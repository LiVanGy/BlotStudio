'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {File}=require('node:buffer');

// These tests execute the production event handlers/state transitions in an
// isolated VM. DOM, canvas preview generation and IndexedDB are explicit stubs.
// They do NOT exercise browser layout, actual Image decoding, OS dialogs or
// native WebKit callbacks. TIFF numerical decoding uses the real decoder.
async function harness(){
  const handlers={},timers=new Map(),writes=[],messages=[],elements={app:{innerHTML:''},'canvas-content':{innerHTML:''},viewport:{clientWidth:1100,clientHeight:780,scrollLeft:0,scrollTop:0}};
  const preview='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=';
  const context={console,TextEncoder,TextDecoder,Uint8Array,Uint16Array,Uint8ClampedArray,DataView,ArrayBuffer,Blob,File,URL,atob,btoa,structuredClone,
    setTimeout(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timer.unref();timers.set(timer,ms);return timer;},
    clearTimeout(timer){clearTimeout(timer);timers.delete(timer);},requestAnimationFrame(){},addEventListener:(name,fn)=>handlers['window:'+name]=fn,
    document:{title:'',activeElement:null,addEventListener:(name,fn)=>handlers[name]=fn,getElementById:id=>elements[id]||null,querySelector:()=>null,querySelectorAll:()=>[],body:{append(){},classList:{add(){},remove(){}}},createElement:type=>type==='canvas'?{width:0,height:0,getContext(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};},toDataURL:()=>preview}:{click(){},remove(){}}},
    webkit:{messageHandlers:{saveFile:{postMessage:body=>messages.push(body)}}}
  };
  context.window=context;const sandbox=vm.createContext(context);
  for(const module of ['core','science','tiff','scene','io','pptx','ui'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',module+'.js'),'utf8'),sandbox,{filename:module+'.js'});
  const B=sandbox.BS;let saved;
  B.db={read:async()=>saved,write:async p=>{saved=JSON.parse(JSON.stringify(p));writes.push(saved);}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),sandbox,{filename:'app.js'});await B.ready;
  const uiDefaults=JSON.parse(JSON.stringify(B.state.ui));
  function reset(p=B.blankProject()){
    for(const timer of timers.keys())clearTimeout(timer);timers.clear();writes.length=0;messages.length=0;
    B.state.p=p;B.state.past=[];B.state.future=[];B.state.ui={...JSON.parse(JSON.stringify(uiDefaults)),group:p.activeGroup,selected:[],checkedGroups:[],analysisId:'',roiId:'',modal:null};
    return p;
  }
  reset();return{B,sandbox,handlers,timers,writes,messages,elements,reset,dispose(){for(const timer of timers.keys())clearTimeout(timer);}};
}
const serial=v=>JSON.stringify(v);
function makeImage(B,width=20,height=10){
  const p=B.blankProject(),g=p.groups[0],values=Uint8Array.from({length:width*height},(_,i)=>80+(i%120)),source=B.sourceFromPixels('synthetic-WB.png',width,height,8,values,{hash:'synthetic-fixture'}),o=B.imageObject(source);
  p.sources=[source];g.objects=[o];o.rois=[{id:B.uid(),sampleIndex:0,x:2,y:2,w:4,h:3}];return{p,g,source,o};
}
async function change(h,scope,field,value,type='number'){
  await h.handlers.change({target:{id:'',dataset:{scope,field},type,value:String(value),checked:!!value}});
}
function delayedTIFF(){
  const data=fs.readFileSync(path.join(__dirname,'fixtures/native16-raw.tif'));let release;
  const gate=new Promise(resolve=>release=resolve),file={name:'synthetic-native16.tif',size:data.length,arrayBuffer:async()=>{await gate;return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}};
  return{file,release};
}
test('production ROI change handler clamps all four boundaries against remaining source dimensions',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p,g,o}=makeImage(B);h.reset(p);B.state.ui.analysisId=o.id;B.state.ui.roiId=o.rois[0].id;
  const roi=()=>B.getGroup().objects[0].rois[0];
  await change(h,'roi','x',999);assert.equal(roi().x,16);assert.equal(roi().w,4);
  await change(h,'roi','y',999);assert.equal(roi().y,7);assert.equal(roi().h,3);
  await change(h,'roi','w',999);assert.equal(roi().w,4);
  await change(h,'roi','h',999);assert.equal(roi().h,3);
  await change(h,'roi','x',-999);assert.equal(roi().x,0);
  await change(h,'roi','y',-999);assert.equal(roi().y,0);
  await change(h,'roi','w',-999);assert.equal(roi().w,1);
  await change(h,'roi','h',-999);assert.equal(roi().h,1);B.validate(B.state.p);
  assert.equal(g.objects[0].rois[0].x,2,'original history object must not be changed');
});
test('production ROI handler rejects nonfinite input and duplicate sample assignment without changing state/history',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p,o}=makeImage(B);o.rois.push({id:B.uid(),sampleIndex:1,x:10,y:2,w:4,h:3});h.reset(p);B.state.ui.analysisId=o.id;B.state.ui.roiId=o.rois[0].id;
  const before=serial(p);await change(h,'roi','x','NaN');assert.equal(serial(B.state.p),before);assert.equal(B.state.past.length,0);
  await change(h,'roi','sampleIndex',1,'select-one');assert.equal(serial(B.state.p),before);assert.match(B.state.ui.toast,/重复/);assert.equal(B.state.past.length,0);
});
test('damaged native pixel payload is rejected before openProject replaces the existing project',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);h.reset(p);const before=serial(B.state),bad=JSON.parse(serial(p));bad.sources[0].pixels='AA==';
  await assert.rejects(()=>B.openProject(new File([serial(bad)],'damaged.wbproj')),/像素长度/);assert.equal(serial(B.state),before);assert.equal(h.writes.length,0);
});
test('invalid commit completely rolls back project, history, redo and UI including newly introduced keys',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);h.reset(p);B.state.future=[B.blankProject()];B.state.ui.modal={type:'layout',width:640,gap:36};
  const before=serial(B.state),oldProject=B.state.p;
  assert.throws(()=>B.commit('invalid-size',(draft,g)=>{g.canvas.width=10001;draft.name='must roll back';B.state.ui.modal=null;B.state.ui.selected=['invalid'];B.state.ui.extraDuringFailedCommit='must disappear';}),/画布参数/);
  assert.equal(B.state.p,oldProject);assert.equal(serial(B.state),before);assert.equal(h.writes.length,0);assert.ok(!Object.hasOwn(B.state.ui,'extraDuringFailedCommit'));
});
test('frozen original sources cannot be altered by a failed commit or contaminate undo history',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);h.reset(p);const bytes=p.sources[0].pixels,before=serial(B.state);
  assert.throws(()=>B.commit('alter-original',draft=>{draft.sources[0].pixels='AAAA';}),/read only|readonly|Cannot assign/i);assert.equal(B.state.p.sources[0].pixels,bytes);assert.equal(serial(B.state),before);
});
test('locked image blocks clear/auto/delete ROI and production ROI field editing',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p,o}=makeImage(B);o.locked=true;h.reset(p);B.state.ui.analysisId=o.id;B.state.ui.roiId=o.rois[0].id;
  const before=serial(B.state.p);for(const action of ['clear-rois','auto-rois','delete-roi','clear-bg']){assert.throws(()=>B.actions[action](),/锁定/);assert.equal(serial(B.state.p),before);}
  await change(h,'roi','x',10);assert.equal(serial(B.state.p),before);assert.match(B.state.ui.toast,/锁定/);assert.equal(B.state.past.length,0);
});
test('cloned groups cannot double the biological n when both are checked for statistics',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=B.demoProject();h.reset(p);const original=B.getGroup();B.actions.clonegroup({dataset:{id:original.id}});const copy=B.getGroup();
  Object.assign(B.state.ui,{tab:'stats',checkedGroups:[original.id,copy.id],statsProtein:'p-Akt',metric:'corrected',normalize:false});const stats=B.currentStats();assert.match(stats.error,/重复样本|重复.*n/);assert.equal(stats.groups.length,0);assert.equal(stats.rows.length,0);assert.ok(stats.records.length>0);
});
test('switching groups updates and immediately flushes activeGroup, and reopening restores it',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=B.blankProject(),second=B.blankGroup('second');p.groups.push(second);h.reset(p);
  B.actions.group({dataset:{id:second.id}});assert.equal(B.state.ui.group,second.id);assert.equal(B.state.p.activeGroup,second.id);assert.equal(await B.flushSave(),true);assert.equal(h.writes.at(-1).activeGroup,second.id);
  const saved=serial(h.writes.at(-1));B.actions.group({dataset:{id:p.groups[0].id}});await B.openProject(new File([saved],'restored.wbproj'));assert.equal(B.state.ui.group,second.id);assert.equal(B.state.p.activeGroup,second.id);
});
test('async native TIFF import retains its captured target group when the user changes groups during decoding',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=B.blankProject(),original=p.groups[0],second=B.blankGroup('second');p.groups.push(second);h.reset(p);const gate=delayedTIFF(),job=B.importFiles([gate.file]);
  B.actions.group({dataset:{id:second.id}});gate.release();await job;
  const target=B.state.p.groups.find(g=>g.id===original.id),other=B.state.p.groups.find(g=>g.id===second.id);assert.equal(target.objects.filter(o=>o.type==='image').length,1);assert.equal(other.objects.length,0);assert.equal(B.state.ui.group,second.id);assert.equal(B.state.p.sources[0].bitDepth,16);assert.equal(B.state.p.sources[0].width,73);assert.equal(B.state.p.sources[0].height,39);assert.equal(B.state.p.sources[0].pixels.length,Math.ceil(73*39*2/3)*4);
});
test('async TIFF import aborts when its project is switched and cannot leak images into the new project',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=B.blankProject();h.reset(p);const gate=delayedTIFF(),job=B.importFiles([gate.file]),rejected=assert.rejects(job,/项目已切换/);
  B.actions.newproject();B.state.ui.modal.name='new destination';B.actions['create-project']();const destination=B.state.p.id;assert.notEqual(destination,p.id);gate.release();await rejected;assert.equal(B.state.p.id,destination);assert.equal(B.state.p.sources.length,0);assert.equal(B.getGroup().objects.length,0);
});
test('async TIFF import also aborts on reopening the same project ID, using the project epoch',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=B.blankProject();h.reset(p);const gate=delayedTIFF(),job=B.importFiles([gate.file]),rejected=assert.rejects(job,/项目已切换/);
  await B.openProject(new File([serial(p)],'same-id.wbproj'));assert.equal(B.state.p.id,p.id);gate.release();await rejected;assert.equal(B.state.p.sources.length,0);
});
test('thin and tall original image objects and real TIFF import preserve their crop aspect ratio',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h;
  for(const [width,height] of [[2000,10],[20,2000],[73,39]]){const {o}=makeImage(B,width,height);assert.ok(Math.abs(o.w/o.h-width/height)<1e-10);}
  h.reset();const bytes=fs.readFileSync(path.join(__dirname,'fixtures/native16-raw.tif'));await B.importFiles([new File([bytes],'native16.tif')]);const o=B.getGroup().objects.find(o=>o.type==='image');assert.ok(Math.abs(o.w/o.h-73/39)<1e-10);assert.ok(o.h<=380);
});
test('deleting an unlocked reference image clears remaining protein links and retains a valid project',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p,g,o}=makeImage(B),reference={...JSON.parse(serial(o)),id:B.uid(),name:'reference',protein:'reference',referenceId:'',rois:[]};g.objects.push(reference);o.referenceId=reference.id;h.reset(p);B.state.ui.selected=[reference.id];B.actions.delete();assert.equal(B.getGroup().objects.length,1);assert.equal(B.getGroup().objects[0].referenceId,'');assert.equal(B.validate(B.state.p),B.state.p);
});
test('native save Promise waits for the matching confirmed native callback',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h;let settled=false;const job=B.saveFile('unsafe/name: WB.png',Uint8Array.of(1,2,3),'image/png').then(result=>{settled=true;return result;});
  assert.equal(h.messages.length,1);assert.equal(h.messages[0].name,'unsafe_name_ WB.png');await Promise.resolve();assert.equal(settled,false);B.nativeSaveResult('unrelated','saved');await Promise.resolve();assert.equal(settled,false);B.nativeSaveResult(h.messages[0].id,'saved');const result=await job;assert.equal(result.status,'saved');assert.equal(settled,true);
});
test('native save cancellation/failure rejects, concurrent save is refused, and the bridge can recover',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,first=B.saveFile('first.bin',Uint8Array.of(1)),cancelled=assert.rejects(first,/取消保存/);
  await assert.rejects(()=>B.saveFile('parallel.bin',Uint8Array.of(2)),/完成或取消/);assert.equal(h.messages.length,1);B.nativeSaveResult(h.messages[0].id,'cancelled');await cancelled;
  const next=B.saveFile('next.bin',Uint8Array.of(3)),failed=assert.rejects(next,/disk full/);B.nativeSaveResult(h.messages.at(-1).id,'failed','disk full');await failed;
  const success=B.saveFile('recovered.bin',Uint8Array.of(4));B.nativeSaveResult(h.messages.at(-1).id,'saved');assert.equal((await success).status,'saved');
});
test('a synchronous native postMessage failure releases its pending request',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,bridge=h.sandbox.webkit.messageHandlers.saveFile,old=bridge.postMessage;bridge.postMessage=()=>{throw Error('bridge disconnected');};await assert.rejects(()=>B.saveFile('x.bin',Uint8Array.of(1)),/bridge disconnected/);bridge.postMessage=old;
  const job=B.saveFile('recovered.bin',Uint8Array.of(2));B.nativeSaveResult(h.messages[0].id,'saved');assert.equal((await job).status,'saved');
});
test('flushSave cancels the debounce and waits for immediate persistence confirmation',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h;let release,done=false,calls=0;B.db.write=async p=>{calls++;assert.equal(p,B.state.p);await new Promise(resolve=>release=resolve);};B.persist();assert.equal(calls,0);assert.ok([...h.timers.values()].includes(650));
  const job=B.flushSave().then(value=>{done=true;return value;});assert.equal(calls,1);assert.ok(![...h.timers.values()].includes(650));await Promise.resolve();assert.equal(done,false);release();assert.equal(await job,true);assert.match(B.state.ui.saveStatus,/已自动保存/);
});
test('flushSave reports a rejected database transaction without claiming success',async t=>{
  const h=await harness();t.after(()=>h.dispose());h.B.db.write=async()=>{throw Error('quota exceeded');};assert.equal(await h.B.flushSave(),false);assert.match(h.B.state.ui.saveStatus,/失败/);
});
function unzipText(bytes){const out={},v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let pos=0;while(pos+30<=bytes.length&&v.getUint32(pos,true)===0x04034b50){const n=v.getUint16(pos+26,true),extra=v.getUint16(pos+28,true),size=v.getUint32(pos+18,true),name=new TextDecoder().decode(bytes.subarray(pos+30,pos+30+n)),start=pos+30+n+extra;out[name]=new TextDecoder().decode(bytes.subarray(start,start+size));pos=start+size;}return out;}
test('statistics Excel exports the selected metric, normalized rows, descriptive summary and optional tests',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/SYNTHETIC-WB-workflow.wbproj'),'utf8'));h.reset(p);Object.assign(B.state.ui,{tab:'stats',metric:'ratio',statsProtein:'p-Akt',control:'Control',normalize:true,inferential:true});const files=unzipText(B.dataExport('xlsx'));
  assert.match(files['xl/workbook.xml'],/灰度原始数据/);assert.match(files['xl/workbook.xml'],/统计纳入值/);assert.match(files['xl/workbook.xml'],/描述统计/);assert.match(files['xl/workbook.xml'],/Welch及Holm/);assert.match(files['xl/worksheets/sheet2.xml'],/ratio/);assert.match(files['xl/worksheets/sheet2.xml'],/Control/);assert.match(files['xl/worksheets/sheet2.xml'],/SYN-12/);assert.equal((files['xl/worksheets/sheet3.xml'].match(/<row /g)||[]).length,5);
  B.state.ui.inferential=false;assert.doesNotMatch(unzipText(B.dataExport('xlsx'))['xl/workbook.xml'],/Welch及Holm/);const csv=B.dataExport('csv');assert.match(csv,/统计纳入值/);assert.match(csv,/描述统计/);
});
test('statistics XLSX actual normalized cells agree with independent NumPy via openpyxl',async t=>{
  const {spawnSync}=require('node:child_process'),probe=spawnSync('python3',['-c','import openpyxl'],{encoding:'utf8'});if(probe.status!==0){t.skip('Optional independent openpyxl unavailable');return;}
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/SYNTHETIC-WB-workflow.wbproj'),'utf8'));h.reset(p);Object.assign(B.state.ui,{tab:'stats',metric:'ratio',statsProtein:'p-Akt',control:'Control',normalize:true});const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'blotstudio-workbook-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'actual.xlsx');fs.writeFileSync(file,B.dataExport('xlsx'));
  const script="import sys,json;from openpyxl import load_workbook;w=load_workbook(sys.argv[1],data_only=True);d=json.load(open(sys.argv[2],encoding='utf-8'));rows=list(w['统计纳入值'].values)[7:];assert len(rows)==12;expected={r['sampleId']:r['fold'] for r in d['expected'] if r['protein']=='p-Akt'};assert all(abs(row[5]-expected[row[2]])<1e-12 for row in rows);assert len(list(w['灰度原始数据'].values))==37;assert [row[1] for row in list(w['描述统计'].values)[1:]]==[3,3,3,3];print('Independent normalized cell readback passed')";
  const run=spawnSync('python3',['-c',script,file,path.join(__dirname,'../examples/workflow-fixture.json')],{encoding:'utf8'});assert.equal(run.status,0,run.stderr+run.stdout);
});
test('multi-sheet Excel preserves XML text and gives colliding long names unique valid identifiers',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,base='A'.repeat(31),files=unzipText(B.workbook([{name:base,rows:[['A\u0001 & < β',5]]},{name:base,rows:[['B',6]]},{name:base,rows:[['C',7]]}]));const names=[...files['xl/workbook.xml'].matchAll(/sheet name="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(names).size,3);assert.ok(names.every(n=>n.length<=31));assert.doesNotMatch(files['xl/worksheets/sheet1.xml'],/\u0001/);assert.match(files['xl/worksheets/sheet1.xml'],/&amp; &lt; β/);
});
test('cancelled native export retains the export dialog and never claims file success',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h;B.state.ui.modal={type:'export',format:'project',scale:1};const job=B.doExport(),cancelled=assert.rejects(job,/取消保存/);assert.equal(B.state.ui.exporting,true);await assert.rejects(()=>B.doExport(),/正在导出/);B.nativeSaveResult(h.messages[0].id,'cancelled');await cancelled;assert.equal(B.state.ui.exporting,false);assert.equal(B.state.ui.modal.type,'export');assert.doesNotMatch(B.state.ui.toast,/文件已保存/);
});
test('opening a new project clears stale modal and gesture UI so old group IDs cannot crash rendering',async t=>{
 const h=await harness();t.after(()=>h.dispose());const {B}=h,old=makeImage(B);h.reset(old.p);B.state.ui.modal={type:'group-menu',id:old.g.id,name:old.g.name,experiment:old.g.experiment};B.state.ui.analysisRect={x:0,y:0,w:5,h:5};const next=B.blankProject();next.name='Reopened clean project';await B.openProject(new File([serial(next)],'clean.wbproj'));assert.equal(B.state.p.id,next.id);assert.equal(B.state.ui.modal,null);assert.equal(B.state.ui.analysisRect,null);assert.match(h.elements.app.innerHTML,/Reopened clean project/);
});
test('a control pointer gesture defers field rerender until its intended click is handled',async t=>{
 const h=await harness();t.after(()=>h.dispose());const {B}=h,{p,o}=makeImage(B);h.reset(p);B.state.ui.selected=[o.id];B.render();const before=h.elements.app.innerHTML,button={dataset:{action:'export'},disabled:false};const target={closest:query=>query==='[data-action]'||query.startsWith('button,')?button:null};h.handlers.pointerdown({button:0,target,preventDefault(){}});await change(h,'object','rotation',33);assert.equal(B.getGroup().objects[0].rotation,33);assert.equal(h.elements.app.innerHTML,before,'field change should not detach the pressed button');await h.handlers.click({target});assert.equal(B.state.ui.modal.type,'export');assert.match(h.elements.app.innerHTML,/文件格式/);
});

