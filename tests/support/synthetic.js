(function(B){
  'use strict';
  // Explicit synthetic fixtures for tests only. Not part of the application bundle.
  B.testSamples=(count=12)=>Array.from({length:count},(_,i)=>({id:'S'+(i+1),group:['Control','Low','Medium','High'][Math.floor(i/3)%4],replicate:i%3+1,include:true}));
  B.testGroup=(...args)=>({...B.blankGroup(...args),samples:B.testSamples()});
  B.syntheticProject=()=>{
    const p=B.blankProject(),g=p.groups[0];g.name='细胞蛋白';g.samples=B.testSamples();p.demo=true;g.demo=true;
    let seed=7031;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    for(let k=0;k<3;k++){const w=720,h=68,a=new Uint8Array(w*h),strength=k===0?[.32,.34,.37,.43,.45,.48,.59,.61,.65,.75,.79,.83]:Array.from({length:12},()=>.71+rand()*.10);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=236+(rand()-.5)*9+4*Math.sin(x/80);for(let j=0;j<12;j++){const dx=(x-(j+.5)*w/12)/18,dy=(y-34-Math.sin(j*2)*1.2)/5.3;v-=strength[j]*220*Math.exp(-.5*(dx**6+dy**2));}a[y*w+x]=B.clamp(Math.round(v),0,255);}const s=B.sourceFromPixels(['p-Akt','Akt','β-Actin'][k]+' · 模拟条带.png',w,h,8,a,{demo:true,hash:'synthetic-demo'});p.sources.push(s);const o=B.imageObject(s,k);o.protein=['p-Akt','Akt','β-Actin'][k];o.name=o.protein;o.mw=k===2?'42':'60';o.rois=B.autoROIs(o.crop,12);g.objects.push(o);}
    g.objects.filter(o=>o.type==='image').forEach(o=>o.demo=true);g.objects[0].referenceId=g.objects[1].id;g.objects[1].referenceId=g.objects[2].id;B.quickLayout(g);B.log(p,'创建演示项目','所有条带均为算法生成的模拟图像，不代表实验结果。');return p;
  };
})(globalThis.BS ||= {});
