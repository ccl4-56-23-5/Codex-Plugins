// Standalone test harness; production build does not include this source file.
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

namespace CodexPrivacyCurtain {
static class SessionSafety {public static bool IsInteractiveUnlocked(){return true;}}
static class ScopedShortcutTests {
    static readonly List<object> results=new List<object>();
    [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
    static int events,attempts,sessionProbe=1,installs,removes;
    static void Check(string name,bool ok){results.Add(new{name=name,passed=ok});if(!ok)throw new Exception(name);}
    static void Unit(){
        IntPtr a=new IntPtr(101),b=new IntPtr(202);Func<IntPtr,bool> allowed=h=>h==a;
        var g=new ShortcutGesture();
        Check("Null and foreign targets are not Codex",!CodexForeground.Matches(IntPtr.Zero));
        Check("Plain N passes",g.Key(0x4e,true,false,a,allowed)==0);
        Check("Modifier down passes",g.Key(0xa2,true,false,a,allowed)==0&&g.Key(0xa0,true,false,a,allowed)==0&&g.Key(0xa4,true,false,a,allowed)==0);
        Check("Outside app N passes",g.Key(0x4e,true,false,b,allowed)==0&&!g.Armed);
        Check("Injected N passes",g.Key(0x4e,true,true,a,allowed)==0&&!g.Armed);
        Check("Codex chord arms and consumes N",g.Key(0x4e,true,false,a,allowed)==1&&g.Armed&&g.Origin==a);
        Check("N autorepeat consumed without re-trigger",g.Key(0x4e,true,false,a,allowed)==1);
        Check("N up consumed",g.Key(0x4e,false,false,a,allowed)==1);
        Check("Modifier up passes before last release",g.Key(0xa2,false,false,a,allowed)==0&&g.Key(0xa0,false,false,a,allowed)==0);
        Check("Last modifier release passes and triggers",g.Key(0xa4,false,false,a,allowed)==2&&!g.Armed);
        Check("Modifier release without arm passes",g.Key(0xa4,false,false,a,allowed)==0);
        g.Reset();g.Key(0xa3,true,false,a,allowed);g.Key(0xa1,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);
        Check("Right Ctrl and Shift with left Alt supported",g.Key(0x4e,true,false,a,allowed)==1);
        Check("Release modifiers while N held passes",g.Key(0xa3,false,false,a,allowed)==0&&g.Key(0xa1,false,false,a,allowed)==0&&g.Key(0xa4,false,false,a,allowed)==0);
        Check("Last N release consumed and triggers",g.Key(0x4e,false,false,a,allowed)==3&&!g.Armed);
        Check("Extended generic Alt is recognized as right Alt",ShortcutGesture.Normalize(0x12,1)==0xa5);
        Check("Nonextended generic Alt is recognized as left Alt",ShortcutGesture.Normalize(0x12,0)==0xa4);
        Check("Explicit right Alt remains right Alt",ShortcutGesture.Normalize(0xa5,0)==0xa5);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa5,true,false,a,allowed);
        Check("Right Alt or AltGr chord passes unchanged",g.Key(0x4e,true,false,a,allowed)==0&&g.Key(0x4e,false,false,a,allowed)==0&&!g.Armed);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);g.Key(0xa5,true,false,a,allowed);
        Check("Both Alt keys down prevent interception",g.Key(0x4e,true,false,a,allowed)==0&&!g.Armed);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);g.Key(0x4e,true,false,a,allowed);
        Check("Right Alt down cancels an armed chord and passes",g.Key(0xa5,true,false,a,allowed)==0&&!g.Armed);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);g.Key(0x5b,true,false,a,allowed);
        Check("Windows key prevents chord interception",g.Key(0x4e,true,false,a,allowed)==0&&!g.Armed);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);g.Key(0x4e,true,false,a,allowed);
        g.ForegroundChanged(b);
        Check("Focus change cancels and foreign N up passes",!g.Armed&&g.Key(0x4e,false,false,b,allowed)==0);
        Check("Modifier releases after cancellation all pass",g.Key(0xa2,false,false,b,allowed)==0&&g.Key(0xa0,false,false,b,allowed)==0&&g.Key(0xa4,false,false,b,allowed)==0);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);g.Key(0x4e,true,false,a,allowed);
        Check("Other key cancels and passes",g.Key(0x41,true,false,a,allowed)==0&&!g.Armed);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);g.Key(0x4e,true,false,a,allowed);
        g.Reset();
        Check("Session reset cancels pending shortcut",!g.Armed&&g.Key(0x4e,false,false,a,allowed)==0);
        g.Reset();g.Key(0xa2,true,true,a,allowed);g.Key(0xa0,true,true,a,allowed);g.Key(0xa4,true,true,a,allowed);
        Check("Injected modifiers cannot arm shortcut",g.Key(0x4e,true,false,a,allowed)==0&&!g.Armed);
        g.Reset();g.Key(0xa2,true,false,a,allowed);g.Key(0xa3,true,false,a,allowed);g.Key(0xa0,true,false,a,allowed);g.Key(0xa4,true,false,a,allowed);g.Key(0x4e,true,false,a,allowed);g.Key(0x4e,false,false,a,allowed);
        Check("Both control keys must release",g.Key(0xa2,false,false,a,allowed)==0&&g.Key(0xa0,false,false,a,allowed)==0&&g.Key(0xa4,false,false,a,allowed)==0&&g.Armed);
        Check("Final extra control release triggers once",g.Key(0xa3,false,false,a,allowed)==2&&!g.Armed&&g.Key(0xa3,false,false,a,allowed)==0);
        Check("Deferred activation waits until all keys are up",ScopedShortcut.AllKeysReleased(k=>0));
        Check("Deferred activation waits for Ctrl release",!ScopedShortcut.AllKeysReleased(k=>k==0x11?unchecked((short)0x8000):(short)0));
        Check("Deferred activation waits for N release",!ScopedShortcut.AllKeysReleased(k=>k==0x4e?unchecked((short)0x8000):(short)0));
        Check("Deferred activation waits for Alt release",!ScopedShortcut.AllKeysReleased(k=>k==0x12?unchecked((short)0x8000):(short)0));
        Check("Deferred activation waits for Windows key release",!ScopedShortcut.AllKeysReleased(k=>k==0x5b?unchecked((short)0x8000):(short)0));
    }
    static int Main(string[] args){try{
        if(args.Length>0&&(args[0]=="--server"||args[0]=="--server-retry"||args[0]=="--server-actionfail"||args[0]=="--server-session")){
            bool retry=args[0]=="--server-retry";
            bool failAction=args[0]=="--server-actionfail";
            using(var shortcut=new ScopedShortcut(args[1],()=>{int n=Interlocked.Increment(ref events);if(failAction&&n==1)throw new Exception("simulated");},h=>false,()=>Thread.VolatileRead(ref sessionProbe)!=0,()=>!retry||Interlocked.Increment(ref attempts)>2,active=>{if(active)Interlocked.Increment(ref installs);else Interlocked.Increment(ref removes);})){
                string line;while((line=Console.ReadLine())!=null){if(line=="exit")break;
                    if(line=="invoke"){typeof(ScopedShortcut).GetMethod("InvokeAction",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(shortcut,null);Console.WriteLine("invoked");}
                    if(line=="safe"){Interlocked.Exchange(ref sessionProbe,1);Console.WriteLine("set");}
                    if(line=="unsafe"){Interlocked.Exchange(ref sessionProbe,0);Console.WriteLine("set");}
                    if(line=="lock"||line=="unlock"||line=="disconnect"||line=="other-lock"){
                        var raw=(long)typeof(ScopedShortcut).GetField("messageHandle",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(shortcut);
                        int reason=line=="unlock"?8:line=="disconnect"?4:7;
                        int sid=Process.GetCurrentProcess().SessionId+(line=="other-lock"?1:0);
                        Console.WriteLine(PostMessage(new IntPtr(raw),0x02b1,new IntPtr(reason),new IntPtr(sid))?"posted":"failed");
                    }
                    if(line=="state")Console.WriteLine(new JavaScriptSerializer().Serialize(new{owner=shortcut.IsOwner,registered=shortcut.IsRegistered,error=shortcut.LastError,events=events,attempts=attempts,installs=installs,removes=removes}));}
            }
            return 0;
        }
        if(args.Length>0&&args[0]=="--query"){Console.WriteLine(ScopedShortcut.QueryStatus(args[1],200));return 0;}
        Unit();Console.WriteLine(new JavaScriptSerializer().Serialize(results));return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex.ToString());return 1;}}
}
}
