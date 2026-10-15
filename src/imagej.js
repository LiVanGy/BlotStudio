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
    measurement:'https://imagej.net/ij/developer/source/ij/plugin/filter/Analyzer.java.html',
    profiles:'https://imagej.net/ij/developer/source/ij/gui/ProfilePlot.java.html'
  }};
  imagej.measure=(source,rect,config={})=>{
    const {polarity='dark',background=null}=options(config,['polarity','background']);
    const m=B.measure(source,rect,background,polarity);
    return {
      Area:m.area,Mean:m.mean,RawIntDen:m.rawIntDen,IntDen:m.area*m.mean,
      DirectionalSignal:m.raw,CorrectedSignal:m.corrected,BackgroundMean:m.backgroundMean,
      rect:{...m.rect},backgroundRect:m.backgroundRect?{...m.backgroundRect}:null,
      Clipped:m.clipped,BackgroundClipped:m.backgroundClipped,Polarity:polarity,BitDepth:source.bitDepth
    };
  };
  imagej.profile=(source,rect,config={})=>{
    const {axis='x',invert=false}=options(config,['axis','invert']);
    if(!['x','y'].includes(axis)||typeof invert!=='boolean')throw Error('曲线方向必须为 x 或 y，反相选项必须为布尔值。');
    const pixels=B.pixels(source),r=B.rectPixels(source,rect),length=axis==='x'?r.w:r.h,denominator=axis==='x'?r.h:r.w,values=Array(length).fill(0),max=2**source.bitDepth-1;
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){
      const value=pixels[y*source.width+x];values[axis==='x'?x-r.x:y-r.y]+=invert?max-value:value;
    }
    for(let i=0;i<length;i++)values[i]/=denominator;
    // coords are absolute original-image positions, not plot distances or
    // rendered SVG coordinates. One element corresponds to one pixel column/row.
    return {coords:Array.from({length},(_,i)=>(axis==='x'?r.x:r.y)+i),values,rect:{...r},axis,invert};
  };
  B.imagej=imagej;
})(globalThis.BS ||= {});
