import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'open-desktop-chat.ps1');
function openDesktopChat(message) {
  return new Promise((done, fail) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Message', message], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', s => out += s); child.stderr.on('data', s => err += s);
    child.on('error', e => { clearTimeout(timer); fail(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return fail(new Error(err.trim() || out.trim() || `Desktop automation failed (${code})`));
      try { done(JSON.parse(out.trim())); } catch { fail(new Error(`Invalid automation result: ${out}`)); }
    });
  });
}
const server = new McpServer({ name: 'codex-dsh-desktop', version: '0.1.1' });
server.registerTool('open_new_conversation', {
  title: 'Start a visible DSH Desktop conversation',
  description: 'Use Windows accessibility controls to start a new conversation in the DSH Desktop default workspace, send a message, and verify it appears in the desktop window.',
  inputSchema: { message: z.string().trim().min(1).default('你好') },
}, async ({ message }) => {
  try { return { content: [{ type: 'text', text: JSON.stringify(await openDesktopChat(message), null, 2) }] }; }
  catch (e) { return { isError: true, content: [{ type: 'text', text: String(e?.message ?? e) }] }; }
});
await server.connect(new StdioServerTransport());
