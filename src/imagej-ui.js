(function(B){
  'use strict';
  B.currentImagejProfile=()=>{
    const {p,ui}=B.state,g=B.getGroup(),o=B.getAnalysis(),s=o&&p.sources.find(s=>s.id===o.sourceId),roi=o&&(o.rois.find(r=>r.id===ui.roiId)||o.rois[0]);
    if(!s||!roi)throw Error('请先为图像框选条带 ROI。');
    return {g,o,s,roi,profile:B.imagej.profile(s,roi,{axis:ui.imagejAxis||'y',invert:!!ui.imagejInvert})};
  };
  B.imagejResultRows=(project,group)=>[
    ['方法','ImageJ1 未校准、无阈值矩形测量；背景框均值校正'],
    ['说明','RawIntDen 为原始像素和；方向积分为按信号方向计算的信号；不等于 Gel Analyzer 峰面积'],[],
    ['蛋白','样本','分组','位深','Area px²','Mean','RawIntDen','IntDen','方向积分','背景均值','背景校正信号','有效ROI x','有效ROI y','有效ROI w','有效ROI h','来源','原图哈希'],
    ...B.records(project,group).map(r=>[r.protein,r.sampleId,r.group,r.bitDepth,r.area,r.mean,r.rawIntDen,r.area*r.mean,r.raw,r.backgroundMean??'',r.corrected,r.rect.x,r.rect.y,r.rect.w,r.rect.h,r.sourceName,r.hash])
  ];
  B.imagejPanel=(project,group,o,s)=>{
    const {ui}=B.state,e=B.esc,roi=o.rois.find(r=>r.id===ui.roiId)||o.rois[0],buttons=B.btn('imagej-measure-export','测量 Excel','export')+B.btn('imagej-bundle','ImageJ 复核包','folder');
    const title='<div class="section-title"><div><h2>ImageJ 方法</h2><p class="hint">未校准、无阈值矩形测量 · 原始 '+s.bitDepth+' 位像素</p></div><div class="button-row">'+buttons+'</div></div>';
    if(!roi)return '<section class="imagej-panel">'+title+'<p class="hint">框选条带 ROI 后，显示 ImageJ 定义的测量与均值曲线。复核包可在原版 ImageJ 中重算。</p></section>';
    const m=B.imagej.measure(s,roi,{background:o.background,polarity:o.polarity}),profile=B.imagej.profile(s,roi,{axis:ui.imagejAxis||'y',invert:!!ui.imagejInvert}),sample=group.samples[roi.sampleIndex],w=640,h=180,left=64,right=20,top=20,bottom=36,lo=profile.values.reduce((a,v)=>Math.min(a,v),Infinity),hi=profile.values.reduce((a,v)=>Math.max(a,v),-Infinity),span=hi-lo||1;
    const px=i=>left+i/Math.max(1,profile.values.length-1)*(w-left-right),py=v=>top+(hi-v)/span*(h-top-bottom),step=Math.max(1,Math.ceil(profile.values.length/800)),indexes=Array.from({length:Math.ceil(profile.values.length/step)},(_,i)=>i*step),last=profile.values.length-1,points=[...new Set([...indexes,last])].map(i=>px(i).toFixed(2)+','+py(profile.values[i]).toFixed(2)).join(' '),f=v=>B.format(v),axis=profile.axis==='y'?'Y':'X';
    const svg='<svg class="imagej-profile" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="选中 ROI 的 ImageJ 行列平均灰度曲线"><rect width="100%" height="100%" fill="#f6faf9"/><path d="M'+left+' '+top+'V'+(h-bottom)+'H'+(w-right)+'" fill="none" stroke="#9aabb4"/><polyline points="'+points+'" fill="none" stroke="#147f75" stroke-width="2"/>'+[[top,hi],[h-bottom,lo]].map(([y,value])=>'<text x="'+(left-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="#637583">'+e(f(value))+'</text>').join('')+'<text x="'+left+'" y="'+(h-15)+'" font-size="11" fill="#637583">'+profile.coords[0]+'</text><text x="'+(w-right)+'" y="'+(h-15)+'" text-anchor="end" font-size="11" fill="#637583">'+profile.coords.at(-1)+'</text><text x="'+(w/2)+'" y="'+(h-3)+'" text-anchor="middle" font-size="10" fill="#637583">原图 '+axis+' 坐标 / px</text></svg>';
    return '<section class="imagej-panel">'+title+'<div class="imagej-metrics">'+[['Area',m.Area],['Mean',m.Mean],['RawIntDen',m.RawIntDen],['IntDen',m.IntDen]].map(([label,value])=>'<div><span>'+label+'</span><strong>'+e(f(value))+'</strong></div>').join('')+'</div><p class="hint">当前样本 '+e(sample?.id||'')+'；有效整数 ROI：'+[m.rect.x,m.rect.y,m.rect.w,m.rect.h].join(', ')+'。RawIntDen 是原始像素和；深色条带的反相积分与背景校正信号另列在测量表中。</p><div class="imagej-profile-controls">'+B.select('analysis-ui','imagejAxis',profile.axis,[['y','按行平均 · 纵向曲线'],['x','按列平均 · 横向曲线']],'曲线方向')+B.check('analysis-ui','imagejInvert',profile.invert,'全位深反相曲线')+B.btn('imagej-profile-export','曲线 CSV','export')+'</div>'+svg+'<p class="hint">曲线为 ROI 内每行 / 列的平均灰度；长曲线显示最多约 800 个采样点，CSV 保留全部数值。曲线不是 Gel Analyzer 峰面积；反相使用 '+(2**s.bitDepth-1)+' − 灰度。当前未内置完整 ImageJ Java 引擎、滚动球或人工封闭峰测量。</p></section>';
  };
  B.exportImagej=async kind=>{
    const {p}=B.state,g=B.getGroup();B.validate(p);let result;
    if(kind==='measure')result=await B.saveFile(g.name+'-ImageJ测量.xlsx',B.workbook([{name:'ImageJ ROI',rows:B.imagejResultRows(p,g)}]),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    else if(kind==='profile'){
      const {o,roi,profile}=B.currentImagejProfile(),sample=g.samples[roi.sampleIndex];
      result=await B.saveFile((o.protein||o.name)+'-'+sample.id+'-ImageJ曲线.csv',B.csv([['方法','ImageJ1 Plot Profile 行列均值'],['原图绝对坐标轴',profile.axis],['全位深反相',profile.invert?'是':'否'],['实际 ROI',profile.rect.x,profile.rect.y,profile.rect.w,profile.rect.h],[],['坐标 px','平均灰度'],...profile.values.map((value,i)=>[profile.coords[i],value])]),'text/csv');
    }else if(kind==='bundle')result=await B.saveFile(g.name+'-ImageJ复核包.zip',await B.imagejBundle(p,g),'application/zip');
    else throw Error('ImageJ 导出类型无效。');
    B.toast(result.status==='saved'?'ImageJ 文件已保存。':'已请求浏览器下载，请在下载记录中确认文件。');
  };
})(globalThis.BS ||= {});
