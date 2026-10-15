const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');

// These checks compile the real Swift bridge helpers and execute their output in
// JavaScript. They deliberately do not open or automate a native application.
const source=path.resolve(__dirname,'../BlotStudio.swift');
const shutdownScript=fs.readFileSync(source,'utf8').match(/let script = """\n([\s\S]*?)\n        """/)[1];
let fixtures;
test.before(()=>{
  if(process.platform!=='darwin')return;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'blotstudio-native-protocol-'));
  const harness=String.raw`import Foundation
let expected = URL(fileURLWithPath: "/Applications/BlotStudio.app/Contents/Resources/BlotStudio.html")
let payloads: [[String]] = [
    ["save-001", "saved", ""],
    ["save-002", "cancelled", ""],
    ["save-003", "error", "无法写入：测试权限错误"],
    ["id-'); globalThis.injected=true; //", "error", "引号 '\" \\ 换行\n</script> \u{2028} \u{2029} 🧪"]
]
let scripts = try payloads.map { try NativeProtocol.resultScript(id: $0[0], status: $0[1], message: $0[2]) }
let urls = [
    expected.absoluteString,
    expected.absoluteString + "#figure",
    "file:///Applications/BlotStudio.app/Contents/Resources/Other.html",
    "file:///etc/passwd",
    "https://example.test/BlotStudio.html",
    "about:blank",
    expected.absoluteString + "?other=1"
]
let checks = urls.map { NativeProtocol.allowsDocument(URL(string: $0)!, expected: expected) }
let output: [String: Any] = ["payloads": payloads, "scripts": scripts, "navigation": checks]
let data = try JSONSerialization.data(withJSONObject: output)
print(String(decoding: data, as: UTF8.self))
`;
  // Swift parses top-level application startup even inside an inactive #if
  // when another main.swift is present. Compile the unchanged production helper
  // prefix, excluding the AppKit application, instead of launching the GUI.
  const helper=path.join(tmp,'NativeProtocol.swift');
  fs.writeFileSync(helper,fs.readFileSync(source,'utf8').split('#if !NATIVE_PROTOCOL_TESTING')[0]);
  const main=path.join(tmp,'main.swift'),exe=path.join(tmp,'protocol-tests');
  fs.writeFileSync(main,harness);
  cp.execFileSync('xcrun',['swiftc','-module-cache-path',path.join(os.tmpdir(),'blotstudio-native-protocol-cache'),helper,main,'-o',exe],{timeout:120000});
  fixtures=JSON.parse(cp.execFileSync(exe,{encoding:'utf8',timeout:10000}));
});

test('Swift native callback delivers saved, cancelled and error as distinct results',{skip:process.platform!=='darwin'},()=>{
  for(let i=0;i<3;i++){
    const calls=[],context={BS:{nativeSaveResult:(...args)=>calls.push(args)}};
    vm.runInNewContext(fixtures.scripts[i],context);
    assert.deepEqual(calls,[fixtures.payloads[i]]);
  }
});
test('Swift callback JSON survives quotes, newlines, Unicode and script-looking error text',{skip:process.platform!=='darwin'},()=>{
  const calls=[],context={BS:{nativeSaveResult:(...args)=>calls.push(args)}};
  vm.runInNewContext(fixtures.scripts[3],context);
  assert.deepEqual(calls,[fixtures.payloads[3]]);
  assert.equal(context.injected,undefined);
});
test('native navigation only accepts its own HTML and an optional fragment',{skip:process.platform!=='darwin'},()=>{
  assert.deepEqual(fixtures.navigation,[true,true,false,false,false,false,false]);
});
test('native callback is harmless if its originating page no longer has a handler',{skip:process.platform!=='darwin'},()=>{
  for(const context of [{},{BS:{}}])assert.doesNotThrow(()=>vm.runInNewContext(fixtures.scripts[0],context));
});
test('native shutdown commits focused inputs and waits for the asynchronous local write',async()=>{
  const calls=[];let complete;
  const context={document:{activeElement:{blur(){calls.push('blur');}},body:{inert:false}},BS:{ready:Promise.resolve(),flushSave(){calls.push('flush');return new Promise(resolve=>complete=resolve);}}};
  const promise=vm.runInNewContext('(async()=>{'+shutdownScript+'})()',context);
  let settled=false;promise.then(()=>settled=true,()=>settled=true);
  await new Promise(setImmediate);
  assert.deepEqual(calls,['blur','flush']);
  assert.equal(context.document.body.inert,true);
  assert.equal(settled,false);
  complete(true);
  assert.equal(await promise,true);
});
test('native shutdown rejects unconfirmed or failed local writes',async()=>{
  for(const value of [false,undefined,null]){
    const context={document:{body:{inert:false}},BS:{flushSave:async()=>value}};
    await assert.rejects(vm.runInNewContext('(async()=>{'+shutdownScript+'})()',context),/本地保存未成功/);
  }
});
test('native shutdown fails explicitly if the frontend save interface is unavailable',async()=>{
  const context={document:{body:{inert:false}}};
  await assert.rejects(vm.runInNewContext('(async()=>{'+shutdownScript+'})()',context),/本地保存接口尚未就绪/);
});
