#define Version "1.0.6"
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
[Run]
Filename: "{app}\bin\PrivacyCurtain.exe"; Parameters: "--remove-legacy-launcher"; Flags: runhidden waituntilterminated; StatusMsg: "退出旧版快捷入口…"
Filename: "{app}\bin\Register.exe"; Parameters: "--quiet"; Flags: runhidden waituntilterminated; StatusMsg: "注册本地 Codex 插件目录…"
[UninstallRun]
; 个人 marketplace 的卸载需精确比较来源后移除；保留用户密码和注册备份。
Filename: "{app}\bin\Unregister.exe"; Flags: runhidden waituntilterminated; RunOnceId: "UnregisterCurtain"
[Code]
const RunKey = 'Software\Microsoft\Windows\CurrentVersion\Run';
const RunName = 'CodexPrivacyCurtain';
function GetFileAttributesW(lpFileName: String): Cardinal;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function ManagedStartup(const Value: String): Boolean;
begin
  Result := (CompareText(Value, '"' + ExpandConstant('{localappdata}\CodexPrivacyCurtain\1.0.4\bin\PrivacyCurtain.exe') + '" --resident') = 0)
         or (CompareText(Value, '"' + ExpandConstant('{app}\bin\PrivacyCurtain.exe') + '" --resident') = 0);
end;

procedure ArchiveOldShortcut(const LinkPath, Expected, ExpectedArguments: String);
var Target, Arguments, BackupDir, BackupPath: String;
    Shell, Link: Variant;
    Attr: Cardinal;
    I: Integer;
begin
  if not FileExists(LinkPath) then exit;
  Attr := GetFileAttributesW(LinkPath);
  if (Attr = $FFFFFFFF) or ((Attr and $400) <> 0) then begin Log('Desktop shortcut is a reparse point or inaccessible; preserved.'); exit; end;
  try
    Shell := CreateOleObject('WScript.Shell');
    Link := Shell.CreateShortcut(LinkPath);
    Target := Link.TargetPath;
    Arguments := Link.Arguments;
    if (CompareText(Target, Expected) <> 0) or (Arguments <> ExpectedArguments) then begin Log('Shortcut has been changed; preserved: ' + LinkPath); exit; end;
    BackupDir := ExpandConstant('{localappdata}\CodexPrivacyCurtain\data\legacy-shortcuts');
    if not ForceDirectories(BackupDir) then begin Log('Could not create shortcut backup folder.'); exit; end;
    I := 0;
    repeat
      BackupPath := BackupDir + '\old-entry-' + IntToStr(I) + '.lnk';
      I := I + 1;
    until (not FileExists(BackupPath)) or (I > 1000);
    if (I <= 1000) and RenameFile(LinkPath, BackupPath) then Log('Archived old desktop shortcut to ' + BackupPath)
    else Log('Could not archive old desktop shortcut.');
  except
    Log('Could not inspect old desktop shortcut; preserved.');
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Existing, OldRoot, GroupPath: String;
    V: Integer;
begin
  if CurStep = ssPostInstall then begin
    if RegQueryStringValue(HKCU, RunKey, RunName, Existing) and ManagedStartup(Existing) then
      RegDeleteValue(HKCU, RunKey, RunName);
    GroupPath := ExpandConstant('{userprograms}\你看你马\');
    for V := 3 to 4 do begin
      OldRoot := ExpandConstant('{localappdata}\CodexPrivacyCurtain\1.0.') + IntToStr(V);
      ArchiveOldShortcut(ExpandConstant('{userdesktop}\你看你马 · 开启幕布.lnk'), OldRoot + '\bin\PrivacyCurtain.exe', '--lock');
      ArchiveOldShortcut(GroupPath + '开启隐私幕布.lnk', OldRoot + '\bin\PrivacyCurtain.exe', '--lock');
      ArchiveOldShortcut(GroupPath + '启动快捷键与托盘.lnk', OldRoot + '\bin\PrivacyCurtain.exe', '--resident');
      ArchiveOldShortcut(GroupPath + '修改密码.lnk', OldRoot + '\bin\PrivacyCurtain.exe', '--settings');
      ArchiveOldShortcut(GroupPath + '使用说明.lnk', OldRoot + '\README.md', '');
    end;
  end;
end;
