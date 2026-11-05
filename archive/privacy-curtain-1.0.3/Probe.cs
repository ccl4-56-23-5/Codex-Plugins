using System;
using System.Drawing;
using System.Windows.Forms;
class Probe {
    [STAThread]static void Main(string[] args){SetProcessDpiAwarenessContext(new IntPtr(-4));Application.EnableVisualStyles();int n=args.Length>0?int.Parse(args[0]):0;var screen=Screen.AllScreens[Math.Min(n,Screen.AllScreens.Length-1)].WorkingArea;var f=new Form{Text="Curtain Compatibility Probe - Screen "+(n+1),ClientSize=new Size(580,270),StartPosition=FormStartPosition.Manual,Location=new Point(screen.X+(screen.Width-580)/2,screen.Y+(screen.Height-310)/2)};
    var text=new TextBox{Location=new Point(24,65),Size=new Size(530,35),AccessibleName="Compatibility text",Font=new Font("Segoe UI",16)};
    var status=new Label{Location=new Point(24,180),AutoSize=true,Text="Clicks: 0"};int clicks=0;
    var button=new Button{Text="Test click",AccessibleName="Test click",Location=new Point(24,125),Size=new Size(200,40)};button.Click+=(s,e)=>status.Text="Clicks: "+(++clicks);
    f.Controls.AddRange(new Control[]{new Label{Text="Computer Use compatibility test — temporary data only",Location=new Point(24,24),AutoSize=true},text,button,status});
    var timer=new Timer{Interval=500};timer.Tick+=(s,e)=>{timer.Stop();ShowWindow(f.Handle,5);f.Show();f.Activate();};timer.Start();Application.Run(f);}
    [System.Runtime.InteropServices.DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int cmd);
    [System.Runtime.InteropServices.DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
}
