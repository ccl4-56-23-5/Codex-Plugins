import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const node = process.execPath;
const server = fileURLToPath(new URL('./mcp-server.mjs', import.meta.url));
const client = new Client({ name: 'dsh-desktop-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({ command: node, args: [server] });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (!tools.tools.some(tool => tool.name === 'open_new_conversation')) throw new Error('MCP tool missing');
  console.log(tools.tools.map(tool => tool.name).join('\n'));
} finally {
  await client.close();
}
