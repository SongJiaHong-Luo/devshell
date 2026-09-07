// Run: node scripts/check-sftp-transfers.cjs (no network or credentials).
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/main/ssh/sftp-manager.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const tick = () => new Promise(resolve => setImmediate(resolve))

function harness(options = {}) {
  const events = [], channels = [], timers = new Set(), remote = new Map(), local = new Map()
  let clock = 1000, sequence = 0, finishRename
  if (options.existing) remote.set('/target', 'original')
  class Sftp extends EventEmitter {
    end() { this.ended = true }
    lstat(name, cb) { queueMicrotask(() => remote.has(name) ? cb(null, { mode: 0o100644 }) : cb(Object.assign(new Error('Missing'), { code: 2 }))) }
    stat(_name, cb) { queueMicrotask(() => cb(null, { size: 100, mode: 0o100644 })) }
    fastPut(_source, destination, settings, cb) { this.destination = destination; this.settings = settings; this.done = cb; remote.set(destination, 'partial') }
    fastGet(_source, destination, settings, cb) { this.destination = destination; this.settings = settings; this.done = cb; if (!options.delayedLocal) local.set(destination, 'partial') }
    unlink(name, cb) { remote.delete(name); queueMicrotask(() => cb(null)) }
    rename(from, to, cb) { if (remote.has(to)) return cb(new Error('Target exists')); remote.set(to, remote.get(from)); remote.delete(from); cb(null) }
    ext_openssh_rename(from, to, cb) {
      if (options.unsupported) throw new Error('Server does not support this extended request')
      remote.set(to, remote.get(from)); remote.delete(from); cb(null)
    }
  }
  const client = new EventEmitter(), channel = new EventEmitter()
  const session = { client, channel, windowId: 1 }
  let currentSession = session
  client.sftp = cb => { const sftp = new Sftp(); channels.push(sftp); queueMicrotask(() => cb(null, sftp)) }
  const result = { exports: {} }
  vm.runInNewContext(source, {
    exports: result.exports, module: result, Date: { now: () => clock },
    setTimeout: (fn, delay) => { const id = setTimeout(() => { timers.delete(id); fn() }, delay); timers.add(id); return id },
    clearTimeout: id => { timers.delete(id); clearTimeout(id) },
    require: id => id === 'electron' ? { BrowserWindow: { fromId: () => ({ isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } }) } }
      : id === './session-manager' ? { getSession: () => currentSession }
      : id === 'crypto' ? { randomUUID: () => `transfer-${++sequence}` }
      : id === 'fs/promises' ? {
        stat: async () => ({ size: 100, isFile: () => true }),
        rename: async (from, to) => {
          if (options.delayedRename) await new Promise(resolve => { finishRename = resolve })
          assert.ok(local.has(from)); local.set(to, local.get(from)); local.delete(from)
        },
        unlink: async name => { if (!local.delete(name)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' }) }
      } : require(id)
  })
  return { api: result.exports, events, channels, remote, local, client, channel,
    advance: milliseconds => { clock += milliseconds },
    finishRename: () => finishRename(),
    disconnect: () => { currentSession = undefined; client.emit('close') },
    dispose: () => { for (const timer of timers) clearTimeout(timer) }
  }
}

async function run(name, fn, options) {
  const h = harness(options)
  try { await fn(h); console.log(`PASS ${name}`) } finally { h.dispose() }
}

async function check() {
  await run('two active transfers, queued cancellation and slot reuse', async h => {
    const tasks = [1, 2, 3, 4].map(n => h.api.uploadFile('session', `/local${n}`, `/remote${n}`).catch(e => e))
    await tick()
    assert.equal(h.channels.length, 2)
    const queued = h.api.getTransfers('session').filter(t => t.status === 'queued')
    assert.equal(queued.length, 2)
    assert.equal(h.api.cancelTransfer(queued[0].transferId), true)
    assert.match((await tasks[2]).message, /cancelled/)
    h.channels[0].done(null)
    await tick()
    assert.equal(h.channels.length, 3)
    h.channels[1].done(null); h.channels[2].done(null)
    await Promise.all(tasks)
    assert.equal(h.api.getTransfers('session').length, 0)
  })
  await run('progress throttling, final notification and stale callback suppression', async h => {
    const promise = h.api.uploadFile('session', '/local', '/target').catch(e => e)
    await tick()
    const sftp = h.channels[0]
    sftp.settings.step(1)
    const count = h.events.length
    for (let i = 2; i < 99; i++) sftp.settings.step(i)
    assert.equal(h.events.length, count)
    h.advance(200); sftp.settings.step(99)
    assert.equal(h.events.length, count + 1)
    sftp.done(null)
    await promise
    const completeCount = h.events.length
    sftp.settings.step(100); sftp.done(null)
    assert.equal(h.events.length, completeCount)
    assert.equal(h.events.filter(e => e[0] === 'sftp:complete').length, 1)
    assert.equal(h.events.filter(e => e[0] === 'sftp:progress').at(-1)[1].transferredBytes, 100)
  })
  await run('failed upload preserves original and removes temporary file', async h => {
    const promise = h.api.uploadFile('session', '/local', '/target').catch(e => e)
    await tick()
    assert.notEqual(h.channels[0].destination, '/target')
    h.channels[0].done(new Error('Write failed'))
    assert.match((await promise).message, /Write failed/)
    assert.equal(h.remote.get('/target'), 'original')
    assert.equal(h.remote.size, 1)
  }, { existing: true })
  await run('unsupported atomic overwrite fails safely without uncaught throw', async h => {
    const promise = h.api.uploadFile('session', '/local', '/target').catch(e => e)
    await tick()
    assert.doesNotThrow(() => h.channels[0].done(null))
    assert.equal(typeof (await promise).message, 'string')
    assert.equal(h.remote.get('/target'), 'original')
  }, { existing: true, unsupported: true })
  await run('unsupported extension falls back only for a new destination', async h => {
    const promise = h.api.uploadFile('session', '/local', '/target').catch(e => e)
    await tick()
    assert.doesNotThrow(() => h.channels[0].done(null))
    assert.equal(typeof await promise, 'string')
    assert.equal(h.remote.has('/target'), true)
  }, { unsupported: true })
  await run('disconnect settles active and queued tasks without progress resurrection', async h => {
    const promises = [1, 2, 3].map(n => h.api.downloadFile('session', `/remote${n}`, `/local${n}`).catch(e => e))
    await tick(); h.disconnect()
    const outcomes = await Promise.all(promises)
    assert.ok(outcomes.every(e => /断开/.test(e.message)))
    assert.equal(h.api.getTransfers('session').length, 0)
    const count = h.events.length
    for (const sftp of h.channels) { sftp.settings.step(42); sftp.done(null) }
    await tick()
    assert.equal(h.events.length, count)
    assert.equal(h.local.size, 0)
  })
  await run('late download creation after cancellation is cleaned up', async h => {
    const promise = h.api.downloadFile('session', '/remote', '/local').catch(e => e)
    await tick()
    const sftp = h.channels[0], task = h.api.getTransfers('session')[0]
    h.api.cancelTransfer(task.transferId)
    await promise
    h.local.set(sftp.destination, 'late partial')
    sftp.done(new Error('Closed'))
    await tick()
    assert.equal(h.local.size, 0)
  }, { delayedLocal: true })
  await run('completed download commits locally even if SSH disconnects during rename', async h => {
    const promise = h.api.downloadFile('session', '/remote', '/local').catch(e => e)
    await tick()
    h.channels[0].done(null)
    assert.equal(h.api.getTransfers('session')[0].status, 'finishing')
    assert.equal(h.api.cancelTransfer(h.api.getTransfers('session')[0].transferId), false)
    h.disconnect()
    h.finishRename()
    assert.equal(typeof await promise, 'string')
    assert.equal(h.local.has('/local'), true)
    assert.equal(h.local.size, 1)
  }, { delayedRename: true })
  console.log('SFTP transfer regression checks passed')
}
check().catch(error => { console.error(error); process.exitCode = 1 })
