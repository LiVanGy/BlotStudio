(function(B){
  'use strict';
  B.sourceFromPixels=(name,width,height,bitDepth,samples,extra={})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),im=ctx.createImageData(width,height),max=2**bitDepth-1;
    for(let i=0;i<samples.length;i++){const v=Math.round(samples[i]*255/max);im.data.set([v,v,v,255],i*4);}ctx.putImageData(im,0,0);
    let bytes;if(bitDepth===16){bytes=new Uint8Array(samples.length*2);const d=new DataView(bytes.buffer);samples.forEach((v,i)=>d.setUint16(i*2,v,true));}else bytes=new Uint8Array(samples);
    return {id:B.uid(),name,width,height,bitDepth,pixels:B.base64(bytes),url:canvas.toDataURL('image/png'),created:new Date().toISOString(),...extra};
  };
  B.importImage=async file=>{
    if(file.size>80*1024*1024)throw Error(file.name+' 超过 80 MB，请先拆页。');const buf=await file.arrayBuffer(),a=new Uint8Array(buf);let hash;
    if(globalThis.crypto?.subtle)hash='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)),n=>n.toString(16).padStart(2,'0')).join('');else hash='crc32:'+B.crc32(a).toString(16).padStart(8,'0');
    const mime=a[0]===73&&a[1]===73||a[0]===77&&a[1]===77?'image/tiff':a[0]===137&&a[1]===80?'image/png':a[0]===255&&a[1]===216?'image/jpeg':a[0]===82&&a[8]===87?'image/webp':null;
    if(!mime)throw Error('支持 PNG、JPEG、WebP 和 TIFF；SVG 请作为文本/形状重新编辑。');
    const original='data:'+mime+';base64,'+B.base64(a),extra={original,hash,originalSize:file.size,originalName:file.name};
    if(mime==='image/tiff'){const pages=await B.decodeTIFF(buf);return pages.map((p,i)=>B.sourceFromPixels(file.name+(pages.length>1?' · 第'+(i+1)+'页':''),p.width,p.height,p.bitDepth,p.samples,{...extra,info:p.info}));}
    if(mime==='image/png'&&a[24]>8)throw Error('PNG 是高位深图像。请将高位深原图无损导出为 16-bit 灰度 TIFF，避免定量降位深。');
    const im=await B.loadImage(original);if(im.width*im.height>32000000)throw Error('单图最多 3200 万像素。');const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data,p=new Uint8Array(c.width*c.height);for(let i=0;i<p.length;i++)p[i]=Math.round(.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2]);
    const s=B.sourceFromPixels(file.name,c.width,c.height,8,p,{...extra,info:'8-bit RGB luminance'});s.url=c.toDataURL('image/png');return[s];
  };
  B.loadImage=url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('图像解码失败。'));im.src=url;});
  const nativeSaves=new Map();
  B.nativeSaveResult=(id,status,message='')=>{const request=nativeSaves.get(id);if(!request)return;nativeSaves.delete(id);clearTimeout(request.timer);if(status==='saved')request.resolve({status:'saved'});else request.reject(Error(status==='cancelled'?'已取消保存，文件没有写入。':message||'保存失败，请重试。'));};
  B.saveFile=async(name,data,mime='application/octet-stream')=>{
    name=String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim()||'BlotStudio-export';
    const bytes=typeof data==='string'?B.utf8(data):data instanceof Blob?new Uint8Array(await data.arrayBuffer()):data;
    if(!(bytes instanceof Uint8Array))throw Error('导出数据格式无效。');
    const postNative=globalThis.chrome?.webview?.postMessage?body=>chrome.webview.postMessage({type:'saveFile',...body}):globalThis.webkit?.messageHandlers?.saveFile?body=>webkit.messageHandlers.saveFile.postMessage(body):null;
    if(postNative){
      if(nativeSaves.size)throw Error('请先完成或取消当前保存对话框。');
      const id=B.uid();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{nativeSaves.delete(id);reject(Error('没有收到保存确认，请检查保存对话框。'));},600000);nativeSaves.set(id,{resolve,reject,timer});try{postNative({id,name,data:B.base64(bytes)});}catch(error){clearTimeout(timer);nativeSaves.delete(id);reject(error);}});
    }
    const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return{status:'downloaded'};
  };
  B.db={
    open:()=>new Promise((resolve,reject)=>{const r=indexedDB.open('BlotStudio-local-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('本地数据库被其他窗口占用，请关闭其他 BlotStudio 窗口后重试。'));}),
    read:async()=>{const db=await B.db.open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readonly'),r=tx.objectStore('projects').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});},
    write:async project=>{const db=await B.db.open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||Error('本地保存事务已取消。'));};});}
  };
  B.demoProject=()=>{
    const p=B.blankProject(),g=p.groups[0];g.name='细胞蛋白';p.demo=true;g.demo=true;
    let seed=7031;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    for(let k=0;k<3;k++){const w=720,h=68,a=new Uint8Array(w*h),strength=k===0?[.32,.34,.37,.43,.45,.48,.59,.61,.65,.75,.79,.83]:Array.from({length:12},()=>.71+rand()*.10);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=236+(rand()-.5)*9+4*Math.sin(x/80);for(let j=0;j<12;j++){const dx=(x-(j+.5)*w/12)/18,dy=(y-34-Math.sin(j*2)*1.2)/5.3;v-=strength[j]*220*Math.exp(-.5*(dx**6+dy**2));}a[y*w+x]=B.clamp(Math.round(v),0,255);}const s=B.sourceFromPixels(['p-Akt','Akt','β-Actin'][k]+' · 模拟条带.png',w,h,8,a,{demo:true,hash:'synthetic-demo'});p.sources.push(s);const o=B.imageObject(s,k);o.protein=['p-Akt','Akt','β-Actin'][k];o.name=o.protein;o.mw=k===2?'42':'60';o.rois=B.autoROIs(o.crop,12);g.objects.push(o);}
    g.objects.filter(o=>o.type==='image').forEach(o=>o.demo=true);g.objects[0].referenceId=g.objects[1].id;g.objects[1].referenceId=g.objects[2].id;B.quickLayout(g);B.log(p,'创建演示项目','所有条带均为算法生成的模拟图像，不代表实验结果。');return p;
  };
})(globalThis.BS ||= {});
