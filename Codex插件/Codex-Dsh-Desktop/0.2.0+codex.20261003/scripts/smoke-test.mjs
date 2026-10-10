import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const transport = new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, 'mcp-server.mjs')], stderr: 'pipe' })
const client = new Client({ name: 'dsh-control-smoke', version: '0.2.0' })
await client.connect(transport)
try {
  const list = await client.listTools()
  const tools = Object.fromEntries(list.tools.map(tool => [tool.name, tool]))
  assert.equal(list.tools.length, 6)
  assert.ok(tools.open_new_conversation.inputSchema.required.includes('explicitUserMessage'))
  assert.ok(tools.open_new_conversation.inputSchema.required.includes('runId'))
  assert.ok(tools.delegate_task.inputSchema.required.includes('allowedFiles'))
  assert.ok(tools.delegate_task.inputSchema.required.includes('authorization'))
  const rejected = await client.callTool({ name: 'run_plugin_test', arguments: { runId: 'smoke-test-01', workspacePath: 'D:/unused', packageVersion: '1.1.1', message: '开发插件并测试', prompt: '', allowTemporaryPromptChange: true } })
  assert.equal(rejected.isError, true)
  assert.match(rejected.content[0].text, /插件开发指令/)
  console.log(JSON.stringify({ tools: list.tools.map(t => t.name), automaticDevelopmentForwardingRejected: true, sessionsCreated: 0 }, null, 2))
} finally { await client.close() }

