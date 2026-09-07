const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const yaml = require('js-yaml')
const asar = require('@electron/asar')
const root = path.resolve(__dirname, '..')
process.chdir(root)
const config = yaml.load(fs.readFileSync('electron-builder.yml', 'utf8'))
const repo = `${config.publish.owner}/${config.publish.repo}`
const api = `https://api.github.com/repos/${repo}`
const token = fs.readFileSync('.release-token.local', 'utf8').trim()
if (!token || /\s/.test(token) || token.includes('REPLACE_WITH')) throw new Error('请先填写本地 GitHub 令牌文件')

async function request(url, method = 'GET', body, binary = false) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': binary ? 'application/octet-stream' : 'application/json' },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(binary ? 600000 : 30000), redirect: 'error'
  })
  if (!response.ok) throw new Error(`GitHub ${method} 失败，HTTP ${response.status}（检查网络及令牌仓库权限）`)
  return response.json()
}
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm' })
  if (result.error || result.status !== 0) throw new Error('检查或构建失败，未发布')
}
async function main() {
  const repository = await request(api)
  if (!repository.permissions?.push) throw new Error('令牌没有目标仓库写入权限')
  const releases = await request(`${api}/releases?per_page=100`)
  console.log(`发布仓库：${repo}；最近版本：${releases.slice(0, 5).map(r => r.tag_name).join(', ') || '无'}`)
  if (process.argv[2] === '--check') return
  const version = process.argv[2]
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('用法：npm run release -- 0.0.4')
  const tag = `v${version}`
  if (releases.some(r => r.tag_name === tag)) throw new Error('版本已存在（包括草稿），不会覆盖；请检查后选择新版本')
  const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0]-y[0] || x[1]-y[1] || x[2]-y[2] }
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  if (compare(version, pkg.version) < 0 || releases.some(r => /^v?\d+\.\d+\.\d+$/.test(r.tag_name) && compare(version, r.tag_name.replace(/^v/, '')) <= 0)) throw new Error('新版本必须高于已发布版本且不低于本地版本')
  for (const file of fs.readdirSync('scripts').filter(f => /^check-.*\.cjs$/.test(f))) run(process.execPath, [path.join('scripts', file)])
  run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'])
  run('npm', ['run', 'build'])
  run(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', 'nsis', '--x64', '--publish', 'never'])
  const archive = path.join('dist', 'win-unpacked', 'resources', 'app.asar')
  if (asar.listPackage(archive).some(p => /release-token|[\\/]\.env/.test(p)) || fs.readFileSync(archive).includes(Buffer.from(token))) throw new Error('安装内容含凭据，已阻止发布')
  const metadata = yaml.load(fs.readFileSync('dist/latest.yml', 'utf8'))
  const installer = `devshell-${version}-Setup.exe`
  const hash = crypto.createHash('sha512').update(fs.readFileSync(path.join('dist', installer))).digest('base64')
  if (metadata.version !== version || metadata.path !== installer || metadata.sha512 !== hash) throw new Error('更新元数据与安装包不一致')
  const assets = [installer, `${installer}.blockmap`, 'latest.yml'].map(name => ({ name, data: fs.readFileSync(path.join('dist', name)) }))
  const draft = await request(`${api}/releases`, 'POST', { tag_name: tag, name: `DevShell ${version}`, draft: true, prerelease: false,
    body: '优化终端阅读与复制粘贴、日志异常高亮及文件中转；修复连接生命周期、文件目录切换及更新状态反馈。Windows x64 安装包。' })
  console.log(`已创建草稿 ${tag}，全部附件验证后才正式发布。失败时保留草稿供检查。`)
  for (const asset of assets) {
    const uploaded = await request(`${draft.upload_url.split('{')[0]}?name=${encodeURIComponent(asset.name)}`, 'POST', asset.data, true)
    if (uploaded.state !== 'uploaded' || uploaded.size !== asset.data.length) throw new Error('附件上传校验失败，保留草稿')
    console.log(`已上传：${asset.name}`)
  }
  const published = await request(`${api}/releases/${draft.id}`, 'PATCH', { draft: false, make_latest: 'true' })
  if (published.draft) throw new Error('Release 仍为草稿')
  console.log(`发布成功：${published.html_url}`)
}
main().catch(error => { console.error(String(error.message).split(token).join('[REDACTED]')); process.exitCode = 1 })
