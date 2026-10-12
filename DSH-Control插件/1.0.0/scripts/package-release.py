from pathlib import Path
import zipfile,json,hashlib
root=Path(__file__).resolve().parents[1]
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
files=[]
for name in ['.codex-plugin','.mcp.json','dist/server.mjs','skills','assets','LICENSE','LICENSES','README.md','THIRD_PARTY_NOTICES.md','Install-Codex.ps1']:
    p=root/name
    files.extend([x for x in p.rglob('*') if x.is_file()] if p.is_dir() else [p])
sums=''.join(f'{hashfile(p)}  {p.relative_to(root).as_posix()}\n' for p in sorted(files))
(root/'RUNTIME-SHA256SUMS.txt').write_text(sums,encoding='utf8');files.append(root/'RUNTIME-SHA256SUMS.txt')
target=root/'dist/codex-dsh-control-1.0.0-Windows.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in files:z.write(p,p.relative_to(root).as_posix())
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    for p in files:assert hashlib.sha256(z.read(p.relative_to(root).as_posix())).hexdigest()==hashfile(p)
(root/'release-manifest.json').write_text(json.dumps({'name':'codex-dsh-control','version':'1.0.0','tools':41,'bundledDependencies':True,'files':{target.name:{'bytes':target.stat().st_size,'sha256':hashfile(target)}}},indent=2),encoding='utf8')
(root/'SHA256SUMS.txt').write_text(f'{hashfile(target)}  {target.name}\n',encoding='utf8')
print(target,hashfile(target))
