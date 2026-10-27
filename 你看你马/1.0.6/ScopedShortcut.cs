using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace CodexPrivacyCurtain {

// Only modifier state and the designated N key are retained; typed text is never recorded.
sealed class ShortcutGesture {
    const int LShift=1,RShift=2,LCtrl=4,RCtrl=8,LAlt=16,RAlt=32,LWin=64,RWin=128;
    const int Shift=LShift|RShift, Ctrl=LCtrl|RCtrl, Alt=LAlt|RAlt, Win=LWin|RWin;
    int modifiers;
    bool armed,nDown;
    IntPtr origin;
    public bool Armed {get{return armed;}}
    public IntPtr Origin {get{return origin;}}
    public void Cancel(){armed=false;nDown=false;origin=IntPtr.Zero;}
    public void Reset(){Cancel();modifiers=0;}
    // Right Alt is an extended key; disambiguate a generic VK_MENU before tracking.
    internal static uint Normalize(uint vk,uint flags){if(vk==0x12)return (flags&1)!=0?0xa5u:0xa4u;return vk;}
    static int Bit(uint vk){switch(vk){case 0xa0:return LShift;case 0xa1:return RShift;case 0xa2:return LCtrl;case 0xa3:return RCtrl;case 0xa4:return LAlt;case 0xa5:return RAlt;case 0x5b:return LWin;case 0x5c:return RWin;case 0x10:return LShift;case 0x11:return LCtrl;case 0x12:return LAlt;default:return 0;}}
    // Returns 0 = pass through, 1 = consume the target key, 2 = pass and trigger, 3 = consume and trigger.
    public int Key(uint vk,bool down,bool injected,IntPtr foreground,Func<IntPtr,bool> isCodex){
        if(injected)return 0;
        if(armed&&foreground!=origin)Cancel();
        int bit=Bit(vk);
        if(bit!=0){
            if(down)modifiers|=bit;else modifiers&=~bit;
            if(armed&&(modifiers&(Win|RAlt))!=0)Cancel();
            if(armed&&!nDown&&(modifiers&(Ctrl|Alt|Shift|Win))==0){Cancel();return 2;}
            return 0;
        }
        if(vk==0x4e){
            if(armed){
                if(down){nDown=true;return 1;}
                nDown=false;
                if((modifiers&(Ctrl|Alt|Shift|Win))==0){Cancel();return 3;}
                return 1;
            }
            if(down&&(modifiers&Ctrl)!=0&&(modifiers&Shift)!=0&&(modifiers&LAlt)!=0&&(modifiers&(Win|RAlt))==0&&foreground!=IntPtr.Zero&&isCodex(foreground)){
                armed=true;nDown=true;origin=foreground;return 1;
            }
        }else if(armed&&down)Cancel();
        return 0;
    }
    public void ForegroundChanged(IntPtr current){if(armed&&current!=origin)Cancel();}
}

static class CodexForeground {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetPackageFamilyName(IntPtr process,ref uint length,StringBuilder family);
    public static bool Matches(IntPtr window){
        if(window==IntPtr.Zero)return false;
        uint pid;GetWindowThreadProcessId(window,out pid);if(pid==0)return false;
        IntPtr process=OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)return false;
        try{uint length=256;var family=new StringBuilder((int)length);return GetPackageFamilyName(process,ref length,family)==0&&String.Equals(family.ToString(),"OpenAI.Codex_2p2nqsd0c76g0",StringComparison.OrdinalIgnoreCase);}
        catch{return false;}finally{CloseHandle(process);}
    }
}

