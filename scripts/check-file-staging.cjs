const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const handlers = new Map()
const uploads = []
const copies = []
let exists = false
let response = 0
const exportsObject = {}
const dialog = {
  showOpenDialog: async () => ({ canceled: false, filePaths: ['C:/files/demo.txt', 'C:/files/demo.txt'] }),
  showSaveDialog: async () => ({ canceled: false, filePath: 'C:/saved/demo.txt' }),
  showMessageBox: async () => ({ response })
}
const mocks = {
  electron: { ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: () => {} }, BrowserWindow: { fromWebContents: () => ({}) }, dialog },
  'fs/promises': { copyFile: async (...args) => copies.push(args) },
  '../ssh/sftp-manager': { resolvePath: async () => '/home/user', pathExists: async () => exists, uploadFile: async (...args) => uploads.push(args) }
}
const source = fs.readFileSync(path.join(__dirname, '../src/main/ipc/index.ts'), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
  exports: exportsObject,
  require: (id) => mocks[id] || (id.startsWith('.') ? {} : require(id))
})
exportsObject.registerIpcHandlers()
const call = (name, ...args) => handlers.get(`sftp:${name}`)({ sender: {} }, ...args)
;(async () => {
  const files = await call('stage')
  assert.equal(files.length, 1, 'Duplicate selections should not duplicate the tray')
  await assert.rejects(call('stagedUpload', 'unknown', 'session-a', '/tmp'))
  exists = true
  assert.equal(await call('stagedUpload', files[0].id, 'session-a', '~'), false)
  assert.equal(uploads.length, 0, 'Cancel overwrite must not upload')
  response = 1
  await call('stagedUpload', files[0].id, 'session-a', '~')
  assert.equal(uploads[0][2], '/home/user/demo.txt')
  await call('stagedSave', files[0].id)
  assert.equal(copies.length, 1)
  assert.equal(call('unstage', files[0].id).length, 0)
  console.log('File staging regression checks passed')
})().catch((error) => { console.error(error); process.exitCode = 1 })
