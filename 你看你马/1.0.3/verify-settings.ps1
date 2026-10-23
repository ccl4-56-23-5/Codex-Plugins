param([string]$Binary=(Join-Path $PSScriptRoot 'plugin\bin\PrivacyCurtain.exe'),[switch]$OpenWindow)
$ErrorActionPreference='Stop'
$checks=[Collections.Generic.List[object]]::new()
function Check($name,$passed){$checks.Add(@{name=$name;passed=[bool]$passed});if(!$passed){throw "FAILED: $name"}}
$passwordFile=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\data\password.dpapi'
$passwordBefore=if(Test-Path -LiteralPath $passwordFile){(Get-FileHash -LiteralPath $passwordFile).Hash}else{$null}
$si=[Diagnostics.ProcessStartInfo]::new($Binary,'--serve');$si.UseShellExecute=$false;$si.CreateNoWindow=$true
$si.RedirectStandardInput=$true;$si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true;$si.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
$p=[Diagnostics.Process]::Start($si)
function Request($id,$method,$params){$p.StandardInput.WriteLine((@{jsonrpc='2.0';id=$id;method=$method;params=$params}|ConvertTo-Json -Depth 12 -Compress));$t=$p.StandardOutput.ReadLineAsync();if(!$t.Wait(10000)){throw 'MCP timeout'};$r=$t.Result|ConvertFrom-Json;if($r.error){throw ($r.error|ConvertTo-Json -Compress)};return $r.result}
try{
    $init=Request 1 'initialize' @{protocolVersion='2025-11-25';capabilities=@{};clientInfo=@{name='settings-entry-verifier';version='1.0.3'}}
    Check 'Installed MCP version' ($init.serverInfo.version -eq '1.0.3')
    Check 'Native settings capability advertised' ($init.capabilities.experimental.'openai/settings'.readTool -eq 'curtain_settings_read' -and $init.capabilities.experimental.'openai/settings'.updateTool -eq 'curtain_settings_update')
    $tools=(Request 2 'tools/list' @{}).tools
    $readTool=$tools|Where-Object name -eq 'curtain_settings_read'
    Check 'Read-only settings tool has outputSchema' ($readTool.annotations.readOnlyHint -and $readTool.outputSchema.required -contains 'schema' -and $readTool.outputSchema.required -contains 'values')
    Check 'Button has Chinese display title and accepts no arguments' (($tools|Where-Object name -eq 'curtain_open_settings').title -eq '修改密码')
    $read=Request 3 'tools/call' @{name='curtain_settings_read';arguments=@{}}
    Check 'Settings read returns structured content' (!$read.isError -and $read.structuredContent.schema.type -eq 'object' -and $read.content.Count -eq 0)
    $button=$read.structuredContent.layout[0].items[0]
    Check 'Settings layout references password action' ($read.structuredContent.layout[0].title -eq '密码与解锁' -and $button.kind -eq 'tool' -and $button.tool -eq 'curtain_open_settings')
    $bad=Request 4 'tools/call' @{name='curtain_settings_update';arguments=@{set=@{password='do-not-accept-in-settings'}}}
    Check 'Password updates through generic settings rejected' $bad.isError
    $empty=Request 5 'tools/call' @{name='curtain_settings_update';arguments=@{set=@{}}}
    Check 'Empty settings update is harmless' (!$empty.isError -and $null -ne $empty.structuredContent.values)
    if($OpenWindow){
        $open=Request 6 'tools/call' @{name='curtain_open_settings';arguments=@{}}
        Check 'Password button starts native window' (!$open.isError -and ($open.content[0].text|ConvertFrom-Json).opened)
        $window=@();for($i=0;$i -lt 20;$i++){$window=@(Get-Process PrivacyCurtain -ErrorAction SilentlyContinue|Where-Object {$_.Path -eq $Binary -and $_.MainWindowTitle -eq '你看你马 · 修改密码'});if($window.Count){break};Start-Sleep -Milliseconds 150}
        Check 'Native password window is visible' ($window.Count -ge 1)
    }
}finally{$p.StandardInput.Close();if(!$p.WaitForExit(3000)){$p.Kill()}}
$passwordAfter=if(Test-Path -LiteralPath $passwordFile){(Get-FileHash -LiteralPath $passwordFile).Hash}else{$null}
Check 'Existing password file preserved' ($passwordBefore -eq $passwordAfter)
$checks|ConvertTo-Json -Depth 8
