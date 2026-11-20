const test=require('node:test');
const assert=require('node:assert/strict');
for(const name of ['core','analysis-engine','science','display','scene','workflow','conditions','statistics-settings'])require('../src/'+name+'.js');
const B=globalThis.BS;
require('./support/synthetic.js');
const source=(values,w,depth=8)=>{const bytes=new Uint8Array(values.length*depth/8),view=new DataView(bytes.buffer);values.forEach((v,i)=>depth===16?view.setUint16(i*2,v,true):bytes[i]=v);return{id:B.uid(),width:w,height:values.length/w,bitDepth:depth,pixels:B.base64(bytes),name:'SYNTHETIC',url:'data:image/png;base64,AA=='};};
const config=extra=>({...B.analysisDefaults(),convert8:false,background:'none',...extra});
test('loading volume uses stated units and never invents actual amounts',()=>{assert.equal(B.plannedVolume(2,20),10);assert.equal(B.plannedVolume('',20),'');assert.throws(()=>B.plannedVolume(0,20));const draft=B.newConditionRecord(B.testGroup());assert.equal(draft.gels[0].lanes[0].actual,'');assert.equal(draft.gels[0].lanes.length,12);assert.equal(B.validateConditions(draft),draft);});
test('factorial design preserves factor identities and biological sample IDs',()=>{const s=B.designSamples({mode:'matrix',factors:'基因型:WT,cKO\n处理:Vehicle,Drug',repeats:3});assert.equal(s.length,12);assert.deepEqual(s[9].factors,{基因型:'cKO',处理:'Drug'});assert.equal(s[11].replicate,3);assert.equal(new Set(s.map(v=>v.id)).size,12);assert.throws(()=>B.designSamples({mode:'matrix',factors:'A:a,b,c\nB:1,2,3',repeats:30}));});
test('plus/minus conditions validate lane counts and preserve crossed conditions',()=>{const s=B.designSamples({mode:'conditions',conditions:'刺激:-,+,-,+\n药物:-,-,+,+',repeats:1});assert.deepEqual(s[2].factors,{刺激:'-',药物:'+'});assert.throws(()=>B.designSamples({mode:'conditions',conditions:'A:+,-\nB:+',repeats:1}));});
test('native 16-bit and ImageJ range-scaled 8-bit paths are explicit and immutable',()=>{const s=source([1000,1001,60000,60001],2,16),before=s.pixels;assert.deepEqual(Array.from(B.analysisPixels(s,config()).values),[1000,1001,60000,60001]);const a=B.analysisPixels(s,config({convert8:true}));assert.equal(a.depth,8);assert.deepEqual(Array.from(a.values),[0,0,255,255]);assert.equal(s.pixels,before);});
test('ImageJ equal-weight RGB uses stored raw channels instead of luminance',()=>{const s=source([76,150],2);s.rgbPixels=B.base64(Uint8Array.from([255,0,0,0,255,0]));assert.deepEqual(Array.from(B.analysisPixels(s,config({rgb:'mean'})).values),[85,85]);assert.deepEqual(Array.from(B.analysisPixels(s,config({rgb:'luminance'})).values),[76,150]);});
test('ellipse pixel mask excludes bounding-box corners',()=>{const s=source([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],4);const r=B.quantify(s,{x:0,y:0,w:4,h:4},null,'dark',config({method:'ellipse'}));assert.equal(r.area,12);assert.equal(r.corrected,12*255);});
test('manual lane baseline uses clipped positive trapezoidal area',()=>{assert.equal(B.profileArea([0,2,4,2,0],0,0).area,8);assert.equal(B.profileArea([1,3,5,3,1],1,1).area,8);assert.equal(B.profileArea([1,1,1],2,2).area,0);});
test('rolling-ball constant backgrounds remain constant at all shrink radii',()=>{for(const radius of [1,10,11,30,31,50,100]){const data=new Uint8Array(32*24).fill(180);for(const light of [true,false]){const bg=B.rollingBackground(data,32,24,radius,true,light);assert.ok([...bg].every(v=>Math.abs(v-180)<.002),radius+': '+bg[0]);}}});
test('72 rolling-ball configurations agree pixel-for-pixel with the unmodified ImageJ1 engine',()=>{const oracle=require('./fixtures/imagej-rolling-reference.json');let checked=0;for(const c of oracle.cases){const max=2**c.depth-1,values=[];for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){let v=Math.floor(max/2)+(x*37+y*23+(x*y)%11)%Math.floor(max/4);if(x>7&&x<15&&y>4&&y<12)v-=Math.floor(max/3);values.push(v);}const s=source(values,c.width,c.depth),a=config({background:'rolling',radius:c.radius,presmooth:c.smooth});assert.deepEqual(Array.from(B.preparedSignal(s,a,c.dark?'dark':'light').corrected),c.expected,JSON.stringify({depth:c.depth,radius:c.radius,smooth:c.smooth,dark:c.dark}));checked+=values.length;}assert.equal(checked,28152);});
test('81 ellipse masks have the same pixel area as ImageJ OvalRoi',()=>{for(const c of require('./fixtures/imagej-rolling-reference.json').ellipses){const s=source(Array(c.w*c.h).fill(0),c.w),r=B.quantify(s,{x:0,y:0,w:c.w,h:c.h},null,'dark',config({method:'ellipse'}));assert.equal(r.area,c.area,c.w+'x'+c.h);}});
test('rolling correction preserves source and distinguishes radius zero',()=>{const s=source(Array.from({length:32*24},(_,i)=>i%32>=12&&i%32<20&&Math.floor(i/32)>=8&&Math.floor(i/32)<16?40:200),32),r={x:0,y:0,w:32,h:24},before=s.pixels;assert.equal(B.quantify(s,r,null,'dark',config({background:'rolling',radius:0})).corrected,B.measure(s,r).raw);const q=B.quantify(s,r,null,'dark',config({background:'rolling',radius:20}));assert.ok(q.corrected>0&&q.corrected<B.measure(s,r).raw);assert.equal(s.pixels,before);});
test('independent control and total-protein ratios match by sample',()=>{const g=B.testGroup();g.samples=g.samples.slice(0,1);const s=[source([55],1),source([155],1),source([215],1)],images=s.map(B.imageObject);images.forEach(v=>v.rois=[{id:B.uid(),x:0,y:0,w:1,h:1,sampleIndex:0}]);images[0].controlId=images[1].id;images[0].totalId=images[2].id;g.objects=images;const result=B.records({sources:s},g)[0];assert.equal(result.controlRatio,2);assert.equal(result.totalRatio,5);assert.equal(result.ratio,2);});
test('statistical pooling refuses mixed analytical methods',()=>{const common={protein:'P',include:true,valid:true,group:'C',corrected:10,bitDepth:8};const d=B.statData([{...common,sampleId:'A',method:'rect'},{...common,sampleId:'B',method:'profile'}],'P');assert.match(d.error,/方法/);});
test('topic/experiment export scope does not mix same-named experiments',()=>{const a={id:'a',topic:'A',experiment:'E'},b={id:'b',topic:'B',experiment:'E'},c={id:'c',topic:'A',experiment:'F'},p={name:'P',groups:[a,b,c]};assert.deepEqual(B.scopedGroups(p,a,'experiment'),[a]);assert.deepEqual(B.scopedGroups(p,a,'topic'),[a,c]);});
test('layout modes crop rather than stretch, render factor labels and honor positions',()=>{const s=source(Array(100*20).fill(200),100),g=B.testGroup();g.samples=B.designSamples({mode:'matrix',factors:'A:X,Y\nB:1,2',repeats:1});g.objects=[B.imageObject(s)];B.quickLayout(g,{extended:true,width:600,height:60,cropMode:'both',swap:true,groupPosition:'below'});const image=g.objects.find(v=>v.type==='image');assert.equal(image.crop.w/image.crop.h,10);assert.equal(image.w/image.h,10);assert.equal(g.objects.filter(v=>v.labelRole==='group').length,6);assert.ok(g.objects.filter(v=>v.labelRole==='group').every(v=>v.y>image.y+image.h));});
test('linked SVG archives use local paths and escape labels',async()=>{const s=source([10,20],2),p=B.blankProject(),g=p.groups[0];p.sources=[s];g.objects=[B.imageObject(s),B.object('text',{text:'<example>'})];const bytes=await B.linkedSVG(p,g);const data=new TextDecoder().decode(bytes);assert.match(data,/images\/source-1.png/);assert.match(data,/&lt;example&gt;/);});

