param()

$ErrorActionPreference = 'Stop'
$codex = (Get-Command codex -CommandType Application | Select-Object -First 1).Source
$pluginManifest = Join-Path $PSScriptRoot 'plugins\codex-workbuddy-control\.codex-plugin\plugin.json'
$version = (Get-Content -LiteralPath $pluginManifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+\+\d+$') {
    throw 'Invalid WorkBuddy Control version in plugin manifest.'
}

$marketplace = Join-Path $env:LOCALAPPDATA "CodexWorkBuddy\$version"
New-Item -ItemType Directory -Path $marketplace -Force | Out-Null
foreach ($folder in '.agents', 'plugins') {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $folder) -Destination $marketplace -Recurse -Force
}

& $codex plugin marketplace add $marketplace --json
if ($LASTEXITCODE -ne 0) { throw 'Codex could not register the WorkBuddy Tools marketplace.' }

& $codex plugin add 'codex-workbuddy-control@workbuddy-tools' --json
if ($LASTEXITCODE -ne 0) { throw 'Codex could not install the WorkBuddy Control plugin.' }
