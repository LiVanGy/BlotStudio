const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function harness(){
  const messages=[];let seq=0;
  const context={Uint8Array,Blob,URL,console,TextEncoder,atob,btoa,setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout,chrome:{webview:{postMessage:m=>messages.push(m)}},BS:{uid:()=>String(++seq),utf8:s=>new TextEncoder().encode(s),base64:b=>Buffer.from(b).toString('base64')}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/io.js'),'utf8'),context);
  return {B:context.BS,messages,context};
}
test('Windows save waits for native disk completion and sanitizes the name',async()=>{
  const {B,messages}=harness();let settled=false;
  const job=B.saveFile('test/name:WB.bin',Uint8Array.of(0,128,255)).then(v=>(settled=true,v));
  await new Promise(setImmediate);assert.equal(settled,false);
  assert.equal(messages[0].type,'saveFile');assert.equal(messages[0].name,'test_name_WB.bin');assert.equal(messages[0].data,'AID/');
  B.nativeSaveResult(messages[0].id,'saved');assert.equal((await job).status,'saved');
});
test('Windows save cancellation is rejected and permits the next save',async()=>{
  const {B,messages}=harness();const job=B.saveFile('x','hello');const rejected=assert.rejects(job,/取消/);
  B.nativeSaveResult(messages[0].id,'cancelled');await rejected;
  const next=B.saveFile('y','ok');B.nativeSaveResult(messages[1].id,'saved');await next;
});
test('Windows write failure preserves error text',async()=>{
  const {B,messages}=harness();const job=B.saveFile('x','hello');const rejected=assert.rejects(job,/disk full/);
  B.nativeSaveResult(messages[0].id,'error','disk full');await rejected;
});
test('Windows concurrent saves cannot overwrite the active callback',async()=>{
  const {B,messages}=harness();const first=B.saveFile('x','hello');await assert.rejects(B.saveFile('y','world'),/完成或取消/);
  assert.equal(messages.length,1);B.nativeSaveResult('unknown','saved');B.nativeSaveResult(messages[0].id,'saved');await first;
});
test('Windows bridge exception cleans up the pending save',async()=>{
  const {B,messages,context}=harness();context.chrome.webview.postMessage=()=>{throw Error('disconnected');};
  await assert.rejects(B.saveFile('x','hello'),/disconnected/);
  context.chrome.webview.postMessage=m=>messages.push(m);const next=B.saveFile('y','ok');B.nativeSaveResult(messages[0].id,'saved');await next;
});
