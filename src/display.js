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
})(globalThis.BS ||= {});
