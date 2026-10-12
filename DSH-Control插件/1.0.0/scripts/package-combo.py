from pathlib import Path
import zipfile,sys,hashlib,json
root=Path(__file__).resolve().parents[1]
dsh=Path(sys.argv[1]).resolve()
codex=root/'dist/codex-dsh-control-1.0.0-Windows.zip'
target=root/'dist/DSH-Control-Combo-1.0.0-Windows.zip'
installer="""param([string]$DshRoot='D:\\DeepSeekHarness')
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'DSH\\Install-DSH.ps1') -DshRoot $DshRoot
& (Join-Path $PSScriptRoot 'Codex\\Install-Codex.ps1') -DshRoot $DshRoot
Write-Output 'Both plugins installed. Restart DSH if not loaded; reconnect Codex MCP or open a new chat.'
"""
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as out:
    for prefix,source in [('DSH',dsh),('Codex',codex)]:
        with zipfile.ZipFile(source) as z:
            for n in z.namelist():out.writestr(prefix+'/'+n,z.read(n))
    out.writestr('Install-All.ps1',installer)
    out.writestr('README.txt','DSH Control Bridge 1.0.0 + Codex DSH Control 1.0.0\nRun Install-All.ps1 in PowerShell. No screenshot recognition.\nDSH and Codex source repositories are separate. See each README and SHA256 manifest.\n')
    out.writestr('PROVENANCE.json',json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [dsh,codex]},indent=2))
with zipfile.ZipFile(target) as z:assert z.testzip() is None
print(target.name,hashlib.sha256(target.read_bytes()).hexdigest())
