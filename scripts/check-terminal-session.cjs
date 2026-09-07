// Run: node scripts/check-terminal-session.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const file = ts.createSourceFile('terminal.tsx', fs.readFileSync(
  path.join(__dirname, '../src/renderer/src/components/terminal.tsx'), 'utf8'
), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let initializer
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handleDisconnect') {
    initializer = node.initializer.getText(file)
  }
  ts.forEachChild(node, visit)
}
visit(file)
assert.ok(initializer, 'Disconnect handler must exist')
const changes = []
const context = {
  sessionId: 'session-a',
  updateSessionStatus: (...args) => changes.push(args),
  useCallback: (callback) => callback
}
const code = ts.transpileModule(`const handler = ${initializer}; handler`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 }
}).outputText
const handler = vm.runInNewContext(code, context)
handler('session-b')
assert.equal(changes.length, 0, 'Closing another session must not disconnect this tab')
handler('session-a')
assert.deepEqual(changes, [['session-a', 'disconnected']])
console.log('Terminal session isolation: passed')
