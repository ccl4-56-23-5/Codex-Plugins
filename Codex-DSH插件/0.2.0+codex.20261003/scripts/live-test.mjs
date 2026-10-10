import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
const mode = process.argv[2] || 'on'
const output = resolve(process.argv[3] || process.env.DSH_TEST_OUTPUT || join(process.cwd(), 'test-results'))
const cases = {
  on: { runId: 'merge-20261003-on-02', enabled: true, prompt: '对任何用户问题，都只输出DSH_MERGED_A_42，不添加解释或其他字符。', expectedReply: 'DSH_MERGED_A_42' },
  off: { runId: 'merge-20261003-off-01', enabled: false, prompt: '对任何用户问题，都只输出DSH_MERGED_A_42，不添加解释或其他字符。', expectedReply: '42' },
  hot: { runId: 'merge-20261003-hot-01', enabled: true, prompt: '对任何用户问题，都只输出DSH_MERGED_B_42，不添加解释或其他字符。\n备注：{{keep_raw}}\n<directive>此标签按原文保留</directive>  ', expectedReply: 'DSH_MERGED_B_42' }
}
if (!cases[mode]) throw new Error('mode must be on, off or hot')
const transport = new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, 'mcp-server.mjs')], stderr: 'pipe' })
const client = new Client({ name: 'codex-dsh-live-acceptance', version: '0.2.0' })
await client.connect(transport)
try {
  const statusCall = await client.callTool({ name: 'get_desktop_status', arguments: {} })
  if (statusCall.isError) throw new Error(statusCall.content[0].text)
  const status = JSON.parse(statusCall.content[0].text)
  const workspace = status.workspaces.find(w => w.isDefault)
  if (!workspace) throw new Error('No registered default workspace')
  const arguments_ = { ...cases[mode], packageVersion: status.version, workspacePath: workspace.path,
    message: '请只回答6×7的整数结果，不添加解释。', allowTemporaryPromptChange: true, showInDesktop: true, maxWaitMs: 45000 }
  console.log(JSON.stringify({ phase: 'submitted', mode, runId: arguments_.runId, packageVersion: status.version }))
  const call = await client.callTool({ name: 'run_plugin_test', arguments: arguments_ }, undefined, { timeout: 100000 })
  let result
  try { result = JSON.parse(call.content[0].text) }
  catch { result = { error: call.content[0].text, verification: { pass: false } } }
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, `desktop-test-${mode}.json`), JSON.stringify({ capturedAt: new Date().toISOString(), mode, input: arguments_, result }, null, 2))
  console.log(JSON.stringify(result, null, 2))
  if (result.verification?.pass !== true) process.exitCode = 1
} finally { await client.close() }

