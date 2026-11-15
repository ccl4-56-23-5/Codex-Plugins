import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {TOOLS,validate} from './protocol.js';
import {connect} from './client.mjs';
const server=new Server({name:'codex-dsh-control',version:'1.0.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:TOOLS.map(t=>({name:'dsh_'+t.name,description:t.description,inputSchema:t.inputSchema,annotations:{readOnlyHint:!t.write,destructiveHint:t.write,idempotentHint:true,openWorldHint:false}}))}));
server.setRequestHandler(CallToolRequestSchema,async({params})=>{try{const t=TOOLS.find(x=>'dsh_'+x.name===params.name);if(!t)throw new Error('Unknown DSH tool');const args=params.arguments||{};validate(t.inputSchema,args);const result=await(await connect()).call(t.name,args);return {isError:result?.status==='uncertain',content:[{type:'text',text:JSON.stringify(result,null,2)}]};}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}});
await server.connect(new StdioServerTransport());
