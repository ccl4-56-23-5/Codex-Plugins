#define Version "1.0.3"
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
Name: "{group}\开启隐私幕布"; Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--lock"
Name: "{group}\修改密码"; Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--settings"
Name: "{group}\使用说明"; Filename: "{app}\README.md"
[Run]
Filename: "{app}\bin\Register.exe"; Parameters: "--quiet"; Flags: runhidden waituntilterminated; StatusMsg: "注册本地 Codex 插件目录…"
[UninstallRun]
; 个人 marketplace 的卸载需精确比较来源后移除；保留用户密码和注册备份。
Filename: "{app}\bin\Unregister.exe"; Flags: runhidden waituntilterminated; RunOnceId: "UnregisterCurtain"
