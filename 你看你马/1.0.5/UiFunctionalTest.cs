using System;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
namespace CodexPrivacyCurtain {
static class UiFunctionalTest {
    static T Field<T>(object o,string name){return (T)o.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(o);}
    static void Wait(PasswordSettingsForm f){var end=DateTime.UtcNow.AddSeconds(12);while(Field<bool>(f,"busy")&&DateTime.UtcNow<end){Application.DoEvents();Thread.Sleep(10);}if(Field<bool>(f,"busy"))throw new Exception("Save timeout");}
    [STAThread]static int Main(string[] args){try{
        if(args.Length!=1)throw new Exception("Isolated data path required");string root=Path.GetFullPath(args[0]);if(!root.Contains(Path.DirectorySeparatorChar+".work"+Path.DirectorySeparatorChar))throw new Exception("Test data must stay in .work");Environment.SetEnvironmentVariable("CPC_DATA_DIR",root);Native.SetProcessDpiAwarenessContext(new IntPtr(-4));Store.Ensure();Application.EnableVisualStyles();
        using(var f=new PasswordSettingsForm(false,96)){f.Show();Native.ShowWindow(f.Handle,0);Application.DoEvents();var current=Field<PasswordInput>(f,"current");var next=Field<PasswordInput>(f,"next");var confirm=Field<PasswordInput>(f,"confirm");var save=f.GetType().GetMethod("Save",BindingFlags.Instance|BindingFlags.NonPublic);
            current.Input.Text="000000";next.Input.Text="246810";confirm.Input.Text="246810";save.Invoke(f,null);Wait(f);
            if(Field<bool>(f,"saved")||!Store.Check("123456")||!Field<string>(f,"feedback").Contains("当前密码不正确"))throw new Exception("Wrong password flow failed");
            current.Input.Text="123456";save.Invoke(f,null);Wait(f);
            if(!Field<bool>(f,"saved")||!Store.Check("246810")||Store.Check("123456")||current.Input.Text.Length+next.Input.Text.Length+confirm.Input.Text.Length!=0)throw new Exception("Save flow failed");
        }
        Console.WriteLine(Json.Write(new{wrongCurrentPasswordRejected=true,originalFixturePasswordPreservedOnFailure=true,newFixturePasswordSaved=true,oldFixturePasswordRejectedAfterSave=true,fieldsClearedOnSuccess=true,isolatedDataOnly=true}));return 0;
    }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}}
}
}
