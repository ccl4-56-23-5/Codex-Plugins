param([string]$OutputFile)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$work=Join-Path $root ('.work\shortcut-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force|Out-Null
$exe=Join-Path $work 'ScopedShortcutTests.exe'
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$exe" /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /r:System.Security.dll (Join-Path $root 'ScopedShortcut.cs') (Join-Path $root 'ScopedShortcutTests.cs')
if($LASTEXITCODE -ne 0){throw 'Shortcut tests failed to compile'}
$unit=@(& $exe|ConvertFrom-Json)
if($LASTEXITCODE -ne 0 -or @($unit|Where-Object {!$_.passed}).Count){throw 'Shortcut unit tests failed'}
$checks=[Collections.Generic.List[object]]::new()
function Check($name,$ok){$checks.Add([pscustomobject]@{name=$name;passed=[bool]$ok});if(!$ok){throw "FAILED: $name"}}
function Start-TestProcess($mutexName,$mode='--server'){
 $si=[Diagnostics.ProcessStartInfo]::new($exe,($mode+' "'+$mutexName+'"'));$si.UseShellExecute=$false;$si.CreateNoWindow=$true
 $si.RedirectStandardInput=$true;$si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true;$si.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
 return [Diagnostics.Process]::Start($si)
}
function State($proc){
 $proc.StandardInput.WriteLine('state');$task=$proc.StandardOutput.ReadLineAsync()
 if(!$task.Wait(3000)){throw 'Test server timeout'}
 if(!$task.Result){throw 'Test server closed unexpectedly'}
 return ($task.Result|ConvertFrom-Json)
}
function Command($proc,$command,$expected){
 $proc.StandardInput.WriteLine($command);$task=$proc.StandardOutput.ReadLineAsync()
 if(!$task.Wait(3000) -or $task.Result -ne $expected){throw "Test command failed: $command"}
}
function Registration($proc,$value){
 $until=[DateTime]::UtcNow.AddSeconds(6)
 while([DateTime]::UtcNow -lt $until){$s=State $proc;if($s.owner -and $s.registered -eq $value){return $s};Start-Sleep -Milliseconds 50}
 throw "Registration transition timed out; last state: $($s|ConvertTo-Json -Compress)"
}
function Owner($proc,$value){
 $until=[DateTime]::UtcNow.AddSeconds(8)
 while([DateTime]::UtcNow -lt $until){$s=State $proc;if($s.owner -eq $value -and (!$value -or $s.registered)){return $s};Start-Sleep -Milliseconds 100}
 throw "Owner transition timed out; last state: $($s|ConvertTo-Json -Compress)"
}
function Query($name){$data=& $exe --query $name;if($LASTEXITCODE -ne 0){throw 'Status query process failed'};return ($data|ConvertFrom-Json)}
function QueryOwner($name,$expectedPid){
 $until=[DateTime]::UtcNow.AddSeconds(8)
 while([DateTime]::UtcNow -lt $until){$s=Query $name;if($s.running -and $s.registered -and $s.ownerPid -eq $expectedPid){return $s};Start-Sleep -Milliseconds 100}
 throw 'Status pipe owner transition timed out'
}
$name='Local\CodexPrivacyCurtain-shortcut-test-'+[Guid]::NewGuid().ToString('N')
$first=$null;$second=$null;$third=$null;$fourth=$null;$retry=$null;$actionTest=$null;$session=$null
$password=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\data\password.dpapi'
$before=if(Test-Path -LiteralPath $password){(Get-FileHash -LiteralPath $password).Hash}else{$null}
try{
 Check 'No owner exists before start' (!(Query $name).running)
 $first=Start-TestProcess $name
 $state=Owner $first $true
 Check 'First process owns one installed hook' ($state.owner -and $state.registered -and $state.error -eq 0)
 $pipe=QueryOwner $name $first.Id
 Check 'Cross-process pipe reports correct owner and scope' ($pipe.ownerPid -eq $first.Id -and $pipe.scope -eq 'codex-foreground' -and $pipe.hotkey -eq 'Ctrl+Shift+LeftAlt+N')
 $second=Start-TestProcess $name
 $state=Owner $second $false
 Check 'Second process waits without a second hook' (!$state.owner -and !$state.registered)
 $pipe=QueryOwner $name $first.Id
 Check 'Second process does not replace first owner' ($pipe.ownerPid -eq $first.Id)
 $first.StandardInput.WriteLine('exit')
 Check 'First process exits cleanly' ($first.WaitForExit(7000) -and $first.ExitCode -eq 0)
 $state=Owner $second $true
 $pipe=QueryOwner $name $second.Id
 Check 'Waiting process takes over hook and status pipe' ($state.owner -and $state.registered -and $pipe.ownerPid -eq $second.Id)
 Check 'No activation occurred during lifecycle test' ((State $second).events -eq 0)
 $second.StandardInput.WriteLine('exit')
 Check 'Second process exits cleanly' ($second.WaitForExit(7000) -and $second.ExitCode -eq 0)
 $until=[DateTime]::UtcNow.AddSeconds(4);do{$pipe=Query $name;if(!$pipe.running){break};Start-Sleep -Milliseconds 100}while([DateTime]::UtcNow -lt $until)
 Check 'Status pipe closes when last server exits' (!$pipe.running -and !$pipe.registered)
 $third=Start-TestProcess $name
 [void](Owner $third $true)
 $fourth=Start-TestProcess $name
 [void](Owner $fourth $false)
 $third.Kill();Check 'Test owner can terminate unexpectedly' $third.WaitForExit(5000)
 $state=Owner $fourth $true
 $pipe=QueryOwner $name $fourth.Id
 Check 'Waiting process takes over after abandoned owner mutex' ($state.owner -and $state.registered -and $pipe.ownerPid -eq $fourth.Id)
 $fourth.StandardInput.WriteLine('exit');Check 'Abandoned-mutex successor exits cleanly' ($fourth.WaitForExit(7000) -and $fourth.ExitCode -eq 0)
 $retry=Start-TestProcess $name '--server-retry'
 $until=[DateTime]::UtcNow.AddSeconds(4);do{$state=State $retry;if($state.error -eq -3){break};Start-Sleep -Milliseconds 50}while([DateTime]::UtcNow -lt $until)
 Check 'Simulated hook setup failure is observable' ($state.error -eq -3 -and !$state.registered)
 $state=Owner $retry $true
 $pipe=QueryOwner $name $retry.Id
 Check 'Hook setup is retried and recovers' ($state.registered -and $state.attempts -ge 3 -and $pipe.lastError -eq 0)
 $retry.StandardInput.WriteLine('exit');Check 'Retried listener exits cleanly' ($retry.WaitForExit(7000) -and $retry.ExitCode -eq 0)
 $actionTest=Start-TestProcess $name '--server-actionfail'
 [void](Owner $actionTest $true)
 $actionTest.StandardInput.WriteLine('invoke');$invoke=$actionTest.StandardOutput.ReadLineAsync();Check 'Isolated failed action invoked' ($invoke.Wait(3000) -and $invoke.Result -eq 'invoked')
 $pipe=QueryOwner $name $actionTest.Id
 Check 'Status pipe exposes action failure' ($pipe.lastError -eq -2)
 $actionTest.StandardInput.WriteLine('invoke');$invoke=$actionTest.StandardOutput.ReadLineAsync();Check 'Isolated successful action invoked' ($invoke.Wait(3000) -and $invoke.Result -eq 'invoked')
 $pipe=QueryOwner $name $actionTest.Id
 Check 'Successful action clears previous error' ($pipe.lastError -eq 0)
 $actionTest.StandardInput.WriteLine('exit');Check 'Action test exits cleanly' ($actionTest.WaitForExit(7000) -and $actionTest.ExitCode -eq 0)
 $session=Start-TestProcess $name '--server-session'
 $s=Owner $session $true
 Check 'Test listener starts with one physical keyboard hook' ($s.installs -eq 1 -and $s.removes -eq 0)
 Command $session 'other-lock' 'posted';Start-Sleep -Milliseconds 300
 $s=State $session
 Check 'Other-session lock does not remove current hook' ($s.registered -and $s.removes -eq 0)
 Command $session 'lock' 'posted'
 $s=Registration $session $false
 Check 'Own-session lock removes physical keyboard hook' (!$s.registered -and $s.removes -eq 1)
 $pipe=Query $name
 Check 'Locked listener status reports unregistered and unsafe' ($pipe.running -and !$pipe.registered -and !$pipe.sessionSafe)
 Start-Sleep -Milliseconds 550;$s=State $session
 Check 'Locked notification stays latched despite a safe probe' (!$s.registered -and $s.installs -eq 1 -and $s.removes -eq 1)
 Command $session 'unsafe' 'set';Command $session 'unlock' 'posted';Start-Sleep -Milliseconds 500
 $s=State $session
 Check 'Unlock notification alone does not reinstall on unsafe desktop' (!$s.registered -and $s.installs -eq 1)
 Command $session 'safe' 'set';$s=Registration $session $true
 Check 'Safe desktop after unlock reinstalls keyboard hook' ($s.registered -and $s.installs -eq 2 -and $s.removes -eq 1)
 Command $session 'unsafe' 'set';$s=Registration $session $false
 Check 'Unsafe polling removes keyboard hook without notification' (!$s.registered -and $s.removes -eq 2)
 Command $session 'safe' 'set';$s=Registration $session $true
 Check 'Safe polling reinstalls keyboard hook' ($s.registered -and $s.installs -eq 3)
 Command $session 'disconnect' 'posted';$s=Registration $session $false
 Check 'Session disconnect immediately removes keyboard hook' (!$s.registered -and $s.removes -eq 3)
 Command $session 'unlock' 'posted';$s=Registration $session $true
 Check 'Safe state after disconnect permits reinstall' ($s.registered -and $s.installs -eq 4)
 Command $session 'lock' 'posted';$s=Registration $session $false
 Check 'Closing after simulated lock has no installed hook' (!$s.registered -and $s.removes -eq 4)
 $session.StandardInput.WriteLine('exit');Check 'Locked listener exits cleanly' ($session.WaitForExit(7000) -and $session.ExitCode -eq 0)
 $pipe=Query $name;Check 'Closing locked listener removes status pipe' (!$pipe.running)
}finally{
 foreach($proc in @($first,$second,$third,$fourth,$retry,$actionTest,$session)){if($proc -and !$proc.HasExited){try{$proc.StandardInput.WriteLine('exit');if(!$proc.WaitForExit(7000)){$proc.Kill();[void]$proc.WaitForExit(3000)}}catch{}}}
 $after=if(Test-Path -LiteralPath $password){(Get-FileHash -LiteralPath $password).Hash}else{$null}
 $checks.Add([pscustomobject]@{name='Actual password file unchanged';passed=($before -eq $after)})
 $result=[ordered]@{unitChecks=$unit;lifecycleChecks=@($checks);syntheticInputSent=$false;actualWindowsLock=$false;actualCodexUiTest=$false;sessionProbeSimulated=$true;generatedAt=[DateTime]::Now.ToString('o')}
 $json=$result|ConvertTo-Json -Depth 7
 [IO.File]::WriteAllText((Join-Path $work 'verification.json'),$json,[Text.UTF8Encoding]::new($false))
 if($OutputFile){[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputFile),$json,[Text.UTF8Encoding]::new($false))}
}
if($before -ne $after){throw 'Actual password data changed during verification'}
$json
