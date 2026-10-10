import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { connect, waitRun, runPluginTest, restoreTestPrompt } from './bridge-client.mjs'

const server = new McpServer({ name: 'codex-dsh-desktop', version: '0.2.0' })
const runId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,80}$/).describe('Stable identity for this handoff. Reuse on retry; never silently create a second run.')
const workspacePath = z.string().min(1).describe('Exact registered DSH workspace path, selected from get_desktop_status.')
const message = z.string().min(1).describe('Scoped message prepared for this tool. Never automatically forward the parent development request.')
function register(name, title, description, inputSchema, action) {
  server.registerTool(name, { title, description, inputSchema }, async input => {
    try {
      const result = await action(input)
      return { ...(result.verification?.pass === false || result.error ? { isError: true } : {}), content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) { return { isError: true, content: [{ type: 'text', text: String(error?.message ?? error) }] } }
  })
}
register('get_desktop_status', 'Inspect DSH Desktop connection',
  'Read the installed prompt plugin version, registered workspaces, and bridge-owned runs. Read only; never sends a greeting or creates a session.', {},
  () => connect().status())
register('open_new_conversation', 'Send an explicitly requested chat message',
  'Use only when the human explicitly asks to send this particular message to DSH. Do not forward a request to develop and test an artifact. For artifact verification use run_plugin_test; for explicitly delegated work use delegate_task.',
  { runId, workspacePath, message, explicitUserMessage: z.literal(true), showInDesktop: z.boolean().default(true) },
  input => connect().submit({ ...input, purpose: 'chat' }))
register('run_plugin_test', 'Verify the existing DSH prompt plugin',
  'Verify the exact installed dsh-top-directive version. Temporarily apply a test prompt and enabled state, send only an answer-only test question with all tools disabled, read the actual reply and prompt assembly, then restore the previous prompt. No implementation is delegated. A timeout is not a pass.',
  { runId, workspacePath, packageVersion: z.string().min(1), message,
    prompt: z.string(), enabled: z.boolean().default(true), expectedReply: z.string().optional(),
    allowTemporaryPromptChange: z.literal(true), showInDesktop: z.boolean().default(true), maxWaitMs: z.number().int().min(0).max(60000).default(45000) },
  input => runPluginTest(input))
register('delegate_task', 'Delegate an explicitly authorized, scoped task',
  'Only use after the human explicitly asks DSH to perform the implementation. Specify DSH as owner, the objective, allowed files, and expected evidence. For requests to call DSH to test Codex work, use run_plugin_test and retain Codex as implementation owner.',
  { runId, workspacePath, message, objective: z.string().min(1), authorization: z.string().min(1).describe('The human instruction that explicitly delegates this work to DSH.'),
    allowedFiles: z.array(z.string().min(1)).min(1), expectedEvidence: z.array(z.string().min(1)).min(1), showInDesktop: z.boolean().default(true) },
  input => connect().submit({ ...input, purpose: 'task' }))
register('read_run', 'Read the actual DSH result',
  'Read only a bridge-owned run. sent, completed, reply, prompt evidence and desktop selection are separate fields. Reuse the runId after a timeout. Never create another session merely to check status.',
  { runId, maxWaitMs: z.number().int().min(0).max(60000).default(0) },
  input => waitRun(connect(), input.runId, input.maxWaitMs))
register('restore_test_prompt', 'Recover an interrupted prompt verification',
  'Restore a pending test prompt only if the current value still matches the temporary test value. Preserve changes made in another window.', {},
  () => restoreTestPrompt())
await server.connect(new StdioServerTransport())
