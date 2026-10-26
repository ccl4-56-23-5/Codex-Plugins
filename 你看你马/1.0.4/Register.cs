using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
class Register {
    static JavaScriptSerializer json=new JavaScriptSerializer();
    [STAThread]static int Main(string[] args){try{
        string root=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..")).TrimEnd(Path.DirectorySeparatorChar);
        string mcp=json.Serialize(new{mcpServers=new Dictionary<string,object>{{"privacy-curtain",new{command=Path.Combine(root,"bin","PrivacyCurtain.exe"),args=new[]{"--serve"}}}}});
        File.WriteAllText(Path.Combine(root,".mcp.json"),mcp,new UTF8Encoding(false));
        string personal=Environment.GetEnvironmentVariable("CPC_MARKETPLACE_DIR")??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".agents","plugins");Directory.CreateDirectory(personal);
        string marketRoot=Path.GetFullPath(Path.Combine(personal,"..","..")).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
        if(!root.StartsWith(marketRoot,StringComparison.OrdinalIgnoreCase))throw new Exception("插件安装目录须位于当前用户目录内。");
        string sourcePath="./"+root.Substring(marketRoot.Length).Replace('\\','/');
        string file=Path.Combine(personal,"marketplace.json");
        using(var mutex=new System.Threading.Mutex(false,"Local\\CodexPrivacyCurtain-Registration")) {if(!mutex.WaitOne(10000))throw new Exception("插件注册正在进行");try{
            string before=File.Exists(file)?File.ReadAllText(file):null;
            var doc=before==null?new Dictionary<string,object>{{"name","personal"},{"interface",new{displayName="Personal"}},{"plugins",new object[0]}}:json.Deserialize<Dictionary<string,object>>(before);
            var list=new List<object>();if(doc.ContainsKey("plugins"))foreach(var p in (System.Collections.IEnumerable)doc["plugins"])list.Add(p);
            list.RemoveAll(o=>{var d=o as Dictionary<string,object>;return d!=null&&Convert.ToString(d["name"])=="codex-privacy-curtain";});
            list.Add(new{name="codex-privacy-curtain",source=new{source="local",path=sourcePath},policy=new{installation="AVAILABLE",authentication="ON_INSTALL"},category="Productivity"});doc["plugins"]=list;
            if(before!=null&&File.ReadAllText(file)!=before)throw new Exception("插件目录被其他程序修改，请重新运行安装程序。");
            string temp=file+".curtain-"+Guid.NewGuid().ToString("N")+".tmp";File.WriteAllText(temp,json.Serialize(doc),new UTF8Encoding(false));
            if(before!=null)File.Replace(temp,file,file+".before-curtain-"+DateTime.Now.ToString("yyyyMMddHHmmssfff")+".bak");else File.Move(temp,file);
        }finally{mutex.ReleaseMutex();}}
        if(!args.Contains("--quiet"))MessageBox.Show("安装完成。\n\n在 Codex 插件目录的 Personal 来源找到“你看你马”，点击安装/启用。\n初始密码：123456\n\n开始菜单另有“开启隐私幕布”和“修改密码”。\n当前不会自动开启幕布，不需要重启 Windows。","你看你马");return 0;
    }catch(Exception ex){MessageBox.Show(ex.Message,"插件注册失败");return 1;}}
}
