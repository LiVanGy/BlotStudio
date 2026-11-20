(function(B){
  'use strict';
  // A small, offline JavaScript implementation of specific ImageJ1 measurement
  // definitions. This is NOT the ImageJ Java runtime, GelAnalyzer, or rolling ball.
  // Sources: https://imagej.net/ij/developer/source/ij/plugin/filter/Analyzer.java.html
  //          https://imagej.net/ij/developer/source/ij/gui/ProfilePlot.java.html
  // Only unsigned native 8/16-bit values, no threshold or spatial/intensity
  // calibration, and the effective integer rectangle from B.rectPixels are used.
  const scope='ImageJ1 方法兼容层：未校准、无阈值的整数矩形测量和行列均值曲线；反相固定使用全位深范围。不是完整 ImageJ 引擎、Gel Analyzer 或滚动球。';
  function options(value,allowed){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('当前 ImageJ 方法仅支持未校准、无阈值的矩形测量；选项无效或不受支持。');
    return value;
  }
  const imagej={scope,upstream:{
    grayscaleLut:'https://wsr.imagej.net/ij/developer/source/ij/io/FileOpener.java.html',
    measurement:'https://imagej.net/ij/developer/source/ij/plugin/filter/Analyzer.java.html',
    profiles:'https://imagej.net/ij/developer/source/ij/gui/ProfilePlot.java.html'
  }};
  // Projects predating tiffWhiteIsZero retain the exact TIFF as a data URL.
  // Read only its header and the selected IFD instead of decoding all pixels.
  const legacyPhotometry=new WeakMap();
  imagej.whiteIsZero=source=>{
    if(typeof source.tiffWhiteIsZero==='boolean')return source.tiffWhiteIsZero;
    const original=source.original, prefix='data:image/tiff;base64,';
    if(!original?.startsWith(prefix)){
      if(!original&&!source.demo&&(source.info?.startsWith('TIFF ')||/\.tiff?(?: · 第\d+页)?$/i.test(source.originalName||source.name)))throw Error('缺少旧项目的 TIFF 原件，无法核对原始码值方向。请重新导入原图后进行 ImageJ 复核。');
      return false;
    }
    const page=source.name===source.originalName?1:Number(/ · 第(\d+)页$/.exec(source.name)?.[1]||1);
    const cached=legacyPhotometry.get(source);
    if(cached?.original===original&&cached.page===page)return cached.whiteIsZero;
    const read=(offset,length)=>{
      const first=Math.floor(offset/3),skip=offset-first*3;
      const bytes=B.unbase64(original.slice(prefix.length+4*first,prefix.length+4*Math.ceil((offset+length)/3)));
      return new DataView(bytes.buffer,bytes.byteOffset+skip,length);
    };
    try{
      const header=read(0,8),order=header.getUint16(0),le=order===0x4949;
      if((!le&&order!==0x4d4d)||header.getUint16(2,le)!==42||page<1||page>32)throw Error();
      let offset=header.getUint32(4,le);
      for(let index=1;index<=page;index++){
        if(offset<8)throw Error();
        const count=read(offset,2).getUint16(0,le);
        if(index<page){offset=read(offset+2+count*12,4).getUint32(0,le);continue;}
        const entries=read(offset+2,count*12);let whiteIsZero=false;
        for(let at=0;at<count*12;at+=12){
          if(entries.getUint16(at,le)!==262)continue;
          const type=entries.getUint16(at+2,le);
          if(entries.getUint32(at+4,le)!==1||![1,3,4].includes(type))throw Error();
          const photometric=type===3?entries.getUint16(at+8,le):type===4?entries.getUint32(at+8,le):entries.getUint8(at+8);
          if(![0,1,2].includes(photometric))throw Error();
          whiteIsZero=photometric===0;break;
        }
        legacyPhotometry.set(source,{original,page,whiteIsZero});return whiteIsZero;
      }
    }catch{throw Error('旧项目的 TIFF 原件或页号无法核对。请重新导入原图后进行 ImageJ 复核。');}
  };
  imagej.measure=(source,rect,config={})=>{
    const {polarity='dark',background=null}=options(config,['polarity','background']);
    const m=B.measure(source,rect,background,polarity);
    const whiteIsZero=imagej.whiteIsZero(source),max=2**source.bitDepth-1;
    const sum=whiteIsZero?max*m.area-m.rawIntDen:m.rawIntDen;
    const backgroundMean=whiteIsZero&&m.backgroundMean!==null?max-m.backgroundMean:m.backgroundMean;
    return {
      Area:m.area,Mean:sum/m.area,RawIntDen:sum,IntDen:sum,
      DirectionalSignal:m.raw,CorrectedSignal:m.corrected,BackgroundMean:backgroundMean,
      rect:{...m.rect},backgroundRect:m.backgroundRect?{...m.backgroundRect}:null,
      Clipped:m.clipped,BackgroundClipped:m.backgroundClipped,Polarity:polarity,BitDepth:source.bitDepth
    };
  };
  imagej.profile=(source,rect,config={})=>{
    const {axis='x',invert=false}=options(config,['axis','invert']);
    if(!['x','y'].includes(axis)||typeof invert!=='boolean')throw Error('曲线方向必须为 x 或 y，反相选项必须为布尔值。');
    const invertBrightness=imagej.whiteIsZero(source)!==invert;
    const pixels=B.pixels(source),r=B.rectPixels(source,rect),length=axis==='x'?r.w:r.h,denominator=axis==='x'?r.h:r.w,values=Array(length).fill(0),max=2**source.bitDepth-1;
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){
      const value=pixels[y*source.width+x];values[axis==='x'?x-r.x:y-r.y]+=invertBrightness?max-value:value;
    }
    for(let i=0;i<length;i++)values[i]/=denominator;
    // coords are absolute original-image positions, not plot distances or
    // rendered SVG coordinates. One element corresponds to one pixel column/row.
    return {coords:Array.from({length},(_,i)=>(axis==='x'?r.x:r.y)+i),values,rect:{...r},axis,invert};
  };
  B.imagej=imagej;
})(globalThis.BS ||= {});
