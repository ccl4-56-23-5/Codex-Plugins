param(
  [string]$InstallRoot = (Join-Path $env:USERPROFILE 'plugins\codex-dsh-desktop-0.2.0-codex.20261003'),
  [string]$DshRoot = 'D:\DeepSeekHarness'
)
$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$nodeExe = Join-Path $DshRoot 'resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
$desktopExe = Join-Path $DshRoot 'DeepSeek Harness.exe'
$marketplaceFile = Join-Path $env:USERPROFILE '.agents\plugins\marketplace.json'
$pluginsDir = [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'plugins'))
$targetRoot = [System.IO.Path]::GetFullPath($InstallRoot)
if (-not $targetRoot.StartsWith($pluginsDir + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'InstallRoot must be inside the current user plugins directory.' }
foreach ($file in @($nodeExe, $desktopExe, $marketplaceFile, (Join-Path $sourceRoot 'node_modules\@modelcontextprotocol\sdk\package.json'))) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing dependency: $file" }
}
$marketplace = Get-Content -LiteralPath $marketplaceFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($marketplace.name -ne 'personal') { throw 'This installer requires the existing personal marketplace.' }
$entry = @($marketplace.plugins | Where-Object { $_.name -eq 'codex-dsh-desktop' })
if ($entry.Count -ne 1) { throw 'Expected exactly one existing codex-dsh-desktop marketplace entry.' }
$backupDir = Join-Path $pluginsDir ('codex-dsh-desktop-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $marketplaceFile -Destination (Join-Path $backupDir 'marketplace.json')
$configFile = Join-Path $env:USERPROFILE '.codex\config.toml'
if (Test-Path -LiteralPath $configFile) { Copy-Item -LiteralPath $configFile -Destination (Join-Path $backupDir 'config.toml') }
if (Test-Path -LiteralPath $targetRoot) {
  foreach ($relative in @('.mcp.json', '.codex-plugin', 'scripts', 'skills', 'README.md', 'package.json')) {
    $existing = Join-Path $targetRoot $relative
    if (Test-Path -LiteralPath $existing) { Copy-Item -LiteralPath $existing -Destination $backupDir -Recurse }
  }
}
if ($targetRoot -ne [System.IO.Path]::GetFullPath($sourceRoot)) {
  New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
  Get-ChildItem -LiteralPath $sourceRoot -Force | Where-Object { $_.Name -notin @('.test-tmp', '.git') } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $targetRoot -Recurse -Force
  }
}
$mcp = @{ mcpServers = @{ 'dsh-desktop' = @{ command = $nodeExe; args = @((Join-Path $targetRoot 'scripts\mcp-server.mjs')); env = @{ DSH_DESKTOP_EXE = $desktopExe } } } }
[System.IO.File]::WriteAllText((Join-Path $targetRoot '.mcp.json'), ($mcp | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
$relativePath = $targetRoot.Substring([System.IO.Path]::GetFullPath($env:USERPROFILE).Length + 1).Replace('\', '/')
$entry[0].source = [pscustomobject]@{ source = 'local'; path = './' + $relativePath }
[System.IO.File]::WriteAllText($marketplaceFile, ($marketplace | ConvertTo-Json -Depth 40), (New-Object System.Text.UTF8Encoding($false)))
$cli = Get-Command codex -CommandType Application -ErrorAction Stop | Select-Object -First 1
try {
  & $cli.Source plugin add 'codex-dsh-desktop@personal' --json
  if ($LASTEXITCODE -ne 0) { throw "Codex plugin installation exited $LASTEXITCODE" }
} catch {
  Copy-Item -LiteralPath (Join-Path $backupDir 'marketplace.json') -Destination $marketplaceFile -Force
  throw
}
[pscustomobject]@{ installed = '0.2.0+codex.20261003'; path = $targetRoot; backup = $backupDir; reconnectRequiredForRunningMcp = $true } | ConvertTo-Json
