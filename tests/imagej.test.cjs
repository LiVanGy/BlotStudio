const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const file of ['core','science','imagej'])require('../src/'+file+'.js');
const B=globalThis.BS;
function source(values,depth=8,width=values.length){
  const bytes=new Uint8Array(values.length*depth/8),view=new DataView(bytes.buffer);
  values.forEach((v,i)=>depth===16?view.setUint16(i*2,v,true):bytes[i]=v);
  return{id:'simulated-imagej-test',name:'SIMULATED TEST ONLY',width,height:values.length/width,bitDepth:depth,pixels:B.base64(bytes)};
}
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/workflow-fixture.json'),'utf8'));
test('ImageJ compatible method scope is explicit and original Java oracle is not implied',()=>{
  assert.match(B.imagej.scope,/未校准/);assert.match(B.imagej.scope,/无阈值/);assert.match(B.imagej.scope,/不是完整/);
  assert.match(B.imagej.upstream.measurement,/Analyzer.java/);
});
test('36 simulated WB ROIs agree with independent NumPy measurements without changing existing results',()=>{
  assert.equal(fixture.expected.length,36);assert.match(fixture.notice,/SYNTHETIC/);
  for(const expected of fixture.expected){
    const s=fixture.sources.find(s=>s.name.startsWith(expected.protein+'-'));
    const legacy=B.measure(s,expected.roi,fixture.background,'dark');
    const actual=B.imagej.measure(s,expected.roi,{polarity:'dark',background:fixture.background});
    const expectedSum=65535*expected.area-expected.raw;
    assert.equal(actual.Area,expected.area);assert.equal(actual.Mean,expected.mean);
    assert.equal(actual.RawIntDen,expectedSum);assert.ok(Math.abs(actual.IntDen-expectedSum)<1e-7);
    assert.equal(actual.BackgroundMean,expected.backgroundMean);assert.equal(actual.DirectionalSignal,expected.raw);assert.equal(actual.CorrectedSignal,expected.corrected);
    assert.equal(legacy.raw,expected.raw);assert.equal(legacy.corrected,expected.corrected);assert.equal(legacy.rawIntDen,expectedSum);
    assert.deepEqual(actual.rect,B.rectPixels(s,expected.roi));assert.deepEqual(actual.backgroundRect,fixture.background);
  }
});
test('RawIntDen remains a raw pixel sum and dark inversion has a separately named output',()=>{
  const s=source([10,20,30,40]),roi={x:0,y:0,w:2,h:1},bg={x:2,y:0,w:2,h:1};
  const dark=B.imagej.measure(s,roi,{polarity:'dark',background:bg}),light=B.imagej.measure(s,roi,{polarity:'light',background:bg});
  for(const r of [dark,light]){assert.equal(r.Area,2);assert.equal(r.Mean,15);assert.equal(r.RawIntDen,30);assert.equal(r.IntDen,30);assert.equal(r.BackgroundMean,35);}
  assert.equal(dark.DirectionalSignal,480);assert.equal(dark.CorrectedSignal,40);assert.equal(light.DirectionalSignal,30);assert.equal(light.CorrectedSignal,-40);
});
test('effective clipped integer coordinates are returned for reproducible macro measurement',()=>{
  const s=source([10,20,30,40,50,60],8,3),r=B.imagej.measure(s,{x:-.5,y:.2,w:2,h:1});
  assert.deepEqual(r.rect,{x:0,y:0,w:2,h:2});assert.equal(r.Area,4);assert.equal(r.RawIntDen,120);assert.equal(r.Clipped,true);assert.equal(r.BackgroundMean,null);assert.equal(r.backgroundRect,null);
});
test('x and y mean profiles agree with hand-calculated values at original pixel positions',()=>{
  const s=source([10,20,30,40,50,60,70,80,90,100,110,120],8,4),rect={x:1,y:1,w:3,h:2};
  const horizontal=B.imagej.profile(s,rect,{axis:'x'}),vertical=B.imagej.profile(s,rect,{axis:'y'});
  assert.deepEqual(horizontal.coords,[1,2,3]);assert.deepEqual(horizontal.values,[80,90,100]);
  assert.deepEqual(vertical.coords,[1,2]);assert.deepEqual(vertical.values,[70,110]);
  assert.equal(horizontal.invert,false);assert.deepEqual(horizontal.rect,rect);
});
test('profile inversion uses the native bit-depth maximum and preserves sub-8-bit differences',()=>{
  const s=source([60000,60001,60002,60003],16,2),rect={x:0,y:0,w:2,h:2};
  assert.deepEqual(B.imagej.profile(s,rect,{axis:'x'}).values,[60001,60002]);
  assert.deepEqual(B.imagej.profile(s,rect,{axis:'x',invert:true}).values,[5534,5533]);
  const eight=source([0,255],8);assert.deepEqual(B.imagej.profile(eight,{x:0,y:0,w:2,h:1},{invert:true}).values,[255,0]);
});
test('profile and measurements do not modify pixels, display settings or supplied rectangles',()=>{
  const s=source([10,20,30,40],8,2),rect={x:0,y:0,w:2,h:2},before=JSON.stringify(s),coords=JSON.stringify(rect);
  s.brightness=10;s.contrast=200;s.invert=true;const expected=B.imagej.measure(s,rect);
  const changed=JSON.stringify(s);B.imagej.profile(s,rect,{invert:true});
  assert.equal(JSON.stringify(s),changed);assert.equal(JSON.stringify(rect),coords);assert.equal(expected.RawIntDen,100);assert.notEqual(changed,before);
});
test('threshold, calibration, invalid axes and malformed rectangles are rejected',()=>{
  const s=source([10]),rect={x:0,y:0,w:1,h:1};
  for(const options of [{threshold:100},{calibration:{}},{polarity:'unknown'},null])assert.throws(()=>B.imagej.measure(s,rect,options));
  for(const options of [{axis:'z'},{invert:'true'},{threshold:1},null])assert.throws(()=>B.imagej.profile(s,rect,options));
  assert.throws(()=>B.imagej.measure(s,{x:NaN,y:0,w:1,h:1}));assert.throws(()=>B.imagej.profile(s,{x:1,y:0,w:1,h:1}));
});