test('project byte budget matches actual UTF-8 JSON for empty, Unicode and multi-source projects',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h;
  const empty=B.blankProject();assert.equal(B.projectBytes(empty),Buffer.byteLength(serial(empty),'utf8'));
  const {p,source}=makeImage(B);p.name='中文 🧪 "quoted" \\ path';p.groups[0].notes='line 1\nline 2\tβ';
  source.name='原图β\u{1F9EA}.png';source.extra='lone \ud800 surrogate';
  p.sources.push({...source,id:B.uid(),name:'第二张 α.png'});
  B.validate(p);assert.equal(B.projectBytes(p),Buffer.byteLength(serial(p),'utf8'));
});
test('frozen source sizing is cached while edited project metadata is always recounted',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p,source}=makeImage(B);
  const realmJSON=vm.runInContext('JSON',h.sandbox),stringify=realmJSON.stringify;let sourceSerializations=0;
  realmJSON.stringify=(value,...args)=>{if(value===source)sourceSerializations++;return stringify(value,...args);};
  t.after(()=>realmJSON.stringify=stringify);
  B.validate(p);assert.equal(Object.isFrozen(source),true);assert.equal(sourceSerializations,1);
  const initial=B.projectBytes(p);B.validate(p);B.projectBytes(p);assert.equal(sourceSerializations,1,'base64 source must not be serialized again for ordinary edits');
  p.groups[0].notes+='中文 🧪';assert.ok(B.projectBytes(p)>initial);assert.equal(B.projectBytes(p),Buffer.byteLength(serial(p),'utf8'));assert.equal(sourceSerializations,1);
  sourceSerializations=0;const extended={...source,extension:{note:'a'}};p.sources[0]=extended;B.validate(p);const before=B.projectBytes(p);extended.extension.note='更多中文';assert.ok(B.projectBytes(p)>before);assert.equal(B.projectBytes(p),Buffer.byteLength(serial(p),'utf8'));
});
test('project byte cap accepts the exact boundary and rejects one byte over including Unicode metadata',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);p.groups[0].notes='边界 🧪';const bytes=Buffer.byteLength(serial(p),'utf8');
  B.MAX_PROJECT_BYTES=bytes;assert.equal(B.validate(p),p);B.MAX_PROJECT_BYTES=bytes-1;
  assert.throws(()=>B.validate(p),/项目容量.*新建另一个项目.*仅拆分图组/);
});
test('commit accounts for its new audit entry before applying state or scheduling persistence',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);h.reset(p);B.MAX_PROJECT_BYTES=Buffer.byteLength(serial(p),'utf8')+8;
  const before=serial(B.state),prior=B.state.p;
  assert.throws(()=>B.commit('新增审计记录 🧪',draft=>{draft.name=p.name;}),/项目容量/);
  assert.equal(B.state.p,prior);assert.equal(serial(B.state),before);assert.equal(B.state.p.audit.length,0);assert.equal(B.state.past.length,0);assert.equal(h.writes.length,0);assert.ok(![...h.timers.values()].includes(650));
});
test('oversized real TIFF import rolls back instead of creating a project that cannot reopen',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,p=B.blankProject();h.reset(p);B.MAX_PROJECT_BYTES=Buffer.byteLength(serial(p),'utf8')+500;
  const before=serial(B.state.p),bytes=fs.readFileSync(path.join(__dirname,'fixtures/native16-raw.tif'));
  await assert.rejects(()=>B.importFiles([new File([bytes],'oversized-native16.tif')]),/项目容量.*新建另一个项目/);
  assert.equal(serial(B.state.p),before);assert.equal(B.state.p.sources.length,0);assert.equal(B.getGroup().objects.length,0);assert.equal(B.state.past.length,0);assert.equal(h.writes.length,0);
});
test('save, export and flush consistently refuse oversized projects before claiming success',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);h.reset(p);B.MAX_PROJECT_BYTES=Buffer.byteLength(serial(p),'utf8')-1;
  await assert.rejects(()=>B.actions.save(),/项目容量/);assert.equal(h.messages.length,0);
  B.state.ui.modal={type:'export',format:'project',scale:1};await assert.rejects(()=>B.doExport(),/项目容量/);assert.equal(h.messages.length,0);
  assert.equal(await B.flushSave(),false);assert.equal(h.writes.length,0);assert.doesNotMatch(B.state.ui.saveStatus,/已自动保存/);
});
test('a project saved exactly at the byte cap reopens with the same original pixels',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);p.name='容量边界 🧪';h.reset(p);const json=serial(p);B.MAX_PROJECT_BYTES=Buffer.byteLength(json,'utf8');
  const saving=B.actions.save();assert.equal(h.messages.length,1);const payload=Buffer.from(h.messages[0].data,'base64').toString('utf8');assert.equal(payload,json);
  B.nativeSaveResult(h.messages[0].id,'saved');await saving;
  await B.openProject(new File([payload],'boundary.wbproj'));assert.equal(serial(B.state.p),json);assert.equal(B.state.p.sources[0].pixels,p.sources[0].pixels);
});
test('oversized project files are rejected before reading text or replacing the current project',async t=>{
  const h=await harness();t.after(()=>h.dispose());const {B}=h,{p}=makeImage(B);h.reset(p);B.MAX_PROJECT_BYTES=Buffer.byteLength(serial(p),'utf8');let read=false;const before=serial(B.state.p);
  await assert.rejects(()=>B.openProject({size:B.MAX_PROJECT_BYTES+1,text:async()=>{read=true;return serial(p);}}),/项目容量.*新建另一个项目/);
  assert.equal(read,false);assert.equal(serial(B.state.p),before);assert.equal(B.state.past.length,0);
});