test('identity display copies preserve every sRGB gray level and alpha',()=>{const data=Uint8ClampedArray.from(Array.from({length:256},(_,v)=>[v,v,v,v]).flat());for(const grayscale of [false,true])assert.deepEqual(B.displayPixels(data,{grayscale}),data);});
test('display contrast, brightness and invert share one sRGB transfer',()=>{const data=Uint8ClampedArray.from([64,64,64,128,96,96,96,255]);assert.deepEqual(Array.from(B.displayPixels(data,{brightness:150,contrast:125,invert:true})),[183,183,183,128,123,123,123,255]);});

test('replacing a source preserves original provenance and resets geometry only when needed',()=>{const p=B.blankProject(),g=p.groups[0];g.samples=B.testSamples(2);const a=source(Array(20).fill(100),10),b=source(Array(20).fill(80),10),c=source(Array(40).fill(50),20),image=B.imageObject(a);image.rois=B.autoROIs(image.crop,2);g.objects=[image];p.sources=[a];const rects=JSON.stringify(image.rois);B.replaceSource(p,g,image.id,b);assert.equal(JSON.stringify(image.rois),rects);B.replaceSource(p,g,image.id,c);assert.equal(image.crop.w,20);assert.equal(p.sources.length,3);assert.equal(p.sources[0],a);});
test('statistical mappings retain original names and never resolve inherited prototype keys',()=>{const records=[{group:'toString',protein:'P'}],mapped=B.statisticsRecords(records,{groups:{},proteins:{P:'Akt'}});assert.equal(mapped[0].group,'toString');assert.equal(mapped[0].protein,'Akt');assert.equal(mapped[0].originalProtein,'P');assert.equal(records[0].protein,'P');assert.throws(()=>B.aliasMap('A=B\nA=C'));});

