(function(B){
  'use strict';
  const references=[
    {title:'ImageJ built-in macro functions: getRawStatistics, fromCharCode, getDirectory and File.saveString',url:'https://imagej.net/ij/developer/macro/functions2.html'},
    {title:'ImageJ macro language',url:'https://imagej.net/ij/developer/macro/macros.html'},
    {title:'ImageJ download / Fiji',url:'https://imagej.net/software/fiji/'}
  ];
  const headers=['Role','ImageIndex','ObjectID','SourceID','Protein','SampleID','SampleGroup','Replicate','Include','Polarity','BitDepth','X','Y','Width','Height','AreaPixels','MeanRaw','RawIntDen','DirectionalIntDen','BackgroundMeanRaw','CorrectedIntDen'];
  const csvRow=row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',');
  // Encode dynamic metadata as numeric UTF-16 units, not macro source literals.
  // This also avoids relying on the macro editor's source-file character set.
  const macroString=value=>{
    const s=String(value??''),parts=[];
    for(let start=0;start<s.length;start+=96){const units=[];for(let i=start;i<Math.min(start+96,s.length);i++)units.push(s.charCodeAt(i));parts.push('fromCharCode('+units.join(',')+')');}
    return parts.length?parts.join(' + '):'""';
  };
  function sourcePixels(source){
    if(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||source.width*source.height>32000000||![8,16].includes(source.bitDepth)||typeof source.pixels!=='string')throw Error('ImageJ 复核需要有效的原生 8/16-bit 灰度像素。');
    let bytes;try{bytes=B.unbase64(source.pixels);}catch{throw Error('原始像素编码损坏，无法生成 ImageJ 复核包。');}
    if(bytes.length!==source.width*source.height*(source.bitDepth/8))throw Error('原始像素长度不匹配，不能生成 ImageJ 复核包。');
    return bytes;
  }
  function nativeTIFF(source,bytes){
    const entries=[[256,4,source.width],[257,4,source.height],[258,3,source.bitDepth],[259,3,1],[262,3,1],[273,4,0],[274,3,1],[277,3,1],[278,4,source.height],[279,4,bytes.length],[284,3,1],[339,3,1]],offset=8+2+entries.length*12+4;
    entries.find(e=>e[0]===273)[2]=offset;
    const out=new Uint8Array(offset+bytes.length),v=new DataView(out.buffer);out[0]=73;out[1]=73;v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,entries.length,true);
    entries.forEach(([tag,type,value],i)=>{const at=10+i*12;v.setUint16(at,tag,true);v.setUint16(at+2,type,true);v.setUint32(at+4,1,true);if(type===3)v.setUint16(at+8,value,true);else v.setUint32(at+8,value,true);});out.set(bytes,offset);return out;
  }
  function rect(source,r){
    if(!r||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0)throw Error('ImageJ 复核遇到无效 ROI。');
    const x=Math.max(0,Math.floor(r.x)),y=Math.max(0,Math.floor(r.y)),right=Math.min(source.width,Math.ceil(r.x+r.w)),bottom=Math.min(source.height,Math.ceil(r.y+r.h));
    if(right<=x||bottom<=y)throw Error('ImageJ 复核 ROI 完全位于原图之外。');
    return{x,y,w:right-x,h:bottom-y};
  }
  function stats(source,bytes,r){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let sum=0;
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=y*source.width+x;sum+=source.bitDepth===16?view.getUint16(i*2,true):bytes[i];}
    return{area:r.w*r.h,mean:sum/(r.w*r.h),sum};
  }
  B.imagejBundle=(project,group)=>{
    if(!project||!Array.isArray(project.sources)||!group||!Array.isArray(group.objects)||!Array.isArray(group.samples))throw Error('没有可复核的 WB 图组。');
    const objects=group.objects.filter(o=>o.type==='image');if(!objects.length)throw Error('请先导入至少一张 WB 原图，再生成 ImageJ 复核包。');
    const files={},expected=[headers],images=[],macro=[
      '// BlotStudio ImageJ verification bundle: native unsigned 8/16-bit pixels.',
      '// Run in ImageJ 1.x / Fiji. This is a generated macro, not an embedded runtime.',
      '// Runtime execution has NOT been validated in the build environment.',
      '// No Results table, ROI Manager, existing images or source pixels are changed.',
      'root = getDirectory("Choose the extracted BlotStudio ImageJ bundle folder");',
      'if (root=="") exit("No bundle directory selected.");',
      'outputPath = root + "recomputed.csv";',
      'if (File.exists(outputPath)) { if (!getBoolean("recomputed.csv already exists. Replace that verification output?")) exit("Output was not replaced."); }',
      'previousImage = 0;',
      'if (nImages>0) previousImage = getImageID();'
    ];
    const body=[];
    objects.forEach((object,index)=>{
      const source=project.sources.find(s=>s.id===object.sourceId),bytes=sourcePixels(source),file='images/'+String(index+1).padStart(3,'0')+'.tif',max=2**source.bitDepth-1,polarity=object.polarity||'dark';
      if(!['dark','light'].includes(polarity)||!Array.isArray(object.rois))throw Error('ImageJ 复核遇到无效信号方向或 ROI 列表。');
      files[file]=nativeTIFF(source,bytes);
      const bg=object.background?rect(source,object.background):null,bgStats=bg?stats(source,bytes,bg):null,protein=object.protein||object.name||'',records=[];
      const image={index:index+1,file,objectId:object.id,sourceId:source.id,sourceName:source.name,sourceHash:source.hash||'',width:source.width,height:source.height,bitDepth:source.bitDepth,visible:object.visible!==false,polarity,demo:!!(object.demo||source.demo||group.demo||project.demo),displayCrop:object.crop||null,background:bg,originalBackground:object.background||null,rois:records};images.push(image);
      macro.push('if (!File.exists(root + '+macroString(file)+')) exit("Missing bundle TIFF: '+file+'");');
      body.push('// Image '+(index+1)+': pixels and ROI coordinates are independent of display edits.',
        'beforeCount = nImages;',
        'open(root + '+macroString(file)+');',
        'ownedImage = getImageID();',
        'if (nImages<=beforeCount) exit("Image opening did not create an owned verification window. No existing window was closed.");',
        'if (getWidth()!='+source.width+' || getHeight()!='+source.height+' || bitDepth()!='+source.bitDepth+') { selectImage(ownedImage); close(); restoreImage(previousImage); exit("TIFF dimensions or bit depth differ from the verification manifest."); }',
        'resetThreshold();');
      const fixed=(role,sample,r)=>[role,index+1,object.id,source.id,protein,sample?.id||'',sample?.group||'',sample?.replicate??'',sample?sample.include!==false:'',polarity,source.bitDepth,r.x,r.y,r.w,r.h];
      const write=(meta,background)=>{
        const numeric=background?['csvNumber(areaPixels,0)','csvNumber(meanRaw,12)','csvNumber(rawIntDen,0)','emptyCell','csvNumber(backgroundMean,12)','emptyCell']:['csvNumber(areaPixels,0)','csvNumber(meanRaw,12)','csvNumber(rawIntDen,0)','csvNumber(directional,0)',bg?'csvNumber(backgroundMean,12)':'emptyCell','csvNumber(corrected,12)'];
        body.push('output += '+macroString(csvRow(meta)+',')+' + '+numeric.join(' + "," + ')+' + "\\r\\n";');
      };
      const measure=r=>body.push('selectImage(ownedImage);','makeRectangle('+[r.x,r.y,r.w,r.h].join(',')+');','getRawStatistics(areaPixels, meanRaw, minRaw, maxRaw, sdRaw, histogram);','rawIntDen = histogramSum(histogram);');
      if(bg){measure(bg);body.push('backgroundMean = meanRaw;');const meta=fixed('background',null,bg);expected.push([...meta,bgStats.area,bgStats.mean,bgStats.sum,'',bgStats.mean,'']);write(meta,true);}
      object.rois.forEach((roi,roiIndex)=>{
        const sample=group.samples[roi.sampleIndex];if(!sample)throw Error('ROI 缺少有效的对应样本，无法生成可追溯的 ImageJ 复核包。');
        const effective=rect(source,roi),measured=stats(source,bytes,effective),directional=polarity==='dark'?max*measured.area-measured.sum:measured.sum,corrected=bg?(polarity==='dark'?bgStats.mean*measured.area-measured.sum:measured.sum-bgStats.mean*measured.area):directional,meta=fixed('band',sample,effective);
        records.push({roiIndex:roiIndex+1,roiId:roi.id||'',sampleIndex:roi.sampleIndex,sampleId:sample.id,sampleGroup:sample.group,replicate:sample.replicate,include:sample.include!==false,original:{x:roi.x,y:roi.y,w:roi.w,h:roi.h},effective,areaPixels:measured.area,meanRaw:measured.mean,rawIntDen:measured.sum,directionalIntDen:directional,backgroundMeanRaw:bgStats?.mean??null,correctedIntDen:corrected});
        expected.push([...meta,measured.area,measured.mean,measured.sum,directional,bgStats?.mean??'',corrected]);measure(effective);
        body.push('directional = '+(polarity==='dark'?max+'*areaPixels - rawIntDen':'rawIntDen')+';','corrected = '+(bg?(polarity==='dark'?'backgroundMean*areaPixels - rawIntDen':'rawIntDen - backgroundMean*areaPixels'):'directional')+';');write(meta,false);
      });
      body.push('selectImage(ownedImage);','close();');
    });
    macro.push('output = fromCharCode(65279) + '+macroString(csvRow(headers)+'\r\n')+';','emptyCell = fromCharCode(34,34);',...body,
      'restoreImage(previousImage);','File.saveString(output, outputPath);','showMessage("BlotStudio verification", "Recomputed measurements were written to recomputed.csv. Compare them with expected.csv. Existing Results were not cleared.");',
      'function histogramSum(histogram) { sum=0; for (bin=0; bin<histogram.length; bin++) sum += bin*histogram[bin]; return sum; }',
      'function csvNumber(value, places) { return fromCharCode(34) + d2s(value,places) + fromCharCode(34); }',
      'function restoreImage(id) { if (id!=0 && isOpen(id)) selectImage(id); }','');
    const manifest={format:'BlotStudio-ImageJ-verification',version:1,createdAt:new Date().toISOString(),projectId:project.id||'',projectName:project.name||'',groupId:group.id||'',groupName:group.name||'',demo:images.some(i=>i.demo),runtimeIncluded:false,macroRuntimeTested:false,measurement:'uncalibrated rectangular ROI; integer source pixels',coordinateRule:'x=max(0,floor(x)); y=max(0,floor(y)); right=min(width,ceil(x+w)); bottom=min(height,ceil(y+h))',tiff:{endianness:'little',sampleFormat:'unsigned integer',photometricInterpretation:'BlackIsZero (normalized source brightness)',spatialCalibration:'none',densityCalibration:'none',pagesPerFile:1},formulas:{rawIntDen:'sum of original unsigned pixel values',directionalDark:'(2^bitDepth-1)*AreaPixels-RawIntDen',directionalLight:'RawIntDen',correctedDark:'BackgroundMeanRaw*AreaPixels-RawIntDen',correctedLight:'RawIntDen-BackgroundMeanRaw*AreaPixels',withoutBackground:'CorrectedIntDen=DirectionalIntDen'},comparisonTolerance:{areaPixels:0,rawIntDen:0,directionalIntDen:0,meanRawAbsolute:1e-9,correctedAbsolute:1e-5,correctedRelative:1e-12},references,images};
    files['verify_imagej.ijm']=macro.join('\n');files['expected.csv']='\ufeff'+expected.map(csvRow).join('\r\n')+'\r\n';files['manifest.json']=JSON.stringify(manifest,null,2);
    files['README_zh-CN.txt']=[
      'BlotStudio：ImageJ 独立复核包',
      manifest.demo?'本包含明确标记的算法模拟数据，不代表实验结果。':'本包由当前图组原始定量像素和 ROI 生成。',
      '',
      '这是什么：用于在独立 ImageJ 1.x / Fiji 中重新测量。未内置 ImageJ 原版运行时，也不是完整 Gel Analyzer。',
      '当前构建环境未实际执行 .ijm 宏；宏结构及 TIFF/预期数值可由自动测试检查，不能代替 ImageJ 实机验收。',
      '',
      '使用：',
      '1. 将 ZIP 完整解压到一个文件夹，保留 images 子目录。建议先保存 ImageJ 中正在处理的工作。',
      '2. 在 ImageJ/Fiji 中打开 verify_imagej.ijm，在宏编辑器运行（Run）。',
      '3. 选择包含 manifest.json、expected.csv 和 images 的解压根目录。路径可含中文和空格。',
      '4. 宏将生成 recomputed.csv。已有该输出时会询问是否覆盖；不会覆盖 expected.csv 或 TIFF。',
      '5. 用支持 UTF-8 的表格软件比较 expected.csv 与 recomputed.csv，按 Role/ImageIndex/ObjectID/SampleID 对应行。',
      '',
      '数据和算法：',
      '每个 image object 有独立单页 TIFF，从 source.pixels 直接编码，保留 8/16-bit 无符号灰度；不从屏幕预览、排版图或原始多页文件中取图。',
      'TIFF 无空间/密度校准。WhiteIsZero 的输入已在导入时统一成亮度；此处写 BlackIsZero，禁止再因 LUT 或显示反相改变像素。',
      'ROI 使用实际参与定量的原图整数像素范围：左/上向下取整，右/下向上取整并与原图相交。manifest 同时保留原始小数坐标。',
      '显示裁剪、旋转、翻转、亮度、对比度和透明度均不参与复核像素。隐藏图层及排除样本也会导出，并在 manifest/Include 中标记。',
      '宏使用 getRawStatistics 的未校准面积（像素数）、均值及单位宽度原始直方图。RawIntDen 为直方图 value×count 之和。',
      '深色条带：DirectionalIntDen = 最大位深值×面积−RawIntDen；浅色条带：DirectionalIntDen = RawIntDen。',
      '有背景时：深色 CorrectedIntDen = 背景均值×面积−RawIntDen；浅色为 RawIntDen−背景均值×面积。无背景时 CorrectedIntDen=DirectionalIntDen。',
      '因此深色 DirectionalIntDen 不能误称 ImageJ RawIntDen。16-bit 最大值固定为 65535，不依赖 ImageJ 的 16-bit Invert 偏好。',
      '背景单独以 Role=background 输出；其方向积分/背景校正积分留空。负的背景校正值保留。',
      '此包只复核基础像素和背景扣除，不重新执行参照蛋白归一化、对照组折算、t 检验或 Gel Analyzer 峰面积分析。',
      '',
      '保护现有工作：宏不用 Results/ROI Manager，不清空表格、不反相或保存原图；仅按 ID 关闭自己新打开的复核图片，最后恢复原活动图像。',
      '动态蛋白/样本/源标识用 fromCharCode 编码，不把用户文字直接作为宏语句；CSV 双引号按标准双写。',
      '比较：像素面积、RawIntDen、DirectionalIntDen 应精确相等；均值允许 1e-9 绝对差，校正积分允许 max(1e-5, |expected|×1e-12) 浮点差。',
      '',
      '来源（官方）：',...references.map(r=>r.title+'\n'+r.url),'',
      'BlotStudio 生成的互操作宏与本软件同许可；包中不重新分发 ImageJ/Fiji 运行时。',''
    ].join('\n');
    return B.zip(files);
  };
})(globalThis.BS ||= {});
