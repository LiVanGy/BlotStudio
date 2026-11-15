const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/workspace.js'),'utf8');
function app(){let count=0;const messages=[],timers=new Map(),B={uid:()=>String(++count),state:{p:{id:'qa',name:'SYNTHETIC'},ui:{}},validate:()=>{},base64:a=>Buffer.from(a).toString('base64'),utf8:s=>new TextEncoder().encode(s),render:()=>{},persist:()=>{},flushSave:async()=>true,header:()=>'<header></header>',modal:()=>'',btn:()=>'',ib:()=>'',esc:String,actions:{},toast:()=>{}};const context={BS:B,TextEncoder,globalThis:null,chrome:{webview:{postMessage:m=>messages.push(m)}},setTimeout:(fn)=>{const id=++count;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};context.globalThis=context;vm.runInNewContext(source,context);return{B,messages,timers};}
test('folder selection waits for its actual native reply and can be cancelled',async()=>{const {B,messages}=app();const p=B.chooseWorkspace();assert.equal(B.workspaceState.path,'未选择');B.workspaceResult(messages[0].id,'cancelled');await assert.rejects(p,/取消/);assert.equal(B.workspaceState.path,'未选择');const q=B.chooseWorkspace();B.workspaceResult(messages[1].id,'ok','test-folder');await q;assert.equal(B.workspaceState.path,'test-folder');});
test('managed backups only report written after the native write succeeds',async()=>{const {B,messages}=app();B.workspaceState.path='test-folder';const p=B.syncWorkspace();await Promise.resolve();await Promise.resolve();assert.equal(messages.length,1);assert.equal(messages[0].workspace,'write');assert.equal(messages[0].name,'BlotStudio-qa.wbproj');assert.match(B.workspaceState.status,/正在/);B.workspaceResult(messages[0].id,'error','disk full');await assert.rejects(p,/disk full/);assert.match(B.workspaceState.status,/失败/);});
test('native directory synchronization participates in close-time flush confirmation',async()=>{const {B,messages}=app();B.workspaceState.path='test-folder';B.workspaceState.sync=true;const p=B.flushSave();for(let i=0;i<5;i++)await Promise.resolve();assert.equal(messages.length,1);B.workspaceResult(messages[0].id,'ok');assert.equal(await p,true);assert.match(B.workspaceState.status,/已写入/);});

test('manual directory backup keeps the project selected when the write was requested', async () => {
  const {B, messages} = app();
  B.workspaceState.path = 'test-folder';
  const first = B.syncWorkspace();
  B.state.p = {id: 'next', name: 'SYNTHETIC NEXT'};
  const second = B.syncWorkspace();

  await new Promise(setImmediate);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].name, 'BlotStudio-qa.wbproj');
  assert.equal(JSON.parse(Buffer.from(messages[0].data, 'base64')).id, 'qa');
  B.workspaceResult(messages[0].id, 'ok');
  await first;

  await new Promise(setImmediate);
  assert.equal(messages[1].name, 'BlotStudio-next.wbproj');
  B.workspaceResult(messages[1].id, 'ok');
  await second;
});

test('close-time directory sync writes pending edits to both projects after a quick switch', async () => {
  const {B, messages} = app();
  B.workspaceState.path = 'test-folder';
  B.workspaceState.sync = true;
  B.state.p = {id: 'qa', name: 'SYNTHETIC EDITED'};
  B.persist();
  B.state.p = {id: 'next', name: 'SYNTHETIC NEXT'};
  B.persist();

  const closing = B.flushSave();
  await new Promise(setImmediate);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].name, 'BlotStudio-qa.wbproj');
  assert.equal(JSON.parse(Buffer.from(messages[0].data, 'base64')).name, 'SYNTHETIC EDITED');
  B.workspaceResult(messages[0].id, 'ok');

  await new Promise(setImmediate);
  assert.equal(messages[1].name, 'BlotStudio-next.wbproj');
  B.workspaceResult(messages[1].id, 'ok');
  assert.equal(await closing, true);
});

test('turning off directory sync cancels writes scheduled for any project', () => {
  const {B, timers} = app();
  B.workspaceState.path = 'test-folder';
  B.workspaceState.sync = true;
  B.persist();
  B.state.p = {id: 'next', name: 'SYNTHETIC NEXT'};
  B.persist();

  B.actions['toggle-workspace-sync']();
  assert.equal(B.workspaceState.sync, false);
  assert.equal(timers.size, 0);
});
