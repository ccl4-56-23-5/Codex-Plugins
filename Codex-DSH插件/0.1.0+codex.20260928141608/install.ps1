param([string]$DshExe = 'D:\DeepSeekHarness\DeepSeek Harness.exe')
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'plugin'
$manifestPath = Join-Path $source '.codex-plugin\plugin.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Plugin files are missing. Extract the entire ZIP before installing.' }
if (-not (Test-Path -LiteralPath $DshExe -PathType Leaf)) { throw "DSH Desktop not found: $DshExe. Run install.ps1 -DshExe '<full path to DeepSeek Harness.exe>'." }
$node = Join-Path (Split-Path -Parent $DshExe) 'resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw "DSH bundled Node.js not found: $node" }
$codex = Get-Command codex -ErrorAction Stop
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$folder = 'codex-dsh-desktop-' + ($manifest.version -replace '[^A-Za-z0-9._-]', '-')
$marketRoot = Join-Path $env:USERPROFILE '.agents\plugins'
$target = Join-Path (Join-Path $env:USERPROFILE 'plugins') $folder
if (Test-Path -LiteralPath $target) {
  $existing = Get-Content -LiteralPath (Join-Path $target '.codex-plugin\plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($existing.version -ne $manifest.version) { throw "Install target contains a different version: $target" }
} else {
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
}
$mcpPath = Join-Path $target '.mcp.json'
$mcp = Get-Content -LiteralPath $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
$mcp.mcpServers.'dsh-desktop'.command = $node
$mcp.mcpServers.'dsh-desktop'.args = @((Join-Path $target 'scripts\mcp-server.mjs'))
$mcp.mcpServers.'dsh-desktop'.env.DSH_DESKTOP_EXE = $DshExe
[IO.File]::WriteAllText($mcpPath, ($mcp | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
$marketPath = Join-Path $marketRoot 'marketplace.json'
if (Test-Path -LiteralPath $marketPath) {
  $market = Get-Content -LiteralPath $marketPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($market.name -ne 'personal') { throw "Existing personal marketplace has unexpected name: $($market.name)" }
  Copy-Item -LiteralPath $marketPath -Destination ($marketPath + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -Force
} else {
  $market = [pscustomobject]@{ name = 'personal'; interface = [pscustomobject]@{ displayName = 'Personal' }; plugins = @() }
}
$entry = @($market.plugins | Where-Object { $_.name -eq 'codex-dsh-desktop' }) | Select-Object -First 1
if ($entry) {
  $entry.source.source = 'local'
  $entry.source.path = './plugins/' + $folder
} else {
  $entry = [pscustomobject]@{ name = 'codex-dsh-desktop'; source = [pscustomobject]@{ source = 'local'; path = './plugins/' + $folder }; policy = [pscustomobject]@{ installation = 'AVAILABLE'; authentication = 'ON_INSTALL' }; category = 'Productivity' }
  $market.plugins = @($market.plugins) + @($entry)
}
[IO.File]::WriteAllText($marketPath, ($market | ConvertTo-Json -Depth 15), (New-Object Text.UTF8Encoding($false)))
& $codex.Source plugin add codex-dsh-desktop@personal
if ($LASTEXITCODE -ne 0) { throw "Codex plugin installation failed ($LASTEXITCODE)" }
Write-Output "Installed $($manifest.name) $($manifest.version) from $target"
