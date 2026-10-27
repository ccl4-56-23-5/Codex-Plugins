using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace CodexPrivacyCurtain {
static class SessionSafety {
    [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern bool WTSQuerySessionInformation(IntPtr server,int sessionId,int infoClass,out IntPtr data,out int bytes);
    [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr data);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,int length,out int needed);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr handle);

    internal static bool Evaluate(bool queryOk,int level,int queriedSession,int expectedSession,int connectionState,int sessionFlags,string desktop){
        return queryOk && level==1 && queriedSession==expectedSession && connectionState==0 && sessionFlags==1
            && String.Equals(desktop,"Default",StringComparison.OrdinalIgnoreCase);
    }
    public static bool IsInteractiveUnlocked(){
        IntPtr data=IntPtr.Zero,desktop=IntPtr.Zero;
        try{
            int bytes;
            if(!WTSQuerySessionInformation(IntPtr.Zero,-1,25,out data,out bytes)||data==IntPtr.Zero||bytes<20)return false;
            // x64 WTSINFOEX: LEVEL1 union starts at offset 8.
            int level=Marshal.ReadInt32(data,0), session=Marshal.ReadInt32(data,8), state=Marshal.ReadInt32(data,12), flags=Marshal.ReadInt32(data,16);
            desktop=OpenInputDesktop(0,false,1);if(desktop==IntPtr.Zero)return false;
            var name=new StringBuilder(256);int needed;
            if(!GetUserObjectInformation(desktop,2,name,name.Capacity*2,out needed))return false;
            return Evaluate(true,level,session,Process.GetCurrentProcess().SessionId,state,flags,name.ToString());
        }catch{return false;}
        finally{if(desktop!=IntPtr.Zero)CloseDesktop(desktop);if(data!=IntPtr.Zero)WTSFreeMemory(data);}
    }
}
sealed class SessionWatch : NativeWindow, IDisposable {
    [DllImport("wtsapi32.dll",SetLastError=true)] static extern bool WTSRegisterSessionNotification(IntPtr window,uint flags);
    [DllImport("wtsapi32.dll",SetLastError=true)] static extern bool WTSUnRegisterSessionNotification(IntPtr window);
    readonly Action<string> unsafeAction;
    readonly Func<bool> probe;
    readonly int sessionId;
    readonly ManualResetEvent stop=new ManualResetEvent(false);
    int unsafeState;
    bool registered; volatile bool disposed;
    public bool IsSafe {get{return Thread.VolatileRead(ref unsafeState)==0&&!disposed;}}
    public bool Registered {get{return registered;}}
    public SessionWatch(Action<string> callback):this(callback,SessionSafety.IsInteractiveUnlocked){}
    internal SessionWatch(Action<string> callback,Func<bool> query){
        unsafeAction=callback;probe=query;sessionId=Process.GetCurrentProcess().SessionId;
        CreateHandle(new CreateParams{Caption="PrivacyCurtain Session Watch"});
        if(!WTSRegisterSessionNotification(Handle,0)){int error=Marshal.GetLastWin32Error();DestroyHandle();stop.Dispose();throw new InvalidOperationException("无法监听 Windows 锁屏状态；幕布未启用。Win32="+error);}
        registered=true;
        if(!CheckNow()){Dispose();throw new InvalidOperationException("Windows 已锁定、处于安全桌面或会话状态不可用；幕布未启用。");}
        new Thread(WatchLoop){IsBackground=true,Name="PrivacyCurtain session monitor"}.Start();
    }
    public bool CheckNow(){bool safe=false;try{safe=probe();}catch{}if(!safe)MarkUnsafe("Windows session or input desktop is not available");return IsSafe;}
    void WatchLoop(){while(!stop.WaitOne(200)){if(!CheckNow())return;}}
    void MarkUnsafe(string reason){if(Interlocked.CompareExchange(ref unsafeState,1,0)==0)unsafeAction(reason);}
    protected override void WndProc(ref Message m){
        if(m.Msg==0x02B1&&m.LParam.ToInt32()==sessionId){int reason=m.WParam.ToInt32();if(reason==7||reason==2||reason==4||reason==6)MarkUnsafe("Windows session locked or disconnected");}
        base.WndProc(ref m);
    }
    public void Dispose(){if(disposed)return;disposed=true;stop.Set();if(registered){WTSUnRegisterSessionNotification(Handle);registered=false;}DestroyHandle();}
}
}
