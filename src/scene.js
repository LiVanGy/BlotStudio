(function(B){
  'use strict';
  B.icons={select:'M4 3l7 17 2-7 7-2L4 3z',hand:'M8 12V6a2 2 0 014 0v5-7a2 2 0 014 0v7-4a2 2 0 014 0v7c0 5-3 7-7 7-3 0-5-3-7-6l-2-3a2 2 0 013-2l2 2z',crop:'M7 3v14h14M3 7h14v14',image:'M4 3h16v18H4z M4 16l5-5 4 4 3-3 4 4 M9 7h.01',text:'M4 4h16M12 4v16M8 20h8',rect:'M4 4h16v16H4z',line:'M4 19L20 5',arrow:'M4 19L20 5M10 5h10v10',bracket:'M4 17V7h16v10',plus:'M12 4v16M4 12h16',minus:'M4 12h16',undo:'M8 4L3 9l5 5M3 9h11a7 7 0 010 14',redo:'M16 4l5 5-5 5M21 9H10a7 7 0 000 14',save:'M4 3h13l4 4v14H3V3zM7 3v7h10V3M7 21v-7h10v7',export:'M12 3v12M7 8l5-5 5 5M4 14v7h16v-7',folder:'M3 6h7l2 3h9v12H3z',chevron:'M8 5l7 7-7 7',down:'M5 8l7 7 7-7',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6',hide:'M3 3l18 18M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z',lock:'M6 10h12v11H6zM8 10V6a4 4 0 018 0v4',unlock:'M6 10h12v11H6zM8 10V6a4 4 0 018 0',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',copy:'M8 8h13v13H8zM16 8V3H3v13h5',left:'M4 3v18M8 6h12v4H8zM8 14h8v4H8z',center:'M12 2v20M4 6h16v4H4zM7 14h10v4H7z',right:'M20 3v18M4 6h12v4H4zM8 14h8v4H8z',top:'M3 4h18M6 8h4v12H6zM14 8h4v8h-4z',middle:'M2 12h20M6 4h4v16H6zM14 7h4v10h-4z',bottom:'M3 20h18M6 4h4v12H6zM14 8h4v8h-4z',layers:'M12 3l10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6',up:'M5 15l7-7 7 7',fit:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8h8v8H8z',help:'M9 8a3 3 0 116 0c0 3-3 2-3 6M12 18h.01M12 2a10 10 0 100 20 10 10 0 000-20',check:'M4 12l5 5L20 6',close:'M5 5l14 14M19 5L5 19',chart:'M4 3v18h17M8 17v-6M13 17V7M18 17V4',rotate:'M4 7V2M4 7h5M4 7a9 9 0 11-1 7',flip:'M12 3v18M3 18l6-12v12zM21 18L15 6v12z',grid:'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',bolt:'M13 2L4 14h7l-1 8L21 9h-8z'};
  B.icon=(name,size=18)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(B.icons[name]||B.icons.rect)+'"/></svg>';
  B.objectMarkup=(o,sources)=>{
    const n=B.num,e=B.esc,w=n(o.w),h=n(o.h),sw=B.clamp(n(o.strokeWidth,1),0,20),col=e(o.fill||'#20252c'),stroke=e(o.stroke||'#20252c');let body='';
    if(o.type==='image'){
      const s=sources.find(s=>s.id===o.sourceId);if(!s)return'';const c=o.crop,id='f'+o.id,clip='c'+o.id,contrast=B.clamp(n(o.contrast,100)/100,0,3),brightness=B.clamp(n(o.brightness,100)/100,0,3),slope=contrast*brightness*(o.invert?-1:1),intercept=o.invert?1-(.5-.5*contrast)*brightness:(.5-.5*contrast)*brightness;
      body='<defs><clipPath id="'+clip+'"><rect width="'+w+'" height="'+h+'"/></clipPath><filter id="'+id+'" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'+(o.grayscale?'<feColorMatrix type="saturate" values="0"/>':'')+'<feComponentTransfer>'+['R','G','B'].map(k=>'<feFunc'+k+' type="linear" slope="'+slope+'" intercept="'+intercept+'"/>').join('')+'</feComponentTransfer></filter></defs><g clip-path="url(#'+clip+')"><g transform="translate('+(o.flipX?w:0)+' '+(o.flipY?h:0)+') scale('+(o.flipX?-1:1)+' '+(o.flipY?-1:1)+')"><image href="'+e(s.url)+'" x="'+(-c.x*w/c.w)+'" y="'+(-c.y*h/c.h)+'" width="'+(s.width*w/c.w)+'" height="'+(s.height*h/c.h)+'" preserveAspectRatio="none" filter="url(#'+id+')"/></g></g>'+(sw>0?'<rect width="'+w+'" height="'+h+'" fill="none" stroke="'+stroke+'" stroke-width="'+sw+'"/>':'');
    }else if(o.type==='text'){
      const fs=B.clamp(n(o.fontSize,22),6,300),anchor=o.align==='center'?'middle':o.align==='right'?'end':'start',tx=o.align==='center'?w/2:o.align==='right'?w:0;
      body='<text xml:space="preserve" x="'+tx+'" y="'+(fs*.90)+'" font-size="'+fs+'" font-family="'+e(o.fontFamily||'Arial')+'" font-weight="'+(o.fontWeight===700?700:400)+'" font-style="'+(o.italic?'italic':'normal')+'" text-anchor="'+anchor+'" fill="'+col+'">'+String(o.text||'').split('\n').map((t,i)=>'<tspan x="'+tx+'" dy="'+(i?fs*1.25:0)+'">'+e(t)+'</tspan>').join('')+'</text>';
    }else if(o.type==='rect')body='<rect width="'+w+'" height="'+h+'" fill="'+col+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
    else body='<path d="'+B.shapeLines(o).map(points=>points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join('')).join(' ')+'" fill="none" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
    return'<g transform="translate('+n(o.x)+' '+n(o.y)+') rotate('+n(o.rotation)+' '+w/2+' '+h/2+')" opacity="'+B.clamp(n(o.opacity,1),0,1)+'">'+body+'</g>';
  };
  B.svg=(project,group,objects=null)=>{const c=group.canvas;return'<svg xmlns="http://www.w3.org/2000/svg" width="'+c.width+'" height="'+c.height+'" viewBox="0 0 '+c.width+' '+c.height+'"><rect width="100%" height="100%" fill="'+B.esc(c.background||'#ffffff')+'"/>'+((objects||group.objects).filter(o=>o.visible!==false).map(o=>B.objectMarkup(o,project.sources)).join(''))+'</svg>';};
  // Shared local coordinates keep SVG and editable PowerPoint paths identical.
  B.shapeLines=o=>{
    const w=B.num(o.w),h=B.num(o.h);
    if(o.type==='bracket')return [[[0,h],[0,0],[w,0],[w,h]]];
    const lines=[[[0,h],[w,0]]];
    if(o.type==='arrow'){
      const length=Math.hypot(w,h),size=Math.min(12,length/3),ux=w/length,uy=-h/length;
      lines.push([[w-size*ux-size*uy, -size*uy+size*ux],[w,0],[w-size*ux+size*uy,-size*uy-size*ux]]);
    }
    return lines;
  };
  B.quickLayout=(g,opts={})=>{
    const images=g.objects.filter(o=>o.type==='image'&&o.visible!==false),w=B.clamp(B.num(opts.width,640),100,5000),gap=B.clamp(B.num(opts.gap,36),0,500),x=180,y=180;
    if(!images.length)throw Error('请先导入至少一张可见的条带图像。');
    if(images.some(o=>o.locked)||g.objects.some(o=>o.autoLabel&&o.locked))throw Error('快速排版会调整条带和自动标签，请先解锁这些对象。');
    if(!g.samples.length)throw Error('请先设置至少一条样本泳道。');
    const additions=[],moved=new Map();
    const add=(text,px,py,pw,fs=22,align='left',bold=false)=>additions.push(B.object('text',{text,name:text,x:px,y:py,w:pw,h:fs*1.3,fontSize:fs,fontFamily:'Arial',align,fontWeight:bold?700:400,autoLabel:true}));
    add('A',38,42,80,28,'left',true);let rowY=y;
    for(const original of images){
      const c=original.crop;if(!c||!(c.w>0&&c.h>0))throw Error('条带裁剪尺寸无效，请重新框选。');
      // Preserve the crop aspect ratio; never stretch a thin band to a minimum height.
      const o={...original,x,y:rowY,w,h:w*c.h/c.w,rotation:0};
      if(!Number.isFinite(o.h)||o.h>10000||rowY+o.h+85>10000)throw Error('排版高度超过 10000 像素。请缩小条带宽度、减少行数，或先裁剪原图。');
      moved.set(o.id,o);add(o.protein||o.name,32,rowY+o.h/2-14,130,24,'right');add(o.mw?o.mw+' kDa':'kDa',x+w+20,rowY+o.h/2-14,135,22);rowY+=o.h+gap;
    }
    // Label contiguous sample runs separately, including interleaved group names.
    for(let start=0;start<g.samples.length;){
      let end=start+1;while(end<g.samples.length&&g.samples[end].group===g.samples[start].group)end++;
      const left=x+start*w/g.samples.length,right=x+end*w/g.samples.length;
      add(g.samples[start].group,left,126,right-left,21,'center',true);
      additions.push(B.object('line',{name:'分组线 · '+g.samples[start].group,x:left+Math.min(5,(right-left)/4),y:158,w:Math.max(.01,right-left-Math.min(10,(right-left)/2)),h:.01,rotation:0,strokeWidth:1.4,autoLabel:true}));start=end;
    }
    if(images.some(o=>o.demo))add('演示数据 · 非实验结果',220,rowY+22,600,16,'center');
    const objects=g.objects.filter(o=>!o.autoLabel).map(o=>moved.get(o.id)||o).concat(additions),height=Math.max(590,rowY+85);
    if(height>10000||objects.length>3000)throw Error('排版结果超过项目尺寸或对象数量上限，请拆分为多个图组。');
    // Apply only after all checks pass, leaving the prior figure intact on failure.
    g.objects=objects;g.canvas={...g.canvas,width:Math.max(1000,x+w+170),height};
  };
  B.rasterize=async(svg,w,h)=>{
    if(![w,h].every(v=>Number.isFinite(v)&&v>0))throw Error('导出尺寸必须为正数。');
    w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
    if(w*h>64000000||w>16000||h>16000)throw Error('导出尺寸过大，请减小像素倍率。');
    const c=document.createElement('canvas');c.width=w;c.height=h;const im=await B.loadImage('data:image/svg+xml;base64,'+B.base64(B.utf8(svg))),ctx=c.getContext('2d');
    if(!ctx)throw Error('当前环境无法创建导出画布。');ctx.drawImage(im,0,0,w,h);return c;
  };
  B.pngDpi=async(canvas,dpi)=>{
    dpi=Number(dpi);
    if(!Number.isFinite(dpi)||dpi<=0||dpi>100000)throw Error('PNG 分辨率无效。');
    const bytes=B.unbase64(canvas.toDataURL('image/png').split(',')[1]);
    if(bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error('PNG 数据异常。');
    const chunk=new Uint8Array(21),v=new DataView(chunk.buffer);v.setUint32(0,9);chunk.set(B.utf8('pHYs'),4);v.setUint32(8,Math.round(dpi/0.0254));v.setUint32(12,Math.round(dpi/0.0254));chunk[16]=1;v.setUint32(17,B.crc32(chunk.subarray(4,17)));
    const parts=[bytes.subarray(0,8)],dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let pos=8;
    let header=false,ended=false;
    while(pos<bytes.length){if(pos+12>bytes.length)throw Error('PNG 数据截断。');const len=dv.getUint32(pos),end=pos+12+len,type=String.fromCharCode(...bytes.subarray(pos+4,pos+8));if(end>bytes.length)throw Error('PNG 数据异常。');if(pos===8&&type!=='IHDR')throw Error('PNG 缺少头信息。');if(type==='IHDR'){if(header||len!==13)throw Error('PNG 头信息异常。');header=true;}if(type==='IEND'){if(len!==0||end!==bytes.length)throw Error('PNG 结束信息异常。');ended=true;}if(type!=='pHYs')parts.push(bytes.subarray(pos,end));if(type==='IHDR')parts.push(chunk);pos=end;}
    if(!header||!ended)throw Error('PNG 数据不完整。');
    const out=new Uint8Array(parts.reduce((s,a)=>s+a.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;
  };
})(globalThis.BS ||= {});
