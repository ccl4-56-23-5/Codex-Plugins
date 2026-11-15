from pathlib import Path
import zipfile,sys,hashlib,json
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text(encoding='utf8'))['version']
dsh=Path(sys.argv[1]).resolve()
codex=root/f'dist/codex-dsh-control-{version}-Windows.zip'
target=root/f'dist/DSH-Control-Combo-{version}-Windows.zip'
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
    out.writestr('README.txt',f'DSH Control Bridge 1.0.0 + Codex DSH Control {version}\nRun Install-All.ps1 in PowerShell. No screenshot recognition.\nDSH and Codex source repositories are separate. See each README and SHA256 manifest.\n')
    out.writestr('PROVENANCE.json',json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [dsh,codex]},indent=2))
with zipfile.ZipFile(target) as z:assert z.testzip() is None
manifest_path=root/'release-manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf8'))
digest=hashlib.sha256(target.read_bytes()).hexdigest()
manifest['files'][target.name]={'bytes':target.stat().st_size,'sha256':digest}
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
with (root/'SHA256SUMS.txt').open('a',encoding='utf8') as sums:
    sums.write(f'{digest}  {target.name}\n')
print(target.name,digest)
