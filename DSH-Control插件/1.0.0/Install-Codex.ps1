param([string]$DshRoot='D:\DeepSeekHarness')
$ErrorActionPreference='Stop'
$target=Join-Path $env:USERPROFILE 'plugins\codex-dsh-control-1.0.0'
$marketFile=Join-Path $env:USERPROFILE '.agents\plugins\marketplace.json'
$node=Join-Path $DshRoot 'resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
if(!(Test-Path -LiteralPath $node)){throw 'DSH bundled Node runtime not found.'}
$backup=Join-Path $env:USERPROFILE ('plugins\codex-dsh-control-backups\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup,$target -Force | Out-Null
if(Test-Path -LiteralPath $marketFile){Copy-Item -LiteralPath $marketFile -Destination $backup;$market=Get-Content -LiteralPath $marketFile -Raw|ConvertFrom-Json}else{$market=[pscustomobject]@{name='personal';plugins=@()};New-Item -ItemType Directory -Path (Split-Path $marketFile) -Force|Out-Null}
if($market.name -ne 'personal'){throw 'Expected personal marketplace; no existing entry changed.'}
foreach($name in @('.codex-plugin','.mcp.json','dist','skills','assets','README.md','LICENSE','THIRD_PARTY_NOTICES.md','LICENSES')){$p=Join-Path $PSScriptRoot $name;if(Test-Path -LiteralPath $p){Copy-Item -LiteralPath $p -Destination $target -Recurse -Force}}
$mcp=@{mcpServers=@{'dsh-control'=@{command=$node;args=@((Join-Path $target 'dist\server.mjs'))}}}
[IO.File]::WriteAllText((Join-Path $target '.mcp.json'),($mcp|ConvertTo-Json -Depth 12))
$entry=[pscustomobject]@{name='codex-dsh-control';source=@{source='local';path='./plugins/codex-dsh-control-1.0.0'};policy=@{installation='AVAILABLE';authentication='ON_INSTALL'};category='Productivity'}
$market.plugins=@($market.plugins|Where-Object name -ne 'codex-dsh-control')+@($entry)
[IO.File]::WriteAllText($marketFile,($market|ConvertTo-Json -Depth 40))
try{& codex plugin add 'codex-dsh-control@personal' --json;if($LASTEXITCODE -ne 0){throw 'Codex plugin add failed'}}catch{if(Test-Path -LiteralPath (Join-Path $backup 'marketplace.json')){Copy-Item -LiteralPath (Join-Path $backup 'marketplace.json') -Destination $marketFile -Force};throw}
Write-Output 'Installed codex-dsh-control 1.0.0. Reconnect MCP or start a new Codex chat to load tools.'
