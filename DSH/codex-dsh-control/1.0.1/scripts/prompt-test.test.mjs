import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPromptTest, recoverPromptTest, runPromptTest } from './prompt-test.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const withRevision = (enabled, text) => ({ enabled, text, revision: hash(JSON.stringify({ enabled, text })) });
const input = { runId:'test-prompt-001', workspacePath:'fixture', packageVersion:'1.1.2', prompt:'reply TEST', message:'Read the directive', expectedReply:'TEST', allowTemporaryPromptChange:true, maxWaitMs:100 };

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-control-prompt-'));
  t.after(() => rmSync(directory, { recursive:true, force:true }));
  const original = withRevision(false, 'original directive');
  let state = original, submitted = false, writes = 0, sends = 0;
  const client = {
    directory, version:'1.1.2', state:async () => state,
    update:async p => {
      assert.equal(p.expectedRevision, state.revision);
      writes++;
      state = withRevision(p.enabled, p.text);
      return state;
    },
    submit:async () => { assert.equal(state.text, input.prompt); submitted = true; sends++; },
    read:async () => {
      if (!submitted) throw Object.assign(new Error('Unknown run'), { status:404 });
      return { runId:input.runId, status:'completed', completed:true, reply:'TEST', toolCalls:0, promptEvidence:{ textSha256:hash(input.prompt), firstNonemptySection:'user:top-directive', toolsAvailable:0, version:client.version } };
    },
  };
  const run = (p = input, requireIdle = async () => {}) => runPromptTest(p, { client, requireIdle });
  return { client, original, run, set:(enabled,text) => { state = withRevision(enabled,text); }, journal:join(directory,'codex-prompt-test.json'), counts:() => ({ writes,sends }) };
}

test('real reply evidence and exact restoration are both required; runId is never replayed', async t => {
  const f = fixture(t);
  const result = await f.run();
  assert.equal(result.verification.pass,true);
  assert.deepEqual(await f.client.state(),f.original);
  assert.equal(existsSync(f.journal),false);
  await assert.rejects(() => f.run(),/already used/);
  assert.deepEqual(f.counts(),{ writes:3,sends:1 });
});

test('busy host stops before writing the prompt or submitting a message', async t => {
  const f = fixture(t);
  const result = await f.run(input,async () => { throw new Error('Host busy'); });
  assert.match(result.error,/busy/);
  assert.deepEqual(f.counts(),{ writes:0,sends:0 });
  assert.equal(existsSync(f.journal),false);
});

test('a missing reply fails verification and restores the original', async t => {
  const f = fixture(t);
  const read = f.client.read;
  f.client.read = async id => ({...await read(id),status:'running',completed:false,reply:''});
  const result = await f.run();
  assert.equal(result.verification.pass,false);
  assert.equal(result.restoration.restored,true);
  assert.deepEqual(await f.client.state(),f.original);
});

test('an ambiguous submission restores without sending again', async t => {
  const f = fixture(t);
  const submit = f.client.submit;
  f.client.submit = async p => { await submit(p); throw new Error('Lost acknowledgement'); };
  const result = await f.run();
  assert.equal(result.verification.pass,false);
  assert.equal(result.restoration.restored,true);
  assert.equal((await readPromptTest(input.runId,f.client)).completed,true);
  await assert.rejects(() => f.run(),/already used/);
  assert.equal(f.counts().sends,1);
});

test('a concurrent edit survives and leaves its recovery record for review', async t => {
  const f = fixture(t);
  const submit = f.client.submit;
  f.client.submit = async p => { await submit(p); f.set(true,'concurrent edit'); };
  const result = await f.run();
  assert.equal(result.verification.pass,false);
  assert.equal(result.restoration.pending,true);
  assert.equal((await f.client.state()).text,'concurrent edit');
  assert.equal(existsSync(f.journal),true);
});

test('recovery restores an interrupted write and is idempotent', async t => {
  const f = fixture(t);
  f.set(true,input.prompt);
  writeFileSync(f.journal,JSON.stringify({runId:input.runId,saved:f.original,temporaryRevision:(await f.client.state()).revision}));
  assert.equal((await recoverPromptTest(input.runId,f.client)).restored,true);
  assert.deepEqual(await f.client.state(),f.original);
  assert.equal((await recoverPromptTest(input.runId,f.client)).restored,true);
  assert.equal(f.counts().writes,2);
});

test('recovery refreshes the fallback after interruption between the two restoration writes', async t => {
  const f = fixture(t);
  const temporary = withRevision(true, input.prompt);
  writeFileSync(f.journal, JSON.stringify({
    runId: input.runId, saved: f.original, temporaryRevision: temporary.revision,
  }));
  assert.equal((await recoverPromptTest(input.runId, f.client)).restored, true);
  assert.deepEqual(await f.client.state(), f.original);
  assert.equal(f.counts().writes, 1);
});
