(function(B){
  'use strict';
  // MIT @tomagranate/liquid-glass, pinned in vendor/liquid-glass.
  // Only an ambient backdrop copy is refracted. Text, original WB pixels,
  // scientific SVGs and export canvases never enter a filter or texture.
  const controllers=[];
  const reduced=matchMedia('(prefers-reduced-transparency: reduce)');
  const selectors='.app-header nav,.glass-toolbar,.sidebar,.inspector,.editor-center,.content-page,.analysis-page,.glass-popover,.modal,.zoom-control';
  B.liquidOptics={engine:'@tomagranate/liquid-glass',version:'efe48923a08c026b77158f3df0317f83571a038d',count:0};
  const destroy=()=>{for(const item of controllers.splice(0)){item.mapResize.disconnect();item.ctrl.destroy();item.host.removeEventListener('scroll',item.scroll);item.refraction.remove();item.sheen.remove();Object.assign(item.host.style,item.original);item.host.removeAttribute('data-liquid-surface');}B.liquidOptics.count=0;};
  const mount=()=>{
    if(reduced.matches||!globalThis.LiquidGlassOptics?.createGlassController){B.liquidOptics.reason='reduced-transparency';return;}
    const maps=[];
    for(const host of document.querySelectorAll(selectors)){
      if(host.hidden||host.getBoundingClientRect().width<2||host.closest('[hidden]'))continue;
      const original={position:host.style.position,overflow:host.style.overflow,isolation:host.style.isolation,background:host.style.background,boxShadow:host.style.boxShadow,borderRadius:host.style.borderRadius};
      const refraction=document.createElement('div'),backdrop=document.createElement('div'),sheen=document.createElement('div'),sourceClip=document.createElement('div');refraction.className='lq-refraction';refraction.style.transform='translateZ(0)';backdrop.className='lq-backdrop';sheen.className='lq-sheen';refraction.setAttribute('aria-hidden','true');sheen.setAttribute('aria-hidden','true');sourceClip.className='lq-source-clip';Object.assign(sourceClip.style,{position:'absolute',inset:'0',overflow:'hidden'});sourceClip.append(backdrop);refraction.append(sourceClip);
      for(const child of host.children){if(getComputedStyle(child).position==='static')child.style.position='relative';child.style.zIndex='2';}
      host.prepend(refraction,sheen);host.setAttribute('data-liquid-surface','');
      const computed=getComputedStyle(host),overflow=computed.overflow,radius=parseFloat(computed.borderRadius)||18,large=host.clientHeight>160;
      const ctrl=LiquidGlassOptics.createGlassController(host,{refraction,backdrop,sheen},{radius,depth:large?18:12,scale:large?38:26,blur:.35,chroma:.16,specular:.14,dpr:.75,rimLight:.9,tint:'rgba(255,255,255,.08)',shadow:'0 12px 36px rgba(35,72,96,.12),inset 0 1px 0 rgba(255,255,255,.85)'});
      host.style.overflow=(overflow==='auto'||overflow==='scroll')?overflow:'hidden';refraction.style.clipPath='inset(0 round '+radius+'px)';
      const alignMap=()=>{const id=refraction.style.filter.match(/#([^"')\s]+)/)?.[1],image=id&&document.getElementById(id)?.querySelector('feImage');if(image){image.setAttribute('x','0');image.setAttribute('y','0');image.setAttribute('width',String(refraction.clientWidth));image.setAttribute('height',String(refraction.clientHeight));host.dataset.liquidMapPixels=refraction.clientWidth+'x'+refraction.clientHeight;}};alignMap();const mapResize=new ResizeObserver(alignMap);mapResize.observe(host);
      const scroll=()=>{const y=host.scrollTop;for(const layer of [refraction,sheen]){layer.style.top=y+'px';layer.style.height=host.clientHeight+'px';layer.style.bottom='auto';}};scroll();host.addEventListener('scroll',scroll,{passive:true});
      controllers.push({host,ctrl,scroll,refraction,sheen,original,mapResize});
    }
    B.liquidOptics.count=controllers.length;B.liquidOptics.reason='svg-refraction';
    for(const image of document.querySelectorAll('svg defs feImage')){const url=image.getAttribute('href')||image.getAttribute('xlink:href');if(url?.startsWith('data:image/'))maps.push(B.loadImage(url).then(image=>image.decode?.()).catch(()=>{}));}
    B.opticsReady=Promise.all(maps);
  };
  const render=B.render;B.render=()=>{const before=document.getElementById('app')?.firstElementChild;render();if(document.getElementById('app')?.firstElementChild===before)return;destroy();mount();};
  reduced.addEventListener?.('change',()=>{destroy();B.render();});
  addEventListener('pagehide',destroy);
})(globalThis.BS ||= {});
