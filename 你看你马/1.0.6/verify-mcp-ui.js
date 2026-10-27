'use strict';
// Isolated MCP protocol and page-bridge checks. Does not send a real lock action.
const {spawn}=require('child_process');
const readline=require('readline');
const fs=require('fs');
const vm=require('vm');
const binary=process.env.CPC_UI_TEST_BINARY;
const resultFile=process.env.CPC_UI_TEST_RESULT;
if(!binary||!resultFile||!process.env.CPC_DATA_DIR)throw Error('Run verify-mcp-ui.ps1 to select the isolated test environment.');
const child=spawn(binary,['--serve'],{env:process.env});
const rl=readline.createInterface({input:child.stdout});
const pending=new Map(),checks=[];
let seq=0;
rl.on('line',line=>{const response=JSON.parse(line),resolve=pending.get(response.id);if(resolve){pending.delete(response.id);resolve(response)}});
function rpc(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP request timed out: '+method))},15000);pending.set(id,r=>{clearTimeout(timer);resolve(r)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')})}
function check(name,passed){checks.push({name,passed:!!passed});if(!passed)throw Error('FAILED: '+name);process.stdout.write('PASS '+name+'\n')}
async function main(){
  const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'ui-contract-test',version:'1'}});
  check('resources announced',init.result.capabilities.resources.listChanged===false);
  const list=await rpc('tools/list');
  const tools=list.result.tools,app=tools.find(x=>x.name==='curtain_app'),lock=tools.find(x=>x.name==='curtain_lock');
  check('app and lock present',!!app&&!!lock);
  const meta=app._meta,global=meta['openai/ui'].entrypoints.find(e=>e.type==='global');
  check('global app resource and shortcut schema',meta.ui.resourceUri==='ui://privacy-curtain/main.html'&&global.quickAction.title==='开启隐私幕布'&&global.quickAction.icons.length>0&&global.quickAction.target.name==='curtain_lock'&&global.quickAction.target.type==='tool');
  check('target is direct action',!lock._meta&&lock.inputSchema.required.length===0);
  check('thread entry present',meta['openai/ui'].entrypoints.some(e=>e.type==='thread'));
  const resources=await rpc('resources/list');
  check('resource discovered',resources.result.resources[0].uri===meta.ui.resourceUri&&resources.result.resources[0].mimeType==='text/html;profile=mcp-app');
  const bad=await rpc('resources/read',{uri:'ui://privacy-curtain/not-found'});
  check('unknown resource rejected',bad.error.code===-32002);
  const page=await rpc('resources/read',{uri:meta.ui.resourceUri}),content=page.result.contents[0];
  check('HTML delivered with correct MIME',content.uri===meta.ui.resourceUri&&content.mimeType==='text/html;profile=mcp-app');
  check('Windows lock guidance present',content.text.includes('Windows 锁屏时幕布会自动关闭，解锁后可再次开启。'));
  const open=await rpc('tools/call',{name:'curtain_app',arguments:{}});
  check('open page has no lock action',open.result.content.length===0&&!open.result.isError);
  const state=await rpc('tools/call',{name:'curtain_status',arguments:{}});
  check('open page leaves isolated guard unlocked',JSON.parse(state.result.content[0].text).locked===false);
  const script=content.text.match(/<script>([\s\S]*?)<\/script>/)[1],posted=[],els={};
  let handler;
  for(const id of ['message','lock','status','shortcut','settings'])els[id]={disabled:false,textContent:'',onclick:null};
  const parent={postMessage:x=>posted.push(x)},window={parent,addEventListener:(event,fn)=>{if(event==='message')handler=fn}};
  vm.runInNewContext(script,{window,document:{getElementById:id=>els[id]},setTimeout:()=>7,clearTimeout:()=>{},Map,Promise,Error,JSON});
  check('page begins MCP Apps handshake',posted[0].method==='ui/initialize'&&posted[0].params.protocolVersion==='2026-01-26');
  handler({source:parent,data:{jsonrpc:'2.0',id:1,result:{protocolVersion:'2026-01-26'}}});
  check('page acknowledges handshake',posted.some(x=>x.method==='ui/notifications/initialized'));
  const req=posted.find(x=>x.method==='tools/call');
  check('page only queries status initially',req.params.name==='curtain_status');
  handler({source:parent,data:{jsonrpc:'2.0',id:req.id,result:{content:[{type:'text',text:'{"locked":false}'}]}}});
  await new Promise(setImmediate);
  check('page displays returned status',els.message.textContent==='隐私幕布未开启。');
  els.lock.onclick();
  const req2=posted.filter(x=>x.method==='tools/call').at(-1);
  check('page lock button calls target',req2.params.name==='curtain_lock');
  handler({source:parent,data:{jsonrpc:'2.0',id:req2.id,result:{content:[{type:'text',text:'{"locked":true}'}]}}});
  await new Promise(setImmediate);
  check('page displays successful lock',els.message.textContent==='隐私幕布已开启。');
  els.shortcut.onclick();
  const req3=posted.filter(x=>x.method==='tools/call').at(-1);
  check('page shortcut status calls target',req3.params.name==='curtain_shortcut_status');
  handler({source:parent,data:{jsonrpc:'2.0',id:req3.id,result:{content:[{type:'text',text:'{"running":true,"registered":true,"sessionSafe":true}'}]}}});
  await new Promise(setImmediate);
  check('page displays shortcut status',els.message.textContent==='快捷键已启用。');
}
main().then(()=>{
  fs.writeFileSync(resultFile,JSON.stringify({passed:true,count:checks.length,checks},null,2));
  child.stdin.end();
}).catch(error=>{
  fs.writeFileSync(resultFile,JSON.stringify({passed:false,count:checks.length,checks,error:error.message},null,2));
  console.error(error.stack);child.kill();process.exitCode=1;
});
