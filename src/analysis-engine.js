(function(B){
  'use strict';
  // Rolling-ball geometry, shrink rules and interpolation follow the public-domain
  // ImageJ1 BackgroundSubtracter (Wayne Rasband / Michael Schmid), not WBsolverunion.
  // https://github.com/imagej/ImageJ/blob/master/ij/plugin/filter/BackgroundSubtracter.java
  const f=Math.fround,cache=new WeakMap();
  B.analysisDefaults=()=>({convert8:true,rgb:'mean',background:'rolling',radius:50,presmooth:true,method:'rect',rotation:0});
  B.validateAnalysis=a=>{
    if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.convert8!=='boolean'||!['mean','luminance'].includes(a.rgb)||!['none','roi','rolling'].includes(a.background)||!Number.isInteger(a.radius)||a.radius<0||a.radius>100||typeof a.presmooth!=='boolean'||!['rect','ellipse','profile'].includes(a.method))throw Error('灰度方法参数无效。');
    if(a.profileAxis!==undefined&&!['x','y'].includes(a.profileAxis))throw Error('峰图方向无效。');
    if(a.rotation!==undefined&&(!Number.isFinite(a.rotation)||Math.abs(a.rotation)>180))throw Error('分析旋转角度无效。');
    return a;
  };
  function smooth(p,w,h){
    const line=(start,step,length)=>{let b=p[start],c=b;for(let i=0,k=start;i<length;i++,k+=step){const a=b;b=c;if(i<length-1)c=p[k+step];p[k]=f(f(f(a+b)+c)*f(1/3));}};
    for(let y=0;y<h;y++)line(y*w,1,w);for(let x=0;x<w;x++)line(x,w,h);
  }
  B.rollingBackground=(input,w,h,radius,presmooth=true,light=true)=>{
    if(input.length!==w*h||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||!Number.isFinite(radius)||radius<=0||radius>100)throw Error('滚球背景参数无效。');
    const p=Float32Array.from(input,v=>light?-v:v);if(presmooth)smooth(p,w,h);
    let shrink=radius<=10?1:radius<=30?2:4;
    // ImageJ's interpolation requires two shrunken points in each dimension.
    // Thin images are evaluated at full resolution instead of indexing outside.
    if(Math.ceil(w/shrink)<2||Math.ceil(h/shrink)<2)shrink=1;
    const r=Math.max(1,radius/shrink),trim=radius<=30?24:32,half=Math.round(r-Math.floor(trim*r/100)),bw=half*2+1,ball=new Float32Array(bw*bw);
    for(let y=0;y<bw;y++)for(let x=0;x<bw;x++)ball[y*bw+x]=Math.sqrt(Math.max(0,r*r-(x-half)**2-(y-half)**2));
    const sw=Math.ceil(w/shrink),sh=Math.ceil(h/shrink),s=new Float32Array(sw*sh);
    for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){let min=Infinity;for(let yy=y*shrink;yy<Math.min(h,(y+1)*shrink);yy++)for(let xx=x*shrink;xx<Math.min(w,(x+1)*shrink);xx++)min=Math.min(min,p[yy*w+xx]);s[y*sw+x]=min;}
    const original=s.slice();s.fill(-Infinity);
    for(let cy=-half;cy<sh+half;cy++)for(let cx=-half;cx<sw+half;cx++){
      const x0=Math.max(0,cx-half),x1=Math.min(sw-1,cx+half),y0=Math.max(0,cy-half),y1=Math.min(sh-1,cy+half);let z=Infinity;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)z=Math.min(z,f(original[y*sw+x]-ball[(y-cy+half)*bw+x-cx+half]));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)s[y*sw+x]=Math.max(s[y*sw+x],f(z+ball[(y-cy+half)*bw+x-cx+half]));
    }
    const out=new Float32Array(w*h);
    if(shrink===1){for(let i=0;i<out.length;i++)out[i]=light?-s[i]:s[i];return out;}
    const interp=(i,length)=>{const n=Math.min(Math.trunc((i-Math.floor(shrink/2))/shrink),length-2),weight=f(1-f(f((i+.5)/shrink)-f(n+.5)));return[n,weight];};
    for(let y=0;y<h;y++){const [iy,wy]=interp(y,sh);for(let x=0;x<w;x++){const [ix,wx]=interp(x,sw),v0=f(f(s[iy*sw+ix]*wx)+f(s[iy*sw+ix+1]*f(1-wx))),v1=f(f(s[(iy+1)*sw+ix]*wx)+f(s[(iy+1)*sw+ix+1]*f(1-wx))),v=f(f(v0*wy)+f(v1*f(1-wy)));out[y*w+x]=light?-v:v;}}
    return out;
  };
  B.analysisPixels=(source,settings)=>{
    const a=B.validateAnalysis(settings),key=JSON.stringify(a),existing=cache.get(source),native=B.pixels(source);
    if(existing?.key===key&&existing.native===native&&existing.rgbPayload===source.rgbPixels&&existing.sourceInfo===source.info)return existing;
    let values=Float64Array.from(native),depth=source.bitDepth,range8=null;
    if(a.rgb==='mean'&&!source.rgbPixels&&/RGB/i.test(source.info||''))throw Error('旧彩色图像未保存原始 RGB 通道；请重新上传原图后使用 ImageJ 等权平均。');
    if(a.rgb==='mean'&&source.rgbPixels){const rgb=B.unbase64(source.rgbPixels);if(rgb.length!==native.length*3)throw Error('原始 RGB 像素损坏。');values=Float64Array.from(native,(_,i)=>Math.floor((rgb[i*3]+rgb[i*3+1]+rgb[i*3+2])/3+.5));}
    if(a.convert8&&depth===16){let lo=Infinity,hi=-Infinity;for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}range8=[lo,hi];const scale=hi>lo?256/(hi-lo+1):0;values=Float64Array.from(values,v=>B.clamp(Math.floor((v-lo)*scale+.5),0,255));depth=8;}
    let rotatedClipping=null;
    if(a.rotation){
      const angle=a.rotation*Math.PI/180,quarterTurn=a.rotation%90===0;
      const cos=quarterTurn?Math.round(Math.cos(angle)):Math.cos(angle);
      const sin=quarterTurn?Math.round(Math.sin(angle)):Math.sin(angle);
      const {width,height}=source,cx=(width-1)/2,cy=(height-1)/2;
      const original=values,fill=a.polarity==='light'?0:2**depth-1;
      const nativeMax=2**source.bitDepth-1;
      const clipped=i=>native[i]===0||native[i]===nativeMax;
      if(native.some(v=>v===0||v===nativeMax))rotatedClipping=new Uint8Array(original.length);
      values=new Float64Array(original.length);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const sx=cos*(x-cx)+sin*(y-cy)+cx,sy=-sin*(x-cx)+cos*(y-cy)+cy;
        const i=y*width+x;
        if(sx<0||sy<0||sx>width-1||sy>height-1){values[i]=fill;continue;}
        const left=Math.floor(sx),top=Math.floor(sy),right=Math.min(width-1,left+1),bottom=Math.min(height-1,top+1);
        const tl=top*width+left,tr=top*width+right,bl=bottom*width+left,br=bottom*width+right;
        const dx=sx-left,dy=sy-top;
        values[i]=Math.round((1-dy)*((1-dx)*original[tl]+dx*original[tr])+dy*((1-dx)*original[bl]+dx*original[br]));
        if(rotatedClipping){
          // A rotated ROI pixel is flagged if a contributing source intensity reached an endpoint.
          rotatedClipping[i]=Number(clipped(tl)||(dx>0&&clipped(tr))||(dy>0&&clipped(bl))||(dx>0&&dy>0&&clipped(br)));
        }
      }
    }
    const result={key,values,depth,max:2**depth-1,native,rotatedClipping,range8,rgbPayload:source.rgbPixels,sourceInfo:source.info};
    cache.set(source,result);
    return result;
  };
  B.preparedSignal=(source,settings,polarity)=>{
    const prepared=B.analysisPixels(source,{...settings,polarity}),key=polarity+'Signal';if(prepared[key])return prepared[key];
    const {values,max}=prepared;let background=null;
    if(settings.background==='rolling'&&settings.radius>0)background=B.rollingBackground(values,source.width,source.height,settings.radius,settings.presmooth,polarity==='dark');
    // ImageJ integer processors round and clip after subtraction. The source is immutable.
    const corrected=Float64Array.from(values,(v,i)=>{if(!background)return polarity==='dark'?max-v:v;const result=Math.floor(B.clamp(f(f(v-background[i])+(polarity==='dark'?max+.5:.5)),0,max));return polarity==='dark'?max-result:result;});
    return prepared[key]={...prepared,corrected,background};
  };
  B.profileArea=(values,baselineStart=0,baselineEnd=0)=>{
    if(!values.length||!values.every(Number.isFinite)||![baselineStart,baselineEnd].every(Number.isFinite))throw Error('峰图或基线无效。');
    const baseline=values.map((_,i)=>baselineStart+(baselineEnd-baselineStart)*i/Math.max(1,values.length-1)),signal=values.map((v,i)=>Math.max(0,v-baseline[i]));
    let area=0;for(let i=1;i<signal.length;i++)area+=(signal[i-1]+signal[i])/2;
    return{values,baseline,signal,area};
  };
  B.quantify=(source,roi,background,polarity,settings)=>{
    const {values,corrected,max,depth,native,rotatedClipping,range8}=B.preparedSignal(source,settings,polarity),r=B.rectPixels(source,roi),method=roi.shape||settings.method;
    const indices=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(method!=='ellipse'||((x+.5-(roi.x+roi.w/2))/(roi.w/2))**2+((y+.5-(roi.y+roi.h/2))/(roi.h/2))**2<=1)indices.push(y*source.width+x);
    if(!indices.length)throw Error('选区不包含像素。');
    const nativeMax=2**source.bitDepth-1;
    let sum=0,raw=0,total=0,sat=0,lo=Infinity,hi=-Infinity;for(const i of indices){const v=values[i];sum+=v;raw+=polarity==='dark'?max-v:v;total+=corrected[i];sat+=rotatedClipping?rotatedClipping[i]:Number(native[i]===0||native[i]===nativeMax);lo=Math.min(lo,v);hi=Math.max(hi,v);}
    let bg=null,bgRect=null;if(settings.background==='roi'&&background){bgRect=B.rectPixels(source,background);let n=0,v=0;for(let y=bgRect.y;y<bgRect.y+bgRect.h;y++)for(let x=bgRect.x;x<bgRect.x+bgRect.w;x++){v+=values[y*source.width+x];n++;}bg=v/n;total=polarity==='dark'?bg*indices.length-sum:sum-bg*indices.length;}
    const missingBackground=settings.background==='roi'&&bg===null;
    let profile=null;
    if(missingBackground){
      total=null;
    }else if(method==='profile'){
      const axis=settings.profileAxis||'y';
      const length=axis==='x'?r.w:r.h,divisor=axis==='x'?r.h:r.w;
      const rows=Array(length).fill(0);
      for(let y=0;y<r.h;y++){
        for(let x=0;x<r.w;x++){
          const index=(r.y+y)*source.width+r.x+x;
          let signal=corrected[index];
          if(bg!==null)signal=polarity==='dark'?bg-values[index]:values[index]-bg;
          rows[axis==='x'?x:y]+=signal;
        }
      }
      let minimum=Infinity;
      for(let i=0;i<rows.length;i++){
        rows[i]/=divisor;
        minimum=Math.min(minimum,rows[i]);
      }
      profile={...B.profileArea(rows,roi.baselineStart??minimum,roi.baselineEnd??minimum),axis};
      total=profile.area;
    }
    return{area:indices.length,mean:sum/indices.length,min:lo,max:hi,raw,rawIntDen:sum,corrected:total,backgroundMean:bg,saturation:sat/indices.length,rect:r,backgroundRect:bgRect,clipped:roi.x<0||roi.y<0||roi.x+roi.w>source.width||roi.y+roi.h>source.height,backgroundClipped:!!background&&(background.x<0||background.y<0||background.x+background.w>source.width||background.y+background.h>source.height),analysisBitDepth:depth,method,profile,coordinateFrame:settings.rotation?'校正旋转 '+settings.rotation+'° 副本':'原图',range8,analysisSettings:range8?{...settings,range8}:{...settings},units:method==='profile'?'mean intensity × profile pixel':'gray level × pixel'};
  };
  B.detectBandROIs=(source,crop,count,settings=B.analysisDefaults(),polarity='dark')=>{
    const signal=B.preparedSignal(source,settings,polarity).corrected,rois=B.autoROIs(crop,count);
    return rois.map(r=>{const box=B.rectPixels(source,{x:r.x,y:crop.y,w:r.w,h:crop.h}),rows=Array(box.h).fill(0);for(let y=0;y<box.h;y++)for(let x=box.x;x<box.x+box.w;x++)rows[y]+=signal[(box.y+y)*source.width+x];let peak=0;for(let i=1;i<rows.length;i++)if(rows[i]>rows[peak])peak=i;const hh=Math.min(crop.h,Math.max(4,crop.h*.45));return{...r,y:B.clamp(box.y+peak-hh/2,crop.y,crop.y+crop.h-hh),h:hh};});
  };
})(globalThis.BS ||= {});
