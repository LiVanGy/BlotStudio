import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
const kind=process.argv[2]||'web';
const arch=process.argv[3]||process.arch;
if(!['web','mac','windows'].includes(kind)||!['x64','arm64'].includes(arch))throw Error('Invalid release target');
const name=`BlotStudio-${kind==='web'?'Web':kind==='mac'?'macOS':'Windows'}-${kind==='web'?'offline':arch}-v${version}`;
const folder=path.resolve('release',name);await fs.mkdir(folder,{recursive:true});
for(const file of ['README.md','LICENSE','ImageJ方法与复核.md','整改与测试说明.md','RELEASE-NOTES.md','THIRD-PARTY-NOTICES.md'])await fs.copyFile(file,path.join(folder,file));
await fs.cp('docs',path.join(folder,'docs'),{recursive:true});
await fs.cp('verification',path.join(folder,'verification'),{recursive:true});
await fs.mkdir(path.join(folder,'示例说明'),{recursive:true});
await fs.copyFile('examples/README.md',path.join(folder,'示例说明/README.md'));
// Synthetic test images are generated only in the temporary test directory.
// Do not publish local examples or personal projects in release archives.

if(kind==='mac')await fs.cp('dist/BlotStudio.app',path.join(folder,'BlotStudio.app'),{recursive:true});
else if(kind==='windows')await fs.cp(`dist/windows-${arch}`,folder,{recursive:true});
else{
  await fs.copyFile('dist/BlotStudio.html',path.join(folder,'BlotStudio.html'));
  await fs.writeFile(path.join(folder,'Start-BlotStudio.cmd'),'@echo off\r\nstart "" "%~dp0BlotStudio.html"\r\n');
}
await fs.mkdir(path.join(folder,'licenses'),{recursive:true});
await fs.copyFile('vendor/liquid-glass/LICENSE',path.join(folder,'licenses/liquid-glass-MIT.txt'));
const zip=folder+'.zip';
if(kind==='mac')execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',folder,zip]);
else if(process.platform==='win32')execFileSync('powershell',['-NoProfile','-Command',`Compress-Archive -Path '${folder.replaceAll("'","''")}\\*' -DestinationPath '${zip.replaceAll("'","''")}' -Force`]);
else execFileSync('zip',['-qr',zip,name],{cwd:path.dirname(folder)});
console.log(zip);
