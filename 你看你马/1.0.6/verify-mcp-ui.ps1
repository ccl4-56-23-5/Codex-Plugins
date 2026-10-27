param([string]$Node)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$work=Join-Path $root '.work\mcp-ui-test'
$bin=Join-Path $work 'bin'
New-Item -ItemType Directory -Path $bin -Force | Out-Null
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $csc)){throw 'Microsoft .NET Framework 4.8 x64 compiler not found.'}
if(!$Node){$cmd=Get-Command node -ErrorAction SilentlyContinue;if($cmd){$Node=$cmd.Source}}
if(!$Node){$Node=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'}
if(!(Test-Path -LiteralPath $Node)){throw 'Node.js not found; pass -Node with its absolute path.'}
$sources=@('PrivacyCurtain.cs','PasswordSettingsForm.cs','LegacyLauncher.cs','SessionSafety.cs','McpUi.cs','ScopedShortcut.cs')
$sourcePaths=@($sources|ForEach-Object {Join-Path $root $_})
$testBinary=Join-Path $bin 'PrivacyCurtain.exe'
& $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$testBinary" /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /r:System.Security.dll $sourcePaths
if($LASTEXITCODE){throw 'MCP UI test compilation failed.'}
$oldData=$env:CPC_DATA_DIR
$oldShortcutDisable=$env:CPC_DISABLE_SHORTCUT
try{
    $env:CPC_DATA_DIR=Join-Path $work ('data-'+[Guid]::NewGuid().ToString('N'))
    $env:CPC_DISABLE_SHORTCUT='1'
    $env:CPC_UI_TEST_BINARY=$testBinary
    $env:CPC_UI_TEST_RESULT=Join-Path $work 'verification.json'
    & $Node (Join-Path $root 'verify-mcp-ui.js')
    if($LASTEXITCODE){throw 'MCP UI verification failed.'}
}finally{
    $env:CPC_DATA_DIR=$oldData
    $env:CPC_DISABLE_SHORTCUT=$oldShortcutDisable
    Remove-Item Env:CPC_UI_TEST_BINARY -ErrorAction SilentlyContinue
    Remove-Item Env:CPC_UI_TEST_RESULT -ErrorAction SilentlyContinue
}
