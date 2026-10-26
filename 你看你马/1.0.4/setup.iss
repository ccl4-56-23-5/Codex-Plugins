#define Version "1.0.4"
[Setup]
AppId=CodexPrivacyCurtain
AppName=你看你马
AppVersion={#Version}
DefaultDirName={localappdata}\CodexPrivacyCurtain\{#Version}
DisableDirPage=yes
UsePreviousAppDir=no
DefaultGroupName=你看你马
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=artifacts
OutputBaseFilename=CodexPrivacyCurtain-Setup-{#Version}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayName=你看你马 {#Version}
SetupLogging=yes
SetupIconFile=plugin\assets\icon.ico
CloseApplications=no
RestartApplications=no
[Files]
Source: "plugin\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{userdesktop}\你看你马 · 开启幕布"; Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--lock"
Name: "{group}\开启隐私幕布"; Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--lock"
Name: "{group}\启动快捷键与托盘"; Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--resident"
Name: "{group}\修改密码"; Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--settings"
Name: "{group}\使用说明"; Filename: "{app}\README.md"
[Tasks]
Name: "autostart"; Description: "登录 Windows 后启用快捷键与托盘（不自动开启幕布）"
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "CodexPrivacyCurtain"; ValueData: """{app}\bin\PrivacyCurtain.exe"" --resident"; Tasks: autostart
[Run]
Filename: "{app}\bin\Register.exe"; Parameters: "--quiet"; Flags: runhidden waituntilterminated; StatusMsg: "注册本地 Codex 插件目录…"
Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--resident-replace"; Flags: runhidden nowait; StatusMsg: "启动快捷键与托盘…"
[UninstallRun]
Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--resident-stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopQuickLauncher"
; 个人 marketplace 的卸载需精确比较来源后移除；保留用户密码和注册备份。
Filename: "{app}\bin\Unregister.exe"; Flags: runhidden waituntilterminated; RunOnceId: "UnregisterCurtain"
