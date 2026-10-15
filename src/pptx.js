(function(B){
  'use strict';
  B.pptx=async(project,g)=>{
    const e=B.esc,files={},rels=[],shapes=[],previews=new Map(),cw=B.num(g.canvas.width),ch=B.num(g.canvas.height);
    if(!(cw>0&&ch>0)||Math.max(cw,ch)/Math.min(cw,ch)>56)throw Error('PowerPoint 画布长宽比不能超过 56:1，请调整画布尺寸。');
    // Office slide dimensions are limited to 56 inches; scale all geometry together.
    const slideScale=Math.min(1,5376/Math.max(cw,ch)),emu=n=>Math.round(B.num(n)*9525*slideScale);
    const color=(value,opacity=1)=>{
      if(value==='none'||value==='transparent')return '<a:noFill/>';
      let h=String(value||'#20252c').slice(1);
      if(h.length===3||h.length===4)h=h.split('').map(c=>c+c).join('');
      if(!/^[a-fA-F0-9]{6}([a-fA-F0-9]{2})?$/.test(h))throw Error('导出颜色格式无效。');
      const alpha=Math.round(B.clamp(opacity,0,1)*(h.length===8?parseInt(h.slice(6),16)/255:1)*100000);
      return '<a:solidFill><a:srgbClr val="'+h.slice(0,6).toUpperCase()+'">'+(alpha<100000?'<a:alpha val="'+alpha+'"/>':'')+'</a:srgbClr></a:solidFill>';
    };
    const line=o=>{const width=B.clamp(B.num(o.strokeWidth,1),0,20);return '<a:ln w="'+emu(width)+'">'+(width?color(o.stroke,B.clamp(B.num(o.opacity,1),0,1)):'<a:noFill/>')+'</a:ln>';};
    const geometry=o=>{
      if(o.type==='text'||o.type==='rect'||o.type==='image')return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
      // Custom geometry remains an editable Office shape and matches the SVG path.
      const paths=B.shapeLines(o).map(points=>'<a:path w="'+Math.max(1,Math.round(o.w*1000))+'" h="'+Math.max(1,Math.round(o.h*1000))+'" fill="none">'+points.map(([x,y],i)=>'<a:'+(i?'lnTo':'moveTo')+'><a:pt x="'+Math.round(x*1000)+'" y="'+Math.round(y*1000)+'"/></a:'+(i?'lnTo':'moveTo')+'>').join('')+'</a:path>').join('');
      return '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>'+paths+'</a:pathLst></a:custGeom>';
    };
    for(const [i,o] of g.objects.filter(o=>o.visible!==false).entries()){
      const id=i+2,opacity=B.clamp(B.num(o.opacity,1),0,1),xfrm='<a:xfrm rot="'+Math.round((((B.num(o.rotation)%360)+360)%360)*60000)+'"'+(o.type==='image'&&o.flipX?' flipH="1"':'')+(o.type==='image'&&o.flipY?' flipV="1"':'')+'><a:off x="'+emu(o.x)+'" y="'+emu(o.y)+'"/><a:ext cx="'+Math.max(1,emu(o.w))+'" cy="'+Math.max(1,emu(o.h))+'"/></a:xfrm>';
      if(o.type==='image'){
        const source=project.sources.find(s=>s.id===o.sourceId);if(!source)throw Error('导出图像来源缺失。');
        const crop=o.crop;if(!crop||crop.x<0||crop.y<0||crop.w<=0||crop.h<=0||crop.x+crop.w>source.width+.001||crop.y+crop.h>source.height+.001)throw Error('图像裁剪范围超出原图，请重新设置裁剪。');
        // Keep the complete source preview in the package, so Office can edit crop
        // and flips. Display filters are baked into this preview, never quantification.
        const single={...o,x:0,y:0,w:source.width,h:source.height,crop:{x:0,y:0,w:source.width,h:source.height},rotation:0,flipX:false,flipY:false,opacity:1,strokeWidth:0};
        const key=JSON.stringify([source.id,B.num(o.brightness,100),B.num(o.contrast,100),!!o.invert,!!o.grayscale]);
        let rid=previews.get(key);
        if(!rid){
          const c=await B.rasterize(B.svg(project,{...g,canvas:{width:source.width,height:source.height,background:'transparent'}},[single]),source.width,source.height),filename='image'+id+'.png';rid='rId'+id;
          files['ppt/media/'+filename]=B.unbase64(c.toDataURL('image/png').split(',')[1]);rels.push('<Relationship Id="'+rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/'+filename+'"/>');previews.set(key,rid);
        }
        const pct=n=>Math.round(n*100000),srcRect='<a:srcRect l="'+pct(crop.x/source.width)+'" t="'+pct(crop.y/source.height)+'" r="'+pct(1-(crop.x+crop.w)/source.width)+'" b="'+pct(1-(crop.y+crop.h)/source.height)+'"/>';
        shapes.push('<p:pic><p:nvPicPr><p:cNvPr id="'+id+'" name="'+e(o.name)+'" descr="'+e('来源：'+source.name+'；源文件标识：'+(source.hash||source.id))+'"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="'+rid+'">'+(opacity<1?'<a:alphaModFix amt="'+Math.round(opacity*100000)+'"/>':'')+'</a:blip>'+srcRect+'<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>'+xfrm+geometry(o)+line(o)+'</p:spPr></p:pic>');
      }else{
        const fs=B.clamp(B.num(o.fontSize,22),6,300),fontSize=Math.max(100,Math.round(fs*75*slideScale));
        const text=o.type==='text'?'<p:txBody><a:bodyPr wrap="none" lIns="0" rIns="0" tIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>'+String(o.text||'').split('\n').map(t=>'<a:p><a:pPr algn="'+({left:'l',center:'ctr',right:'r'}[o.align]||'l')+'"><a:lnSpc><a:spcPct val="125000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr><a:r><a:rPr lang="zh-CN" sz="'+fontSize+'" b="'+(o.fontWeight===700?1:0)+'" i="'+(o.italic?1:0)+'">'+color(o.fill,opacity)+'<a:latin typeface="'+e(o.fontFamily||'Arial')+'"/><a:ea typeface="'+e(o.fontFamily||'Arial')+'"/></a:rPr><a:t xml:space="preserve">'+e(t)+'</a:t></a:r><a:endParaRPr sz="'+fontSize+'"/></a:p>').join('')+'</p:txBody>':'';
        shapes.push('<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+e(o.name)+'"/><p:cNvSpPr txBox="'+(o.type==='text'?1:0)+'"/><p:nvPr/></p:nvSpPr><p:spPr>'+xfrm+geometry(o)+(o.type==='rect'?color(o.fill,opacity):'<a:noFill/>')+(o.type==='text'?'<a:ln><a:noFill/></a:ln>':line(o))+'</p:spPr>'+text+'</p:sp>');
      }
    }
    files['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>';
    files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>';
    files['ppt/presentation.xml']='<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="'+emu(g.canvas.width)+'" cy="'+emu(g.canvas.height)+'"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
    files['ppt/_rels/presentation.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>';
    files['ppt/slides/slide1.xml']='<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="'+e(g.name)+'"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'+shapes.join('')+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    files['ppt/slides/_rels/slide1.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'+rels.join('')+'</Relationships>';
    const ns='xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const tree='<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree>';
    const cmap='<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
    files['ppt/slideMasters/slideMaster1.xml']='<p:sldMaster '+ns+'><p:cSld name="BlotStudio"><p:bg><p:bgPr>'+color(g.canvas.background||'#ffffff')+'<a:effectLst/></p:bgPr></p:bg>'+tree+'</p:cSld>'+cmap+'<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';
    files['ppt/slideMasters/_rels/slideMaster1.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
    files['ppt/slideLayouts/slideLayout1.xml']='<p:sldLayout '+ns+' type="blank" preserve="1"><p:cSld name="Blank">'+tree+'</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
    files['ppt/slideLayouts/_rels/slideLayout1.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>';
    const colors={dk1:'20252C',lt1:'FFFFFF',dk2:'183F48',lt2:'F4F6F8',accent1:'147F75',accent2:'368D81',accent3:'81B5A5',accent4:'BFD9CE',accent5:'D6952D',accent6:'477BC0',hlink:'147F75',folHlink:'09645D'};
    files['ppt/theme/theme1.xml']='<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="BlotStudio"><a:themeElements><a:clrScheme name="BlotStudio">'+Object.entries(colors).map(([k,v])=>'<a:'+k+'><a:srgbClr val="'+v+'"/></a:'+k+'>').join('')+'</a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="PingFang SC"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="PingFang SC"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="BlotStudio"><a:fillStyleLst>'+Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')+'</a:fillStyleLst><a:lnStyleLst>'+Array(3).fill('<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>').join('')+'</a:lnStyleLst><a:effectStyleLst>'+Array(3).fill('<a:effectStyle><a:effectLst/></a:effectStyle>').join('')+'</a:effectStyleLst><a:bgFillStyleLst>'+Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')+'</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
    return B.zip(files);
  };
})(globalThis.BS ||= {});
