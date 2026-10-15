(function(B){
  'use strict';
  function packbits(a,expected){
    const out=new Uint8Array(expected);let at=0;
    for(let i=0;i<a.length;){const n=(a[i++]<<24)>>24;if(n>=0){const count=n+1;if(i+count>a.length)throw Error('PackBits 数据截断');if(at+count>expected)throw Error('TIFF 解压长度超过图像范围。');out.set(a.subarray(i,i+count),at);i+=count;at+=count;}else if(n!==-128){if(i>=a.length)throw Error('PackBits 数据截断');const count=1-n;if(at+count>expected)throw Error('TIFF 解压长度超过图像范围。');out.fill(a[i++],at,at+count);at+=count;}}
    if(at!==expected)throw Error('TIFF 解压长度不足。');return out;
  }
  function lzw(a,expected){
    let pos=0,bits=9,dict=[],next=258,prev=null,at=0,ended=false;const out=new Uint8Array(expected);
    function reset(){dict=Array.from({length:256},(_,i)=>Uint8Array.of(i));next=258;bits=9;prev=null;}reset();
    function code(){if(pos+bits>a.length*8)return null;let v=0;for(let i=0;i<bits;i++){v=(v<<1)|((a[pos>>3]>>(7-(pos&7)))&1);pos++;}return v;}
    for(let c;(c=code())!==null;){
      if(c===256){reset();continue;}if(c===257){ended=true;break;}let s=dict[c];
      if(!s&&c===next&&prev){s=new Uint8Array(prev.length+1);s.set(prev);s[prev.length]=prev[0];}if(!s)throw Error('无效 LZW 编码');
      if(at+s.length>expected)throw Error('TIFF 解压长度超过图像范围。');out.set(s,at);at+=s.length;
      if(prev&&next<4096){const n=new Uint8Array(prev.length+1);n.set(prev);n[prev.length]=s[0];dict[next++]=n;if(next===(1<<bits)-1&&bits<12)bits++;}prev=s;
    }
    if(at!==expected||!ended)throw Error('TIFF LZW 数据截断或缺少结束标记。');return out;
  }
  async function inflate(a,expected){
    if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持 Deflate TIFF，请转换为未压缩 TIFF。');
    const reader=new Blob([a]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),out=new Uint8Array(expected);let at=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;if(at+value.length>expected){await reader.cancel();throw Error('TIFF 解压长度超过图像范围。');}out.set(value,at);at+=value.length;}}finally{reader.releaseLock();}
    if(at!==expected)throw Error('TIFF 解压长度不足。');return out;
  }
  B.decodeTIFF=async buffer=>{
    if(ArrayBuffer.isView(buffer))buffer=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<8)throw Error('TIFF 文件头截断。');
    const a=new Uint8Array(buffer),d=new DataView(buffer),need=(off,len)=>{if(!Number.isSafeInteger(off)||!Number.isSafeInteger(len)||off<0||len<0||off+len>a.length)throw Error('TIFF 目录或标签数据截断。');},le=d.getUint16(0)===0x4949;
    if(![0x4949,0x4d4d].includes(d.getUint16(0))||d.getUint16(2,le)!==42)throw Error('只支持标准 TIFF；BigTIFF 请先无损导出为标准 TIFF。');
    let off=d.getUint32(4,le),pages=[],visited=new Set(),totalPixels=0;
    const supportedTags=new Set([256,257,258,259,262,266,273,274,277,278,279,284,317,339,322,323,324,325]);
    while(off){
      if(off<8||visited.has(off)||pages.length>=32)throw Error('TIFF 页数过多或目录异常。');visited.add(off);need(off,2);const n=d.getUint16(off,le);need(off,2+12*n+4);const tags={};
      for(let i=0;i<n;i++){
        const p=off+2+12*i,t=d.getUint16(p,le);if(!supportedTags.has(t))continue;
        if(tags[t])throw Error('TIFF 包含重复的关键标签。');
        const ty=d.getUint16(p+2,le),ct=d.getUint32(p+4,le),sz=({1:1,3:2,4:4})[ty];if(!sz||!ct)throw Error('TIFF 关键标签类型或数量无效。');
        if(ct>32000000)throw Error('TIFF 标签过大');if(![258,273,279,339].includes(t)&&ct!==1)throw Error('TIFF 关键标签数量无效。');const q=sz*ct<=4?p+8:d.getUint32(p+8,le);need(q,sz*ct);const v=[];
        for(let j=0;j<ct;j++)v.push(ty===1?d.getUint8(q+j):ty===3?d.getUint16(q+j*2,le):d.getUint32(q+j*4,le));tags[t]=v;
      }
      const v=(t,def)=>tags[t]?.[0]??def,w=v(256),h=v(257),depth=v(258,8),channels=v(277,1),comp=v(259,1),photo=v(262,1),predictor=v(317,1);
      if(!(w>0&&h>0)||w*h>32000000)throw Error('图像太大或尺寸无效，单页最多 3200 万像素。');
      totalPixels+=w*h;if(totalPixels>64000000)throw Error('TIFF 总像素超过 6400 万，请拆分多页文件。');
      if(![8,16].includes(depth)||(tags[258]&&![1,channels].includes(tags[258].length))||(tags[258]||[]).some(x=>x!==depth)||(tags[339]&&![1,channels].includes(tags[339].length))||(tags[339]||[1]).some(x=>x!==1)||!((channels===1&&[0,1].includes(photo))||(depth===8&&channels===3&&photo===2)))throw Error('支持 8/16-bit 无符号灰度及 8-bit RGB TIFF；不支持的类型不会转成 8-bit 冒充原始定量。');
      if(v(284,1)!==1||v(274,1)!==1||v(266,1)!==1||tags[322]||tags[323]||tags[324]||tags[325]||!tags[273]||!tags[279]||![1,2].includes(predictor))throw Error('暂不支持平面分离、特殊方向或分块 TIFF，请无损转换为 strips TIFF。');
      if(![1,5,8,32946,32773].includes(comp))throw Error('不支持这种 TIFF 压缩，请保存为未压缩、LZW、PackBits 或 Deflate。');
      const stride=w*channels*(depth/8),data=new Uint8Array(stride*h),offsets=tags[273],counts=tags[279],rows=v(278,h),stripCount=Math.ceil(h/rows);
      if(!(rows>0)||offsets.length!==stripCount||counts.length!==stripCount)throw Error('TIFF 条带数量与图像尺寸不匹配。');
      for(let i=0;i<stripCount;i++){
        need(offsets[i],counts[i]);if(!counts[i])throw Error('TIFF 条带数据为空。');const len=Math.min(rows,h-i*rows)*stride;let strip=a.subarray(offsets[i],offsets[i]+counts[i]);
        if(comp===32773)strip=packbits(strip,len);else if(comp===5)strip=lzw(strip,len);else if(comp===8||comp===32946)strip=await inflate(strip,len);
        if(strip.length!==len)throw Error('TIFF 条带长度与图像尺寸不匹配。');data.set(strip,i*rows*stride);
      }
      const samples=depth===16?new Uint16Array(w*h):new Uint8Array(w*h),dv=new DataView(data.buffer),max=2**depth-1;
      if(predictor===2){for(let y=0;y<h;y++)for(let x=channels;x<w*channels;x++){const p=(y*w*channels+x)*(depth/8),q=p-channels*(depth/8);if(depth===16)dv.setUint16(p,(dv.getUint16(p,le)+dv.getUint16(q,le))&65535,le);else data[p]=(data[p]+data[q])&255;}}
      for(let i=0;i<w*h;i++){let z=channels===3?Math.round(.299*data[i*3]+.587*data[i*3+1]+.114*data[i*3+2]):depth===16?dv.getUint16(i*2,le):data[i];samples[i]=photo===0?max-z:z;}
      pages.push({width:w,height:h,bitDepth:depth,samples,info:'TIFF '+depth+'-bit'+(channels===3?' RGB luminance':' native grayscale')});off=d.getUint32(off+2+12*n,le);
    }
    if(!pages.length)throw Error('TIFF 不含可解码的图像页。');return pages;
  };
  B.encodeTIFF=(rgba,w,h,dpi=300)=>{
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>64000000||!(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray)||rgba.length!==w*h*4||!Number.isInteger(dpi)||dpi<1||dpi>65535)throw Error('TIFF 导出尺寸、RGBA 像素或 DPI 无效。');
    const tags=12,offset=8+2+12*tags+4,extra=22,pixelsAt=offset+extra,buf=new ArrayBuffer(pixelsAt+w*h*3),v=new DataView(buf),a=new Uint8Array(buf);v.setUint16(0,0x4949);v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,tags,true);
    const values=[[256,4,1,w],[257,4,1,h],[258,3,3,offset],[259,3,1,1],[262,3,1,2],[273,4,1,pixelsAt],[277,3,1,3],[278,4,1,h],[279,4,1,w*h*3],[282,5,1,offset+6],[283,5,1,offset+14],[296,3,1,2]];
    values.forEach(([t,ty,n,val],i)=>{const p=10+i*12;v.setUint16(p,t,true);v.setUint16(p+2,ty,true);v.setUint32(p+4,n,true);if(ty===3&&n===1)v.setUint16(p+8,val,true);else v.setUint32(p+8,val,true);});[0,2,4].forEach(p=>v.setUint16(offset+p,8,true));v.setUint32(offset+6,dpi,true);v.setUint32(offset+10,1,true);v.setUint32(offset+14,dpi,true);v.setUint32(offset+18,1,true);
    for(let i=0;i<w*h;i++){const alpha=rgba[i*4+3]/255;for(let k=0;k<3;k++)a[pixelsAt+i*3+k]=Math.round(rgba[i*4+k]*alpha+255*(1-alpha));}return a;
  };
})(globalThis.BS ||= {});
