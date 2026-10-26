param([string]$OutputFile,[string]$PreviousInstaller)
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\1.0.4'
$bin=Join-Path $root 'bin\PrivacyCurtain.exe'
$cache=Join-Path $env:USERPROFILE '.codex\plugins\cache\personal\codex-privacy-curtain\1.0.4'
$checks=[Collections.Generic.List[object]]::new()
function Check($name,$ok){$checks.Add([pscustomobject]@{name=$name;passed=[bool]$ok});if(!$ok){throw "FAILED: $name"}}
function State($mode){(& $bin $mode)|ConvertFrom-Json}
$before=State '--status'
Check 'Existing curtain stays active during acceptance' ($before.locked -and $before.coverageVerified)
$resident=State '--resident-status'
Check 'Installed 1.0.4 hotkey active' ($resident.version -eq '1.0.4' -and $resident.hotkeyRegistered -and !$resident.testMode)
$startCount=$resident.activations
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class InstalledQuickInput {
 [DllImport("user32.dll")] static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
 public static void Chord(){byte[] keys={0x11,0x10,0x12,0x4e};foreach(byte k in keys)keybd_event(k,0,0,UIntPtr.Zero);for(int i=keys.Length-1;i>=0;i--)keybd_event(keys[i],0,2,UIntPtr.Zero);}
}
'@
[InstalledQuickInput]::Chord()
for($i=0;$i -lt 30;$i++){$resident=State '--resident-status';if($resident.activations -gt $startCount){break};Start-Sleep -Milliseconds 100}
Check 'Installed hotkey reaches launcher' ($resident.activations -eq $startCount+1 -and $resident.lastTrigger -eq 'hotkey' -and !$resident.lastError)
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
$link=Join-Path $desktop '你看你马 · 开启幕布.lnk'
Check 'Desktop shortcut exists' (Test-Path -LiteralPath $link)
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($link)
Check 'Desktop shortcut directly invokes lock' ($shortcut.TargetPath -eq $bin -and $shortcut.Arguments -eq '--lock')
$p=Start-Process -FilePath $link -PassThru -WindowStyle Hidden
if($p){[void]$p.WaitForExit(5000)}
$after=State '--status'
Check 'Hotkey and shortcut preserve active curtain windows' ($after.locked -and (@($after.monitorBounds.handle)-join ',') -eq (@($before.monitorBounds.handle)-join ','))
$run=Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name CodexPrivacyCurtain
Check 'Login startup points to installed resident' ($run -eq ('"'+$bin+'" --resident'))
foreach($file in 'PrivacyCurtain.exe','Register.exe','Unregister.exe'){
 $source=Join-Path $PSScriptRoot ('plugin\bin\'+$file)
 $installed=Join-Path $root ('bin\'+$file)
 $cached=Join-Path $cache ('bin\'+$file)
 Check ($file+' source/install/cache hashes match') ((Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $installed).Hash -and (Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $cached).Hash)
}
$mcp=Get-Content -LiteralPath (Join-Path $cache '.mcp.json') -Raw|ConvertFrom-Json
Check 'Cached MCP uses installed binary' ($mcp.mcpServers.'privacy-curtain'.command -eq $bin)
$record=Get-Content -LiteralPath (Join-Path $PSScriptRoot '.work\before-install.json') -Raw|ConvertFrom-Json
$password=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\data\password.dpapi'
Check 'Original password unchanged after install' ($record.passwordSha256 -eq (Get-FileHash -LiteralPath $password).Hash)
if($PreviousInstaller){Check 'Previous usable installer unchanged' ($record.oldInstallerSha256 -eq (Get-FileHash -LiteralPath $PreviousInstaller).Hash)}
$market=Join-Path $env:USERPROFILE '.agents\plugins\marketplace.json'
$backup=Get-ChildItem -LiteralPath (Split-Path $market) -Filter 'marketplace.json.before-curtain-*.bak' | Where-Object {(Get-FileHash -LiteralPath $_.FullName).Hash -eq $record.marketplaceSha256}|Select-Object -First 1
Check 'Marketplace backup matches pre-install data' ($null -ne $backup)
$prior=Get-Content -LiteralPath $backup.FullName -Raw|ConvertFrom-Json
$current=Get-Content -LiteralPath $market -Raw|ConvertFrom-Json
$otherBefore=@($prior.plugins|Where-Object name -ne 'codex-privacy-curtain')|ConvertTo-Json -Depth 15 -Compress
$otherAfter=@($current.plugins|Where-Object name -ne 'codex-privacy-curtain')|ConvertTo-Json -Depth 15 -Compress
Check 'Other marketplace plugins preserved' ($otherBefore -eq $otherAfter)
$checks|ConvertTo-Json -Depth 5
if($OutputFile){$checks|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $OutputFile -Encoding utf8}
