import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { prepareRun, PROTOCOL_VERSION } from './contract.mjs'

export const bridgeDirectory = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'top-directive')
export function connect(descriptorFile = join(bridgeDirectory(), 'codex-bridge.json')) {
  let descriptor
  try { descriptor = JSON.parse(readFileSync(descriptorFile, 'utf8').replace(/^\uFEFF/, '')) }
  catch { throw new Error('未发现DSH会话桥。请安装dsh-top-directive@1.1.1并打开DSH桌面。') }
  const url = new URL(descriptor.endpoint)
  if (descriptor.protocolVersion !== PROTOCOL_VERSION || descriptor.packageName !== 'dsh-top-directive'
    || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/top-directive/api/bridge'
    || url.username || url.password || url.search || url.hash || !/^[a-f0-9]{64}$/.test(descriptor.token)) throw new Error('DSH桥接描述无效。拒绝向未知地址发送消息。')
  async function call(endpoint, method = 'GET', body) {
    const response = await fetch(new URL(endpoint, `${url.origin}/top-directive/api/`), {
      method, headers: { 'x-codex-dsh-token': descriptor.token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(40000)
    })
    const json = await response.json()
    if (!response.ok || json.ok !== true) throw new Error(json?.error?.message || `DSH请求失败(${response.status})`)
    return json.value
  }
  return { descriptorFile, version: descriptor.version,
    status: () => call('bridge/status'), state: () => call('state'), setState: patch => call('state', 'POST', patch),
    submit(input) { prepareRun(input); return call('bridge/runs', 'POST', input) },
    read(runId) { if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,80}$/.test(runId)) throw new Error('runId无效。'); return call(`bridge/runs/${runId}`) }
  }
}
export async function waitRun(client, runId, maxWaitMs = 45000) {
  const deadline = Date.now() + Math.min(Math.max(maxWaitMs, 0), 60000)
  let result
  do {
    result = await client.read(runId)
    if (result.completed || ['failed', 'ended_without_reply', 'not_sent'].includes(result.status)) break
    if (Date.now() >= deadline) break
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())))
  } while (Date.now() <= deadline)
  return result
}
export async function runPluginTest(input, client) {
  prepareRun({ ...input, purpose: 'test', packageName: 'dsh-top-directive' })
  if (input.allowTemporaryPromptChange !== true) throw new Error('验证需要明确允许临时更改提示词并在结束后恢复。')
  if (typeof input.prompt !== 'string' || Buffer.byteLength(input.prompt) > 32768) throw new Error('测试提示词须为32KiB以内的字符串。')
  client ||= connect()
  if (client.version !== input.packageVersion) throw new Error('安装版本与测试指定版本不一致。')
  const recoveryFile = join(dirname(client.descriptorFile), 'codex-prompt-test.json')
  let lock
  try { lock = openSync(recoveryFile, 'wx', 0o600) }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('另一个验证正在使用提示词，或上次验证的恢复记录尚未处理。请先调用restore_test_prompt。')
    throw new Error('无法建立验证恢复记录：' + error.message)
  }
  let saved, temporary, result, restoration, failure
  try {
    saved = await client.state()
    const planned = { enabled: input.enabled !== false, text: input.prompt }
    const plannedRevision = createHash('sha256').update(JSON.stringify(planned)).digest('hex')
    writeFileSync(lock, JSON.stringify({ runId: input.runId, saved, temporaryRevision: plannedRevision }, null, 2))
    closeSync(lock); lock = undefined
    temporary = await client.setState({ text: input.prompt, enabled: input.enabled !== false, expectedRevision: saved.revision })
    writeFileSync(recoveryFile, JSON.stringify({ runId: input.runId, saved, temporaryRevision: temporary.revision }, null, 2), { mode: 0o600 })
    await client.submit({ runId: input.runId, workspacePath: input.workspacePath, purpose: 'test', packageName: 'dsh-top-directive', packageVersion: input.packageVersion, message: input.message, showInDesktop: input.showInDesktop !== false })
    result = await waitRun(client, input.runId, input.maxWaitMs ?? 45000)
    const evidence = result.promptEvidence
    const actual = input.enabled !== false && input.prompt.trim() ? input.prompt : ''
    const expectedDigest = createHash('sha256').update(actual).digest('hex')
    result.verification = {
      completed: result.completed,
      replyMatches: input.expectedReply === undefined ? null : result.reply.trim() === input.expectedReply.trim(),
      rawPromptMatches: evidence?.textSha256 === expectedDigest,
      frontSectionMatches: !actual || ['user:top-directive', 'user:top-directive:priority'].includes(evidence?.firstNonemptySection),
      noTools: evidence?.toolsAvailable === 0 && result.toolCalls === 0,
      pass: result.completed && (input.expectedReply === undefined || result.reply.trim() === input.expectedReply.trim()) && evidence?.textSha256 === expectedDigest && (!actual || ['user:top-directive', 'user:top-directive:priority'].includes(evidence?.firstNonemptySection)) && evidence?.toolsAvailable === 0 && result.toolCalls === 0
    }
  } catch (error) { failure = error }
  finally {
    if (lock !== undefined) closeSync(lock)
    if (saved) {
      try {
        const current = await client.state()
        if (temporary && current.revision === temporary.revision) {
          const restored = await client.setState({ text: saved.text, enabled: saved.enabled, expectedRevision: current.revision })
          restoration = { restored: restored.text === saved.text && restored.enabled === saved.enabled }
        } else if (current.revision === saved.revision) restoration = { restored: true }
        else restoration = { restored: false, reason: '提示词已由其他窗口修改，保留该修改。恢复记录仍保留。' }
      } catch (error) { restoration = { restored: false, reason: error.message } }
    }
    if (!saved || restoration?.restored) { if (existsSync(recoveryFile)) unlinkSync(recoveryFile) }
  }
  if (failure) return { runId: input.runId, error: failure.message, restoration, verification: { pass: false } }
  return { ...result, restoration, verification: { ...result.verification, pass: result.verification.pass && restoration?.restored === true } }
}
export async function restoreTestPrompt(client = connect()) {
  const file = join(dirname(client.descriptorFile), 'codex-prompt-test.json')
  if (!existsSync(file)) return { restored: true, pending: false }
  const recovery = JSON.parse(readFileSync(file, 'utf8'))
  const current = await client.state()
  if (current.revision === recovery.saved.revision) { unlinkSync(file); return { restored: true, pending: false } }
  if (current.revision !== recovery.temporaryRevision) throw new Error('当前提示词与临时验证值不同；保留用户修改，需人工核对恢复记录。')
  const restored = await client.setState({ text: recovery.saved.text, enabled: recovery.saved.enabled, expectedRevision: current.revision })
  if (restored.text !== recovery.saved.text || restored.enabled !== recovery.saved.enabled) throw new Error('恢复验证失败。')
  unlinkSync(file)
  return { restored: true, pending: false, runId: recovery.runId }
}

