param([string]$OutputFile)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$qa=Join-Path $root ('.work\session-safety-'+[Guid]::NewGuid().ToString('N'))
$bin=Join-Path $qa 'bin'
$assets=Join-Path $qa 'assets'
$data=Join-Path $qa 'data'
New-Item -ItemType Directory -Path $bin,$assets,$data -Force|Out-Null
$realPassword=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\data\password.dpapi'
$beforePassword=if(Test-Path -LiteralPath $realPassword){(Get-FileHash -LiteralPath $realPassword).Hash}else{$null}
$realExe=$null
$guard=$null
$checks=[Collections.Generic.List[object]]::new()
$unit=@()
function Check($name,$ok){$checks.Add([pscustomobject]@{name=$name;passed=[bool]$ok});if(!$ok){throw "FAILED: $name"}}
function Child($exe,$arguments,$testData){
    $si=[Diagnostics.ProcessStartInfo]::new($exe,$arguments)
    $si.UseShellExecute=$false;$si.CreateNoWindow=$true
    $si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true
    $si.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    if($testData){$si.EnvironmentVariables['CPC_DATA_DIR']=$testData}else{$si.EnvironmentVariables.Remove('CPC_DATA_DIR')}
    return [Diagnostics.Process]::Start($si)
}
function State($exe,$testData){
    $child=Child $exe '--status' $testData
    if(!$child.WaitForExit(4000)){try{$child.Kill()}catch{};throw 'Status process timed out'}
    if($child.ExitCode -ne 0){throw ('Status failed: '+$child.StandardError.ReadToEnd())}
    return ($child.StandardOutput.ReadToEnd()|ConvertFrom-Json)
}
try{
    $csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if(!(Test-Path -LiteralPath $csc)){throw 'x64 C# compiler unavailable'}
    $unitExe=Join-Path $bin 'SessionSafetyUnit.exe'
    & $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$unitExe" /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll (Join-Path $root 'SessionSafety.cs') (Join-Path $root 'SessionSafetyUnit.cs')
    if($LASTEXITCODE -ne 0){throw 'Session safety unit compilation failed'}
    $guardExe=Join-Path $bin 'PrivacyCurtain.exe'
    & $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$guardExe" /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /r:System.Security.dll (Join-Path $root 'PrivacyCurtain.cs') (Join-Path $root 'PasswordSettingsForm.cs') (Join-Path $root 'LegacyLauncher.cs') (Join-Path $root 'SessionSafety.cs') (Join-Path $root 'McpUi.cs') (Join-Path $root 'ScopedShortcut.cs')
    if($LASTEXITCODE -ne 0){throw 'Guard test compilation failed'}
    $realExe=$guardExe
    Copy-Item -LiteralPath (Join-Path $root 'plugin\assets\wallpaper.jpg') -Destination (Join-Path $assets 'wallpaper.jpg')
    $test=Child $unitExe '' $data
    if(!$test.WaitForExit(10000)){try{$test.Kill()}catch{};throw 'Unit test timed out'}
    $unitText=$test.StandardOutput.ReadToEnd();$unitError=$test.StandardError.ReadToEnd()
    if($unitText){$unit=@($unitText|ConvertFrom-Json)}
    if($test.ExitCode -ne 0){throw "Unit test failed: $unitError"}
    Check 'All session gating and monitor unit checks passed' ($unit.Count -gt 20 -and @($unit|Where-Object {!$_.passed}).Count -eq 0)
    if(Test-Path -LiteralPath $realExe){$realState=State $realExe $null;Check 'Existing real curtain is not active before isolated guard test' (!$realState.locked)}
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PrivacySessionIntegration {
 [DllImport("user32.dll",SetLastError=true)] public static extern bool PostMessage(IntPtr h,uint message,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
    $guard=Child $guardExe '--guard --test-seconds 5' $data
    $status=$null;$deadline=[DateTime]::UtcNow.AddSeconds(3.5)
    do{
        try{$candidate=State $guardExe $data;if($candidate.locked){$status=$candidate;break}}catch{}
        Start-Sleep -Milliseconds 50
    }while([DateTime]::UtcNow -lt $deadline -and !$guard.HasExited)
    Check 'Isolated test guard starts with five-second auto release' ($null -ne $status -and $status.testAutoRelease)
    Check 'Guard registers Windows session notifications and safe session' ($status.sessionNotificationsRegistered -and $status.systemSessionSafe -and $status.sessionMonitorHandle -gt 0)
    Check 'Test curtain covers screens with screenshot exclusion' ($status.coverageVerified -and $status.captureAffinity -eq 'WDA_EXCLUDEFROMCAPTURE')
    $sessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId
    $window=[IntPtr]([long]$status.sessionMonitorHandle)
    $sent=[PrivacySessionIntegration]::PostMessage($window,0x02b1,[IntPtr]7,[IntPtr]$sessionId)
    Check 'Simulated lock sent only to test guard session window' $sent
    Check 'Guard exits promptly after simulated lock' ($guard.WaitForExit(2500) -and $guard.ExitCode -eq 0)
    $log=Get-Content -LiteralPath (Join-Path $data 'lifecycle.log') -Raw
    Check 'Guard records session-triggered cleanup rather than test timeout' ($log -match 'session safety: Windows session locked or disconnected' -and $log -notmatch 'test timer expired')
    Check 'Session notification window is destroyed' (![PrivacySessionIntegration]::IsWindow($window))
    $after=State $guardExe $data
    Check 'Test guard reports inactive after cleanup' (!$after.locked -and !$after.running)
    if(Test-Path -LiteralPath $realExe){$realAfter=State $realExe $null;Check 'Real curtain state remains inactive' (!$realAfter.locked)}
}finally{
    if($guard -and !$guard.HasExited){if(!$guard.WaitForExit(6500)){try{$guard.Kill();[void]$guard.WaitForExit(3000)}catch{}}}
    $afterPassword=if(Test-Path -LiteralPath $realPassword){(Get-FileHash -LiteralPath $realPassword).Hash}else{$null}
    $checks.Add([pscustomobject]@{name='Real password data unchanged';passed=($beforePassword -eq $afterPassword)})
    $result=[ordered]@{unitChecks=$unit;integrationChecks=@($checks);isolatedData=$true;usedActualWindowsLock=$false;guardMaximumSeconds=5;generatedAt=[DateTime]::Now.ToString('o')}
    $json=$result|ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText((Join-Path $qa 'results.json'),$json,[Text.UTF8Encoding]::new($false))
    if($OutputFile){[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputFile),$json,[Text.UTF8Encoding]::new($false))}
}
if($beforePassword -ne $afterPassword){throw 'Real password file changed during test'}
$result|ConvertTo-Json -Depth 8