test('analysis rotation uses an independent coordinate frame and retains source bytes',()=>{const s=source([10,20,30,40],2),before=s.pixels,settings=config({rotation:90}),pixels=B.analysisPixels(s,settings).values;assert.deepEqual(Array.from(pixels),[30,10,40,20]);const result=B.quantify(s,{x:0,y:0,w:2,h:2},null,'dark',settings);assert.match(result.coordinateFrame,/90/);assert.equal(s.pixels,before);});

test('ROI background corrects the signed lane profile before a manual baseline is integrated',()=>{
  const s=source([10,20,30,40,50,60,70,80],4);
  const roi={x:0,y:0,w:2,h:2,baselineStart:0,baselineEnd:0};
  const a=config({method:'profile',background:'roi'});
  const background=x=>({x,y:0,w:1,h:2});
  const light=B.quantify(s,roi,background(2),'light',a);
  assert.deepEqual(light.profile.values,[-35,5]);
  assert.equal(light.corrected,2.5);
  assert.equal(B.quantify(s,roi,background(3),'light',a).corrected,0);
  assert.deepEqual(B.quantify(s,roi,background(2),'dark',a).profile.values,[35,-5]);
  const horizontal=B.quantify(s,roi,background(2),'light',{...a,profileAxis:'x'});
  assert.deepEqual(horizontal.profile.values,[-20,-10]);
  const signed=B.quantify(s,{...roi,baselineStart:-35,baselineEnd:-35},background(2),'light',a);
  assert.equal(signed.corrected,20);
  const project=B.blankProject(),group=project.groups[0],object=B.imageObject(s);
  project.sources=[s];
  group.samples=B.testSamples();
  object.rois=[{...roi,id:B.uid(),sampleIndex:0,baselineStart:-35}];
  group.objects=[object];
  assert.equal(B.validate(project),project);
});

function quantGroup(samples, measurements){
  const group=B.testGroup();
  group.samples=samples.map(([id,name])=>({id,group:name,replicate:1,include:true}));
  group.objects=measurements.map(({s,protein,roi,settings, ...extra})=>({
    ...B.imageObject(s),id:protein,name:protein,protein,polarity:'light',analysis:settings,
    rois:group.samples.map((_,i)=>({id:B.uid(),x:i,y:0,w:1,h:1,...roi,sampleIndex:i})),...extra
  }));
  return B.records({sources:measurements.map(m=>m.s)},group);
}

test('explicit missing background leaves corrected data and ratios blank while preserving raw measurements',()=>{
  const s=source([10,20,50,60],4);
  const a=config({background:'roi'});
  const [target]=quantGroup([['A','C']],[
    {s,protein:'P',settings:a,controlId:'Ref'},
    {s,protein:'Ref',settings:config()}
  ]);
  assert.equal(target.raw,10);
  assert.equal(target.corrected,null);
  assert.equal(target.controlRatio,null);
  assert.match(target.issue,/框选背景/);
  assert.equal(B.statData([target],'P','corrected').rows.length,0);
  assert.equal(B.statData([target],'P','raw').rows[0].value,10);
  assert.equal(B.quantify(s,{x:0,y:0,w:2,h:1},null,'light',{...a,method:'profile'}).profile,null);
});

