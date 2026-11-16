param()

$ErrorActionPreference = 'Stop'
$codex = (Get-Command codex -CommandType Application | Select-Object -First 1).Source
$pluginManifest = Join-Path $PSScriptRoot 'plugins\codex-workbuddy-control\.codex-plugin\plugin.json'
$version = (Get-Content -LiteralPath $pluginManifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+\+\d+$') {
    throw 'Invalid WorkBuddy Control version in plugin manifest.'
}

$marketplace = Join-Path $env:LOCALAPPDATA "CodexWorkBuddy\$version"
$marketName = 'workbuddy-tools'
$pluginId = "codex-workbuddy-control@$marketName"
$registered = & $codex plugin marketplace list --json
if ($LASTEXITCODE -ne 0) { throw 'Codex could not list installed marketplaces.' }
$previous = ($registered | ConvertFrom-Json).marketplaces |
    Where-Object { $_.name -eq $marketName } | Select-Object -First 1
$replace = $previous -and $previous.root -ne $marketplace
if ($replace) {
    $expectedParent = Join-Path $env:LOCALAPPDATA 'CodexWorkBuddy'
    if ((Split-Path -Parent $previous.root) -ne $expectedParent -or
        (Split-Path -Leaf $previous.root) -notmatch '^\d+\.\d+\.\d+\+\d+$') {
        throw "The existing WorkBuddy marketplace is not a version installed by this script: $($previous.root)"
    }
}

New-Item -ItemType Directory -Path $marketplace -Force | Out-Null
foreach ($folder in '.agents', 'plugins') {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $folder) -Destination $marketplace -Recurse -Force
}

$removed = $false
$added = $false
try {
    if ($replace) {
        & $codex plugin marketplace remove $marketName --json
        if ($LASTEXITCODE -ne 0) { throw 'Codex could not replace the previous marketplace.' }
        $removed = $true
    }
    if (!$previous -or $replace) {
        & $codex plugin marketplace add $marketplace --json
        if ($LASTEXITCODE -ne 0) { throw 'Codex could not register the WorkBuddy Tools marketplace.' }
        $added = $true
    }
    & $codex plugin add $pluginId --json
    if ($LASTEXITCODE -ne 0) { throw 'Codex could not install the WorkBuddy Control plugin.' }
    $installed = & $codex plugin list --marketplace $marketName --json
    if ($LASTEXITCODE -ne 0 -or !(($installed | ConvertFrom-Json).installed |
        Where-Object { $_.pluginId -eq $pluginId -and $_.version -eq $version -and $_.enabled })) {
        throw "Codex did not report WorkBuddy Control $version enabled."
    }
} catch {
    if ($added) { & $codex plugin marketplace remove $marketName --json }
    if ($removed) {
        & $codex plugin marketplace add $previous.root --json
        if ($LASTEXITCODE -eq 0) { & $codex plugin add $pluginId --json }
        if ($LASTEXITCODE -ne 0) { Write-Warning 'The previous WorkBuddy marketplace could not be fully restored.' }
    }
    throw
}
