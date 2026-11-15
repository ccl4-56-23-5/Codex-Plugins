import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { connect, runPluginTest } from './bridge-client.mjs'
import { prepareRun } from './contract.mjs'
const base = resolve(import.meta.dirname, '../.test-tmp')
mkdirSync(base, { recursive: true })
const sha = value => createHash('sha256').update(value).digest('hex')
function temporary(t) {
  const directory = mkdtempSync(join(base, 'run-'))
  t.after(() => { assert.ok(resolve(directory).startsWith(base + '\\') || resolve(directory).startsWith(base + '/')); rmSync(directory, { recursive: true, force: true }) })
  return directory
}
function fake(t, failure = false, userEdit = false) {
  const directory = temporary(t)
  let state = { enabled: true, text: 'user-original' }, input
  const snapshot = () => ({ ...state, revision: sha(JSON.stringify(state)) })
  return { descriptorFile: join(directory, 'codex-bridge.json'), version: '1.1.1', state: async () => snapshot(),
    async setState(patch) { assert.equal(patch.expectedRevision, snapshot().revision); state = { enabled: patch.enabled, text: patch.text }; return snapshot() },
    async submit(value) { input = value; if (failure) throw new Error('simulated connection failure'); if (userEdit) state = { enabled: false, text: 'user-external-edit' }; return { accepted: true } },
    async read() { const raw = state.enabled && state.text.trim() ? state.text : ''; return { runId: input.runId, completed: true, status: 'completed', reply: '42', toolCalls: 0, promptEvidence: { textSha256: sha(raw), firstNonemptySection: raw ? 'user:top-directive' : 'harness:identity', toolsAvailable: 0 } } }
  }
}
const input = { runId: 'control-test-01', workspacePath: 'D:/workspace', packageVersion: '1.1.1', message: '6×7?', prompt: 'raw{{test}}', enabled: true, expectedReply: '42', allowTemporaryPromptChange: true, maxWaitMs: 0 }
test('host and controller share the same handoff validation', () => {
  const hostContract = resolve(import.meta.dirname, '../../dsh-top-directive/lib/contract.js')
  if (existsSync(hostContract)) assert.equal(readFileSync(join(import.meta.dirname, 'contract.mjs'), 'utf8'), readFileSync(hostContract, 'utf8'))
  const valid = { ...input, purpose: 'test', packageName: 'dsh-top-directive' }
  assert.equal(prepareRun(valid).fingerprint, prepareRun({ ...valid }).fingerprint)
  assert.deepEqual(prepareRun(valid).contract.allowedActions, ['answer'])
  assert.throws(() => prepareRun({ ...input, purpose: 'chat' }))
  assert.throws(() => prepareRun({ ...input, purpose: 'task', objective: '修复' }))
})
test('successful verification restores the exact previous user prompt', async t => {
  const client = fake(t)
  const original = await client.state()
  const result = await runPluginTest(input, client)
  assert.equal(result.verification.pass, true)
  assert.equal(result.restoration.restored, true)
  assert.deepEqual(await client.state(), original)
  assert.equal(existsSync(join(resolve(client.descriptorFile, '..'), 'codex-prompt-test.json')), false)
})
test('send failure is not success and still restores the prompt', async t => {
  const client = fake(t, true)
  const original = await client.state()
  const result = await runPluginTest(input, client)
  assert.equal(result.verification.pass, false)
  assert.equal(result.restoration.restored, true)
  assert.match(result.error, /simulated/)
  assert.deepEqual(await client.state(), original)
})
test('external user edits during testing are preserved', async t => {
  const client = fake(t, false, true)
  const result = await runPluginTest(input, client)
  assert.equal(result.restoration.restored, false)
  assert.equal(result.verification.pass, false)
  assert.equal((await client.state()).text, 'user-external-edit')
})
test('development requests are rejected before connectivity or prompt changes', async () => {
  await assert.rejects(runPluginTest({ ...input, message: '开发插件并测试' }), /插件开发指令/)
})

