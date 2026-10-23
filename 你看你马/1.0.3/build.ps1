param([string]$InnoCompiler,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $csc)){throw '.NET Framework 4.8 x64 compiler is required.'}
$bin=if($CheckOnly){Join-Path $root '.work\check\bin'}else{Join-Path $root 'plugin\bin'}
New-Item -ItemType Directory -Path $bin -Force|Out-Null
$icon=Join-Path $root 'plugin\assets\icon.ico'
& $csc /nologo /target:exe /platform:x64 /optimize+ "/win32icon:$icon" "/out:$bin\PrivacyCurtain.exe" /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /r:System.Security.dll "$root\PrivacyCurtain.cs" "$root\PasswordSettingsForm.cs"
if($LASTEXITCODE){throw 'Application compilation failed.'}
& $csc /nologo /target:winexe /platform:x64 /optimize+ "/out:$bin\Register.exe" /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll "$root\Register.cs"
if($LASTEXITCODE){throw 'Registration compilation failed.'}
& $csc /nologo /target:winexe /platform:x64 /optimize+ "/out:$bin\Unregister.exe" /r:System.Web.Extensions.dll "$root\Unregister.cs"
if($LASTEXITCODE){throw 'Unregistration compilation failed.'}
if($CheckOnly){Write-Output 'Native source compilation passed; bundled tested binaries were preserved.';return}
if(!$InnoCompiler){$cmd=Get-Command ISCC.exe -ErrorAction SilentlyContinue;if($cmd){$InnoCompiler=$cmd.Source}}
if(!$InnoCompiler){$InnoCompiler=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'}
if(!(Test-Path -LiteralPath $InnoCompiler)){throw 'Pass -InnoCompiler with the path to Inno Setup 6 ISCC.exe.'}
& $InnoCompiler "$root\setup.iss"
if($LASTEXITCODE){throw 'Installer build failed.'}
