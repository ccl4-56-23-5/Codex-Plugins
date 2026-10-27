using System;
using System.IO;
using System.Threading;

namespace CodexPrivacyCurtain {
// Upgrade helper only: stop the known 1.0.4 tray process without touching a guard.
static class LegacyLauncher {
    public static void Stop(){
        System.Collections.Generic.Dictionary<string,object> state;
        try{state=Client.Request(new{command="status"},400,Store.Pipe+"-launcher");}
        catch(TimeoutException){return;}catch(IOException){return;}
        string expected=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CodexPrivacyCurtain","1.0.4","bin","PrivacyCurtain.exe");
        string actual=Json.Str(state,"executable");
        if(!String.Equals(actual,expected,StringComparison.OrdinalIgnoreCase))return;
        var result=Client.Request(new{command="stop",executable=actual},800,Store.Pipe+"-launcher");
        if(!result.ContainsKey("ok")||!(bool)result["ok"])throw new InvalidOperationException("旧版快捷入口未能退出。");
        for(int i=0;i<30;i++){
            Thread.Sleep(100);
            try{state=Client.Request(new{command="status"},100,Store.Pipe+"-launcher");}
            catch(TimeoutException){return;}catch(IOException){return;}
            if(!String.Equals(Json.Str(state,"executable"),expected,StringComparison.OrdinalIgnoreCase))return;
        }
        throw new TimeoutException("旧版快捷入口退出超时。");
    }
}
}
