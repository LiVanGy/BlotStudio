'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
for(const name of ['core','science','imagej','imagej-interop'])require('../src/'+name+'.js');
const B=globalThis.BS;
require('./support/synthetic.js');
function unpack(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files={};let at=0;
  while(view.getUint32(at,true)===0x04034b50){const length=view.getUint32(at+18,true),nameLength=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameLength)),start=at+30+nameLength+extra,data=bytes.subarray(start,start+length);assert.equal(B.crc32(data),view.getUint32(at+14,true),name+' CRC');files[name]=data;at=start+length;}return files;
}
const text=bytes=>new TextDecoder().decode(bytes);
function source(values,width,bitDepth,name){const bytes=new Uint8Array(values.length*bitDepth/8),view=new DataView(bytes.buffer);values.forEach((value,i)=>bitDepth===16?view.setUint16(i*2,value,true):bytes[i]=value);return{id:B.uid(),name,width,height:values.length/width,bitDepth,pixels:B.base64(bytes),url:'preview-must-not-be-used',original:'multi-page-original-must-not-be-used',hash:'source-checksum'};}
function fixture(){
  const p=B.blankProject(),g=p.groups[0],pixels16=Array.from({length:24},(_,i)=>1000+i*79);pixels16[23]=65535;const s16=source(pixels16,6,16,'16位原图 "A".tiff'),s8=source([20,30,40,50,200,210,220,230],4,8,'8-bit fluorescence.png');g.samples=B.testSamples();p.sources=[s16,s8];
  const a=B.imageObject(s16),b=B.imageObject(s8);a.protein='β-Actin "样本"\n"; run("Close All"); // 🧪';a.crop={x:1,y:1,w:3,h:2};a.brightness=23;a.contrast=180;a.invert=true;a.rotation=45;a.flipX=true;a.opacity=.2;a.rois=[{id:B.uid(),sampleIndex:0,x:1.2,y:.1,w:2.3,h:1.5}];a.background={x:4.5,y:2,w:2,h:2};
  b.polarity='light';b.visible=false;b.rois=[{id:B.uid(),sampleIndex:1,x:0,y:0,w:2,h:1}];b.background={x:2,y:1,w:2,h:1};g.samples[0].id='样本 "1",\n🧬';g.samples[1].include=false;g.objects=[a,b];return{p,g,a,b,s16,s8,pixels16};
}
function parseCSV(string){
  const rows=[];let row=[],cell='',quoted=false;string=string.replace(/^\ufeff/,'');
  for(let i=0;i<string.length;i++){const c=string[i];if(c==='"'){if(quoted&&string[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&string[i+1]==='\n')i++;row.push(cell);if(row.length>1||cell)rows.push(row);row=[];cell='';}else cell+=c;}
  if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
test('ImageJ bundle is a CRC-valid ZIP with one native TIFF per image object and explicit untested-runtime provenance',()=>{
  const {p,g}=fixture(),before=JSON.stringify(p),files=unpack(B.imagejBundle(p,g));assert.deepEqual(Object.keys(files).sort(),['README_zh-CN.txt','expected.csv','images/001.tif','images/002.tif','manifest.json','verify_imagej.ijm'].sort());const manifest=JSON.parse(text(files['manifest.json']));assert.equal(manifest.runtimeIncluded,false);assert.equal(manifest.macroRuntimeTested,false);assert.equal(manifest.images.length,2);assert.equal(manifest.images[1].visible,false);assert.equal(manifest.images[0].bitDepth,16);assert.match(text(files['README_zh-CN.txt']),/未实际执行/);assert.equal(JSON.stringify(p),before);
});
test('bundle expected measurements match production raw-pixel measurement on the same effective integer ROIs',()=>{
  const {p,g,a,b,s16,s8}=fixture(),files=unpack(B.imagejBundle(p,g)),manifest=JSON.parse(text(files['manifest.json']));
  for(const [i,o,s] of [[0,a,s16],[1,b,s8]]){const actual=B.measure(s,o.rois[0],o.background,o.polarity),row=manifest.images[i].rois[0];assert.deepEqual(row.effective,actual.rect);assert.equal(row.areaPixels,actual.area);assert.equal(row.meanRaw,actual.mean);assert.equal(row.rawIntDen,actual.rawIntDen);assert.equal(row.directionalIntDen,actual.raw);assert.equal(row.correctedIntDen,actual.corrected);assert.deepEqual(manifest.images[i].background,actual.backgroundRect);}
  assert.equal(manifest.images[0].rois[0].effective.x,1);assert.equal(manifest.images[0].rois[0].effective.w,3);assert.ok(manifest.images[1].rois[0].correctedIntDen<0);assert.equal(manifest.images[1].rois[0].include,false);
});
test('CSV distinguishes raw sums, directional signal and background rows and preserves Unicode, quotes and multiline sample IDs',()=>{
  const {p,g,a}=fixture(),rows=parseCSV(text(unpack(B.imagejBundle(p,g))['expected.csv'])),headers=rows[0],data=rows.slice(1).map(row=>Object.fromEntries(row.map((value,i)=>[headers[i],value])));assert.equal(data.length,4);const band=data.find(row=>row.Role==='band'&&row.ImageIndex==='1');assert.equal(band.Protein,a.protein);assert.equal(band.SampleID,g.samples[0].id);assert.notEqual(band.RawIntDen,band.DirectionalIntDen);const bg=data.find(row=>row.Role==='background');assert.equal(bg.CorrectedIntDen,'');assert.equal(bg.DirectionalIntDen,'');assert.equal(data.find(row=>row.Role==='band'&&row.ImageIndex==='2').Include,'false');
});
test('generated ImageJ macro uses raw histogram statistics and never mutates images, Results tables or ROI Manager',()=>{
  const {p,g}=fixture(),macro=text(unpack(B.imagejBundle(p,g))['verify_imagej.ijm']);assert.match(macro,/getDirectory\(/);assert.match(macro,/getRawStatistics\(areaPixels, meanRaw, minRaw, maxRaw, sdRaw, histogram\)/);assert.match(macro,/histogramSum\(histogram\)/);assert.match(macro,/65535\*areaPixels - rawIntDen/);assert.match(macro,/backgroundMean\*areaPixels - rawIntDen/);assert.match(macro,/rawIntDen - backgroundMean\*areaPixels/);assert.match(macro,/File\.saveString\(output, outputPath\)/);assert.match(macro,/selectImage\(ownedImage\);\nclose\(\);/);assert.match(macro,/nImages<=beforeCount/);assert.doesNotMatch(macro,/\brun\s*\(|roiManager\s*\(|setResult\s*\(|saveAs\s*\(|close\("\*"\)/);assert.doesNotMatch(macro,/File\.openAsString.*expected|setBatchMode\(/);
});
test('macro metadata is encoded as UTF-16 code units, so Unicode and quote-bearing labels cannot become macro statements',()=>{
  const {p,g,a}=fixture(),macro=text(unpack(B.imagejBundle(p,g))['verify_imagej.ijm']);assert.ok([...macro].every(c=>c.charCodeAt(0)<128),'macro source stays ASCII');assert.ok(!macro.includes(a.protein));const decoded=[...macro.matchAll(/fromCharCode\(([\d,]+)\)/g)].map(match=>String.fromCharCode(...match[1].split(',').map(Number))).join('');assert.ok(decoded.includes(a.protein.replaceAll('"','""')));assert.ok(decoded.includes(g.samples[0].id.replaceAll('"','""')));assert.ok(!Object.keys(unpack(B.imagejBundle(p,g))).some(name=>name.includes('样本')));
});
test('absence of a background preserves directional signal as corrected signal, with empty background fields',()=>{
  const {p,g,a}=fixture();a.background=null;g.objects=[a];const files=unpack(B.imagejBundle(p,g)),manifest=JSON.parse(text(files['manifest.json'])),row=manifest.images[0].rois[0];assert.equal(row.correctedIntDen,row.directionalIntDen);assert.equal(row.backgroundMeanRaw,null);const rows=parseCSV(text(files['expected.csv']));assert.equal(rows.length,2);assert.equal(rows[1][rows[0].indexOf('BackgroundMeanRaw')],'');
});
test('ImageJ bundle rejects damaged native pixels, missing sources, out-of-image ROI and absent sample mapping',()=>{
  {const {p,g,s16}=fixture();s16.pixels='AA==';assert.throws(()=>B.imagejBundle(p,g),/像素长度/);}
  {const {p,g}=fixture();p.sources=[];assert.throws(()=>B.imagejBundle(p,g),/原生.*灰度像素/);}
  {const {p,g,a}=fixture();a.rois[0].x=10000;assert.throws(()=>B.imagejBundle(p,g),/原图之外/);}
  {const {p,g,a}=fixture();a.rois[0].sampleIndex=99;assert.throws(()=>B.imagejBundle(p,g),/对应样本/);}
  {const p=B.blankProject();assert.throws(()=>B.imagejBundle(p,p.groups[0]),/至少一张/);}
});
test('independent Pillow reads exact unsigned native 8/16-bit pixels, little-endian TIFF, single pages and no calibration',t=>{
  const probe=spawnSync('python3',['-c','import PIL'],{encoding:'utf8'});if(probe.error||probe.status!==0){t.skip('Independent Pillow validation unavailable; this is not ImageJ runtime validation.');return;}
  const {p,g,pixels16}=fixture(),files=unpack(B.imagejBundle(p,g)),directory=fs.mkdtempSync(path.join(os.tmpdir(),'blotstudio-imagej-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));for(const [name,data] of Object.entries(files)){const target=path.join(directory,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  const script='import json,sys\nfrom PIL import Image\nfrom pathlib import Path\nroot=Path(sys.argv[1])\nexpected=json.loads(sys.argv[2])\nfor i,values in enumerate(expected,1):\n path=root/"images"/(str(i).zfill(3)+".tif")\n assert path.read_bytes()[:4]==b"II\\x2a\\x00"\n with Image.open(path) as im:\n  assert list(im.getdata())==values,(i,list(im.getdata()),values)\n  assert im.n_frames==1\n  assert im.tag_v2[339]==(1,) or im.tag_v2[339]==1\n  assert im.tag_v2[262]==1\n  assert im.tag_v2[258]==((16,) if i==1 else (8,))\n  assert all(tag not in im.tag_v2 for tag in [282,283,296])\nprint("Pillow native unsigned pixel/calibration checks passed")\n';
  const result=spawnSync('python3',['-c',script,directory,JSON.stringify([pixels16,[20,30,40,50,200,210,220,230]])],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/passed/);
});
test('ImageJ raw verification rejects ROIs from rotated analysis coordinates',()=>{
  const {p,g}=fixture();
  g.objects.find(o=>o.type==='image').analysis={rotation:20};
  assert.throws(()=>B.imagejBundle(p,g),/原图坐标/);
});

test('WhiteIsZero grayscale exports use original TIFF codes, while dark and light signals follow displayed brightness',async()=>{
  require('../src/tiff.js');
  for(const depth of [8,16]){
    const {p,g,a}=fixture(),max=2**depth-1,stored=[5,15,40,60];
    const s=source(stored.map(value=>max-value),4,depth,'white.tif');
    s.tiffWhiteIsZero=true;p.sources=[s];a.sourceId=s.id;g.objects=[a];
    const roi={id:'band',x:0,y:0,w:2,h:1,sampleIndex:0},bg={x:2,y:0,w:2,h:1};
    a.rois=[roi];a.background=bg;
    for(const polarity of ['dark','light']){
      a.polarity=polarity;
      const m=B.imagej.measure(s,roi,{polarity,background:bg});
      assert.deepEqual([m.Mean,m.RawIntDen,m.IntDen,m.BackgroundMean],[10,20,20,50]);
      assert.deepEqual([m.DirectionalSignal,m.CorrectedSignal],polarity==='dark'?[20,-80]:[2*max-20,80]);
      assert.deepEqual(B.imagej.profile(s,roi).values,[5,15]);
      assert.deepEqual(B.imagej.profile(s,roi,{invert:true}).values,[max-5,max-15]);
      assert.equal(B.measure(s,roi,bg,polarity).rawIntDen,2*max-20);
      const files=unpack(B.imagejBundle(p,g)),tiff=files['images/001.tif'];
      const view=new DataView(tiff.buffer,tiff.byteOffset,tiff.byteLength),count=view.getUint16(8,true);
      const tag=code=>{for(let i=0;i<count;i++){const pos=10+i*12;if(view.getUint16(pos,true)===code)return pos;}throw Error('missing TIFF tag '+code);};
      assert.equal(view.getUint16(tag(262)+8,true),0);
      const offset=view.getUint32(tag(273)+8,true);
      assert.deepEqual(stored.map((_,i)=>depth===8?tiff[offset+i]:view.getUint16(offset+i*2,true)),stored);
      const [decoded]=await B.decodeTIFF(tiff);
      assert.equal(decoded.whiteIsZero,true);
      assert.deepEqual(Array.from(decoded.samples),stored.map(v=>max-v));
      const row=JSON.parse(text(files['manifest.json'])).images[0].rois[0];
      assert.deepEqual([row.rawIntDen,row.directionalIntDen,row.backgroundMeanRaw,row.correctedIntDen],[20,m.DirectionalSignal,50,m.CorrectedSignal]);
      // Re-open a pre-metadata, two-page project with different photometry per page.
      const directoryLength=2+count*12+4,stack=new Uint8Array(tiff.length+directoryLength),sv=new DataView(stack.buffer);
      stack.set(tiff);stack.set(tiff.subarray(8,8+directoryLength),tiff.length);
      sv.setUint16(tag(262)+8,1,true);sv.setUint32(8+directoryLength-4,tiff.length,true);
      const old={...s,original:'data:image/tiff;base64,'+B.base64(stack),originalName:'stack.tif',name:'stack.tif · 第1页'};
      delete old.tiffWhiteIsZero;
      assert.equal(B.imagej.whiteIsZero(old),false);
      old.name='stack.tif · 第2页';assert.equal(B.imagej.whiteIsZero(old),true);
      assert.equal(B.imagej.measure(old,roi).RawIntDen,20);
      old.name='stack.tif · 第3页';assert.throws(()=>B.imagej.measure(old,roi),/旧项目/);
      delete old.original;old.info='TIFF 16-bit native grayscale';
      assert.throws(()=>B.imagej.measure(old,roi),/缺少旧项目/);
    }
  }
});
