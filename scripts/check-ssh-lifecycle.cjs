// Run: node scripts/check-ssh-lifecycle.cjs
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const clients = []
const events = []
class Channel extends EventEmitter {
  stderr = new EventEmitter()
  close() { this.closed = true }
}
class Client extends EventEmitter {
  constructor() { super(); clients.push(this) }
  connect() {}
  end() { this.ended = true }
  shell(_options, callback) { this.openShell = callback }
}
const moduleResult = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(
  require('node:path').join(__dirname, '../src/main/ssh/session-manager.ts'), 'utf8'
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: moduleResult.exports, module: moduleResult, setTimeout, clearTimeout,
  require: (id) => id === 'ssh2' ? { Client } : id === 'electron'
    ? { BrowserWindow: { fromId: () => ({ isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } }) } }
    : id.includes('known-hosts-store') ? {} : id === './output-flow' ? { trackOutput: () => 'test-flow' } : require(id)
})
const api = moduleResult.exports
const options = { sessionId: 'a', host: 'host', port: 22, username: 'user', authType: 'password' }
async function check() {
  api.connectSession(options, 1)
  const first = clients.at(-1)
  first.emit('ready')
  api.disconnectSession('a')
  const cancelled = new Channel()
  first.openShell(null, cancelled)
  assert.equal(api.getSession('a'), undefined, 'Cancelled shell must never register')
  assert.ok(cancelled.closed)

  api.connectSession(options, 1)
  const old = clients.at(-1)
  old.emit('ready')
  const oldStream = new Channel()
  old.openShell(null, oldStream)
  api.connectSession(options, 1)
  const current = clients.at(-1)
  current.emit('ready')
  const currentStream = new Channel()
  current.openShell(null, currentStream)
  const eventCount = events.length
  old.emit('error', new Error('late error'))
  old.emit('close')
  oldStream.emit('close')
  assert.equal(api.getSession('a').channel, currentStream, 'Old callbacks must not remove the new session')
  assert.equal(events.length, eventCount, 'Old callbacks must not change UI state')
  current.exec = (_command, _options, callback) => { current.execCallback = callback }
  api.execStreamStart('a', 'tail', 'tail -f file')
  api.execStreamStop('tail')
  const cancelledExec = new Channel()
  current.execCallback(null, cancelledExec)
  assert.ok(cancelledExec.closed, 'Stopped pending exec must not start streaming')

  const bastion = { host: 'jump', port: 22, username: 'user', authType: 'password' }
  api.connectSession({ ...options, sessionId: 'b', bastion }, 1)
  const b = clients.at(-1)
  b.emit('ready')
  api.connectSession({ ...options, sessionId: 'c', bastion }, 1)
  const c = clients.at(-1)
  c.emit('ready')
  await new Promise(resolve => setTimeout(resolve, 30))
  b.openShell(null, new Channel())
  c.openShell(null, new Channel())
  assert.notEqual(b, c, 'Bastion terminals must own independent connections')
  api.disconnectSession('b')
  assert.ok(b.ended)
  assert.ok(!c.ended, 'Closing one bastion terminal must preserve the other')
  assert.ok(api.getSession('c'))
  api.getSession('c').shellOnly = true
  await assert.rejects(api.execCommand('c', 'ls'), /堡垒机/)
  api.disconnectAll()
  console.log('SSH lifecycle: passed (cancellation, stale callbacks, bastion isolation)')
}
check().catch(error => { console.error(error); process.exitCode = 1 })