// Attached to an already running MCP server, not a login-started process or tray service.
sealed class ScopedShortcut : IDisposable {
    delegate IntPtr KeyboardProc(int code,IntPtr message,IntPtr data);
    delegate void WinEventProc(IntPtr hook,uint eventType,IntPtr hwnd,int objectId,int childId,uint eventThread,uint eventTime);
    [StructLayout(LayoutKind.Sequential)] struct KeyboardData {public uint vk,scan,flags,time;public UIntPtr extra;}
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int type,KeyboardProc proc,IntPtr module,uint thread);
    [DllImport("user32.dll",SetLastError=true)] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEventProc callback,uint process,uint thread,uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("wtsapi32.dll",SetLastError=true)] static extern bool WTSRegisterSessionNotification(IntPtr h,uint flags);
    [DllImport("wtsapi32.dll")] static extern bool WTSUnRegisterSessionNotification(IntPtr h);
    sealed class MessageWindow : NativeWindow, IDisposable {
        readonly ScopedShortcut owner;
        public MessageWindow(ScopedShortcut o){owner=o;CreateHandle(new CreateParams{Caption="PrivacyCurtain Codex Shortcut"});}
        protected override void WndProc(ref Message m){
            if(m.Msg==0x02b1&&m.LParam.ToInt32()==owner.sessionId){
                int code=m.WParam.ToInt32();
                if(code==7||code==2||code==4||code==6)owner.SuspendForSystemLock();
                else if(code==8||code==1||code==3){Interlocked.Exchange(ref owner.sessionLocked,0);}
            }
            if(m.Msg==0x8001){owner.SchedulePending();return;}
            if(m.Msg==0x8002){owner.ReconcileKeyboardHook();return;}
            if(m.Msg==0x10){owner.context.ExitThread();return;}
            base.WndProc(ref m);
        }
        public void Dispose(){DestroyHandle();}
    }
    readonly string mutexName;
    readonly Action activate;
    readonly Func<IntPtr,bool> target;
    readonly Func<bool> sessionProbe;
    readonly Func<bool> hookPreflight;
    readonly Action<bool> hookObserver;
    readonly ManualResetEvent stopped=new ManualResetEvent(false);
    readonly Thread worker;
    readonly int sessionId=Process.GetCurrentProcess().SessionId;
    readonly ShortcutGesture gesture=new ShortcutGesture();
    ApplicationContext context;
    KeyboardProc keyboardCallback;
    WinEventProc focusCallback;
    System.Windows.Forms.Timer activationTimer;
    IntPtr pendingOrigin;
    DateTime pendingUntil;
    IntPtr hook,focusHook;
    long messageHandle;
    int owner,registered,sessionSafe,sessionLocked,busy,lastError,fatalUnhook;
    public ScopedShortcut(string name,Action action):this(name,action,CodexForeground.Matches,SessionSafety.IsInteractiveUnlocked,()=>true){}
    internal ScopedShortcut(string name,Action action,Func<IntPtr,bool> targetCheck,Func<bool> probe):this(name,action,targetCheck,probe,()=>true){}
    internal ScopedShortcut(string name,Action action,Func<IntPtr,bool> targetCheck,Func<bool> probe,Func<bool> preflight):this(name,action,targetCheck,probe,preflight,null){}
    internal ScopedShortcut(string name,Action action,Func<IntPtr,bool> targetCheck,Func<bool> probe,Func<bool> preflight,Action<bool> observer){
        mutexName=name;activate=action;target=targetCheck;sessionProbe=probe;hookPreflight=preflight;hookObserver=observer;
        worker=new Thread(OwnerLoop){IsBackground=true,Name="Codex-only shortcut"};worker.SetApartmentState(ApartmentState.STA);worker.Start();
    }
    public bool IsOwner {get{return Thread.VolatileRead(ref owner)!=0;}}
    public bool IsRegistered {get{return Thread.VolatileRead(ref registered)!=0;}}
    public int LastError {get{return Thread.VolatileRead(ref lastError);}}
    void OwnerLoop(){
        try{using(var mutex=new Mutex(false,mutexName))while(!stopped.WaitOne(0)){
            bool acquired=false;
            try{try{acquired=mutex.WaitOne(250);}catch(AbandonedMutexException){acquired=true;}if(!acquired)continue;
                if(stopped.WaitOne(0))return;
                Interlocked.Exchange(ref owner,1);
                try{RunOwner();}catch{Interlocked.Exchange(ref lastError,-1);}
            }finally{if(acquired){Interlocked.Exchange(ref owner,0);mutex.ReleaseMutex();}}
            if(Thread.VolatileRead(ref fatalUnhook)!=0)return;
            if(!stopped.WaitOne(500))continue;
        }}catch{Interlocked.Exchange(ref lastError,-1);}
    }
    void RunOwner(){
        using(var window=new MessageWindow(this)){
            context=new ApplicationContext();keyboardCallback=Keyboard;focusCallback=ForegroundChanged;
            bool wts=false;Thread poll=null,server=null;var ownerStop=new ManualResetEvent(false);
            try{
                server=new Thread(()=>StatusLoop(ownerStop)){IsBackground=true,Name="Codex shortcut status"};server.Start();
                if(!WTSRegisterSessionNotification(window.Handle,0)){Interlocked.Exchange(ref lastError,Marshal.GetLastWin32Error());stopped.WaitOne(500);return;}
                wts=true;
                focusHook=SetWinEventHook(3,3,IntPtr.Zero,focusCallback,0,0,0);
                if(focusHook==IntPtr.Zero){Interlocked.Exchange(ref lastError,Marshal.GetLastWin32Error());stopped.WaitOne(500);return;}
                Interlocked.Exchange(ref sessionSafe,0);Interlocked.Exchange(ref sessionLocked,0);
                Interlocked.Exchange(ref messageHandle,window.Handle.ToInt64());
                poll=new Thread(()=>PollSession(ownerStop)){IsBackground=true,Name="Codex shortcut session state"};poll.Start();
                if(!stopped.WaitOne(0))Application.Run(context);
            }finally{
                Interlocked.Exchange(ref registered,0);Interlocked.Exchange(ref sessionSafe,0);Interlocked.Exchange(ref messageHandle,0);gesture.Reset();CancelPending();
                if(activationTimer!=null){activationTimer.Dispose();activationTimer=null;}
                RemoveKeyboardHook();
                if(focusHook!=IntPtr.Zero){UnhookWinEvent(focusHook);focusHook=IntPtr.Zero;}
                if(wts)WTSUnRegisterSessionNotification(window.Handle);
                ownerStop.Set();bool pollDone=poll==null||poll.Join(3000);bool serverDone=server==null||server.Join(3000);
                context.Dispose();context=null;
                if(pollDone&&serverDone)ownerStop.Dispose();
            }
        }
    }
    static string PipeName(string name){return name.StartsWith("Local\\",StringComparison.OrdinalIgnoreCase)?name.Substring(6):name;}
    void StatusLoop(ManualResetEvent done){
        var acl=new PipeSecurity();acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User,PipeAccessRights.FullControl,AccessControlType.Allow));
        while(!done.WaitOne(0))try{
            using(var pipe=new NamedPipeServerStream(PipeName(mutexName),PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,1024,1024,acl)){
                var connect=pipe.WaitForConnectionAsync();
                while(!connect.Wait(100)){if(done.WaitOne(0))break;}
                if(done.WaitOne(0)||!pipe.IsConnected)continue;
                using(var writer=new StreamWriter(pipe,new UTF8Encoding(false),1024,true){AutoFlush=true})
                    writer.WriteLine("{\"running\":true,\"registered\":"+(IsRegistered?"true":"false")+",\"sessionSafe\":"+(Thread.VolatileRead(ref sessionSafe)!=0?"true":"false")+",\"ownerPid\":"+Process.GetCurrentProcess().Id+",\"hotkey\":\"Ctrl+Shift+LeftAlt+N\",\"scope\":\"codex-foreground\",\"lastError\":"+LastError+"}");
            }
        }catch{if(!done.WaitOne(0))Thread.Sleep(100);}
    }
    public static string QueryStatus(string name,int timeout=400){
        try{using(var pipe=new NamedPipeClientStream(".",PipeName(name),PipeDirection.InOut,PipeOptions.Asynchronous)){
            pipe.Connect(timeout);using(var reader=new StreamReader(pipe,Encoding.UTF8,false,1024,true)){
                var read=reader.ReadLineAsync();if(!read.Wait(2000)||read.Result==null)throw new TimeoutException();return read.Result;
            }
        }}catch(TimeoutException){return "{\"running\":false,\"registered\":false}";}catch(IOException){return "{\"running\":false,\"registered\":false}";}
    }
    void PollSession(ManualResetEvent done){
        while(!done.WaitOne(0)){
            bool ok=false;try{ok=sessionProbe();}catch{}
            if(done.WaitOne(0))return;
            int safe=ok&&Thread.VolatileRead(ref sessionLocked)==0?1:0;
            int previous=Interlocked.Exchange(ref sessionSafe,safe);
            if(Thread.VolatileRead(ref sessionLocked)!=0)Interlocked.Exchange(ref sessionSafe,0);
            long h=Interlocked.Read(ref messageHandle);
            if(h!=0&&(previous!=Thread.VolatileRead(ref sessionSafe)||(Thread.VolatileRead(ref sessionSafe)!=0&&!IsRegistered)))PostMessage(new IntPtr(h),0x8002,IntPtr.Zero,IntPtr.Zero);
            if(done.WaitOne(200))return;
        }
    }
    void NotifyHookObserver(bool active){if(hookObserver!=null)try{hookObserver(active);}catch{}}
    void RemoveKeyboardHook(){
        gesture.Reset();CancelPending();Interlocked.Exchange(ref registered,0);
        if(hook==IntPtr.Zero)return;
        if(UnhookWindowsHookEx(hook)){hook=IntPtr.Zero;NotifyHookObserver(false);return;}
        int error=Marshal.GetLastWin32Error();
        if(error==1404){hook=IntPtr.Zero;NotifyHookObserver(false);return;}
        // If Windows refuses removal, end this owning thread so the OS tears down its hook.
        Interlocked.Exchange(ref lastError,error==0?-5:error);Interlocked.Exchange(ref fatalUnhook,1);
        if(context!=null)context.ExitThread();
    }
    void SuspendForSystemLock(){
        Interlocked.Exchange(ref sessionLocked,1);Interlocked.Exchange(ref sessionSafe,0);
        RemoveKeyboardHook();
    }
    void ReconcileKeyboardHook(){
        if(Thread.VolatileRead(ref sessionSafe)==0||Thread.VolatileRead(ref sessionLocked)!=0){RemoveKeyboardHook();return;}
        if(hook!=IntPtr.Zero||stopped.WaitOne(0)||Thread.VolatileRead(ref fatalUnhook)!=0)return;
        if(!hookPreflight()){Interlocked.Exchange(ref lastError,-3);return;}
        hook=SetWindowsHookEx(13,keyboardCallback,GetModuleHandle(null),0);
        if(hook==IntPtr.Zero){int error=Marshal.GetLastWin32Error();Interlocked.Exchange(ref lastError,error==0?-1:error);return;}
        Interlocked.Exchange(ref lastError,0);Interlocked.Exchange(ref registered,1);NotifyHookObserver(true);
    }
    void ForegroundChanged(IntPtr h,uint type,IntPtr window,int obj,int child,uint thread,uint time){gesture.ForegroundChanged(window);if(pendingOrigin!=IntPtr.Zero&&window!=pendingOrigin)CancelPending();}
    internal static bool AllKeysReleased(Func<int,short> state){
        foreach(int key in new[]{0x11,0x10,0x12,0x4e,0x5b,0x5c})if((state(key)&0x8000)!=0)return false;
        return true;
    }
    void CancelPending(){pendingOrigin=IntPtr.Zero;if(activationTimer!=null)activationTimer.Stop();}
    void SchedulePending(){
        if(pendingOrigin==IntPtr.Zero)return;
        pendingUntil=DateTime.UtcNow.AddSeconds(2);
        if(activationTimer==null){activationTimer=new System.Windows.Forms.Timer{Interval=25};activationTimer.Tick+=(s,e)=>CheckPending();}
        activationTimer.Start();
    }
    void CheckPending(){
        IntPtr original=pendingOrigin;
        if(original==IntPtr.Zero||DateTime.UtcNow>=pendingUntil||Thread.VolatileRead(ref sessionSafe)==0||CodexForeground.GetForegroundWindow()!=original){CancelPending();return;}
        if(!AllKeysReleased(GetAsyncKeyState))return;
        CancelPending();
        if(Interlocked.CompareExchange(ref busy,1,0)!=0)return;
        ThreadPool.QueueUserWorkItem(_=>{
            try{IntPtr current=CodexForeground.GetForegroundWindow();if(Thread.VolatileRead(ref sessionSafe)!=0&&current==original&&target(current))InvokeAction();}
            catch{Interlocked.Exchange(ref lastError,-2);}finally{Interlocked.Exchange(ref busy,0);}
        });
    }
    void InvokeAction(){try{activate();Interlocked.Exchange(ref lastError,0);}catch{Interlocked.Exchange(ref lastError,-2);}}
    IntPtr Keyboard(int code,IntPtr message,IntPtr data){
        if(code<0)return CallNextHookEx(hook,code,message,data);
        try{
            var k=(KeyboardData)Marshal.PtrToStructure(data,typeof(KeyboardData));
            if((k.flags&0x12)!=0)return CallNextHookEx(hook,code,message,data);
            if(Thread.VolatileRead(ref sessionSafe)==0){gesture.Reset();return CallNextHookEx(hook,code,message,data);}
            int msg=message.ToInt32();bool down=msg==0x100||msg==0x104,up=msg==0x101||msg==0x105;
            if(!down&&!up)return CallNextHookEx(hook,code,message,data);
            IntPtr foreground=CodexForeground.GetForegroundWindow();IntPtr priorOrigin=gesture.Origin;
            int result=gesture.Key(ShortcutGesture.Normalize(k.vk,k.flags),down,false,foreground,target);
            if((result&2)!=0){
                pendingOrigin=priorOrigin;
                // Post to this thread's message loop so the low-level hook returns first.
                if(!PostMessage(new IntPtr(Interlocked.Read(ref messageHandle)),0x8001,IntPtr.Zero,IntPtr.Zero)){pendingOrigin=IntPtr.Zero;Interlocked.Exchange(ref lastError,-4);}
            }
            return (result&1)!=0?new IntPtr(1):CallNextHookEx(hook,code,message,data);
        }catch{return CallNextHookEx(hook,code,message,data);}
    }
    public void Dispose(){
        stopped.Set();long h=Interlocked.Read(ref messageHandle);if(h!=0)PostMessage(new IntPtr(h),0x10,IntPtr.Zero,IntPtr.Zero);
        if(worker.Join(5000))stopped.Dispose();
    }
}
}
