'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
for(const name of ['core','science','imagej','scene','ui','imagej-ui'])require('../src/'+name+'.js');
const B=globalThis.BS;
function setup(){
  const p=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/SYNTHETIC-WB-workflow.wbproj'),'utf8'));B.validate(p);const g=p.groups[0],o=g.objects[0],s=p.sources[0];
  B.state={p,ui:{group:g.id,analysisId:o.id,roiId:o.rois[0].id,analysisTool:'roi',analysisZoom:.5,imagejAxis:'y',imagejInvert:false}};
  B.toast=()=>{};return{p,g,o,s};
}
test('production analysis page includes ImageJ measurement names, scope and profile exports',()=>{
  setup();const html=B.analysis();assert.match(html,/ImageJ 方法/);assert.match(html,/RawIntDen/);assert.match(html,/未校准、无阈值/);assert.match(html,/data-action="imagej-bundle"/);assert.match(html,/data-action="imagej-profile-export"/);assert.match(html,/不是 Gel Analyzer 峰面积/);assert.match(html,/65535 − 灰度/);
});
test('profile uses the selected original ROI independently of displayed crop, rotation and zoom',()=>{
  const {o,s}=setup();B.state.ui.roiId=o.rois[2].id;Object.assign(o,{rotation:90,crop:{x:200,y:25,w:400,h:40},brightness:180,contrast:10});B.state.ui.analysisZoom=2;
  const {profile,roi}=B.currentImagejProfile();assert.equal(roi.sampleIndex,2);assert.equal(profile.coords[0],32);assert.equal(profile.coords.at(-1),63);const pixels=B.pixels(s),sum=Array.from({length:42},(_,i)=>pixels[32*s.width+129+i]).reduce((a,v)=>a+v,0);assert.equal(profile.values[0],sum/42);
});
test('ImageJ measurement sheet keeps pixel sum distinct from dark directional signal',()=>{
  const {p,g}=setup(),rows=B.imagejResultRows(p,g),reference=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/workflow-fixture.json'),'utf8')).expected[0],row=rows[4];
  assert.equal(rows.length,40);assert.equal(row[4],reference.area);assert.equal(row[5],reference.mean);assert.equal(row[6],reference.mean*reference.area);assert.equal(row[8],reference.raw);assert.notEqual(row[6],row[8]);assert.equal(row[10],reference.corrected);assert.deepEqual(row.slice(11,15),[9,32,42,32]);
});
test('ImageJ exports preserve real profile values and Excel format with truthful browser status',async()=>{
  setup();const files=[],messages=[];B.saveFile=async(name,data,mime)=>{files.push({name,data,mime});return{status:'downloaded'};};B.toast=msg=>messages.push(msg);
  await B.exportImagej('profile');assert.match(files[0].name,/ImageJ曲线.csv$/);assert.match(files[0].data,/"坐标 px","平均灰度"/);assert.match(files[0].data,/"32",/);assert.match(messages[0],/请求浏览器下载/);assert.doesNotMatch(messages[0],/已保存/);
  await B.exportImagej('measure');assert.ok(files[1].data instanceof Uint8Array);assert.equal(new DataView(files[1].data.buffer).getUint32(0,true),0x04034b50);assert.match(files[1].mime,/spreadsheetml/);
});
test('ImageJ export cancellation cannot announce success and no-ROI profile is rejected clearly',async()=>{
  const {o}=setup();let announced=false;B.toast=()=>announced=true;B.saveFile=async()=>{throw Error('已取消保存');};await assert.rejects(()=>B.exportImagej('measure'),/取消/);assert.equal(announced,false);o.rois=[];assert.throws(()=>B.currentImagejProfile(),/框选条带 ROI/);assert.match(B.imagejPanel(B.state.p,B.getGroup(),o,B.state.p.sources[0]),/框选条带 ROI 后/);
});
