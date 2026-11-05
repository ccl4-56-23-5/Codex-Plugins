import {connect} from './client.mjs';import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const c=await connect(),prefix='qa-terminal-'+Date.now(),sessionId=prefix,id='control-terminal',attachmentId='control-attachment',e={};const call=async(n,a)=>{const v=await c.call(n,a);if(v.status==='uncertain')throw new Error(v.error);return v;};
let hold,follow;
try{const w=await c.call('workspaces_list');await call('session_create',{operationId:prefix+'-create',sessionId,workspaceId:w.items.find(x=>x.path.endsWith('default-workspace')).id});
e.create=await call('host_invoke',{operationId:prefix+'-terminal',endpoint:'terminal/create',arguments:{agentId:sessionId,request:{id,cols:100,rows:24}}});
hold=(await call('host_stream_open',{operationId:prefix+'-hold',endpoint:'terminal/retain',arguments:{sessionId,id}})).result.streamId;
follow=(await call('host_stream_open',{operationId:prefix+'-follow',endpoint:'terminal/follow',arguments:{agentId:sessionId,id,attachmentId}})).result.streamId;
e.baseline=await call('host_stream_poll',{streamId:follow,maxWaitMs:5000});
e.write=await call('host_invoke',{operationId:prefix+'-write',endpoint:'terminal/write',arguments:{agentId:sessionId,id,attachmentId,data:'echo CONTROL-TERMINAL-OK\r'}});
let cursor=e.baseline.cursor;e.output=[];for(let i=0;i<8;i++){const p=await call('host_stream_poll',{streamId:follow,after:cursor,maxWaitMs:1000});cursor=p.cursor;e.output.push(...p.items);if(JSON.stringify(e.output).includes('CONTROL-TERMINAL-OK'))break;}
assert.match(JSON.stringify(e.output),/CONTROL-TERMINAL-OK/);e.pass=true;
}catch(error){e.pass=false;e.error=error.message;process.exitCode=1;}finally{for(const streamId of [follow,hold].filter(Boolean))await call('host_stream_close',{operationId:prefix+'-close-'+streamId,streamId});await call('host_invoke',{operationId:prefix+'-dispose',endpoint:'terminal/close',arguments:{agentId:sessionId,id}}).catch(()=>{});await call('session_archive',{operationId:prefix+'-archive',sessionId,archived:true}).catch(()=>{});writeFileSync(process.argv[2],JSON.stringify(e,null,2));console.log(JSON.stringify({pass:e.pass,error:e.error,outputItems:e.output?.length}));}
