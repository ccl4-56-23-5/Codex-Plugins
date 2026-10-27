using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
class Unregister {
    static int Main(){try{
        string root=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,".."));
        string file=Path.Combine(Environment.GetEnvironmentVariable("CPC_MARKETPLACE_DIR")??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".agents","plugins"),"marketplace.json");
        if(!File.Exists(file))return 0;
        var j=new JavaScriptSerializer();string before=File.ReadAllText(file);var d=j.Deserialize<Dictionary<string,object>>(before);var list=new List<object>();
        string marketRoot=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(file),"..",".."));
        foreach(var o in (System.Collections.IEnumerable)d["plugins"]){var p=o as Dictionary<string,object>;bool mine=false;if(p!=null&&Convert.ToString(p["name"])=="codex-privacy-curtain"){var s=p["source"] as Dictionary<string,object>;mine=s!=null&&String.Equals(Path.GetFullPath(Path.Combine(marketRoot,Convert.ToString(s["path"]))),root,StringComparison.OrdinalIgnoreCase);}if(!mine)list.Add(o);}
        d["plugins"]=list;if(File.ReadAllText(file)!=before)return 2;
        string temp=file+".curtain-uninstall-"+Guid.NewGuid().ToString("N")+".tmp";File.WriteAllText(temp,j.Serialize(d),new UTF8Encoding(false));File.Replace(temp,file,file+".before-curtain-uninstall-"+DateTime.Now.ToString("yyyyMMddHHmmssfff")+".bak");return 0;
    }catch{return 1;}}
}
