param([string]$Binary=(Join-Path $PSScriptRoot 'plugin\bin\PrivacyCurtain.exe'))
$ErrorActionPreference='Stop'
$Binary=[IO.Path]::GetFullPath($Binary)
$qa=Join-Path $PSScriptRoot ('.work\quick-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qa -Force | Out-Null
$checks=[Collections.Generic.List[object]]::new()
function Check($name,$ok){$checks.Add([pscustomobject]@{name=$name;passed=[bool]$ok});if(!$ok){throw "FAILED: $name"}}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class QuickTestInput {
 [DllImport("user32.dll")] public static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool RegisterHotKey(IntPtr h,int id,uint modifiers,uint key);
 [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h,int id);
 public static void Chord(bool repeat){byte[] keys={0x11,0x10,0x12,0x4e};foreach(byte k in keys)keybd_event(k,0,0,UIntPtr.Zero);if(repeat)for(int i=0;i<4;i++)keybd_event(0x4e,0,0,UIntPtr.Zero);for(int i=keys.Length-1;i>=0;i--)keybd_event(keys[i],0,2,UIntPtr.Zero);}
}
'@
function Start-Child($mode){
 $si=[Diagnostics.ProcessStartInfo]::new($Binary,$mode);$si.UseShellExecute=$false;$si.CreateNoWindow=$true
 $si.EnvironmentVariables['CPC_DATA_DIR']=$qa
 $si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true
 $si.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
 [Diagnostics.Process]::Start($si)
}
function Read-State($mode){$p=Start-Child $mode;if(!$p.WaitForExit(15000)){throw 'Child timeout'};if($p.ExitCode){throw $p.StandardError.ReadToEnd()};$p.StandardOutput.ReadToEnd()|ConvertFrom-Json}
function Await-State($mode,$predicate){for($i=0;$i -lt 50;$i++){$s=Read-State $mode;if(&$predicate $s){return $s};Start-Sleep -Milliseconds 100};throw "Timed out: $mode"}
$realData=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\data\password.dpapi'
$before=if(Test-Path -LiteralPath $realData){(Get-FileHash -LiteralPath $realData).Hash}else{$null}
$resident=$null;$conflict=$false
try{
 $resident=Start-Child '--resident-test'
 $s=Await-State '--resident-status' {param($v)$v.running}
 Check 'Global hotkey registered' $s.hotkeyRegistered
 Check 'Starting launcher does not lock' (!(Read-State '--status').locked)
 Check 'Starting launcher does not create a password' (!(Test-Path -LiteralPath (Join-Path $qa 'password.dpapi')))
 $second=Start-Child '--resident-test';Check 'Duplicate launcher exits' $second.WaitForExit(4000)
 [QuickTestInput]::Chord($true)
 $s=Await-State '--resident-status' {param($v)$v.activations -ge 1}
 Check 'Windows hotkey dispatch reaches launcher once for held key' ($s.lastTrigger -eq 'hotkey' -and $s.activations -eq 1)
 $guard=Read-State '--status'
 Check 'Hotkey creates visible capture-excluded multi-monitor curtain' ($guard.locked -and $guard.coverageVerified -and $guard.captureAffinity -eq 'WDA_EXCLUDEFROMCAPTURE')
 $handles=@($guard.monitorBounds.handle)
 [QuickTestInput]::Chord($false)
 $s=Await-State '--resident-status' {param($v)$v.activations -eq 2}
 $again=Read-State '--status'
 Check 'Second hotkey reuses curtain and never unlocks' ($again.locked -and (@($again.monitorBounds.handle)-join ',') -eq ($handles-join ','))
 Check 'Injected key events still pass through curtain' ($again.injectedKeyboardEvents -ge 8)
 $stop=Start-Child '--resident-stop';Check 'Resident stop returns success' ($stop.WaitForExit(4000) -and $stop.ExitCode -eq 0)
 Check 'Resident exits cleanly' $resident.WaitForExit(4000)
 Check 'Stopping launcher keeps curtain locked' (Read-State '--status').locked
 $released=Await-State '--status' {param($v)!$v.locked}
 Check 'Isolated test curtain releases automatically' (!$released.locked)
 $conflict=[QuickTestInput]::RegisterHotKey([IntPtr]::Zero,22001,0x4007,0x4e)
 Check 'Stopped launcher releases global key registration' $conflict
 $resident=Start-Child '--resident-test'
 $s=Await-State '--resident-status' {param($v)$v.running}
 Check 'Hotkey conflict is reported while tray remains running' (!$s.hotkeyRegistered -and $s.registrationError -eq 1409 -and $s.lastError.Length -gt 0)
 $stop=Start-Child '--resident-stop';[void]$stop.WaitForExit(4000);[void]$resident.WaitForExit(4000)
 [void][QuickTestInput]::UnregisterHotKey([IntPtr]::Zero,22001);$conflict=$false
 $resident=Start-Child '--resident-test'
 $s=Await-State '--resident-status' {param($v)$v.running}
 Check 'Hotkey registers after conflict is removed' $s.hotkeyRegistered
 $replacement=Start-Child '--resident-replace'
 Check 'Replacement stops old launcher' $resident.WaitForExit(5000)
 $resident=$replacement
 $s=Await-State '--resident-status' {param($v)$v.running -and !$v.testMode}
 Check 'Replacement preserves one registered resident' $s.hotkeyRegistered
 Check 'Replacement does not enable curtain' (!(Read-State '--status').locked)
}finally{
 if($conflict){[void][QuickTestInput]::UnregisterHotKey([IntPtr]::Zero,22001)}
 $stop=Start-Child '--resident-stop';[void]$stop.WaitForExit(4000)
 if($resident){[void]$resident.WaitForExit(5000)}
 $after=if(Test-Path -LiteralPath $realData){(Get-FileHash -LiteralPath $realData).Hash}else{$null}
 Check 'Real password data unchanged' ($before -eq $after)
 $checks|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $qa 'results.json') -Encoding utf8
}
$checks|ConvertTo-Json -Depth 6
