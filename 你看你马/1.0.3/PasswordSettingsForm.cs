using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace CodexPrivacyCurtain {
sealed class UiColors {
    public Color Background,Surface,Border,Foreground,Muted,Primary,PrimaryText,Hover,Disabled,DisabledText,Error,Success;
    public bool Dark;
    public static UiColors Create(bool dark){return dark?
        new UiColors{Dark=true,Background=Color.FromArgb(32,32,32),Surface=Color.FromArgb(40,40,40),Border=Color.FromArgb(70,70,70),Foreground=Color.FromArgb(242,242,242),Muted=Color.FromArgb(170,170,170),Primary=Color.FromArgb(240,240,240),PrimaryText=Color.FromArgb(24,24,24),Hover=Color.FromArgb(51,51,51),Disabled=Color.FromArgb(53,53,53),DisabledText=Color.FromArgb(116,116,116),Error=Color.FromArgb(255,152,143),Success=Color.FromArgb(129,201,149)}:
        new UiColors{Background=Color.White,Surface=Color.White,Border=Color.FromArgb(220,220,220),Foreground=Color.FromArgb(28,28,28),Muted=Color.FromArgb(108,108,108),Primary=Color.FromArgb(28,28,28),PrimaryText=Color.White,Hover=Color.FromArgb(245,245,245),Disabled=Color.FromArgb(235,235,235),DisabledText=Color.FromArgb(154,154,154),Error=Color.FromArgb(183,51,41),Success=Color.FromArgb(42,119,65)};}
    public static bool SystemDark(){try{return Convert.ToInt32(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize","AppsUseLightTheme",1))==0;}catch{return false;}}
}
static class UiShapes {
    public static GraphicsPath Round(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
}
sealed class SettingsButton : Button {
    public UiColors Colors;public bool Primary;public float ScaleValue=1;bool hover;
    public SettingsButton(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnEnabledChanged(EventArgs e){base.OnEnabledChanged(e);Invalidate();}
    protected override void OnPaint(PaintEventArgs e){var c=Colors;var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;g.Clear(c.Background);var r=new RectangleF(.75f,.75f,Width-1.5f,Height-1.5f);using(var path=UiShapes.Round(r,8*ScaleValue)){
        var fill=!Enabled?c.Disabled:Primary?c.Primary:hover?c.Hover:c.Surface;
        using(var b=new SolidBrush(fill))g.FillPath(b,path);
        if(!Primary)using(var pen=new Pen(c.Border,1))g.DrawPath(pen,path);
    }TextRenderer.DrawText(g,Text,Font,ClientRectangle,!Enabled?c.DisabledText:Primary?c.PrimaryText:c.Foreground,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine);
        if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(g,new Rectangle(5,5,Width-10,Height-10),c.Muted,Primary?c.Primary:c.Surface);
    }
}
sealed class PasswordInput : UserControl {
    public readonly TextBox Input;public UiColors Colors;public bool Invalid;public float ScaleValue=1;
    public PasswordInput(string name){AutoScaleMode=AutoScaleMode.None;TabStop=false;SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);Input=new TextBox{BorderStyle=BorderStyle.None,UseSystemPasswordChar=true,MaxLength=32,AccessibleName=name};Controls.Add(Input);Input.Enter+=(s,e)=>Invalidate();Input.Leave+=(s,e)=>Invalidate();Click+=(s,e)=>Input.Focus();}
    public void Apply(UiColors colors,float scale){Colors=colors;ScaleValue=scale;BackColor=colors.Background;Input.BackColor=colors.Surface;Input.ForeColor=colors.Foreground;Input.Font=new Font("Microsoft YaHei UI",14*scale,FontStyle.Regular,GraphicsUnit.Pixel);LayoutInput();Invalidate();}
    void LayoutInput(){if(Input==null)return;int h=Input.PreferredHeight;Input.Bounds=new Rectangle((int)(14*ScaleValue),(Height-h)/2,Math.Max(20,Width-(int)(28*ScaleValue)),h);}
    protected override void OnResize(EventArgs e){base.OnResize(e);LayoutInput();}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(Colors==null)return;var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;g.Clear(Colors.Background);using(var path=UiShapes.Round(new RectangleF(1,1,Width-2,Height-2),8*ScaleValue)){using(var b=new SolidBrush(Colors.Surface))g.FillPath(b,path);using(var p=new Pen(Invalid?Colors.Error:Input.Focused?Colors.Foreground:Colors.Border,Input.Focused?1.5f:1f))g.DrawPath(p,path);}}
}
sealed class SettingsSurface : Panel {public Action<Graphics> Render;public SettingsSurface(){DoubleBuffered=true;}protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(Render!=null)Render(e.Graphics);}}
sealed class PasswordSettingsForm : Form {
    readonly PasswordInput current=new PasswordInput("当前密码"),next=new PasswordInput("新密码"),confirm=new PasswordInput("确认新密码");
    readonly SettingsButton save=new SettingsButton(),cancel=new SettingsButton();readonly CheckBox show=new CheckBox();readonly SettingsSurface surface=new SettingsSurface();
    readonly Image horse;readonly float unit;readonly UiColors colors;bool busy,saved;string feedback="",errorField="";
    public PasswordSettingsForm(bool? dark=null,int dpi=0){
        unit=(dpi>0?dpi:Native.GetDpiForSystem())/96f;unit=Math.Max(1,Math.Min(2.5f,unit));colors=UiColors.Create(dark??UiColors.SystemDark());
        AutoScaleMode=AutoScaleMode.None;Text="你看你马 · 修改密码";ClientSize=new Size(S(548),S(612));StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;BackColor=colors.Background;
        Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);horse=Image.FromFile(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","assets","icon.png"));
        surface.Dock=DockStyle.Fill;surface.BackColor=colors.Background;surface.Render=Render;Controls.Add(surface);
        current.Bounds=R(32,190,484,44);next.Bounds=R(32,275,484,44);confirm.Bounds=R(32,360,484,44);current.TabIndex=0;next.TabIndex=1;confirm.TabIndex=2;
        foreach(var f in new[]{current,next,confirm}){f.Apply(colors,unit);surface.Controls.Add(f);f.Input.TextChanged+=(s,e)=>Changed();}
        show.Text="显示密码";show.AccessibleName="显示密码";show.AutoSize=false;show.Bounds=R(33,423,200,26);show.BackColor=colors.Background;show.ForeColor=colors.Foreground;show.Font=FontAt(14);show.TabIndex=3;show.CheckedChanged+=(s,e)=>{foreach(var f in new[]{current,next,confirm})f.Input.UseSystemPasswordChar=!show.Checked;};surface.Controls.Add(show);
        cancel.Text="取消";cancel.Bounds=R(280,536,100,44);cancel.TabIndex=4;cancel.Click+=(s,e)=>Close();
        save.Text="保存密码";save.Primary=true;save.Bounds=R(392,536,124,44);save.TabIndex=5;save.Click+=(s,e)=>Save();
        foreach(var b in new[]{cancel,save}){b.Colors=colors;b.ScaleValue=unit;b.Font=FontAt(14);b.BackColor=colors.Background;surface.Controls.Add(b);}
        AcceptButton=save;CancelButton=cancel;Changed();Shown+=(s,e)=>current.Input.Focus();FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
    }
    int S(float n){return (int)Math.Round(n*unit);}Rectangle R(int x,int y,int w,int h){return new Rectangle(S(x),S(y),S(w),S(h));}Font FontAt(float size,FontStyle style=FontStyle.Regular){return new Font("Microsoft YaHei UI",size*unit,style,GraphicsUnit.Pixel);}
    void TextAt(Graphics g,string text,int x,int y,int w,int h,float size,Color color,FontStyle style=FontStyle.Regular,TextFormatFlags flags=TextFormatFlags.Left|TextFormatFlags.VerticalCenter){using(var f=FontAt(size,style))TextRenderer.DrawText(g,text,f,R(x,y,w,h),color,flags|TextFormatFlags.NoPadding);}
    void Render(Graphics g){g.Clear(colors.Background);g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(horse,R(32,25,28,28));TextAt(g,"你看你马",72,23,410,30,14,colors.Foreground,FontStyle.Bold);
        TextAt(g,"修改密码",32,79,484,34,26,colors.Foreground,FontStyle.Bold);TextAt(g,"用于解锁隐私幕布。密码仅保存在本机。",32,120,484,25,14,colors.Muted);
        TextAt(g,"当前密码",32,160,484,24,14,colors.Foreground);TextAt(g,"新密码",32,245,200,24,14,colors.Foreground);TextAt(g,"6–32 位数字",300,245,216,24,12,colors.Muted,FontStyle.Regular,TextFormatFlags.Right|TextFormatFlags.VerticalCenter);TextAt(g,"确认新密码",32,330,484,24,14,colors.Foreground);
        string message=feedback.Length>0?feedback:"保存后，下次解锁请使用新密码。";Color tone=saved?colors.Success:errorField.Length>0?colors.Error:colors.Muted;TextAt(g,message,32,463,484,38,13,tone,FontStyle.Regular,TextFormatFlags.Left|TextFormatFlags.WordBreak);
        using(var pen=new Pen(colors.Border,1))g.DrawLine(pen,S(32),S(514),S(516),S(514));
    }
    void Changed(){if(busy||saved)return;errorField="";feedback="";if(next.Input.Text.Length>0&&!Store.Valid(next.Input.Text)){feedback="新密码需为 6–32 位数字。";errorField="new";}else if(confirm.Input.Text.Length>0&&next.Input.Text!=confirm.Input.Text){feedback="两次输入的新密码不一致。";errorField="confirm";}
        save.Enabled=current.Input.Text.Length>0&&Store.Valid(next.Input.Text)&&next.Input.Text==confirm.Input.Text;current.Invalid=false;next.Invalid=errorField=="new";confirm.Invalid=errorField=="confirm";foreach(var f in new[]{current,next,confirm})f.Invalidate();surface.Invalidate();
    }
    void Save(){if(saved){Close();return;}if(busy||!save.Enabled)return;string old=current.Input.Text,replacement=next.Input.Text;busy=true;save.Text="保存中…";save.Enabled=false;cancel.Enabled=false;foreach(var f in new[]{current,next,confirm})f.Enabled=false;show.Enabled=false;feedback="正在验证并保存…";errorField="";surface.Invalidate();
        ThreadPool.QueueUserWorkItem(_=>{bool correct=false;string error="";try{var state=Client.Status() as System.Collections.Generic.Dictionary<string,object>;if(state!=null&&state.ContainsKey("locked")&&(bool)state["locked"])error="请先解锁幕布，再修改密码。";else{correct=Store.Check(old);if(correct)Store.Save(replacement);else error="当前密码不正确，请重新输入。";}}catch{error="暂时无法保存，请稍后重试。";}
            if(IsDisposed)return;BeginInvoke((Action)(()=>{busy=false;cancel.Enabled=true;if(correct&&error.Length==0){saved=true;foreach(var f in new[]{current,next,confirm})f.Input.Clear();show.Checked=false;feedback="密码已更新。下次解锁请使用新密码。";errorField="";save.Text="完成";save.Enabled=true;cancel.Visible=false;}else{foreach(var f in new[]{current,next,confirm})f.Enabled=true;show.Enabled=true;save.Text="保存密码";Changed();feedback=error;errorField="current";current.Invalid=true;current.Invalidate();current.Input.SelectAll();current.Input.Focus();}surface.Invalidate();}));
        });
    }
    protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);int dark=colors.Dark?1:0;Native.DwmSetWindowAttribute(Handle,20,ref dark,4);}
    protected override void Dispose(bool disposing){if(disposing&&horse!=null)horse.Dispose();base.Dispose(disposing);}
    public static void Preview(string path,bool dark,int dpi){using(var f=new PasswordSettingsForm(dark,dpi)){f.Show();Native.ShowWindow(f.Handle,0);Application.DoEvents();using(var bitmap=new Bitmap(f.surface.Width,f.surface.Height)){f.surface.DrawToBitmap(bitmap,f.surface.ClientRectangle);bitmap.Save(path,System.Drawing.Imaging.ImageFormat.Png);}}}
    public static void VerifyUi(string directory){Directory.CreateDirectory(directory);var checks=new System.Collections.Generic.List<object>();
        Action<string,bool> check=(name,ok)=>{checks.Add(new{name=name,passed=ok});if(!ok)throw new InvalidOperationException(name);};
        foreach(int dpi in new[]{96,120,144,192})using(var f=new PasswordSettingsForm(false,dpi)){
            check("Empty form disables save at "+dpi+" DPI",!f.save.Enabled);
            f.current.Input.Text="fixture-only";f.next.Input.Text="654321";f.confirm.Input.Text="654320";
            check("Mismatch disables save and gives inline feedback at "+dpi+" DPI",!f.save.Enabled&&f.errorField=="confirm"&&f.feedback.Contains("不一致"));
            f.confirm.Input.Text="654321";check("Matching numeric password enables save at "+dpi+" DPI",f.save.Enabled);
            f.next.Input.Text="abc123";f.confirm.Input.Text="abc123";check("Invalid numeric format is rejected at "+dpi+" DPI",!f.save.Enabled&&f.errorField=="new");
            f.show.Checked=true;check("Show password toggles all fields at "+dpi+" DPI",!f.current.Input.UseSystemPasswordChar&&!f.next.Input.UseSystemPasswordChar&&!f.confirm.Input.UseSystemPasswordChar);
            f.show.Checked=false;check("Hide password restores masking at "+dpi+" DPI",f.current.Input.UseSystemPasswordChar&&f.next.Input.UseSystemPasswordChar&&f.confirm.Input.UseSystemPasswordChar);
            check("Fields and actions stay within client at "+dpi+" DPI",f.current.Right<=f.ClientSize.Width&&f.confirm.Bottom<f.show.Top&&f.cancel.Right<f.save.Left&&f.save.Bottom<f.ClientSize.Height);
            using(var font=f.FontAt(14)){var size=TextRenderer.MeasureText("保存密码",font,Size.Empty,TextFormatFlags.NoPadding|TextFormatFlags.SingleLine);check("Save label fits at "+dpi+" DPI",size.Width<f.save.Width&&size.Height<f.save.Height);}
        }
        File.WriteAllText(Path.Combine(directory,"ui-verification.json"),Json.Write(checks));
    }
}
}
