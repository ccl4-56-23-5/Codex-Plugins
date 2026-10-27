param([string]$OutputFile,[string]$BeforeInstallFile=(Join-Path $PSScriptRoot '.work\before-install.json'))
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\1.0.6'
$old=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\1.0.4\bin\PrivacyCurtain.exe'
$bin=Join-Path $root 'bin\PrivacyCurtain.exe'
$cache=Join-Path $env:USERPROFILE '.codex\plugins\cache\personal\codex-privacy-curtain\1.0.6'
$checks=[Collections.Generic.List[object]]::new()
function Check($name,$ok){$checks.Add([pscustomobject]@{name=$name;passed=[bool]$ok});if(!$ok){throw "FAILED: $name"}}
$prior=Get-Content -LiteralPath $BeforeInstallFile -Raw|ConvertFrom-Json
$state=(& $bin --status)|ConvertFrom-Json
Check 'Installed 1.0.6 responds and curtain is not active' ($state.version -eq '1.0.6' -and !$state.locked)
$desktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) '你看你马 · 开启幕布.lnk'
Check 'Old desktop shortcut was removed from desktop' (!(Test-Path -LiteralPath $desktop))
$backup=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\data\legacy-shortcuts'
if($null -ne $prior.desktopShortcut){
 $found=@(Get-ChildItem -LiteralPath $backup -Filter '*.lnk' -ErrorAction SilentlyContinue|Where-Object {(Get-FileHash -LiteralPath $_.FullName).Hash -eq $prior.desktopShortcut.sha256})
 Check 'Prior unmodified desktop shortcut has a recoverable copy' ($found.Count -ge 1)
}else{Check 'No desktop shortcut existed before this update' (!$prior.desktopExists)}
$run=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$startup=$run.PSObject.Properties['CodexPrivacyCurtain']
Check 'Old plugin-owned startup value removed' ($null -eq $startup)
$group=Join-Path ([Environment]::GetFolderPath('Programs')) '你看你马'
$oldLinks=@('开启隐私幕布.lnk','启动快捷键与托盘.lnk','修改密码.lnk','使用说明.lnk')|Where-Object {Test-Path -LiteralPath (Join-Path $group $_)}
Check 'Old start-menu links removed' ($oldLinks.Count -eq 0)
if(Test-Path -LiteralPath $old){$launcher=(& $old --resident-status)|ConvertFrom-Json;Check 'Old tray and global hotkey are stopped' (!$launcher.running -and !$launcher.hotkeyRegistered)}
foreach($file in 'PrivacyCurtain.exe','Register.exe','Unregister.exe'){
 $source=Join-Path $PSScriptRoot ('plugin\bin\'+$file)
 $installed=Join-Path $root ('bin\'+$file)
 $cached=Join-Path $cache ('bin\'+$file)
 Check ($file+' source, installed and cache binaries match') ((Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $installed).Hash -and (Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $cached).Hash)
}
$manifest=Get-Content -LiteralPath (Join-Path $cache '.codex-plugin\plugin.json') -Raw|ConvertFrom-Json
Check 'Codex plugin cache contains 1.0.6' ($manifest.version -eq '1.0.6')
$mcp=Get-Content -LiteralPath (Join-Path $cache '.mcp.json') -Raw|ConvertFrom-Json
Check 'Codex MCP points at updated installed binary' ($mcp.mcpServers.'privacy-curtain'.command -eq $bin)
$password=Join-Path $env:LOCALAPPDATA 'CodexPrivacyCurtain\data\password.dpapi'
$passwordAfter=if(Test-Path -LiteralPath $password){(Get-FileHash -LiteralPath $password).Hash}else{$null}
Check 'Existing password unchanged' ($prior.passwordSha256 -eq $passwordAfter)
$market=Join-Path $env:USERPROFILE '.agents\plugins\marketplace.json'
$backupFile=Get-ChildItem -LiteralPath (Split-Path $market) -Filter 'marketplace.json.before-curtain-*.bak' | Where-Object {(Get-FileHash -LiteralPath $_.FullName).Hash -eq $prior.marketplaceSha256}|Select-Object -First 1
Check 'Marketplace before-install backup preserved' ($null -ne $backupFile)
$before=Get-Content -LiteralPath $backupFile.FullName -Raw|ConvertFrom-Json
$after=Get-Content -LiteralPath $market -Raw|ConvertFrom-Json
$otherBefore=@($before.plugins|Where-Object name -ne 'codex-privacy-curtain')|ConvertTo-Json -Depth 15 -Compress
$otherAfter=@($after.plugins|Where-Object name -ne 'codex-privacy-curtain')|ConvertTo-Json -Depth 15 -Compress
Check 'Other marketplace plugins unchanged' ($otherBefore -eq $otherAfter)
$json=$checks|ConvertTo-Json -Depth 6
if($OutputFile){[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputFile),$json,[Text.UTF8Encoding]::new($false))}
$json
