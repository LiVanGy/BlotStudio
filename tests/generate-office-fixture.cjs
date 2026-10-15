'use strict';
// Office compatibility fixture: uses existing grayscale PNG previews with
// identity display settings. This deliberately does not test browser SVG /
// Canvas rasterization; tests/export-browser.html covers that separate stage.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
for(const name of ['core','scene','pptx'])require('../src/'+name+'.js');
const B=globalThis.BS,root=path.join(__dirname,'../examples');
const p=B.validate(JSON.parse(fs.readFileSync(path.join(root,'SYNTHETIC-WB-workflow.wbproj'),'utf8'))),g=p.groups[0];
for(const o of g.objects.filter(o=>o.type==='image'))assert.ok(o.brightness===100&&o.contrast===100&&!o.invert,'fixture requires identity display filters');
B.rasterize=async(svg,width,height)=>{
  const source=p.sources.find(s=>svg.includes(s.url));assert.ok(source,'source preview must be embedded');
  assert.equal(width,source.width);assert.equal(height,source.height);
  assert.match(svg,/slope="1" intercept="0"/);return{toDataURL:()=>source.url};
};
g.objects.push(
  B.object('text',{name:'Office QA editable text',text:'SYNTHETIC · Office QA · editable text',x:180,y:430,w:650,h:34,fontSize:24,fill:'#147f75',strokeWidth:0}),
  B.object('bracket',{name:'Office QA bracket',x:180,y:510,w:320,h:20,stroke:'#147f75',strokeWidth:2}),
  B.object('arrow',{name:'Office QA arrow',x:560,y:510,w:120,h:50,stroke:'#147f75',strokeWidth:2}),
  B.object('rect',{name:'Office QA rectangle',x:730,y:510,w:80,h:50,fill:'#147f7533',stroke:'#147f75',strokeWidth:2})
);
B.pptx(p,g).then(bytes=>{const target=path.join(root,'SYNTHETIC-WB-Office-QA.pptx');fs.writeFileSync(target,bytes);console.log('Generated Office compatibility fixture:',target);}).catch(err=>{console.error(err);process.exitCode=1;});
