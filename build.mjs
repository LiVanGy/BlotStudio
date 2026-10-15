import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const order=['core','science','imagej','tiff','scene','io','pptx','imagej-interop','imagej-ui','ui','app'];
const js=(await Promise.all(order.map(name=>fs.readFile(path.join(root,'src',name+'.js'),'utf8')))).join('\n');
const css=await fs.readFile(path.join(root,'src/styles.css'),'utf8');
const html=(await fs.readFile(path.join(root,'index.template.html'),'utf8')).replace('/*__STYLE__*/',()=>css).replace('/*__SCRIPT__*/',()=>js.replaceAll('</script','<\\/script'));
await fs.mkdir(path.join(root,'dist'),{recursive:true});
await fs.writeFile(path.join(root,'dist/BlotStudio.html'),html);
await fs.writeFile(path.join(root,'dist/index.html'),html);
console.log('Built standalone offline HTML:',html.length,'characters');
if(process.argv.includes('--mac')){
  const app=path.join(root,'dist/BlotStudio.app/Contents');
  await fs.mkdir(path.join(app,'MacOS'),{recursive:true});await fs.mkdir(path.join(app,'Resources'),{recursive:true});
  await fs.writeFile(path.join(app,'Resources/BlotStudio.html'),html);
  await fs.copyFile(path.join(root,'native/Info.plist'),path.join(app,'Info.plist'));
  await fs.copyFile(path.join(root,'native/AppIcon.icns'),path.join(app,'Resources/AppIcon.icns'));
  const cache=path.join(root,'.swift-cache');await fs.mkdir(cache,{recursive:true});
  const arch=process.env.BLOTSTUDIO_MAC_ARCH||process.arch;
  if(!['arm64','x64'].includes(arch))throw Error('Unsupported macOS architecture: '+arch);
  execFileSync('xcrun',['swiftc','-O','-target',(arch==='x64'?'x86_64':'arm64')+'-apple-macosx13.0','-module-cache-path',cache,'-framework','Cocoa','-framework','WebKit',path.join(root,'native/BlotStudio.swift'),'-o',path.join(app,'MacOS/BlotStudio')],{stdio:'inherit',timeout:180000});
  const bundle=path.dirname(app);
  execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',bundle],{stdio:'inherit',timeout:30000});
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit',timeout:30000});
  console.log('Built native macOS application with verified local ad-hoc signature (not Apple notarized).');
}
