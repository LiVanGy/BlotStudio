(function(B){
  'use strict';
  const cache=new WeakMap();
  B.pixels=s=>{
    if(!s||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width*s.height>32000000||![8,16].includes(s.bitDepth))throw Error('原始图像尺寸或位深无效，无法定量。');
    const entry=cache.get(s);if(entry&&entry.encoded===s.pixels&&entry.width===s.width&&entry.height===s.height&&entry.depth===s.bitDepth)return entry.data;
    const b=B.unbase64(s.pixels),expected=s.width*s.height*(s.bitDepth/8);if(b.length!==expected)throw Error('原始像素长度不匹配，无法定量。');let out;
    if(s.bitDepth===16){const d=new DataView(b.buffer,b.byteOffset,b.byteLength);out=new Uint16Array(b.length/2);for(let i=0;i<out.length;i++)out[i]=d.getUint16(i*2,true);}else out=b;
    cache.set(s,{encoded:s.pixels,width:s.width,height:s.height,depth:s.bitDepth,data:out});return out;
  };
  B.rectPixels=(s,r)=>{if(!s||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||!r||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0)throw Error('ROI 坐标与尺寸必须为有效数值，宽和高必须大于 0。');const x=Math.max(0,Math.floor(r.x)),y=Math.max(0,Math.floor(r.y)),x1=Math.min(s.width,Math.ceil(r.x+r.w)),y1=Math.min(s.height,Math.ceil(r.y+r.h));if(x1<=x||y1<=y)throw Error('ROI 不在图像范围内。');return{x,y,w:x1-x,h:y1-y};};
  B.measure=(s,roi,background=null,polarity='dark')=>{
    if(!['dark','light'].includes(polarity))throw Error('条带信号方向无效。');
    const p=B.pixels(s),r=B.rectPixels(s,roi),max=2**s.bitDepth-1;let sum=0,sat=0,min=max,hi=0;
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const v=p[y*s.width+x];sum+=v;min=Math.min(min,v);hi=Math.max(hi,v);if(v===0||v===max)sat++;}
    const area=r.w*r.h,mean=sum/area;let bg=null,backgroundRect=null;
    if(background){const b=B.rectPixels(s,background);backgroundRect=b;let v=0;for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)v+=p[y*s.width+x];bg=v/(b.w*b.h);}
    const raw=polarity==='dark'?max*area-sum:sum;
    const corrected=bg===null?raw:(polarity==='dark'?bg*area-sum:sum-bg*area);
    return {area,mean,min,max:hi,raw,rawIntDen:sum,backgroundMean:bg,corrected,saturation:sat/area,rect:r,backgroundRect,clipped:roi.x<0||roi.y<0||roi.x+roi.w>s.width||roi.y+roi.h>s.height,backgroundClipped:!!background&&(background.x<0||background.y<0||background.x+background.w>s.width||background.y+background.h>s.height)};
  };
  B.autoROIs=(crop,count)=>{if(!crop||![crop.x,crop.y,crop.w,crop.h].every(Number.isFinite)||crop.w<=0||crop.h<=0||!Number.isInteger(count)||count<1||count>200||crop.w/count<1)throw Error('自动 ROI 需要有效裁剪范围及 1–200 条泳道，每条泳道至少占 1 个原图像素。');return Array.from({length:count},(_,i)=>({id:B.uid(),x:crop.x+(i+.15)*crop.w/count,y:crop.y+crop.h*.22,w:crop.w/count*.7,h:crop.h*.56,sampleIndex:i}));};
  B.mean=a=>{if(!a.length||!a.every(Number.isFinite))return NaN;const scale=a.reduce((s,v)=>Math.max(s,Math.abs(v)),0);return scale===0?0:a.reduce((s,v)=>s+v/scale,0)/a.length*scale;};
  B.summary=a=>{const mean=B.mean(a),scale=a.reduce((s,v)=>Math.max(s,Math.abs(v)),0),m=scale?mean/scale:0,sd=a.length>1&&Number.isFinite(mean)?(scale?Math.sqrt(a.reduce((s,v)=>s+(v/scale-m)**2,0)/(a.length-1))*scale:0):NaN;return{n:a.length,mean,sd,sem:sd/Math.sqrt(a.length)};};
  B.records=(project,group)=>{
    const images=group.objects.filter(o=>o.type==='image'),all=[],sampleCounts=new Map();
    for(const s of group.samples)sampleCounts.set(s.id,(sampleCounts.get(s.id)||0)+1);
    for(const o of images){
      const s=project.sources.find(s=>s.id===o.sourceId);if(!s)throw Error('图像缺少原始来源，无法定量。');
      const roiCounts=new Map();for(let i=0;i<o.rois.length;i++){const idx=o.rois[i].sampleIndex??i;roiCounts.set(idx,(roiCounts.get(idx)||0)+1);}
      for(let i=0;i<o.rois.length;i++){
        const roi=o.rois[i],idx=roi.sampleIndex??i,sample=group.samples[idx];if(!sample||!Number.isInteger(idx)||idx<0)throw Error('ROI 对应的样本不存在，请重新分配泳道。');
        const m=B.measure(s,roi,o.background,o.polarity),issues=[];let valid=true;
        if(sampleCounts.get(sample.id)!==1||!String(sample.id??'').trim()){issues.push('样本 ID 缺失或重复');valid=false;}
        if(roiCounts.get(idx)!==1){issues.push('同一样本重复分配 ROI');valid=false;}
        if(m.corrected<=0)issues.push('背景校正后信号 ≤ 0');if(m.saturation>.01)issues.push('饱和像素 > 1%');if(m.clipped)issues.push('ROI 超出原图，按图内像素计算');if(m.backgroundClipped)issues.push('背景框超出原图，按图内像素计算');
        if(m.backgroundRect){const b=m.backgroundRect,r=m.rect;if(r.x<b.x+b.w&&r.x+r.w>b.x&&r.y<b.y+b.h&&r.y+r.h>b.y)issues.push('背景框与条带 ROI 重叠');}
        all.push({objectId:o.id,protein:o.protein||o.name,sourceName:s.name,sourceId:s.id,hash:s.hash||'',bitDepth:s.bitDepth,sampleId:sample.id,group:sample.group,replicate:sample.replicate,lane:idx+1,include:sample.include!==false&&valid,valid,...m,roi,referenceId:o.referenceId,ratio:null,fold:null,issue:issues.join('；')});
      }
    }
    for(const r of all){
      if(all.some(v=>v!==r&&v.objectId===r.objectId&&r.rect.x<v.rect.x+v.rect.w&&r.rect.x+r.rect.w>v.rect.x&&r.rect.y<v.rect.y+v.rect.h&&r.rect.y+r.rect.h>v.rect.y))r.issue=[r.issue,'条带 ROI 之间重叠'].filter(Boolean).join('；');
    }
    const ownIssues=new Map(all.map(r=>[r,r.issue]));
    for(const r of all){if(r.referenceId){
      const matches=all.filter(v=>v.objectId===r.referenceId&&v.sampleId===r.sampleId);
      if(r.referenceId!==r.objectId&&matches.length===1&&matches[0].valid&&r.valid&&matches[0].corrected>0&&r.corrected>0){r.ratio=r.corrected/matches[0].corrected;if(ownIssues.get(matches[0]))r.issue=[r.issue,'参照：'+ownIssues.get(matches[0])].filter(Boolean).join('；');}
      else r.issue=[r.issue,r.referenceId===r.objectId?'不能将蛋白自身设为参照':'参照蛋白缺失、重复或信号 ≤ 0'].filter(Boolean).join('；');
    }}
    return all;
  };
  // Continued fraction for regularized incomplete beta, used for Student t probabilities.
  const logGamma=z=>{const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);z-=1;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);};
  const fraction=(a,b,x)=>{let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<1e-30)d=1e-30;d=1/d;let h=d;for(let m=1;m<300;m++){let aa=m*(b-m)*x/((a+2*m-1)*(a+2*m));d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;h*=d*c;aa=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<3e-14)break;}return h;};
  B.betaI=(x,a,b)=>{if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));return x<(a+1)/(a+b+2)?bt*fraction(a,b,x)/a:1-bt*fraction(b,a,1-x)/b;};
  B.welch=(a,b)=>{
    const invalid={t:NaN,df:NaN,p:NaN};if(a.length<2||b.length<2||!a.every(Number.isFinite)||!b.every(Number.isFinite))return invalid;
    const scale=[...a,...b].reduce((s,v)=>Math.max(s,Math.abs(v)),0);if(!scale)return invalid;
    const aa=a.map(v=>v/scale),bb=b.map(v=>v/scale),sa=B.summary(aa),sb=B.summary(bb),va=sa.sd**2/a.length,vb=sb.sd**2/b.length;if(!(va+vb>0))return invalid;
    const t=(sa.mean-sb.mean)/Math.sqrt(va+vb),wa=va/(va+vb),wb=vb/(va+vb),df=1/(wa**2/(a.length-1)+wb**2/(b.length-1));return{t,df,p:B.betaI(df/(df+t*t),df/2,.5)};
  };
  B.holm=tests=>{
    const a=tests.map((t,index)=>({...t,index})).filter(t=>Number.isFinite(t.p)&&t.p>=0&&t.p<=1).sort((a,b)=>a.p-b.p),adjusted=new Map();let prev=0;
    for(let i=0;i<a.length;i++){prev=Math.max(prev,Math.min(1,a[i].p*(a.length-i)));adjusted.set(a[i].index,prev);}
    return tests.map((t,i)=>({...t,adjusted:adjusted.get(i)??NaN}));
  };
  B.statData=(records,protein,metric='corrected',control='Control',normalize=false)=>{
    if(!['corrected','raw','ratio'].includes(metric))return {rows:[],groups:[],tests:[],error:'统计指标无效。'};
    const a=records.filter(r=>r.protein===protein&&r.include&&r.valid!==false&&Number.isFinite(r[metric])&&r[metric]>0).map(r=>({...r,value:r[metric]}));
    const seen=new Set(),duplicates=new Set();for(const r of a){if(typeof r.sampleId!=='string'||!r.sampleId)continue;if(seen.has(r.sampleId))duplicates.add(r.sampleId);seen.add(r.sampleId);}
    if(duplicates.size)return {rows:[],groups:[],tests:[],error:'同一蛋白存在重复样本 ID（'+[...duplicates].slice(0,8).join('、')+'）。请区分独立样本；重复曝光或技术重复不能重复计入 n。'};
    const base=B.mean(a.filter(r=>r.group===control).map(r=>r.value));if(normalize){if(!(base>0))return {rows:[],groups:[],tests:[],error:'对照组没有有效正值，不能归一化。'};for(const r of a)r.value/=base;}
    const groups=[...new Set(a.map(r=>r.group))].map(name=>({name,...B.summary(a.filter(r=>r.group===name).map(r=>r.value)),values:a.filter(r=>r.group===name).map(r=>r.value)}));
    const tests=B.holm(groups.filter(g=>g.name!==control).map(g=>({group:g.name,...B.welch(g.values,a.filter(r=>r.group===control).map(r=>r.value))})));
    return {rows:a,groups,tests,base};
  };
  B.resultRows=records=>[['蛋白','样本','分组','重复编号','泳道','位深','面积 px²','均值','原始积分信号','背景均值','校正积分信号','目的/参照','饱和比例','ROI x','ROI y','ROI w','ROI h','来源','原图哈希','提示'],...records.map(r=>[r.protein,r.sampleId,r.group,r.replicate,r.lane,r.bitDepth,r.area,r.mean,r.raw,r.backgroundMean??'',r.corrected,r.ratio??'',r.saturation,r.rect.x,r.rect.y,r.rect.w,r.rect.h,r.sourceName,r.hash,r.issue])];
})(globalThis.BS ||= {});
