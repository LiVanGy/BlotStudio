(function(B){
  'use strict';
  // The native compositor samples the real DOM backdrop through CSS. A read-only
  // app-scene texture supplies only a thin refracting rim on both WebKit and Blink.
  // This is an Apple-style web material, not Apple's private native material.
  const NS='http://www.w3.org/2000/svg',surfaces=[],events=[];
  const reduceTransparency=matchMedia('(prefers-reduced-transparency: reduce)'),reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const selector='.app-header nav,.glass-toolbar,.sidebar,.inspector,.glass-popover,.modal,.zoom-control';
  let serial=0,frame=0,pointerFrame=0,lastRoot=null,lastPointer=null,disposed=false;
  const make=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  const decode=url=>B.loadImage(url).then(img=>img.decode?.()).catch(()=>{});
  const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);events.push([target,type,handler,options]);};
  B.liquidOptics={engine:'@tomagranate/liquid-glass',version:'efe48923a08c026b77158f3df0317f83571a038d',count:0,reason:'live-dom-backdrop-and-scene-rim',liveVersion:0};
  B.opticsReady=Promise.resolve();
  const ready=pending=>Promise.all(pending).catch(error=>{B.liquidOptics.lastError=String(error.message||error);});
  function resetPointer(){
    if(pointerFrame)cancelAnimationFrame(pointerFrame);pointerFrame=0;lastPointer=null;
    for(const item of surfaces){item.host.style.removeProperty('--glass-pointer-x');item.host.style.removeProperty('--glass-pointer-y');item.host.style.removeProperty('--glass-pointer-strength');item.host.removeAttribute('data-glass-pressed');}
  }
  function destroy(){
    if(frame)cancelAnimationFrame(frame);frame=0;resetPointer();
    for(const item of surfaces.splice(0)){
      item.resize.disconnect();item.refraction.remove();item.sheen.remove();
      for(const child of item.children)Object.assign(child.node.style,child.style);
      Object.assign(item.host.style,item.original);
      for(const name of ['data-live-glass-host','data-liquid-surface','data-glass-material','data-glass-tone','data-glass-busy','data-liquid-map-pixels'])item.host.removeAttribute(name);
    }
    B.liquidOptics.count=0;
  }
  function position(item){
    const {host,refraction,sheen}=item;
    // Keep menus and inspector content scrollable. Only the two decorative
    // layers counter-scroll to remain pinned to the visible material surface.
    for(const layer of [refraction,sheen])Object.assign(layer.style,{top:host.scrollTop+'px',left:host.scrollLeft+'px',width:host.clientWidth+'px',height:host.clientHeight+'px',right:'auto',bottom:'auto'});
    const box=refraction.getBoundingClientRect();item.image.setAttribute('x',String(-box.left));item.image.setAttribute('y',String(-box.top));item.image.setAttribute('width',innerWidth);item.image.setAttribute('height',innerHeight);
  }
  function geometry(item){
    if(!item.host.isConnected)return null;position(item);
    const w=item.host.clientWidth,h=item.host.clientHeight;if(w<2||h<2)return null;
    const radius=Math.min(item.radius,w/2,h/2),key=[w,h,radius].join(':');if(key===item.key)return null;
    const edge=Math.min(item.compact?10:12,radius*.7),scale=item.compact?12:9,map=LiquidGlassOptics.generateDisplacementMap({width:w,height:h,radius,depth:edge,dpr:.75,specular:.025,specularAngle:135});if(!map)return null;
    const id='bs-live-glass-'+(++serial),maskId=id+'-rim',pad=14,filter=LiquidGlassOptics.buildGlassFilter({id,mapUrl:map,scale,blur:.15,chroma:.025,specular:.025,lens:{x:0,y:0,width:w,height:h}}),region={x:-pad,y:-pad,width:w+2*pad,height:h+2*pad};
    filter.setAttribute('filterUnits','userSpaceOnUse');filter.setAttribute('primitiveUnits','userSpaceOnUse');for(const[k,v]of Object.entries(region))filter.setAttribute(k,v);for(const primitive of filter.children)if(primitive.localName!=='feImage')for(const[k,v]of Object.entries(region))primitive.setAttribute(k,v);
    const mask=make('mask',{id:maskId,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:0,y:0,width:w,height:h});mask.append(make('rect',{width:w,height:h,rx:radius,fill:'white'}),make('rect',{x:edge,y:edge,width:Math.max(0,w-edge*2),height:Math.max(0,h-edge*2),rx:Math.max(0,radius-edge),fill:'black'}));
    item.defs.replaceChildren(filter,mask);item.scene.setAttribute('filter','url(#'+id+')');item.scene.setAttribute('mask','url(#'+maskId+')');item.svg.setAttribute('viewBox','0 0 '+w+' '+h);item.svg.setAttribute('width',w);item.svg.setAttribute('height',h);item.key=key;item.host.dataset.liquidMapPixels=w+'x'+h;
    return decode(map);
  }
  function schedule(){
    if(disposed||frame)return;frame=requestAnimationFrame(()=>{frame=0;const pending=surfaces.map(geometry).filter(Boolean);if(pending.length)B.opticsReady=ready(pending);B.liveGlassSource?.invalidate();});
  }
  function adaptTone(item,canvas){
    if(!item.compact)return;
    const r=item.refraction.getBoundingClientRect(),sx=canvas.width/innerWidth,sy=canvas.height/innerHeight;
    const x=Math.max(0,Math.floor(r.left*sx)),y=Math.max(0,Math.floor(r.top*sy)),w=Math.max(0,Math.min(canvas.width-x,Math.ceil(r.width*sx))),h=Math.max(0,Math.min(canvas.height-y,Math.ceil(r.height*sy)));if(w<1||h<1)return;
    const data=canvas.getContext('2d').getImageData(x,y,w,h).data,step=Math.max(1,Math.floor(Math.sqrt(w*h/96)));let sum=0,squares=0,n=0;
    for(let row=0;row<h;row+=step)for(let col=0;col<w;col+=step){const at=(row*w+col)*4,luma=(.2126*data[at]+.7152*data[at+1]+.0722*data[at+2])/255;sum+=luma;squares+=luma*luma;n++;}
    const brightness=sum/n,variance=Math.max(0,squares/n-brightness*brightness),prior=item.host.dataset.glassTone||'light';
    // Separate thresholds prevent flashing near the boundary while scrolling.
    const tone=prior==='dark'?(brightness>.49?'light':'dark'):(brightness<.34?'dark':'light'),busy=item.host.dataset.glassBusy==='true'?variance>.018:variance>.035;
    if(tone!==item.host.dataset.glassTone)item.host.dataset.glassTone=tone;
    if(String(busy)!==item.host.dataset.glassBusy)item.host.dataset.glassBusy=String(busy);
  }
  function mount(){
    lastRoot=document.getElementById('app')?.firstElementChild;
    if(disposed||reduceTransparency.matches||!B.liveGlassSource||!globalThis.LiquidGlassOptics){B.liquidOptics.reason=reduceTransparency.matches?'reduced-transparency':'live-source-unavailable';return;}
    const pending=[];
    for(const host of document.querySelectorAll(selector)){
      if(host.hidden||host.closest('[hidden]')||host.getBoundingClientRect().width<2||getComputedStyle(host).display==='none')continue;
      const computed=getComputedStyle(host),original={position:host.style.position,isolation:host.style.isolation},children=Array.from(host.children).map(node=>({node,style:{position:node.style.position,zIndex:node.style.zIndex}})),compact=host.matches('.app-header nav,.glass-toolbar,.zoom-control');
      for(const{node}of children){if(getComputedStyle(node).position==='static')node.style.position='relative';node.style.zIndex='2';}
      if(computed.position==='static')host.style.position='relative';host.style.isolation='isolate';
      host.setAttribute('data-liquid-surface','');host.setAttribute('data-live-glass-host','');host.dataset.glassMaterial=compact?'compact':'regular';if(compact){host.dataset.glassTone='light';host.dataset.glassBusy='false';}
      const refraction=document.createElement('div'),sheen=document.createElement('div');refraction.className='lq-refraction';sheen.className='lq-sheen';refraction.setAttribute('aria-hidden','true');sheen.setAttribute('aria-hidden','true');
      Object.assign(refraction.style,{position:'absolute',overflow:'hidden',borderRadius:'inherit',pointerEvents:'none',zIndex:'0'});Object.assign(sheen.style,{position:'absolute',pointerEvents:'none',borderRadius:'inherit',zIndex:'1'});
      const svg=make('svg',{'aria-hidden':'true',preserveAspectRatio:'none'}),defs=make('defs'),scene=make('g'),image=make('image',{preserveAspectRatio:'none'});Object.assign(svg.style,{display:'block',width:'100%',height:'100%',pointerEvents:'none'});scene.append(image);svg.append(defs,scene);refraction.append(svg);host.prepend(refraction,sheen);
      const item={host,refraction,sheen,svg,defs,scene,image,original,children,compact,radius:parseFloat(computed.borderRadius)||18,key:null,resize:new ResizeObserver(schedule)};surfaces.push(item);item.resize.observe(host);const promise=geometry(item);if(promise)pending.push(promise);
    }
    B.liquidOptics.count=surfaces.length;B.liquidOptics.reason='live-dom-backdrop-and-scene-rim';delete B.liquidOptics.lastError;pending.push(B.liveGlassSource.capture());B.opticsReady=ready(pending);
  }
  const stopSource=B.liveGlassSource?.subscribe(frame=>{
    if(frame.error){B.liquidOptics.lastError=frame.error;return;}
    for(const item of surfaces){position(item);item.image.setAttribute('href',frame.url);adaptTone(item,frame.canvas);}
    B.liquidOptics.liveVersion=frame.version;
  });
  const refresh=()=>{destroy();mount();},render=B.render;B.render=()=>{const before=document.getElementById('app')?.firstElementChild;render();if(document.getElementById('app')?.firstElementChild!==before)refresh();};
  const app=document.getElementById('app'),appObserver=app?new MutationObserver(()=>{if(app.firstElementChild!==lastRoot)refresh();}):null;if(appObserver)appObserver.observe(app,{childList:true});
  listen(window,'resize',schedule,{passive:true});listen(window,'scroll',()=>{for(const item of surfaces)position(item);},{passive:true,capture:true});
  function updatePointer(){
    pointerFrame=0;if(reduceMotion.matches||!lastPointer)return;
    for(const item of surfaces){
      const r=item.host.getBoundingClientRect(),dx=Math.max(r.left-lastPointer.x,0,lastPointer.x-r.right),dy=Math.max(r.top-lastPointer.y,0,lastPointer.y-r.bottom),distance=Math.hypot(dx,dy),strength=Math.max(0,1-distance/72);
      if(strength<=0){item.host.style.removeProperty('--glass-pointer-strength');continue;}
      const x=Math.max(0,Math.min(100,(lastPointer.x-r.left)/r.width*100)),y=Math.max(0,Math.min(100,(lastPointer.y-r.top)/r.height*100));
      item.host.style.setProperty('--glass-pointer-x',x.toFixed(1)+'%');item.host.style.setProperty('--glass-pointer-y',y.toFixed(1)+'%');item.host.style.setProperty('--glass-pointer-strength',strength.toFixed(2));
    }
  }
  listen(window,'pointermove',event=>{if(reduceMotion.matches)return;lastPointer={x:event.clientX,y:event.clientY};if(!pointerFrame)pointerFrame=requestAnimationFrame(updatePointer);},{passive:true});
  listen(window,'pointerout',event=>{if(event.relatedTarget===null)resetPointer();},{passive:true});listen(window,'blur',resetPointer);listen(document,'visibilitychange',()=>{if(document.hidden)resetPointer();});
  listen(window,'pointerdown',event=>{if(reduceMotion.matches)return;const host=event.target.closest?.('[data-live-glass-host]');if(host)host.setAttribute('data-glass-pressed','true');},{passive:true,capture:true});
  const release=()=>{for(const item of surfaces)item.host.removeAttribute('data-glass-pressed');};listen(window,'pointerup',release,{passive:true,capture:true});listen(window,'pointercancel',resetPointer,{passive:true,capture:true});
  listen(reduceMotion,'change',()=>{if(reduceMotion.matches)resetPointer();});listen(reduceTransparency,'change',refresh);
  listen(window,'pagehide',()=>{disposed=true;appObserver?.disconnect();stopSource?.();destroy();for(const[target,type,handler,options]of events)target.removeEventListener(type,handler,options);B.liveGlassSource?.destroy();});
})(globalThis.BS ||= {});
