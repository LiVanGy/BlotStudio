(function(B){
  'use strict';
  // Optical chrome only. A real per-surface SVG viewport keeps WebKit filter
  // primitives, the environment image and the displacement map in one space.
  // MIT @tomagranate/liquid-glass: fixed upstream version in vendor notices.
  const NS='http://www.w3.org/2000/svg',items=[];
  const reduced=matchMedia('(prefers-reduced-transparency: reduce)');
  const selectors='.app-header nav,.glass-toolbar,.sidebar,.inspector,.editor-center,.content-page,.analysis-page,.glass-popover,.modal,.zoom-control';
  let serial=0,frame=0,lastRoot=null;
  B.liquidOptics={engine:'@tomagranate/liquid-glass',version:'efe48923a08c026b77158f3df0317f83571a038d',count:0};
  B.opticsReady=Promise.resolve();
  const svg=(name,attrs={})=>{const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  const ambient=()=>{
    const text=getComputedStyle(document.documentElement).getPropertyValue('--lq-backdrop').trim();
    const match=text.match(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/),url=match&&(match[1]||match[2]||match[3]);
    return url&&/^data:image\/(?:svg\+xml|png|jpeg|webp)[;,]/.test(url)?url:null;
  };
  const decode=url=>B.loadImage?B.loadImage(url).then(image=>image.decode?.()).catch(()=>{}):Promise.resolve();
  const destroy=()=>{
    if(frame){cancelAnimationFrame(frame);frame=0;}
    for(const item of items.splice(0)){
      item.resize.disconnect();item.host.removeEventListener('scroll',item.scroll);
      item.refraction.remove();item.sheen.remove();
      for(const child of item.children)Object.assign(child.node.style,child.style);
      Object.assign(item.host.style,item.original);item.host.removeAttribute('data-liquid-surface');item.host.removeAttribute('data-liquid-map-pixels');
    }
    B.liquidOptics.count=0;B.opticsReady=Promise.resolve();
  };
  const position=item=>{
    const {host,refraction,sheen,image}=item;
    // Counter-scroll only the two decorative layers; scientific content stays
    // entirely in its original DOM and coordinate system.
    for(const layer of [refraction,sheen])Object.assign(layer.style,{top:host.scrollTop+'px',height:host.clientHeight+'px',bottom:'auto'});
    const box=refraction.getBoundingClientRect();
    image.setAttribute('x',String(-box.left));image.setAttribute('y',String(-box.top));
    image.setAttribute('width',String(innerWidth));image.setAttribute('height',String(innerHeight));
  };
  const rebuild=item=>{
    if(!item.host.isConnected)return null;
    position(item);
    const w=item.refraction.clientWidth,h=item.refraction.clientHeight;if(w<2||h<2)return null;
    const radius=Math.min(item.radius,w/2,h/2),large=h>160,scale=large?38:26,signature=[w,h,radius,scale].join('|');
    if(signature===item.signature)return null;
    const map=LiquidGlassOptics.generateDisplacementMap({width:w,height:h,radius,depth:large?18:12,dpr:.75,specular:.14,specularAngle:135});
    if(!map)return null;
    const id='bs-optical-svg-'+(++serial),pad=Math.ceil(scale*.6+4),filter=LiquidGlassOptics.buildGlassFilter({id,mapUrl:map,scale,blur:.35,chroma:.16,specular:.14,lens:{x:0,y:0,width:w,height:h}});
    // Do not mix objectBoundingBox lengths with HTML/page coordinates. All
    // filter regions are explicit user-space pixels in this SVG's own viewBox.
    const region={x:-pad,y:-pad,width:w+2*pad,height:h+2*pad};
    filter.setAttribute('filterUnits','userSpaceOnUse');filter.setAttribute('primitiveUnits','userSpaceOnUse');
    for(const [key,value] of Object.entries(region))filter.setAttribute(key,String(value));
    for(const primitive of filter.children)if(primitive.localName!=='feImage')for(const [key,value] of Object.entries(region))primitive.setAttribute(key,String(value));
    // The upstream lens branch supplies a neutral full-area flood before the
    // finite bump image. Its RGB=128 exterior prevents half-scale black seams.
    const bump=filter.querySelector('feImage');bump.setAttribute('x','0');bump.setAttribute('y','0');bump.setAttribute('width',String(w));bump.setAttribute('height',String(h));
    item.defs.replaceChildren(filter);item.scene.setAttribute('filter','url(#'+id+')');
    item.canvas.setAttribute('width',String(w));item.canvas.setAttribute('height',String(h));item.canvas.setAttribute('viewBox','0 0 '+w+' '+h);
    item.signature=signature;item.host.dataset.liquidMapPixels=w+'x'+h;
    return decode(map);
  };
  const schedule=()=>{
    if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const pending=[];for(const item of items){const ready=rebuild(item);if(ready)pending.push(ready);}if(pending.length)B.opticsReady=Promise.all(pending);});
  };
  const mount=()=>{
    lastRoot=document.getElementById('app')?.firstElementChild;
    if(reduced.matches||!globalThis.LiquidGlassOptics?.buildGlassFilter){B.liquidOptics.reason='reduced-transparency';return;}
    const url=ambient();if(!url){B.liquidOptics.reason='ambient-source-unavailable';return;}
    const pending=[decode(url)];
    for(const host of document.querySelectorAll(selectors)){
      if(host.hidden||host.closest('[hidden]')||host.getBoundingClientRect().width<2)continue;
      const computed=getComputedStyle(host),radius=parseFloat(computed.borderRadius)||18;
      const original={position:host.style.position,overflow:host.style.overflow,isolation:host.style.isolation,background:host.style.background,boxShadow:host.style.boxShadow,borderRadius:host.style.borderRadius};
      const children=Array.from(host.children).map(node=>({node,style:{position:node.style.position,zIndex:node.style.zIndex}}));
      for(const {node} of children){if(getComputedStyle(node).position==='static')node.style.position='relative';node.style.zIndex='2';}
      if(computed.position==='static')host.style.position='relative';host.style.isolation='isolate';host.style.overflow=['auto','scroll'].includes(computed.overflow)?computed.overflow:'hidden';
      host.style.background='rgba(255,255,255,.08)';host.style.boxShadow='0 12px 36px rgba(35,72,96,.12),inset 0 1px 0 rgba(255,255,255,.85)';host.style.borderRadius=radius+'px';
      const refraction=document.createElement('div'),sheen=document.createElement('div');refraction.className='lq-refraction';sheen.className='lq-sheen';refraction.setAttribute('aria-hidden','true');sheen.setAttribute('aria-hidden','true');
      Object.assign(refraction.style,{overflow:'hidden',borderRadius:'inherit',clipPath:'inset(0 round '+radius+'px)'});
      const canvas=svg('svg',{'aria-hidden':'true',preserveAspectRatio:'none'}),defs=svg('defs'),scene=svg('g'),image=svg('image',{href:url,preserveAspectRatio:'none'});
      Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',overflow:'visible',pointerEvents:'none'});scene.append(image);canvas.append(defs,scene);refraction.append(canvas);
      Object.assign(sheen.style,{borderRadius:'inherit',boxShadow:'inset 0 1px 1.5px rgba(255,255,255,.81),inset 1px 0 1px rgba(255,255,255,.315),inset -1px 0 1px rgba(255,255,255,.315),inset 0 -1.5px 2px rgba(0,0,0,.225),inset 0 0 0 1px rgba(255,255,255,.225)',background:'linear-gradient(225deg,rgba(255,255,255,.162),transparent 38%,transparent 64%,rgba(255,255,255,.072))'});
      host.prepend(refraction,sheen);host.setAttribute('data-liquid-surface','');
      const item={host,refraction,sheen,canvas,defs,scene,image,original,children,radius,signature:null,resize:null,scroll:null};
      item.scroll=()=>position(item);host.addEventListener('scroll',item.scroll,{passive:true});
      item.resize=new ResizeObserver(schedule);item.resize.observe(host);items.push(item);const ready=rebuild(item);if(ready)pending.push(ready);
    }
    B.liquidOptics.count=items.length;B.liquidOptics.reason='svg-refraction';B.opticsReady=Promise.all(pending);
  };
  const refresh=()=>{destroy();mount();};
  const render=B.render;B.render=()=>{const before=document.getElementById('app')?.firstElementChild;render();if(document.getElementById('app')?.firstElementChild!==before)refresh();};
  // Captured async render sinks may bypass the public B.render wrapper. Observe
  // only direct app children, not the optical subtrees we insert ourselves.
  const app=document.getElementById('app');if(app)new MutationObserver(()=>{if(app.firstElementChild!==lastRoot)refresh();}).observe(app,{childList:true});
  reduced.addEventListener?.('change',refresh);addEventListener('resize',schedule,{passive:true});
  addEventListener('scroll',()=>{for(const item of items)position(item);},{passive:true,capture:true});
  addEventListener('pagehide',destroy);
})(globalThis.BS ||= {});
