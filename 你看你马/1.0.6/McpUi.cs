using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace CodexPrivacyCurtain {
// The sidebar app is a read-only entry point; opening it never starts the curtain.
static class McpUi {
    public const string Uri="ui://privacy-curtain/main.html";
    public const string Mime="text/html;profile=mcp-app";
    static readonly string IconData=MakeIcon();
    static readonly string ActionIcon="data:image/svg+xml;base64,"+Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='currentColor' d='M12 2 3 6v6c0 5.2 3.8 8.9 9 10 5.2-1.1 9-4.8 9-10V6zm0 3.1 6 2.7v4.1c0 3.7-2.5 6.3-6 7.2-3.5-.9-6-3.5-6-7.2V7.8z'/></svg>"));
    static string MakeIcon(){
        try{
            string path=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","assets","icon.png"));
            using(var source=Image.FromFile(path))using(var bitmap=new Bitmap(64,64))using(var g=Graphics.FromImage(bitmap))using(var stream=new MemoryStream()){
                g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(source,0,0,64,64);bitmap.Save(stream,ImageFormat.Png);
                return "data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());
            }
        }catch{return ActionIconFallback();}
    }
    static string ActionIconFallback(){return "data:image/svg+xml;base64,"+Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='#555' d='M12 2 3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6z'/></svg>"));}
    public static object Tool(){
        var action=new {title="开启隐私幕布",icons=new[]{new{src=ActionIcon,mimeType="image/svg+xml",sizes=new[]{"any"}}},target=new{type="tool",name="curtain_lock",arguments=new{}}};
        var meta=new Dictionary<string,object>{
            {"ui",new{resourceUri=Uri,visibility=new[]{"app"}}},
            {"openai/ui",new Dictionary<string,object>{{"entrypoints",new object[]{new Dictionary<string,object>{{"type","global"},{"quickAction",action}},new Dictionary<string,object>{{"type","thread"}}}}}}
        };
        return new{name="curtain_app",title="你看你马",description="在 Codex 中打开隐私幕布控制页。打开页面不会开启幕布。",icons=new[]{new{src=IconData}},inputSchema=new{type="object",properties=new{},additionalProperties=false},annotations=new{readOnlyHint=true,destructiveHint=false,idempotentHint=true,openWorldHint=false},_meta=meta};
    }
    public static object Resources(){return new{resources=new[]{new{uri=Uri,name="你看你马",description="隐私幕布控制页",mimeType=Mime}}};}
    public static object Read(){return new{contents=new[]{new{uri=Uri,mimeType=Mime,text=Html(),_meta=new Dictionary<string,object>{{"ui",new{csp=new{connectDomains=new string[0],resourceDomains=new string[0]}}},{"openai/ui",new{preferredDisplayMode="fullscreen",availableDisplayModes=new[]{"inline","fullscreen"}}}}}}};}
    static string Html(){return @"<!doctype html>
<html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>
<style>
:root{color-scheme:light dark;font-family:system-ui,'Microsoft YaHei UI',sans-serif;color:#202020;background:#fff}
@media(prefers-color-scheme:dark){:root{color:#ececec;background:#212121}.card{border-color:#494949!important}.muted{color:#b3b3b3!important}button.secondary{border-color:#666!important;color:#ececec!important;background:#292929!important}}
body{margin:0;padding:38px 24px}.wrap{max-width:620px;margin:auto}.head{display:flex;align-items:center;gap:15px;margin-bottom:28px}.head img{width:62px;height:62px;border-radius:14px}.head h1{font-size:24px;margin:0 0 6px}.muted{color:#6b6b6b;line-height:1.65;font-size:14px}.card{border:1px solid #ddd;border-radius:16px;padding:22px}h2{font-size:17px;margin:0 0 9px}p{margin:0 0 15px}.buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}button{border:1px solid #151515;border-radius:9px;padding:10px 16px;font:inherit;font-weight:600;background:#151515;color:white;cursor:pointer}button.secondary{background:white;color:#222;border-color:#ccc}button:disabled{opacity:.5;cursor:default}#message{margin:18px 0 0;min-height:22px;font-size:14px}kbd{font:inherit;background:#eee;color:#333;padding:2px 6px;border-radius:4px}
</style></head><body><main class='wrap'><div class='head'><img alt='' src='{{ICON}}'><div><h1>你看你马</h1><div class='muted'>隐私幕布</div></div></div><section class='card'><h2>手动开启</h2><p class='muted'>在 Codex 内点击“开启隐私幕布”。开启后覆盖各个屏幕；在实体键盘输入幕布密码并按 Enter 解锁。</p><p class='muted'>Codex 客户端在前台时，按 Ctrl + Shift + 左 Alt + N，松开按键后开启。</p><p class='muted'>Windows 锁屏时幕布会自动关闭，解锁后可再次开启。</p><div class='buttons'><button id='lock' type='button' disabled>开启隐私幕布</button><button id='status' class='secondary' type='button' disabled>查看状态</button><button id='shortcut' class='secondary' type='button' disabled>快捷键状态</button><button id='settings' class='secondary' type='button' disabled>修改密码</button></div><p id='message' role='status' aria-live='polite'>正在连接…</p></section></main>
<script>
(()=>{'use strict';const message=document.getElementById('message'),buttons=['lock','status','shortcut','settings'].map(id=>document.getElementById(id));let next=1,ready=false,pending=new Map();
function post(data){window.parent.postMessage(data,'*')}
function call(method,params){return new Promise((resolve,reject)=>{const id=++next,t=setTimeout(()=>{pending.delete(id);reject(Error('请求超时'))},12000);pending.set(id,{resolve,reject,t});post({jsonrpc:'2.0',id,method,params})})}
function showState(result){if(result.isError)throw Error(result.content?.find(x=>x.type==='text')?.text||'操作失败');let state;try{state=JSON.parse(result.content?.find(x=>x.type==='text')?.text||'{}')}catch{state={}}message.textContent=state.locked?'隐私幕布已开启。':'隐私幕布未开启。'}
function action(name){if(!ready)return;buttons.forEach(x=>x.disabled=true);message.textContent='正在处理…';call('tools/call',{name,arguments:{}}).then(r=>{if(name==='curtain_open_settings'){if(r.isError)throw Error(r.content?.find(x=>x.type==='text')?.text||'打开失败');message.textContent='已打开本地改密窗口。'}else if(name==='curtain_shortcut_status'){if(r.isError)throw Error('无法读取快捷键状态');let s=JSON.parse(r.content?.find(x=>x.type==='text')?.text||'{}');message.textContent=s.lastError?'最近一次快捷键操作未能开启幕布。':s.running&&s.registered&&s.sessionSafe?'快捷键已启用。':'快捷键未就绪，请重新连接插件。'}else showState(r)}).catch(e=>{message.textContent=e.message||'操作失败'}).finally(()=>buttons.forEach(x=>x.disabled=false))}
window.addEventListener('message',event=>{if(event.source!==window.parent||event.data?.jsonrpc!=='2.0')return;const d=event.data;if(d.id===1&&!ready){if(d.error){message.textContent='连接失败';return}if(d.result?.protocolVersion){ready=true;post({jsonrpc:'2.0',method:'ui/notifications/initialized'});buttons.forEach(x=>x.disabled=false);action('curtain_status')}return}if(d.id!=null&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.t);d.error?p.reject(Error(d.error.message||'请求失败')):p.resolve(d.result)}if(d.method==='ui/resource-teardown'&&d.id!=null)post({jsonrpc:'2.0',id:d.id,result:{}})});
document.getElementById('lock').onclick=()=>action('curtain_lock');document.getElementById('status').onclick=()=>action('curtain_status');document.getElementById('shortcut').onclick=()=>action('curtain_shortcut_status');document.getElementById('settings').onclick=()=>action('curtain_open_settings');
post({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{appInfo:{name:'privacy-curtain',version:'1.0.6'},appCapabilities:{},protocolVersion:'2026-01-26'}});setTimeout(()=>{if(!ready)message.textContent='连接超时，请关闭后重新打开页面。'},12000)
})();</script></body></html>".Replace("{{ICON}}",IconData);}
}
}
