param([string]$OutputFile)
$ErrorActionPreference='Stop'
$bin=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\1.0.6\bin\PrivacyCurtain.exe'
$checks=[Collections.Generic.List[object]]::new()
function Check($name,$ok){$checks.Add([pscustomobject]@{name=$name;passed=[bool]$ok});if(!$ok){throw "FAILED: $name"}}
function ShortcutState(){(& $bin --shortcut-status)|ConvertFrom-Json}
$before=ShortcutState
$si=[Diagnostics.ProcessStartInfo]::new($bin,'--serve');$si.UseShellExecute=$false;$si.CreateNoWindow=$true
$si.RedirectStandardInput=$true;$si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true
$si.EnvironmentVariables.Remove('CPC_DATA_DIR');$si.EnvironmentVariables.Remove('CPC_DISABLE_SHORTCUT')
$process=[Diagnostics.Process]::Start($si)
try{
 $deadline=[DateTime]::UtcNow.AddSeconds(8);$state=$null
 do{$state=ShortcutState;if($state.running -and $state.registered -and $state.sessionSafe){break};Start-Sleep -Milliseconds 100}while([DateTime]::UtcNow -lt $deadline)
 Check 'Installed MCP process activates a listener' ($state.running -and $state.registered -and $state.sessionSafe)
 Check 'Installed shortcut is restricted to Codex foreground and left Alt' ($state.scope -eq 'codex-foreground' -and $state.hotkey -eq 'Ctrl+Shift+LeftAlt+N')
 Check 'Listener reports no startup error' ($state.lastError -eq 0)
 Check 'No actual curtain enabled during verification' (!((& $bin --status|ConvertFrom-Json).locked))
}finally{
 $process.StandardInput.Close()
 if(!$process.WaitForExit(7000)){try{$process.Kill();[void]$process.WaitForExit(2000)}catch{}}
}
Check 'Temporary plugin process exits cleanly' ($process.HasExited -and $process.ExitCode -eq 0)
$after=ShortcutState
Check 'Temporary listener is released or handed to another plugin process' (!$after.running -or $after.ownerPid -ne $process.Id)
$record=[ordered]@{checks=@($checks);realKeyboardInputSent=$false;windowsLockTriggered=$false;beforeAlreadyRunning=[bool]$before.running;temporaryOwnerPid=$process.Id;finalListenerRunning=[bool]$after.running}
$json=$record|ConvertTo-Json -Depth 6
if($OutputFile){[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputFile),$json,[Text.UTF8Encoding]::new($false))}
$json
