import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {TOOLS,validate} from './protocol.js';
import {connect} from './client.mjs';
import {PROMPT_TOOLS, runPromptTest, readPromptTest, recoverPromptTest} from './prompt-test.mjs';

const tools = [...TOOLS, ...PROMPT_TOOLS];
const server = new Server({name:'codex-dsh-control',version:'1.0.1'}, {capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(t => ({name:'dsh_'+t.name,description:t.description,inputSchema:t.inputSchema,annotations:{readOnlyHint:!t.write,destructiveHint:t.write,idempotentHint:true,openWorldHint:false}})),
}));

async function callTool(name, args) {
  if (name === 'prompt_test_read') return readPromptTest(args.runId);
  if (name === 'prompt_test_restore') return recoverPromptTest(args.runId);
  const bridge = await connect();
  if (name === 'prompt_test') {
    return runPromptTest(args, { requireIdle: async () => {
      const { items } = await bridge.call('sessions_list');
      if (!Array.isArray(items) || items.some(session => session.running)) throw new Error('Wait for the current DSH turns to finish before replacing the shared directive');
    } });
  }
  return bridge.call(name, args);
}

server.setRequestHandler(CallToolRequestSchema, async ({params}) => {
  try {
    const tool = tools.find(t => 'dsh_' + t.name === params.name);
    if (!tool) throw new Error('Unknown DSH tool');
    const args = params.arguments || {};
    validate(tool.inputSchema, args);
    const result = await callTool(tool.name, args);
    const isError = result?.status === 'uncertain' || (tool.name === 'prompt_test' && result.verification?.pass !== true) || (tool.name === 'prompt_test_restore' && !result.restored);
    return {isError,content:[{type:'text',text:JSON.stringify(result,null,2)}]};
  } catch (error) {
    return {isError:true,content:[{type:'text',text:error.message}]};
  }
});
await server.connect(new StdioServerTransport());
