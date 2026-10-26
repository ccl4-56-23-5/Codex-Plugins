using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace CodexPrivacyCurtain {
sealed class HotkeyWindow : NativeWindow, IDisposable {
    const int Id=0x4350;
    [DllImport("user32.dll",SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint modifiers,uint key);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h,int id);
    readonly Action activate;
    public bool Registered {get;private set;}
    public int Error {get;private set;}
    public HotkeyWindow(Action action){
        activate=action;CreateHandle(new CreateParams{Caption="PrivacyCurtain Quick Launcher",Parent=new IntPtr(-3)});
        Registered=RegisterHotKey(Handle,Id,0x4000|1|2|4,0x4E);
        if(!Registered)Error=Marshal.GetLastWin32Error();
    }
    protected override void WndProc(ref Message m){if(m.Msg==0x312&&m.WParam.ToInt32()==Id)activate();base.WndProc(ref m);}
    public void Dispose(){if(Registered){UnregisterHotKey(Handle,Id);Registered=false;}DestroyHandle();}
}
sealed class QuickLauncher : ApplicationContext {
    readonly Control dispatch=new Control();
    readonly HotkeyWindow hotkey;
    readonly NotifyIcon tray;
    readonly Icon icon;
    readonly System.Windows.Forms.Timer timeout;
    readonly int testSeconds;
    volatile bool stopping;
    bool busy;
    int activations;
    string lastTrigger="",lastError="";
    public QuickLauncher(int seconds){
        testSeconds=seconds;dispatch.CreateControl();
        hotkey=new HotkeyWindow(()=>Activate("hotkey"));
        if(!hotkey.Registered)lastError="Ctrl+Shift+Alt+N 注册失败，可能已被其他程序占用。Win32="+hotkey.Error;
        icon=new Icon(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","assets","icon.ico"));
        var menu=new ContextMenuStrip();
        menu.Items.Add("开启隐私幕布    Ctrl+Shift+Alt+N",null,(s,e)=>Activate("tray"));
        menu.Items.Add("修改密码",null,(s,e)=>Process.Start(new ProcessStartInfo(Application.ExecutablePath,"--settings"){UseShellExecute=true,WindowStyle=ProcessWindowStyle.Hidden}));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出快捷入口（幕布保持当前状态）",null,(s,e)=>Stop());
        tray=new NotifyIcon{Icon=icon,Text=hotkey.Registered?"你看你马 · Ctrl+Shift+Alt+N 开启":"你看你马 · 快捷键被占用，请使用托盘",ContextMenuStrip=menu,Visible=true};
        tray.MouseClick+=(s,e)=>{if(e.Button==MouseButtons.Left)Activate("tray");};
        if(!hotkey.Registered)tray.ShowBalloonTip(6000,"你看你马",lastError,ToolTipIcon.Warning);
        new Thread(PipeLoop){IsBackground=true,Name="PrivacyCurtain launcher IPC"}.Start();
        if(seconds>0){timeout=new System.Windows.Forms.Timer{Interval=seconds*1000};timeout.Tick+=(s,e)=>Stop();timeout.Start();}
        Store.Log("quick launcher started version=1.0.4 hotkey="+hotkey.Registered);
    }
    void Activate(string source){
        if(busy||stopping)return;busy=true;lastTrigger=source;
        ThreadPool.QueueUserWorkItem(_=>{
            string error="";
            try{var state=Client.Lock(testSeconds>0?5:0) as System.Collections.Generic.Dictionary<string,object>;if(state==null||!state.ContainsKey("locked")||!(bool)state["locked"])throw new InvalidOperationException(state==null?"幕布未返回状态":Json.Str(state,"lastError"));}
            catch(Exception ex){error=ex.Message;}
            try{dispatch.BeginInvoke((Action)(()=>{busy=false;lastError=error;if(error.Length==0)activations++;else tray.ShowBalloonTip(6000,"幕布开启失败",error,ToolTipIcon.Error);}));}catch(InvalidOperationException){}
        });
    }
    object Status(){return new{version="1.0.4",running=true,hotkey="Ctrl+Shift+Alt+N",hotkeyRegistered=hotkey.Registered,registrationError=hotkey.Error,executable=Application.ExecutablePath,activations=activations,lastTrigger=lastTrigger,busy=busy,lastError=lastError,testMode=testSeconds>0};}
    void PipeLoop(){
        var acl=new PipeSecurity();acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User,PipeAccessRights.FullControl,AccessControlType.Allow));
        while(!stopping)try{using(var pipe=new NamedPipeServerStream(Store.Pipe+"-launcher",PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096,acl)){
            pipe.WaitForConnection();using(var r=new StreamReader(pipe,Encoding.UTF8,false,4096,true))using(var w=new StreamWriter(pipe,new UTF8Encoding(false),4096,true){AutoFlush=true}){
                var read=r.ReadLineAsync();if(!read.Wait(3000)||read.Result==null||read.Result.Length>4096)continue;
                var request=Json.Read(read.Result);object result=null;bool stop=false;
                using(var done=new ManualResetEvent(false)){
                    dispatch.BeginInvoke((Action)(()=>{
                        string cmd=Json.Str(request,"command");
                        if(cmd=="status")result=Status();
                        else if(cmd=="stop"&&String.Equals(Json.Str(request,"executable"),Application.ExecutablePath,StringComparison.OrdinalIgnoreCase)){result=new{ok=true};stop=true;}
                        else result=new{ok=false,error="未知命令或入口版本不匹配"};done.Set();
                    }));
                    if(!done.WaitOne(10000))continue;w.WriteLine(Json.Write(result));
                    if(stop)dispatch.BeginInvoke((Action)Stop);
                }
            }
        }}catch(Exception){if(!stopping)Thread.Sleep(100);}
    }
    void Stop(){if(stopping)return;stopping=true;if(timeout!=null)timeout.Stop();tray.Visible=false;tray.Dispose();icon.Dispose();hotkey.Dispose();ExitThread();}
    protected override void ExitThreadCore(){if(!stopping){Stop();return;}dispatch.Dispose();base.ExitThreadCore();}
}
static class LauncherClient {
    public static object Status(){try{return Client.Request(new{command="status"},400,Store.Pipe+"-launcher");}catch(TimeoutException){return new{version="1.0.4",running=false,hotkey="Ctrl+Shift+Alt+N",hotkeyRegistered=false};}}
    public static void Stop(bool ownOnly){
        var state=Status() as System.Collections.Generic.Dictionary<string,object>;
        if(state==null||!state.ContainsKey("executable"))return;
        string path=Json.Str(state,"executable");
        if(ownOnly&&!String.Equals(path,Application.ExecutablePath,StringComparison.OrdinalIgnoreCase))return;
        Client.Request(new{command="stop",executable=path},800,Store.Pipe+"-launcher");
    }
    public static void Run(bool replace,int seconds){
        // Serialize upgrades so two launchers cannot stop or replace each other concurrently.
        using(var launch=new Mutex(false,"Local\\"+Store.Pipe+"-launcher-start")){
            if(!launch.WaitOne(10000))throw new TimeoutException("快捷入口启动正在进行");
            try{
                if(replace)Stop(false);
                Mutex single=null;
                for(int i=0;i<30;i++){bool made;single=new Mutex(true,"Local\\"+Store.Pipe+"-launcher-single",out made);if(made)break;single.Dispose();single=null;if(!replace)return;Thread.Sleep(100);}
                if(single==null)throw new TimeoutException("旧快捷入口退出超时");
                // Release the launch mutex before entering the resident message loop.
                launch.ReleaseMutex();
                using(single){Application.EnableVisualStyles();Application.Run(new QuickLauncher(seconds));single.ReleaseMutex();}
                return;
            }finally{try{launch.ReleaseMutex();}catch(ApplicationException){}}
        }
    }
}
}
