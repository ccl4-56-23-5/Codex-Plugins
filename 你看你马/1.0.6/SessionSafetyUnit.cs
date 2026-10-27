using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace CodexPrivacyCurtain {
static class SessionSafetyUnit {
    [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessage(IntPtr window,uint message,IntPtr w,IntPtr l);
    static readonly List<object> results=new List<object>();
    static int callbacks,probeState=1;
    static void Check(string name,bool passed){results.Add(new{name=name,passed=passed});if(!passed)throw new Exception(name);}
    static void Pump(int ms){var until=DateTime.UtcNow.AddMilliseconds(ms);while(DateTime.UtcNow<until){Application.DoEvents();Thread.Sleep(10);}}
    [STAThread] static int Main(){
        try{
            int sid=Process.GetCurrentProcess().SessionId;
            Check("Current real session is interactive and unlocked",SessionSafety.IsInteractiveUnlocked());
            Check("Active unlocked default desktop allowed",SessionSafety.Evaluate(true,1,sid,sid,0,1,"Default"));
            Check("Desktop name comparison ignores case",SessionSafety.Evaluate(true,1,sid,sid,0,1,"default"));
            Check("Failed query rejected",!SessionSafety.Evaluate(false,1,sid,sid,0,1,"Default"));
            Check("Unexpected information level rejected",!SessionSafety.Evaluate(true,2,sid,sid,0,1,"Default"));
            Check("Other session rejected",!SessionSafety.Evaluate(true,1,sid+1,sid,0,1,"Default"));
            Check("Disconnected session rejected",!SessionSafety.Evaluate(true,1,sid,sid,4,1,"Default"));
            Check("Locked session rejected",!SessionSafety.Evaluate(true,1,sid,sid,0,0,"Default"));
            Check("Unknown session state rejected",!SessionSafety.Evaluate(true,1,sid,sid,0,-1,"Default"));
            Check("Winlogon secure desktop rejected",!SessionSafety.Evaluate(true,1,sid,sid,0,1,"Winlogon"));
            Check("Unknown desktop rejected",!SessionSafety.Evaluate(true,1,sid,sid,0,1,null));
            Check("Empty desktop rejected",!SessionSafety.Evaluate(true,1,sid,sid,0,1,""));
            callbacks=0;bool threw=false;
            try{using(var rejected=new SessionWatch(_=>Interlocked.Increment(ref callbacks),()=>false)){} }catch(InvalidOperationException){threw=true;}
            Check("Unsafe initial probe prevents monitor startup",threw && callbacks==1);
            callbacks=0;threw=false;
            try{using(var rejected=new SessionWatch(_=>Interlocked.Increment(ref callbacks),()=>{throw new Exception("probe");})){} }catch(InvalidOperationException){threw=true;}
            Check("Probe exception fails safely",threw && callbacks==1);
            callbacks=0;probeState=1;
            using(var watcher=new SessionWatch(_=>Interlocked.Increment(ref callbacks),()=>Thread.VolatileRead(ref probeState)==1)){
                Check("Notification registration and initial state",watcher.Registered && watcher.IsSafe);
                Interlocked.Exchange(ref probeState,0);
                var until=DateTime.UtcNow.AddSeconds(3);
                while((watcher.IsSafe || Thread.VolatileRead(ref callbacks)==0) && DateTime.UtcNow<until)Thread.Sleep(10);
                Check("Poll detects unsafe session",!watcher.IsSafe);
                Check("Poll triggers exactly one cleanup callback",callbacks==1);
                Interlocked.Exchange(ref probeState,1);Thread.Sleep(300);
                Check("Unsafe state remains latched",!watcher.IsSafe && callbacks==1);
            }
            callbacks=0;
            using(var watcher=new SessionWatch(_=>Interlocked.Increment(ref callbacks),()=>true)){
                Check("Post unrelated-session test event",PostMessage(watcher.Handle,0x02b1,new IntPtr(7),new IntPtr(sid+1)));
                Pump(80);Check("Unrelated-session notification ignored",watcher.IsSafe && callbacks==0);
                Check("Post unlock test event",PostMessage(watcher.Handle,0x02b1,new IntPtr(8),new IntPtr(sid)));
                Pump(80);Check("Unlock notification does not stop watcher",watcher.IsSafe && callbacks==0);
                Check("Post own-session lock test event",PostMessage(watcher.Handle,0x02b1,new IntPtr(7),new IntPtr(sid)));
                Pump(80);Check("Own-session lock stops watcher",!watcher.IsSafe && callbacks==1);
                PostMessage(watcher.Handle,0x02b1,new IntPtr(7),new IntPtr(sid));Pump(80);
                Check("Repeated lock notification does not duplicate cleanup",callbacks==1);
            }
            Console.WriteLine(new JavaScriptSerializer().Serialize(results));return 0;
        }catch(Exception ex){Console.Error.WriteLine(ex.ToString());Console.WriteLine(new JavaScriptSerializer().Serialize(results));return 1;}
    }
}
}