test('ratio denominators must use compatible intensity scales and physical integration units',()=>{
  const s=source([10,20,30,40,50,60,70,80],4);
  const sixteen=source([1000,2000,3000,4000,5000,6000,7000,8000],4,16);
  const roi={x:0,y:0,w:2,h:2,baselineStart:0,baselineEnd:0};
  const [target]=quantGroup([['A','C']],[
    {s,roi,protein:'P',settings:config(),referenceId:'peak',controlId:'peak',totalId:'total'},
    {s,roi,protein:'peak',settings:config({method:'profile'})},
    {s:sixteen,roi,protein:'total',settings:config({convert8:true})}
  ]);
  assert.equal(target.corrected,140);
  assert.equal(target.ratio,null);
  assert.equal(target.controlRatio,null);
  assert.equal(target.totalRatio,null);
  assert.match(target.issue,/积分单位、位深或缩放范围/);
  assert.deepEqual(target.referenceProteins,{ratio:'peak',controlRatio:'peak',totalRatio:'total'});
});

test('a missing control lane never silently changes the default ratio to total protein',()=>{
  const target=source([20,40],2),control=source([10,0],2),total=source([5,4],2);
  const result=quantGroup([['A','C'],['B','T']],[
    {s:target,protein:'P',settings:config(),controlId:'Ref',totalId:'Total'},
    {s:control,protein:'Ref',settings:config()},
    {s:total,protein:'Total',settings:config()}
  ]).filter(r=>r.protein==='P');
  assert.deepEqual(result.map(r=>[r.ratio,r.controlRatio,r.totalRatio]),[[2,2,4],[null,null,10]]);
  assert.deepEqual(result.map(r=>r.referenceProteins.ratio),['Ref','Ref']);
});

test('statistics retain denominator identity and signal direction across image groups',()=>{
  const s=source([20,10],2);
  const rows=['Actin','GAPDH'].map((name,i)=>quantGroup([[String(i),'C']],[
    {s,protein:'P',settings:config(),controlId:name},
    {s,protein:name,settings:config()}
  ])[0]);
  assert.match(B.statData(rows,'P','ratio').error,/参照蛋白/);
  assert.equal(B.statData(rows,'P','corrected').rows.length,2);
  assert.match(B.statData([rows[0],{...rows[1],polarity:'dark'}],'P','corrected').error,/方向/);
});

test('saturation uses original endpoints even after range scaling and rotational padding',()=>{
  const s=source([1000,1100,1200,1300],4,16);
  const roi={x:0,y:0,w:4,h:1};
  assert.equal(B.quantify(s,roi,null,'dark',config({convert8:true})).saturation,0);
  const clipped=source([0,1100,1200,65535],4,16);
  assert.equal(B.quantify(clipped,roi,null,'dark',config({convert8:true})).saturation,.5);
  const flat=source([30,40,50,60,70,80,90,100,110],3);
  assert.equal(B.quantify(flat,{x:0,y:0,w:3,h:3},null,'dark',config({rotation:30})).saturation,0);
  const corner=source([0,10,20,30,40,50,60,70,80],3);
  assert.equal(B.quantify(corner,{x:2,y:2,w:1,h:1},null,'dark',config({rotation:180})).saturation,1);
});

test('exact quarter turns do not replace image-edge pixels with background',()=>{
  for(const [w,h] of [[3,3],[4,2],[2,4]]){
    const values=Array.from({length:w*h},(_,i)=>50+i);
    const s=source(values,w);
    for(const angle of [-180,180]){
      assert.deepEqual(Array.from(B.analysisPixels(s,config({rotation:angle})).values),values.slice().reverse());
    }
  }
});

test('different per-image 16-to-8 scaling ranges are traceable and cannot form a raw ratio',()=>{
  const first=source([1000,2000,3000],3,16),second=source([1000,2000,16000],3,16);
  const roi={x:1,y:0,w:1,h:1},settings=config({convert8:true});
  const scaled=quantGroup([['A','C']],[
    {s:first,roi,settings,protein:'P',controlId:'Ref'},
    {s:second,roi,settings,protein:'Ref'}
  ]);
  assert.notEqual(scaled[0].corrected,scaled[1].corrected);
  assert.deepEqual(scaled.map(r=>r.analysisSettings.range8),[[1000,3000],[1000,16000]]);
  assert.equal(scaled[0].controlRatio,null);
  assert.match(scaled[0].issue,/原生位深/);
  const native=quantGroup([['A','C']],[
    {s:first,roi,settings:config(),protein:'P',controlId:'Ref'},
    {s:second,roi,settings:config(),protein:'Ref'}
  ]);
  assert.equal(native[0].controlRatio,1);
});
