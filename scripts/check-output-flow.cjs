const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
function load(file) {
  const exports = {}
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require, setTimeout, clearTimeout })
  return exports
}
const flow = load('src/main/ssh/output-flow.ts')
const writerModule = load('src/renderer/src/lib/terminal-writer.ts')
const stream = new EventEmitter()
stream.stderr = { pause() {}, resume() {} }
stream.pause = () => { stream.paused = true }
stream.resume = () => { stream.paused = false }
const token = flow.trackOutput(stream, 1, 256 * 1024)
assert.equal(stream.paused, true)
flow.acknowledgeOutput(token, 256 * 1024, 2)
assert.equal(stream.paused, true, 'Other window cannot acknowledge')
flow.acknowledgeOutput(token, 256 * 1024 + 1, 1)
assert.equal(stream.paused, true, 'Oversized acknowledgement rejected')
flow.acknowledgeOutput(token, 200 * 1024, 1)
assert.equal(stream.paused, false)
stream.emit('close')
stream.paused = true
flow.acknowledgeOutput(token, 56 * 1024, 1)
assert.equal(stream.paused, true, 'Closed flow is forgotten')
;(async () => {
  const writes = []
  let acknowledged = 0
  const writer = writerModule.createTerminalWriter((data, done) => writes.push({ data, done }), () => true)
  writer.push('\x1b[31', () => acknowledged++)
  writer.push('m中文', () => acknowledged++)
  await new Promise(r => setTimeout(r, 30))
  assert.equal(writes.length, 1)
  assert.equal(writes[0].data, '\x1b[31m中文')
  assert.equal(acknowledged, 0)
  writer.push('next', () => acknowledged++)
  await new Promise(r => setTimeout(r, 30))
  assert.equal(writes.length, 1, 'Only one write in flight')
  writes[0].done()
  assert.equal(acknowledged, 2)
  await new Promise(r => setTimeout(r, 30))
  assert.equal(writes[1].data, 'next')
  writes[1].done()
  writer.push('pending', () => acknowledged++)
  writer.dispose()
  await new Promise(r => setTimeout(r, 30))
  assert.equal(writes.length, 2)
  assert.equal(acknowledged, 4)
  console.log('Output backpressure and batching regression checks passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
