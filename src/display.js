(function(B){
  'use strict';
  // SVG filters in WebKit can quantize through a linear-light intermediate even
  // for an identity transfer (e.g. sRGB 32 becomes 34). Compute the display copy
  // once in sRGB, then let SVG handle geometry. Original/analytical pixels remain
  // untouched. Alpha is retained independently of the object's opacity.
  const cache=new Map();
  B.displayKey=(url,params)=>JSON.stringify([url,params]);
  B.displayPixels=(rgba,{grayscale=false,brightness=100,contrast=100,invert=false}={})=>{
    const out=new Uint8ClampedArray(rgba),slope=contrast/100*brightness/100,offset=(.5-.5*contrast/100)*brightness/100;
    for(let i=0;i<out.length;i+=4){const gray=.213*rgba[i]+.715*rgba[i+1]+.072*rgba[i+2];for(let k=0;k<3;k++){let v=(grayscale?gray:rgba[i+k])/255*slope+offset;if(invert)v=1-v;out[i+k]=Math.round(B.clamp(v,0,1)*255);}}
    return out;
  };
  B.cachedDisplay=(url,params)=>cache.get(B.displayKey(url,params))?.url;
  B.displayURL=(url,params)=>{
    const key=B.displayKey(url,params),entry=cache.get(key);if(entry)return entry.promise;
    const item={url:null,promise:null};cache.set(key,item);
    item.promise=(async()=>{const image=await B.loadImage(url),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);pixels.data.set(B.displayPixels(pixels.data,params));ctx.putImageData(pixels,0,0);item.url=canvas.toDataURL('image/png');let size=0;for(const [k,v] of cache)size+=k.length*2+(v.url?.length||0)*2;if(cache.size>512||size>128*1024*1024){for(const [k,v] of cache){if(k!==key&&v.url){cache.delete(k);size-=k.length*2+v.url.length*2;if(cache.size<=512&&size<=128*1024*1024)break;}}}return item.url;})().catch(error=>{cache.delete(key);throw error;});return item.promise;
  };
  B.prepareSVG=async svg=>{
    if(typeof DOMParser==='undefined')return svg;
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
    if(doc.querySelector('parsererror'))throw Error('导出 SVG 数据异常。');
    for(const image of doc.querySelectorAll('image[data-bs-display]')){
      const params=JSON.parse(image.getAttribute('data-bs-display')),url=image.getAttribute('href');
      const preview=await B.displayURL(url,params),decoded=await B.loadImage(preview);if(decoded.decode)await decoded.decode();image.setAttribute('href',preview);image.removeAttribute('filter');image.removeAttribute('data-bs-display');
    }
    return new XMLSerializer().serializeToString(doc);
  };
  // Safari 15 may report an SVG image decoded before its nested PNG has painted.
  // Draw our own SVG scene through Canvas2D, decoding each bitmap directly.
  B.drawSVG=async(svg,canvas)=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement,ctx=canvas.getContext('2d'),width=Number(root.getAttribute('width')),height=Number(root.getAttribute('height'));
    if(doc.querySelector('parsererror')||!(width>0&&height>0))throw Error('SVG 画布无效。');
    ctx.scale(canvas.width/width,canvas.height/height);
    const val=(node,key,fallback=0)=>{const text=node.getAttribute(key);return text===null?fallback:text.endsWith('%')?parseFloat(text)/100*(key==='width'?width:height):Number(text);};
    const draw=async node=>{
      if(['defs','clipPath','filter'].includes(node.localName))return;
      ctx.save();ctx.globalAlpha*=val(node,'opacity',1);
      for(const match of (node.getAttribute('transform')||'').matchAll(/(translate|scale|rotate)\(([^)]+)\)/g)){const a=match[2].trim().split(/[ ,]+/).map(Number);if(match[1]==='translate')ctx.translate(a[0],a[1]||0);else if(match[1]==='scale')ctx.scale(a[0],a[1]??a[0]);else{ctx.translate(a[1]||0,a[2]||0);ctx.rotate(a[0]*Math.PI/180);ctx.translate(-(a[1]||0),-(a[2]||0));}}
      const clip=node.getAttribute('clip-path')?.match(/url\(#([^)]*)\)/);if(clip){const r=doc.getElementById(clip[1])?.querySelector('rect');if(r){ctx.beginPath();ctx.rect(val(r,'x'),val(r,'y'),val(r,'width'),val(r,'height'));ctx.clip();}}
      ctx.strokeStyle=node.getAttribute('stroke')||'#000';ctx.fillStyle=node.getAttribute('fill')||'#000';ctx.lineWidth=val(node,'stroke-width',1);ctx.setLineDash((node.getAttribute('stroke-dasharray')||'').split(/[ ,]+/).filter(Boolean).map(Number));
      if(node.localName==='image'){let url=node.getAttribute('href');if(node.hasAttribute('data-bs-display'))url=await B.displayURL(url,JSON.parse(node.getAttribute('data-bs-display')));const image=await B.loadImage(url);if(image.decode)await image.decode();ctx.drawImage(image,val(node,'x'),val(node,'y'),val(node,'width'),val(node,'height'));}
      else if(node.localName==='rect'){if(node.getAttribute('fill')!=='none')ctx.fillRect(val(node,'x'),val(node,'y'),val(node,'width'),val(node,'height'));if(node.hasAttribute('stroke')&&node.getAttribute('stroke')!=='none'&&ctx.lineWidth>0)ctx.strokeRect(val(node,'x'),val(node,'y'),val(node,'width'),val(node,'height'));}
      else if(node.localName==='path'){const path=new Path2D(node.getAttribute('d'));if(node.getAttribute('fill')!=='none')ctx.fill(path);if(node.getAttribute('stroke')!=='none')ctx.stroke(path);}
      else if(node.localName==='text'){const size=val(node,'font-size',22),anchor=node.getAttribute('text-anchor');ctx.textAlign=anchor==='middle'?'center':anchor==='end'?'right':'left';let y=val(node,'y');for(const span of node.querySelectorAll('tspan')){y+=val(span,'dy');const shift=span.getAttribute('baseline-shift'),small=shift==='super'||shift==='sub';ctx.font=(node.getAttribute('font-style')||'normal')+' '+(node.getAttribute('font-weight')||'400')+' '+size*(small?.7:1)+'px '+(node.getAttribute('font-family')||'Arial');ctx.fillText(span.textContent,val(span,'x',val(node,'x')),y+(shift==='super'?-size*.35:shift==='sub'?size*.2:0));}}
      else for(const child of node.children)await draw(child);
      ctx.restore();
    };
    await draw(root);return canvas;
  };
})(globalThis.BS ||= {});
