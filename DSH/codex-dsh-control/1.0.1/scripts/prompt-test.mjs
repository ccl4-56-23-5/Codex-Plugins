import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const digest = value => createHash('sha256').update(value).digest('hex');
const revisionOf = ({ enabled, text }) => digest(JSON.stringify({ enabled, text }));
const readJson = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const runIdPattern = '^[a-zA-Z0-9][a-zA-Z0-9_-]{7,80}$';
const runId = { type: 'string', pattern: runIdPattern };
const string = { type: 'string', minLength: 1 };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });

export const PROMPT_TOOLS = [
  { name: 'prompt_test', write: true, description: 'Temporarily replace the installed DSH Top Directive, ask one authorized test question, check the real reply and prompt assembly, and restore the prior setting.', inputSchema: schema({ runId, workspacePath: string, packageVersion: string, prompt: string, message: string, expectedReply: string, allowTemporaryPromptChange: { enum: [true] }, maxWaitMs: { type: 'integer', minimum: 100, maximum: 60000 } }, ['runId','workspacePath','packageVersion','prompt','message','expectedReply','allowTemporaryPromptChange']) },
  { name: 'prompt_test_read', write: false, description: 'Read one Top Directive test run and whether recovery is pending. Reuse its runId after a timeout.', inputSchema: schema({ runId }, ['runId']) },
  { name: 'prompt_test_restore', write: true, description: 'Restore a journaled Top Directive test after the runner has stopped. A concurrent edit is preserved.', inputSchema: schema({ runId }, ['runId']) },
];

export function connectTopDirective({ descriptor = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'top-directive', 'codex-bridge.json'), fetchImpl = fetch } = {}) {
  const d = readJson(descriptor);
  const url = new URL(d.endpoint);
  if (d.protocolVersion !== 2 || d.packageName !== 'dsh-top-directive' || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/top-directive/api/bridge' || url.username || url.password || url.search || url.hash || !/^[a-f0-9]{64}$/.test(d.token)) {
    throw new Error('Invalid Top Directive local discovery descriptor');
  }
  async function call(path, method = 'GET', body) {
    const response = await fetchImpl(new URL(path, `${url.origin}/top-directive/api/`), {
      method, headers: { 'x-codex-dsh-token': d.token, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(35000),
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw Object.assign(new Error(data.error?.message || `Top Directive HTTP ${response.status}`), { status: response.status });
    return data.value;
  }
  return {
    directory: dirname(descriptor), version: d.version,
    state: () => call('state'), update: patch => call('state', 'POST', patch),
    submit: input => call('bridge/runs', 'POST', input),
    read: id => call(`bridge/runs/${id}`),
  };
}

// Publish a complete journal before touching the host. The exclusive link also
// shares the lock with the former Codex desktop plugin's recovery routine.
function createExclusiveJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); }
    finally { closeSync(fd); }
    linkSync(temp, file);
  } finally { unlinkSync(temp); }
}

function checkRunId(id) {
  if (!new RegExp(runIdPattern).test(id)) throw new Error('Invalid prompt test runId');
}

function journalAt(client) { return join(client.directory, 'codex-prompt-test.json'); }
function reservedAt(client, id) { return join(client.directory, `control-prompt-run-${id}.json`); }
function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code !== 'ESRCH'; }
}

async function restore(client, file, journal) {
  try {
    const state = await client.state();
    const replacingTemporary = state.revision === journal.temporaryRevision && state.revision !== journal.saved.revision;
    if (replacingTemporary) {
      try {
        await client.update({ enabled: journal.saved.enabled, text: journal.saved.text, expectedRevision: state.revision });
      } catch {
        // The write can have succeeded even when its acknowledgement was lost.
      }
    }
    let actual = await client.state();
    if (journal.temporaryRevision !== journal.saved.revision && actual.revision === journal.saved.revision) {
      // Top Directive saves the previous state to .bak on every write. Refresh
      // that backup so a later disk recovery cannot revive the test prompt.
      await client.update({ enabled: journal.saved.enabled, text: journal.saved.text, expectedRevision: actual.revision });
      actual = await client.state();
    }
    const restored = actual.revision === journal.saved.revision && actual.enabled === journal.saved.enabled && actual.text === journal.saved.text;
    if (!restored) return { restored: false, pending: true, reason: 'The original revision could not be confirmed. Current settings were preserved and the recovery record remains.' };
    const currentJournal = readJson(file);
    if (currentJournal.runId !== journal.runId) return { restored: false, pending: true, reason: 'Recovery record changed during readback.' };
    unlinkSync(file);
    return { restored: true, pending: false, revision: actual.revision };
  } catch (error) {
    return { restored: false, pending: true, reason: error.message };
  }
}

function summarize(row) {
  const { runId, sessionId, accepted, sent, completed, status, reply, toolCalls, visibleInDesktop, promptEvidence } = row;
  return { runId, sessionId, accepted, sent, completed, status, reply, toolCalls, visibleInDesktop, promptEvidence };
}

