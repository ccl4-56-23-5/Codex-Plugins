using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace CodexPrivacyCurtain {
static class Json {
    public static string Write(object o) { return new JavaScriptSerializer().Serialize(o); }
    public static Dictionary<string,object> Read(string s) { return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(s); }
    public static string Str(Dictionary<string,object> d,string key,string fallback="") { return d.ContainsKey(key) ? Convert.ToString(d[key]) : fallback; }
}
static class Store {
    public static readonly string Root = Path.GetFullPath(Environment.GetEnvironmentVariable("CPC_DATA_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CodexPrivacyCurtain","data"));
    public static string Pipe { get { using(var h=SHA256.Create()) return "CodexPrivacyCurtain-"+BitConverter.ToString(h.ComputeHash(Encoding.UTF8.GetBytes(Root+WindowsIdentity.GetCurrent().User.Value))).Replace("-","").Substring(0,24); } }
    static string FileName { get { return Path.Combine(Root,"password.dpapi"); } }
    public static void Ensure() { Directory.CreateDirectory(Root); if(!File.Exists(FileName)) Save("123456"); }
    public static void Log(string message){try{Directory.CreateDirectory(Root);File.AppendAllText(Path.Combine(Root,"lifecycle.log"),DateTime.Now.ToString("o")+" "+message+Environment.NewLine);}catch{}}
    public static bool Valid(string p) { return p!=null && p.Length>=6 && p.Length<=32 && p.All(c=>c>='0'&&c<='9'); }
    public static void Save(string p) {
        if(!Valid(p)) throw new ArgumentException("密码须为 6–32 位数字。");
        Directory.CreateDirectory(Root); byte[] salt=new byte[24]; using(var r=RandomNumberGenerator.Create())r.GetBytes(salt);
        byte[] hash; using(var k=new Rfc2898DeriveBytes(p,salt,180000,HashAlgorithmName.SHA256))hash=k.GetBytes(32);
        var raw=Encoding.UTF8.GetBytes(Json.Write(new {salt=Convert.ToBase64String(salt), hash=Convert.ToBase64String(hash), iterations=180000}));
        string tmp=FileName+"."+Guid.NewGuid().ToString("N")+".tmp";
        File.WriteAllBytes(tmp,ProtectedData.Protect(raw,null,DataProtectionScope.CurrentUser));
        if(File.Exists(FileName))File.Replace(tmp,FileName,null); else File.Move(tmp,FileName);
    }
    public static bool Check(string p) {
        if(!Valid(p))return false;
        var d=Json.Read(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(FileName),null,DataProtectionScope.CurrentUser)));
        byte[] expected=Convert.FromBase64String(Json.Str(d,"hash")), actual;
        using(var k=new Rfc2898DeriveBytes(p,Convert.FromBase64String(Json.Str(d,"salt")),Convert.ToInt32(d["iterations"]),HashAlgorithmName.SHA256))actual=k.GetBytes(expected.Length);
        int diff=0; for(int i=0;i<actual.Length;i++)diff|=actual[i]^expected[i]; return diff==0;
    }
}
static class Native {
    public delegate IntPtr Hook(int code,IntPtr w,IntPtr l);
    [StructLayout(LayoutKind.Sequential)] public struct Kbd { public uint vk,scan,flags,time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] public struct Mouse { public Point pt; public uint data,flags,time; public UIntPtr extra; }
    [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SetWindowsHookEx(int id,Hook callback,IntPtr module,uint thread);
    [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr w,IntPtr l);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string s);
    [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowDisplayAffinity(IntPtr h,uint affinity);
    [DllImport("user32.dll",SetLastError=true)] public static extern bool GetWindowDisplayAffinity(IntPtr h,out uint affinity);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h,uint color,byte alpha,uint flags);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern int GetDpiForSystem();
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h,int attribute,ref int value,int size);
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [StructLayout(LayoutKind.Sequential)] public struct Rect {public int left,top,right,bottom;}
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int index);
    public static Rectangle Bounds(IntPtr h){Rect r;if(!GetWindowRect(h,out r))throw new InvalidOperationException("Cannot read curtain bounds");return Rectangle.FromLTRB(r.left,r.top,r.right,r.bottom);}
    [DllImport("ntdll.dll")] static extern int RtlGetVersion(ref OSVERSIONINFO info);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct OSVERSIONINFO { public int size,major,minor,build,platform; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)] public string csd; }
    public static int Build { get { var i=new OSVERSIONINFO(); i.size=Marshal.SizeOf(i); RtlGetVersion(ref i); return i.build; } }
}
class Curtain : Form {
    static readonly string WallpaperPath=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","assets","wallpaper.jpg"));
    static readonly Image Wallpaper=Image.FromFile(WallpaperPath);
    public static string WallpaperHash {get{using(var h=SHA256.Create())using(var s=File.OpenRead(WallpaperPath))return BitConverter.ToString(h.ComputeHash(s)).Replace("-","");}}
    public string Dots="", Message="直接输入密码，按 Enter 解锁";
    public Curtain(Rectangle r) { var width=Wallpaper.Width; FormBorderStyle=FormBorderStyle.None; AutoScaleMode=AutoScaleMode.None; StartPosition=FormStartPosition.Manual; Bounds=r; ShowInTaskbar=false; TopMost=true; BackColor=Color.FromArgb(255,250,239); DoubleBuffered=true; }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams { get { var p=base.CreateParams; p.ExStyle|=0x08000000|0x20|0x80000|0x80; return p; } }
    public void VerifyAffinity() { uint a; if(!Native.SetWindowDisplayAffinity(Handle,0x11)||!Native.GetWindowDisplayAffinity(Handle,out a)||a!=0x11)throw new InvalidOperationException("截图排除不可用；未启用幕布。Win32="+Marshal.GetLastWin32Error()); Native.SetLayeredWindowAttributes(Handle,0,255,2); }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e); var g=e.Graphics; g.SmoothingMode=SmoothingMode.AntiAlias;
        g.Clear(BackColor); float fit=Math.Min((float)Width/Wallpaper.Width,(float)Height/Wallpaper.Height);
        g.InterpolationMode=InterpolationMode.HighQualityBicubic;
        g.DrawImage(Wallpaper,new RectangleF((Width-Wallpaper.Width*fit)/2f,(Height-Wallpaper.Height*fit)/2f,Wallpaper.Width*fit,Wallpaper.Height*fit));
        float sc=Math.Max(.6f,Math.Min(DeviceDpi/96f,Math.Min(Width/600f,Height/400f)));
        g.TranslateTransform(Width/2f,Height-130*sc);g.ScaleTransform(sc,sc);
        using(var b=new SolidBrush(Color.FromArgb(224,255,252,244)))g.FillRectangle(b,-233,-8,466,116);
        Draw(g,Dots.Length==0?"隐私幕布已开启 · Codex 继续工作":new string('●',Math.Min(Dots.Length,24)),new Font("Microsoft YaHei UI",12,FontStyle.Bold),Color.FromArgb(91,46,24),3);
        Draw(g,Message,new Font("Microsoft YaHei UI",10),Color.FromArgb(102,67,44),38);
        Draw(g,"Enter 解锁  ·  Backspace 删除  ·  Esc 清空",new Font("Microsoft YaHei UI",9),Color.FromArgb(128,99,74),69);
    }
    static void Draw(Graphics g,string text,Font f,Color c,float y) { using(f)using(var b=new SolidBrush(c))using(var sf=new StringFormat {Alignment=StringAlignment.Center})g.DrawString(text,f,b,new PointF(0,y),sf); }
}
class Guard : ApplicationContext {
    readonly Control dispatch=new Control(); readonly List<Curtain> forms=new List<Curtain>();
    Native.Hook kb,ms; IntPtr kh,mh; SessionWatch session; System.Windows.Forms.Timer timer; volatile bool locked,stopping; string digits="",message="直接输入密码，按 Enter 解锁"; bool checking; int fails; DateTime retry=DateTime.MinValue; DateTime until=DateTime.MaxValue;
    long physicalKeys,physicalMouse,injectedKeys,injectedMouse; string lastError="";
    public Guard(int testSeconds) {
        dispatch.CreateControl(); kb=Keyboard; ms=Mouse;
        if(testSeconds>0)until=DateTime.UtcNow.AddSeconds(testSeconds);
        new Thread(PipeLoop){IsBackground=true,Name="PrivacyCurtain IPC"}.Start();
        try {
            if(Native.Build<19041)throw new InvalidOperationException("需要 Windows 10 2004 或更新版本。");
            session=new SessionWatch(SessionUnsafe);
            Store.Ensure();
            Rebuild();
            kh=Native.SetWindowsHookEx(13,kb,Native.GetModuleHandle(null),0); mh=Native.SetWindowsHookEx(14,ms,Native.GetModuleHandle(null),0);
            if(kh==IntPtr.Zero||mh==IntPtr.Zero)throw new InvalidOperationException("无法注册实体输入拦截；Win32="+Marshal.GetLastWin32Error());
            if(!session.CheckNow())throw new InvalidOperationException("Windows 会话状态已变化；幕布未启用。");
            locked=true;
            Store.Log("guard started pid="+Process.GetCurrentProcess().Id+" testSeconds="+testSeconds);
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged+=DisplayChanged;
            timer=new System.Windows.Forms.Timer {Interval=500}; timer.Tick+=(s,e)=> { if(DateTime.UtcNow>=until){Store.Log("test timer expired");Stop();return;} foreach(var f in forms){Native.SetWindowPos(f.Handle,new IntPtr(-1),0,0,0,0,0x13);f.Invalidate();} }; timer.Start();
        } catch(Exception ex) { lastError=ex.Message; Cleanup(); System.Windows.Forms.Timer quit=new System.Windows.Forms.Timer{Interval=2500};quit.Tick+=(s,e)=>{quit.Stop();ExitThread();};quit.Start(); }
    }
    void SessionUnsafe(string reason){Store.Log("session safety: "+reason);try{if(dispatch.InvokeRequired)dispatch.BeginInvoke((Action)Stop);else Stop();}catch(InvalidOperationException){}}
    void DisplayChanged(object sender,EventArgs e) { if(!stopping)dispatch.BeginInvoke((Action)(()=>{try{Rebuild();}catch(Exception ex){lastError=ex.Message;Store.Log("display rebuild failed: "+ex.Message);Stop();}})); }
    void Rebuild() { foreach(var f in forms)f.Close();forms.Clear(); try{foreach(var s in Screen.AllScreens){var f=new Curtain(s.Bounds);forms.Add(f);var h=f.Handle;f.VerifyAffinity();f.Show();Native.ShowWindow(h,8);}}catch{foreach(var f in forms)f.Close();forms.Clear();throw;} Render(); }
    void Render() { foreach(var f in forms){f.Dots=digits;f.Message=message;f.Invalidate();} }
    IntPtr Keyboard(int code,IntPtr w,IntPtr l) {
        if(code<0||!locked||session==null||!session.IsSafe)return Native.CallNextHookEx(kh,code,w,l);
        var k=(Native.Kbd)Marshal.PtrToStructure(l,typeof(Native.Kbd));
        if((k.flags&0x12)!=0){Interlocked.Increment(ref injectedKeys);return Native.CallNextHookEx(kh,code,w,l);}
        Interlocked.Increment(ref physicalKeys);
        bool up=(k.flags&0x80)!=0;
        if((!up && k.vk!=13)||(up && k.vk==13)){uint v=k.vk; dispatch.BeginInvoke((Action)(()=>Key(v)));}
        return new IntPtr(1);
    }
    IntPtr Mouse(int code,IntPtr w,IntPtr l) {
        if(code<0||!locked||session==null||!session.IsSafe)return Native.CallNextHookEx(mh,code,w,l);
        var m=(Native.Mouse)Marshal.PtrToStructure(l,typeof(Native.Mouse));
        if((m.flags&3)!=0){Interlocked.Increment(ref injectedMouse);return Native.CallNextHookEx(mh,code,w,l);}
        Interlocked.Increment(ref physicalMouse);return new IntPtr(1);
    }
    void Key(uint v) {
        if(!locked||checking)return;
        if(v==27){digits="";message="已清空；请输入密码";}
        else if(v==8){if(digits.Length>0)digits=digits.Substring(0,digits.Length-1);}
        else if(v==13){TryPassword(digits,null);return;}
        else if(digits.Length<32){if(v>=48&&v<=57)digits+=(char)v;else if(v>=96&&v<=105)digits+=(char)('0'+v-96);}
        Render();
    }
    void TryPassword(string p,Action<object> done) {
        if(checking){if(done!=null)done(new{ok=false,error="正在验证"});return;}
        if(DateTime.UtcNow<retry){message="尝试过多，请稍后再试";digits="";Render();if(done!=null)done(new{ok=false,error=message});return;}
        checking=true; message="正在验证…";Render();
        ThreadPool.QueueUserWorkItem(_=> { bool ok=false;string error="";try{ok=Store.Check(p);}catch(Exception ex){error=ex.Message;}
            dispatch.BeginInvoke((Action)(()=>{ checking=false;digits="";if(ok){Store.Log(done==null?"physical keyboard password accepted":"IPC password accepted");if(done!=null)done(new{ok=true,locked=false});Stop();}else{fails++;if(fails>=5){retry=DateTime.UtcNow.AddSeconds(Math.Min(30,5*(fails-4)));}message=error.Length>0?"密码记录异常，请通过系统安全选项恢复":"密码不正确，请重新输入";Render();if(done!=null)done(new{ok=false,error=message});} })); });
    }
    object Status() {
        var windows=forms.Select(f=>{var b=Native.Bounds(f.Handle);uint affinity;bool a=Native.GetWindowDisplayAffinity(f.Handle,out affinity);long style=Native.GetWindowLongPtr(f.Handle,-20).ToInt64();return new{handle=f.Handle.ToInt64(),x=b.X,y=b.Y,width=b.Width,height=b.Height,visible=Native.IsWindowVisible(f.Handle),topmost=(style&8)!=0,clickThrough=(style&0x20)!=0,noActivate=(style&0x8000000)!=0,captureExcluded=a&&affinity==0x11};}).ToArray();
        var screens=Screen.AllScreens;bool covered=locked&&screens.Length==windows.Length&&screens.All(s=>windows.Any(w=>w.visible&&w.topmost&&w.x==s.Bounds.X&&w.y==s.Bounds.Y&&w.width==s.Bounds.Width&&w.height==s.Bounds.Height));
        return new {version="1.0.6",locked=locked,monitors=forms.Count,allCurtainsVisible=locked&&windows.All(w=>w.visible),coverageVerified=covered,monitorBounds=windows,wallpaperSha256=Curtain.WallpaperHash,captureAffinity=locked&&windows.All(w=>w.captureExcluded)?"WDA_EXCLUDEFROMCAPTURE":"none",physicalInputBlocked=locked&&session!=null&&session.IsSafe,injectedInputAllowed=true,sessionNotificationsRegistered=session!=null&&session.Registered,systemSessionSafe=session!=null&&session.IsSafe,sessionMonitorHandle=session==null?0:session.Handle.ToInt64(),physicalKeyboardEvents=Interlocked.Read(ref physicalKeys),physicalMouseEvents=Interlocked.Read(ref physicalMouse),injectedKeyboardEvents=Interlocked.Read(ref injectedKeys),injectedMouseEvents=Interlocked.Read(ref injectedMouse),testAutoRelease=until!=DateTime.MaxValue,lastError=lastError};
    }
    void PipeLoop() {
        var acl=new PipeSecurity();acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User,PipeAccessRights.FullControl,AccessControlType.Allow));
        while(!stopping)try{using(var pipe=new NamedPipeServerStream(Store.Pipe,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096,acl)){
            pipe.WaitForConnection();using(var r=new StreamReader(pipe,Encoding.UTF8,false,4096,true))using(var w=new StreamWriter(pipe,new UTF8Encoding(false),4096,true){AutoFlush=true}) {
                var read=r.ReadLineAsync();if(!read.Wait(3000))continue;string line=read.Result;if(line==null||line.Length>4096)continue;
                var q=Json.Read(line);object result=null;using(var done=new ManualResetEvent(false)){
                    dispatch.BeginInvoke((Action)(()=>{string cmd=Json.Str(q,"command");if(cmd=="status"){result=Status();done.Set();}else if(cmd=="unlock"){TryPassword(Json.Str(q,"password"),o=>{result=o;done.Set();});}else{result=new{ok=false,error="未知命令"};done.Set();}}));
                    if(!done.WaitOne(10000))result=new{ok=false,error="UI timeout"};w.WriteLine(Json.Write(result));
                }
            }
        }}catch(Exception){if(!stopping)Thread.Sleep(100);}
    }
    void Cleanup() { locked=false;if(kh!=IntPtr.Zero){Native.UnhookWindowsHookEx(kh);kh=IntPtr.Zero;}if(mh!=IntPtr.Zero){Native.UnhookWindowsHookEx(mh);mh=IntPtr.Zero;}if(session!=null){session.Dispose();session=null;}foreach(var f in forms)f.Close();forms.Clear(); }
    void Stop(){if(stopping)return;Store.Log("guard stopping");stopping=true;if(timer!=null)timer.Stop();Microsoft.Win32.SystemEvents.DisplaySettingsChanged-=DisplayChanged;Cleanup();System.Windows.Forms.Timer t=new System.Windows.Forms.Timer{Interval=300};t.Tick+=(s,e)=>{t.Stop();ExitThread();};t.Start();}
    protected override void ExitThreadCore(){stopping=true;Cleanup();base.ExitThreadCore();}
}
static class Client {
    public static Dictionary<string,object> Request(object q,int wait=800,string pipeName=null) { using(var pipe=new NamedPipeClientStream(".",pipeName??Store.Pipe,PipeDirection.InOut,PipeOptions.Asynchronous)) { pipe.Connect(wait);using(var r=new StreamReader(pipe,Encoding.UTF8,false,4096,true))using(var w=new StreamWriter(pipe,new UTF8Encoding(false),4096,true){AutoFlush=true}){w.WriteLine(Json.Write(q));var t=r.ReadLineAsync();if(!t.Wait(12000))throw new TimeoutException("幕布未响应");return Json.Read(t.Result);} } }
    static object Missing(){try{using(var m=Mutex.OpenExisting("Local\\"+Store.Pipe+"-guard"))throw new InvalidOperationException("幕布进程仍在运行，但状态通道不可用；不能确认已解锁。");}catch(WaitHandleCannotBeOpenedException){return new{version="1.0.6",locked=false,running=false};}}
    public static object Status(){try{return Request(new{command="status"});}catch(TimeoutException){return Missing();}catch(IOException){return Missing();}}
    public static object Lock(int seconds=0){
        if(!SessionSafety.IsInteractiveUnlocked())throw new InvalidOperationException("Windows 已锁定、处于安全桌面或会话状态不可用；幕布未启用。");
        using(var m=new Mutex(false,"Local\\"+Store.Pipe+"-launch")){if(!m.WaitOne(10000))throw new TimeoutException("启动正在进行");try{
            try{var state=Request(new{command="status"},150);if(state.ContainsKey("locked")&&(bool)state["locked"])return state;}catch(TimeoutException){}catch(IOException){}
            string args="--guard"+(seconds>0?" --test-seconds "+seconds:"");
            var p=Process.Start(new ProcessStartInfo(Application.ExecutablePath,args){UseShellExecute=true,WindowStyle=ProcessWindowStyle.Hidden});
            for(int i=0;i<40;i++){Thread.Sleep(100);try{var s=Request(new{command="status"},100);if((bool)s["locked"]||Json.Str(s,"lastError").Length>0)return s;}catch(TimeoutException){}catch(IOException){}if(p.HasExited)break;}
            throw new InvalidOperationException("幕布启动失败，未改变 Windows 锁定状态。");
        }finally{m.ReleaseMutex();}}
    }
}
static class Program {
    [STAThread] static int Main(string[] args){
        string mode=args.Length>0?args[0]:"--lock";
        if(mode!="--serve"&&mode!="--status"&&mode!="--shortcut-status"&&mode!="--unlock"&&mode!="--self-test"&&mode!="--remove-legacy-launcher") { var h=Native.GetConsoleWindow();if(h!=IntPtr.Zero)Native.ShowWindow(h,0); }
        try{
            Native.SetProcessDpiAwarenessContext(new IntPtr(-4));
            if(mode=="--remove-legacy-launcher"){LegacyLauncher.Stop();return 0;}
            if(mode=="--settings-preview"){Application.EnableVisualStyles();if(args.Length!=4)throw new ArgumentException("Preview needs path, light/dark, dpi");PasswordSettingsForm.Preview(args[1],args[2]=="dark",int.Parse(args[3]));return 0;}
            if(mode=="--settings-ui-test"){Application.EnableVisualStyles();if(args.Length!=2)throw new ArgumentException("UI test output directory required");PasswordSettingsForm.VerifyUi(args[1]);return 0;}
            if(mode=="--preview"){Application.EnableVisualStyles();if(args.Length!=2)throw new ArgumentException("Preview output path required");using(var f=new Curtain(new Rectangle(0,0,1920,1080)))using(var b=new Bitmap(1920,1080)){f.DrawToBitmap(b,new Rectangle(0,0,1920,1080));b.Save(args[1],System.Drawing.Imaging.ImageFormat.Png);}return 0;}
            if(mode=="--guard") {bool made;using(var m=new Mutex(true,"Local\\"+Store.Pipe+"-guard",out made)){if(!made)return 0;Application.EnableVisualStyles();int secs=0;if(args.Length==3&&args[1]=="--test-seconds")secs=Math.Max(5,Math.Min(60,int.Parse(args[2])));Application.Run(new Guard(secs));}return 0;}
            if(mode=="--serve"){
                ScopedShortcut shortcut=null;
                try{if(Environment.GetEnvironmentVariable("CPC_DISABLE_SHORTCUT")!="1")shortcut=new ScopedShortcut("Local\\"+Store.Pipe+"-codex-shortcut",()=>{
                    var lockState=Client.Lock() as Dictionary<string,object>;
                    if(lockState==null||!lockState.ContainsKey("locked")||!(bool)lockState["locked"])throw new InvalidOperationException(lockState==null?"幕布未返回状态":Json.Str(lockState,"lastError","幕布未开启"));
                });}
                catch(Exception ex){Store.Log("shortcut initialization failed: "+ex.Message);}
                try{Mcp.Run();}finally{if(shortcut!=null)shortcut.Dispose();}return 0;
            }
            if(mode=="--shortcut-status"){Console.WriteLine(ScopedShortcut.QueryStatus("Local\\"+Store.Pipe+"-codex-shortcut"));return 0;}
            if(mode=="--status"){Console.WriteLine(Json.Write(Client.Status()));return 0;}
            if(mode=="--unlock"){Console.WriteLine(Json.Write(Client.Request(new{command="unlock",password=Console.ReadLine()})));return 0;}
            if(mode=="--settings"){Settings();return 0;}
            if(mode=="--self-test"){Store.Ensure();bool ok=Store.Check("123456")&&!Store.Check("999999")&&!Store.Valid("abc")&&Store.Valid("123456");Console.WriteLine(Json.Write(new{ok=ok,build=Native.Build,pipe=Store.Pipe}));return ok?0:1;}
            if(mode=="--smoke"){Console.WriteLine(Json.Write(Client.Lock(20)));return 0;}
            if(mode!="--lock")throw new ArgumentException("Unknown command");
            var result=Client.Lock();var d=result as Dictionary<string,object>;if(d!=null&&!(bool)d["locked"])throw new InvalidOperationException(Json.Str(d,"lastError"));return 0;
        }catch(Exception ex){if(mode=="--serve"||mode=="--status"||mode=="--shortcut-status"||mode=="--unlock"||mode=="--self-test"||mode=="--remove-legacy-launcher")Console.Error.WriteLine(ex.Message);else MessageBox.Show(ex.Message,"你看你马",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
    }
    public static void Settings(){
        var s=Client.Status() as Dictionary<string,object>;if(s!=null&&s.ContainsKey("locked")&&(bool)s["locked"])throw new InvalidOperationException("请先输入密码解锁，再修改密码。");
        Store.Ensure();Application.EnableVisualStyles();using(var f=new PasswordSettingsForm())using(var show=new System.Windows.Forms.Timer{Interval=300}){
            show.Tick+=(o,e)=>{show.Stop();Native.ShowWindow(f.Handle,5);f.Activate();};show.Start();f.ShowDialog();
        }
    }
}
static class Mcp {
    static object Tool(string name,string description,object props,string[] required,bool readOnly){return new{name=name,title=name=="curtain_open_settings"?"修改密码":name=="curtain_lock"?"开启隐私幕布":name,description=description,inputSchema=new{type="object",properties=props,required=required,additionalProperties=false},annotations=new{readOnlyHint=readOnly,destructiveHint=false,idempotentHint=name!="curtain_open_settings",openWorldHint=false}};}
    static object SettingsCapability(){return new Dictionary<string,object>{{"openai/settings",new{readTool="curtain_settings_read",updateTool="curtain_settings_update"}}};}
    static object ReadSettings(){return new{schema=new{type="object",properties=new{}},values=new{},layout=new[]{new{kind="group",title="手动开启",items=new[]{new{kind="tool",tool="curtain_lock",description="立即开启全部屏幕幕布；Codex 前台可按 Ctrl+Shift+左Alt+N。Windows 锁屏时幕布会自动关闭。"}}},new{kind="group",title="密码与解锁",items=new[]{new{kind="tool",tool="curtain_open_settings",description="打开本地改密窗口，输入当前密码及两次新密码。"}}}}};}
    static object ReadSettingsTool(){return new{name="curtain_settings_read",title="读取幕布插件设置",description="读取插件详情页中的密码设置入口，不读取或修改密码。",inputSchema=new{type="object",properties=new{},additionalProperties=false},outputSchema=new{type="object",properties=new{schema=new{type="object"},values=new{type="object"},layout=new{type="array",items=new{type="object"}}},required=new[]{"schema","values"}},annotations=new{readOnlyHint=true,destructiveHint=false,idempotentHint=true,openWorldHint=false}};}
    static object UpdateSettingsTool(){return new{name="curtain_settings_update",title="更新幕布插件设置",description="本插件设置页仅提供本地改密按钮，不接收密码或普通字段。",inputSchema=new{type="object",properties=new{set=new{type="object",properties=new{},additionalProperties=false}},required=new[]{"set"},additionalProperties=false},outputSchema=new{type="object",properties=new{values=new{type="object"}},required=new[]{"values"}},annotations=new{readOnlyHint=false,destructiveHint=false,idempotentHint=true,openWorldHint=false}};}
    static object[] Tools(){return new[]{
        Tool("curtain_status","读取本机隐私幕布状态及实体/注入输入计数。",new{},new string[0],true),
        Tool("curtain_shortcut_status","读取 Codex 前台快捷键监听状态，不读取输入内容。",new{},new string[0],true),
        Tool("curtain_lock","开启多屏隐私幕布；实体键鼠被拦截，注入输入放行。不会调用 Windows 锁定。",new{},new string[0],false),
        Tool("curtain_unlock","使用用户提供的数字密码解锁。不要猜测密码或读取本地密码文件。",new{password=new{type="string",description="用户提供的解锁密码，初始 123456"}},new[]{"password"},false),
        Tool("curtain_open_settings","打开修改密码窗口，需要用户在窗口中输入当前及新密码。",new{},new string[0],false),ReadSettingsTool(),UpdateSettingsTool(),McpUi.Tool()};}
    public static void Run(){Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);string line;while((line=Console.ReadLine())!=null){Dictionary<string,object> q=null;try{
        q=Json.Read(line);if(!q.ContainsKey("id"))continue;string method=Json.Str(q,"method");object result;
        if(method=="initialize"){var p=q.ContainsKey("params")?q["params"] as Dictionary<string,object>:null;string requested=p==null?"":Json.Str(p,"protocolVersion");result=new{protocolVersion=new[]{"2024-11-05","2025-03-26","2025-06-18","2025-11-25"}.Contains(requested)?requested:"2025-06-18",capabilities=new{tools=new{listChanged=false},resources=new{subscribe=false,listChanged=false},experimental=SettingsCapability(),extensions=SettingsCapability()},serverInfo=new{name="codex-privacy-curtain",version="1.0.6"}};}
        else if(method=="ping")result=new{};
        else if(method=="tools/list")result=new{tools=Tools()};
        else if(method=="resources/list")result=McpUi.Resources();
        else if(method=="resources/read"){
            var p=q.ContainsKey("params")?q["params"] as Dictionary<string,object>:null;
            if(p==null||Json.Str(p,"uri")!=McpUi.Uri){Console.WriteLine(Json.Write(new{jsonrpc="2.0",id=q["id"],error=new{code=-32002,message="Resource not found"}}));continue;}
            result=McpUi.Read();
        }
        else if(method=="tools/call"){
            var p=(Dictionary<string,object>)q["params"];string name=Json.Str(p,"name");var a=p.ContainsKey("arguments")?p["arguments"] as Dictionary<string,object>:new Dictionary<string,object>();object value;
            try{switch(name){case "curtain_app":value=new{};break;case "curtain_status":value=Client.Status();break;case "curtain_shortcut_status":value=Json.Read(ScopedShortcut.QueryStatus("Local\\"+Store.Pipe+"-codex-shortcut"));break;case "curtain_lock":value=Client.Lock();break;case "curtain_unlock":value=Client.Request(new{command="unlock",password=Json.Str(a,"password")});break;case "curtain_open_settings":Process.Start(new ProcessStartInfo(Application.ExecutablePath,"--settings"){UseShellExecute=true,WindowStyle=ProcessWindowStyle.Hidden});value=new{opened=true};break;case "curtain_settings_read":value=ReadSettings();break;case "curtain_settings_update":var set=a!=null&&a.ContainsKey("set")?a["set"] as Dictionary<string,object>:null;if(set==null||set.Count!=0)throw new ArgumentException("请使用“修改密码”按钮，在本地窗口更改密码。");value=new{values=new{}};break;default:throw new ArgumentException("未知工具");}
                var d=value as Dictionary<string,object>;bool failed=d!=null&&((d.ContainsKey("ok")&&!(bool)d["ok"])||(d.ContainsKey("lastError")&&Json.Str(d,"lastError").Length>0));if(name=="curtain_app")result=new{content=new object[0],isError=false};else if(name=="curtain_settings_read"||name=="curtain_settings_update")result=new{content=new object[0],structuredContent=value,isError=false};else result=new{content=new[]{new{type="text",text=Json.Write(value)}},isError=failed};
            }catch(Exception ex){result=new{content=new[]{new{type="text",text=ex.Message}},isError=true};}
        }else{Console.WriteLine(Json.Write(new{jsonrpc="2.0",id=q["id"],error=new{code=-32601,message="Method not found"}}));continue;}
        Console.WriteLine(Json.Write(new{jsonrpc="2.0",id=q["id"],result=result}));
    }catch(Exception ex){Console.WriteLine(Json.Write(new{jsonrpc="2.0",id=q!=null&&q.ContainsKey("id")?q["id"]:null,error=new{code=-32602,message=ex.Message}}));}}}
}
}
