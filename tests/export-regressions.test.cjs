const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const f of ['core','scene','pptx'])require('../src/'+f+'.js');
const B=globalThis.BS;
const png=fs.readFileSync(path.join(__dirname,'fixtures/dpi96.png'));
function packageFiles(bytes){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files={};let i=0;
  while(i+30<=bytes.length&&v.getUint32(i,true)===0x04034b50){
    const size=v.getUint32(i+18,true),n=v.getUint16(i+26,true),extra=v.getUint16(i+28,true),name=new TextDecoder().decode(bytes.subarray(i+30,i+30+n)),start=i+30+n+extra,data=bytes.subarray(start,start+size);
    assert.equal(B.crc32(data),v.getUint32(i+14,true),'CRC '+name);files[name]=new TextDecoder().decode(data);i=start+size;
  }return files;
}
function imageProject(){const p=B.blankProject(),g=p.groups[0],s={id:B.uid(),name:'synthetic-WB.png',url:'data:image/png;base64,'+png.toString('base64'),width:800,height:100,hash:'synthetic-fixture'};p.sources=[s];g.objects=[B.imageObject(s)];return{p,g,o:g.objects[0],s};}
test('PowerPoint retains full source preview, editable crop, both flips, rotation and native opacity',async()=>{
  const {p,g,o}=imageProject();Object.assign(o,{crop:{x:80,y:20,w:400,h:50},flipX:true,flipY:true,rotation:-30,opacity:.35,strokeWidth:0});
  const calls=[],original=B.rasterize;B.rasterize=async(svg,w,h)=>{calls.push({svg,w,h});return{toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')};};
  let files;try{files=packageFiles(await B.pptx(p,g));}finally{B.rasterize=original;}
  assert.equal(calls.length,1);assert.equal(calls[0].w,800);assert.equal(calls[0].h,100);
  assert.match(calls[0].svg,/fill="transparent"/);assert.match(calls[0].svg,/opacity="1"/);assert.doesNotMatch(calls[0].svg,/scale\(-1/);
  const slide=files['ppt/slides/slide1.xml'];assert.match(slide,/<a:srcRect l="10000" t="20000" r="40000" b="30000"\/>/);
  assert.match(slide,/rot="19800000" flipH="1" flipV="1"/);assert.match(slide,/<a:alphaModFix amt="35000"\/>/);assert.match(slide,/synthetic-WB.png/);
  assert.equal((slide.match(/<p:pic>/g)||[]).length,1);assert.match(slide,/<a:ln w="0"><a:noFill\/><\/a:ln>/);
});
test('PowerPoint preserves opacity and shorthand alpha colors for editable vectors and text',async()=>{
  const p=B.blankProject(),g=p.groups[0];g.objects=[B.object('rect',{fill:'#0f08',stroke:'#123',opacity:.5,strokeWidth:0}),B.object('text',{text:' A  β-Actin\n42 kDa ',fill:'#12345680',opacity:.5})];
  const slide=packageFiles(await B.pptx(p,g))['ppt/slides/slide1.xml'];
  assert.match(slide,/val="00FF00"><a:alpha val="26667"/);assert.match(slide,/val="123456"><a:alpha val="25098"/);
  assert.match(slide,/<a:t xml:space="preserve"> A  β-Actin<\/a:t>/);assert.match(slide,/<a:t xml:space="preserve">42 kDa <\/a:t>/);assert.match(slide,/<a:noAutofit\/>/);
});
test('PowerPoint reuses one full-source preview for different crops and flips without merging editable picture layers',async()=>{
  const {p,g,o}=imageProject();g.objects.push({...o,id:B.uid(),crop:{x:80,y:20,w:400,h:50},flipX:true,opacity:.4});
  let calls=0;const original=B.rasterize;B.rasterize=async()=>{calls++;return{toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')};};
  let files;try{files=packageFiles(await B.pptx(p,g));}finally{B.rasterize=original;}
  assert.equal(calls,1);assert.equal(Object.keys(files).filter(k=>k.startsWith('ppt/media/')).length,1);assert.equal((files['ppt/slides/slide1.xml'].match(/<p:pic>/g)||[]).length,2);
});
test('PowerPoint custom paths preserve the three sides of brackets and arrow geometry',async()=>{
  const p=B.blankProject(),g=p.groups[0];g.objects=[B.object('bracket',{w:100,h:20}),B.object('arrow',{w:100,h:100})];
  const slide=packageFiles(await B.pptx(p,g))['ppt/slides/slide1.xml'];assert.equal((slide.match(/<a:custGeom>/g)||[]).length,2);
  assert.match(slide,/<a:pt x="0" y="20000"\/><\/a:moveTo><a:lnTo><a:pt x="0" y="0"\/><\/a:lnTo><a:lnTo><a:pt x="100000" y="0"\/><\/a:lnTo><a:lnTo><a:pt x="100000" y="20000"/);
  assert.doesNotMatch(slide,/bentConnector2|tailEnd/);assert.equal(B.shapeLines(g.objects[1]).length,2);
});
test('PowerPoint omits hidden objects and constrains large slides to Office limits without moving relative geometry',async()=>{
  const p=B.blankProject(),g=p.groups[0];Object.assign(g.canvas,{width:10000,height:5000});g.objects=[B.object('rect',{x:5000,y:2500,w:2000,h:1000}),B.object('text',{visible:false,text:'hidden'})];
  const files=packageFiles(await B.pptx(p,g));assert.match(files['ppt/presentation.xml'],/<p:sldSz cx="51206400" cy="25603200"/);assert.match(files['ppt/slides/slide1.xml'],/<a:off x="25603200" y="12801600"/);assert.doesNotMatch(files['ppt/slides/slide1.xml'],/hidden/);
  g.canvas.height=100;await assert.rejects(()=>B.pptx(p,g),/56:1/);
});
test('PowerPoint rejects missing sources and out-of-source crop before generating a misleading picture',async()=>{
  const {p,g,o}=imageProject();o.crop.x=-1;await assert.rejects(()=>B.pptx(p,g),/裁剪范围/);p.sources=[];await assert.rejects(()=>B.pptx(p,g),/来源缺失/);
});
test('quick layout preserves native crop aspect ratio for thin synthetic WB strips',()=>{
  const {g,o}=imageProject();o.crop={x:0,y:0,w:800,h:8};B.quickLayout(g);const result=g.objects.find(v=>v.id===o.id);assert.equal(result.h,6.4);assert.equal(result.w/result.h,100);
});
test('quick layout rejects locked bands and locked automatic labels without mutating the figure',()=>{
  const {g,o}=imageProject();o.locked=true;let before=JSON.stringify(g);assert.throws(()=>B.quickLayout(g),/解锁/);assert.equal(JSON.stringify(g),before);
  o.locked=false;g.objects.push(B.object('text',{autoLabel:true,locked:true}));before=JSON.stringify(g);assert.throws(()=>B.quickLayout(g),/解锁/);assert.equal(JSON.stringify(g),before);
});
test('quick layout rejects extreme image ratios and excessive figure heights atomically',()=>{
  const {g,o}=imageProject();o.crop={x:0,y:0,w:1,h:1000};let before=JSON.stringify(g);assert.throws(()=>B.quickLayout(g,{width:5000}),/10000/);assert.equal(JSON.stringify(g),before);
  o.crop={x:0,y:0,w:800,h:100};g.objects=Array.from({length:20},()=>({...o,id:B.uid()}));before=JSON.stringify(g);assert.throws(()=>B.quickLayout(g,{width:5000,gap:500}),/10000/);assert.equal(JSON.stringify(g),before);
});
test('quick layout does not label hidden images and splits interleaved sample groups into contiguous spans',()=>{
  const {g,o}=imageProject();g.samples=g.samples.slice(0,3);g.samples.forEach((s,i)=>s.group=i===1?'Treatment':'Control');g.objects.push({...o,id:B.uid(),name:'hidden protein',protein:'hidden protein',visible:false});
  B.quickLayout(g);assert.equal(g.objects.filter(v=>v.type==='text'&&v.text==='Control').length,2);assert.ok(!g.objects.some(v=>v.type==='text'&&v.text==='hidden protein'));
  const c=g.objects.filter(v=>v.type==='text'&&v.text==='Control');assert.ok(Math.abs(c[0].w-640/3)<1e-9);assert.ok(c[1].x>c[0].x+c[0].w);
});
test('SVG keeps multiline spaces, image crop, filtering, local flips, rotation and opacity in separate layers',()=>{
  const {p,g,o}=imageProject();Object.assign(o,{x:30,y:40,w:400,h:50,crop:{x:80,y:20,w:400,h:50},flipX:true,flipY:true,rotation:90,opacity:.4,brightness:150,contrast:125,invert:true});
  g.objects.push(B.object('text',{text:' A  B\nβ-Actin',align:'center',w:200}));const svg=B.svg(p,g);
  assert.match(svg,/translate\(30 40\) rotate\(90 200 25\)" opacity="0.4"/);assert.match(svg,/translate\(400 50\) scale\(-1 -1\)/);assert.match(svg,/<image[^>]* x="-80" y="-20" width="800" height="100"/);assert.match(svg,/<feFuncR type="linear" slope="-1.875" intercept="1.1875"/);assert.match(svg,/<text xml:space="preserve"/);assert.match(svg,/<tspan x="100" dy="0"> A  B<\/tspan>/);
});
test('raster export rejects nonfinite, negative and excessive sizes before allocating a canvas',async()=>{
  for(const [w,h] of [[0,1],[-1,1],[NaN,1],[1,Infinity],[16001,2],[9000,9000]])await assert.rejects(()=>B.rasterize('<svg/>',w,h));
});
test('PNG resolution is unique, CRC-valid, and leaves pixel data untouched',async()=>{
  const bytes=await B.pngDpi({toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')},'600'),chunks=a=>{const d=new DataView(a.buffer,a.byteOffset,a.byteLength),out=[];for(let i=8;i<a.length;){const n=d.getUint32(i),type=String.fromCharCode(...a.subarray(i+4,i+8)),data=a.subarray(i+8,i+8+n);assert.equal(B.crc32(a.subarray(i+4,i+8+n)),d.getUint32(i+8+n),'CRC '+type);out.push({type,data});i+=12+n;}return out;};
  const before=chunks(png),after=chunks(bytes);assert.equal(after.filter(c=>c.type==='pHYs').length,1);const phys=after.find(c=>c.type==='pHYs').data;assert.equal(new DataView(phys.buffer,phys.byteOffset,phys.byteLength).getUint32(0),23622);assert.deepEqual(after.filter(c=>c.type==='IDAT').map(c=>Array.from(c.data)),before.filter(c=>c.type==='IDAT').map(c=>Array.from(c.data)));
});
test('PNG resolution writer rejects invalid DPI and incomplete input',async()=>{
  const canvas={toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')};for(const dpi of [0,-1,NaN,Infinity])await assert.rejects(()=>B.pngDpi(canvas,dpi),/分辨率/);
  for(const bytes of [Buffer.from('notpng'),png.subarray(0,png.length-3)])await assert.rejects(()=>B.pngDpi({toDataURL:()=> 'data:image/png;base64,'+bytes.toString('base64')},300),/PNG/);
});