async function waitForReply(client, id, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const row = await client.read(id);
    if (row.completed || ['failed', 'ended_without_reply'].includes(row.status) || Date.now() >= deadline) return row;
    await delay(Math.min(750, Math.max(0, deadline - Date.now())));
  }
}

export async function runPromptTest(input, { client = connectTopDirective(), requireIdle }) {
  checkRunId(input.runId);
  if (input.allowTemporaryPromptChange !== true) throw new Error('Temporary Top Directive replacement requires authorization');
  if (client.version !== input.packageVersion) throw new Error('Installed Top Directive version differs from packageVersion');
  if (!input.prompt.trim() || Buffer.byteLength(input.prompt) > 32768 || !input.expectedReply.trim()) throw new Error('Provide a nonempty directive of at most 32 KiB and a nonempty expected reply');
  if (!input.message.trim() || Buffer.byteLength(input.message) > 48 * 1024) throw new Error('Provide a nonempty test question of at most 48 KiB');
  const reservation = reservedAt(client, input.runId);
  if (existsSync(reservation)) throw new Error('This runId was already used. Read the existing run rather than submitting it again.');
  try {
    await client.read(input.runId);
    throw new Error('This runId already exists in the host. Read the existing run.');
  } catch (error) { if (error.status !== 404) throw error; }
  const initial = await client.state();
  const saved = { enabled: initial.enabled, text: initial.text, revision: initial.revision };
  if (revisionOf(saved) !== saved.revision) throw new Error('Unsupported Top Directive state revision');
  const temporary = { enabled: true, text: input.prompt };
  const journal = { runId: input.runId, ownerPid: process.pid, saved, temporaryRevision: revisionOf(temporary) };
  const file = journalAt(client);
  if (existsSync(`${file}.recover`)) throw new Error('A recovery is in progress');
  try { createExclusiveJson(file, journal); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('A prompt test or recovery record already exists'); throw error; }
  let result, verification = { pass: false }, failure, restoration, writeAttempted = false;
  try {
    await requireIdle();
    createExclusiveJson(reservation, { runId: input.runId, createdAt: new Date().toISOString() });
    writeAttempted = true;
    try { await client.update({ ...temporary, expectedRevision: saved.revision }); }
    catch (error) {
      if (error.status === 409) { writeAttempted = false; throw error; }
      if ((await client.state()).revision !== journal.temporaryRevision) throw error;
    }
    if ((await client.state()).revision !== journal.temporaryRevision) throw new Error('Temporary prompt readback differs');
    await client.submit({ runId: input.runId, workspacePath: input.workspacePath, purpose: 'test', packageName: 'dsh-top-directive', packageVersion: input.packageVersion, message: input.message, showInDesktop: false });
    result = await waitForReply(client, input.runId, input.maxWaitMs ?? 45000);
    const e = result.promptEvidence;
    const replyMatches = result.reply?.trim() === input.expectedReply.trim();
    const promptMatches = e?.textSha256 === digest(input.prompt) && ['user:top-directive','user:top-directive:priority'].includes(e.firstNonemptySection) && e.version === input.packageVersion;
    const noTools = e?.toolsAvailable === 0 && result.toolCalls === 0;
    verification = { replyMatches, promptMatches, noTools, completed: result.completed === true, pass: result.completed === true && replyMatches && promptMatches && noTools };
  } catch (error) { failure = error.message; }
  finally {
    if (writeAttempted) restoration = await restore(client, file, journal);
    else {
      unlinkSync(file);
      restoration = { restored: true, pending: false, writeAttempted: false };
    }
  }
  return { runId: input.runId, ...(result && summarize(result)), ...(failure && { error: failure }), restoration, verification: { ...verification, pass: verification.pass && restoration.restored } };
}

export async function readPromptTest(id, client = connectTopDirective()) {
  checkRunId(id);
  const file = journalAt(client);
  const recoveryPending = existsSync(file) && readJson(file).runId === id;
  try { return { ...summarize(await client.read(id)), recoveryPending }; }
  catch (error) {
    if (error.status !== 404) throw error;
    return { runId: id, status: existsSync(reservedAt(client, id)) ? 'submission_unconfirmed' : 'not_found', recoveryPending };
  }
}

export async function recoverPromptTest(id, client = connectTopDirective()) {
  checkRunId(id);
  const file = journalAt(client);
  if (!existsSync(file)) return { runId: id, restored: true, pending: false };
  const lease = `${file}.recover`;
  if (existsSync(lease)) throw new Error('A recovery lease exists. Check the recorded owner before removing an interrupted lease.');
  createExclusiveJson(lease, { ownerPid: process.pid, runId: id });
  try {
    const journal = readJson(file);
    if (journal.runId !== id) throw new Error('Recovery runId differs from the pending record');
    if (processAlive(journal.ownerPid)) throw new Error('The test process is still active. Read its run before attempting recovery.');
    if (revisionOf(journal.saved) !== journal.saved.revision || !/^[a-f0-9]{64}$/.test(journal.temporaryRevision)) throw new Error('Invalid recovery record');
    return { runId: id, ...await restore(client, file, journal) };
  } finally { unlinkSync(lease); }
}
