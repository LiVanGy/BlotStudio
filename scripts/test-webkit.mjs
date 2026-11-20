import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
if(process.platform!=='darwin')throw Error('Native WebKit tests require macOS.');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'blotstudio-webkit-'));
const host=path.join(temporary,'renderer');
const inject=(html,script)=>html.replace('</body>','<script>'+script.replaceAll('</script','<\\/script')+'</script></body>');
try{
  execFileSync('xcrun',['swiftc','-O','-module-cache-path',path.resolve('.swift-cache'),'-framework','Cocoa','-framework','WebKit','tests/renderer-webkit.swift','-o',host],{stdio:'inherit',timeout:120000});
  let pixel=await fs.readFile('tests/export-browser.html','utf8');
  for(const name of ['core','display','scene','pptx','tiff'])pixel=pixel.replace('<script src="../src/'+name+'.js"></script>','<script>'+(await fs.readFile('src/'+name+'.js','utf8')).replaceAll('</script','<\\/script')+'</script>');
  pixel=pixel.replace("document.title='Export '+window.exportTestResults.passed+'/'+logs.length;","document.title='Export '+window.exportTestResults.passed+'/'+logs.length;webkit.messageHandlers.qaResult.postMessage(window.exportTestResults);");
  const build=await fs.readFile('build.mjs','utf8'),order=build.match(/const order=\[([^\]]+)\]/)[1].split(',').map(v=>v.trim().replaceAll("'",'')),parts=[];
  for(const name of order){parts.push(await fs.readFile('src/'+name+'.js','utf8'));if(name==='io')parts.push('BS.db={read:async()=>null,write:async()=>{}};');}
  let app=(await fs.readFile('index.template.html','utf8')).replace('/*__STYLE__*/',(await fs.readFile('src/styles.css','utf8'))+'\n'+(await fs.readFile('src/glass.css','utf8'))+'\n'+(await fs.readFile('src/button-glass.css','utf8'))+'\n'+(await fs.readFile('src/frosted-shell.css','utf8'))).replace('/*__SCRIPT__*/',parts.join('\n').replaceAll('</script','<\\/script'));
  // Synthetic projects are test-only; this helper never enters build.mjs output.
  app=app.replace('<head>', `<head><script>
    addEventListener('error',event=>{
      const {message,filename,lineno,colno,error}=event;
      webkit.messageHandlers.qaResult.postMessage({fatal:message||String(error),file:filename||location.href,line:lineno||0,column:colno||0,stack:error?.stack||''});
    });
    addEventListener('unhandledrejection',event=>{
      webkit.messageHandlers.qaResult.postMessage({fatal:String(event.reason),stack:event.reason?.stack||''});
    });
  </script>`);
  // This independent production-only suite has no synthetic-project helper.
  // Cache actual MediaQueryLists solely in the fixture so it can exercise the
  // JS preference-change listener; the operating system's CSS setting is intact.
  const mediaFixture='<script>window.__bsLiquidMedia=new Map();{const nativeMatchMedia=window.matchMedia.bind(window);window.matchMedia=query=>{if(!window.__bsLiquidMedia.has(query))window.__bsLiquidMedia.set(query,nativeMatchMedia(query));return window.__bsLiquidMedia.get(query);};}</script>';
  const baseApp=app;
  const liquid=inject(app.replace('<head>','<head>'+mediaFixture),await fs.readFile('tests/liquid-glass-webkit.js','utf8'));
  const buttons=inject(app.replace('<head>','<head>'+mediaFixture),await fs.readFile('tests/button-glass-webkit.js','utf8'));
  app=inject(app,await fs.readFile('tests/support/synthetic.js','utf8'));
  const chart=inject(app,await fs.readFile('tests/chart-canvas-webkit.js','utf8'));
  app=inject(app,await fs.readFile('tests/app-webkit.js','utf8'));
  const tiff=await fs.readFile('tests/fixtures/native16-raw.tif');
  const fileTest=inject(baseApp, 'window.testTiff='+JSON.stringify(tiff.toString('base64'))+';\n'+await fs.readFile('tests/export-files-webkit.js','utf8'));
  const filePage=path.join(temporary,'files.html'),fileResult=path.join(temporary,'exports.json');
  await fs.writeFile(filePage,fileTest);
  await fs.writeFile(fileResult,execFileSync(host,[filePage],{timeout:120000,maxBuffer:8*1024*1024}));
  execFileSync('python3',['tests/inspect-export-files.py',fileResult],{stdio:'inherit',timeout:30000});
  const reports=[];
  // Native host exits on 90 s without a progress message, or 300 s total.
  // The shell guard is slightly longer so it cannot kill a healthy late suite.
  for(const [name,html] of [['pixels',pixel],['app',app],['liquid',liquid],['buttons',buttons],['chart',chart]]){const file=path.join(temporary,name+'.html');await fs.writeFile(file,html);const report=JSON.parse(execFileSync(host,[file],{encoding:'utf8',timeout:330000,maxBuffer:5*1024*1024}));reports.push({name,...report});console.log(JSON.stringify({name,...report}));}
  await fs.mkdir('verification',{recursive:true});await fs.writeFile('verification/webkit-results.json',JSON.stringify(reports,null,2)+'\n');
  if(reports.some(r=>r.fatal||r.passed!==r.total||r.errors?.length))process.exitCode=1;
}finally{await fs.rm(temporary,{recursive:true,force:true});}
