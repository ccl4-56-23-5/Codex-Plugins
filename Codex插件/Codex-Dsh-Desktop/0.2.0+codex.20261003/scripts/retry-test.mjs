import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { connect } from './bridge-client.mjs'
const directory = resolve(process.argv[2] || process.env.DSH_TEST_OUTPUT || join(process.cwd(), 'test-results'))
const prior = JSON.parse(readFileSync(join(directory, 'desktop-test-hot.json'), 'utf8'))
const client = connect()
const before = await client.status()
const row = await client.read(prior.input.runId)
const input = { runId: prior.input.runId, purpose: 'test', workspacePath: prior.input.workspacePath, packageName: 'dsh-top-directive', packageVersion: prior.input.packageVersion, message: prior.input.message, showInDesktop: true }
const again = await client.submit(input)
const after = await client.status()
assert.equal(before.runs.length, after.runs.length)
assert.equal(row.sessionId, again.sessionId)
assert.equal(row.userSeq, again.userSeq)
assert.equal(row.assistantSeq, again.assistantSeq)
assert.equal(row.reply, again.reply)
const result = { runId: prior.input.runId, sameSession: true, sameUserEvent: true, sameAssistantEvent: true, extraRunsCreated: after.runs.length - before.runs.length, pass: true }
writeFileSync(join(directory, 'desktop-test-retry.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
