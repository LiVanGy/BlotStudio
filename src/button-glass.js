(function(B){
  'use strict';
  // Candidate supplement, loaded after liquid-optics.js. It reads the shared
  // live scene only; interactive nodes and scientific scene data stay intact.
  const NS='http://www.w3.org/2000/svg',items=[],events=[],normalCache=new Map();
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),transparency=matchMedia('(prefers-reduced-transparency: reduce)');
  const buttonSelector='button.primary,.header-actions>button,.button-row>button,.page-heading button,.section-title button,.module-controls>button,.layout-primary,.sidebar-heading-actions>button,.view-controls>button,.inspector-tabs button.active,.roi-segments button.chosen,.roi-commands>button,.subnav button.active,.modal-heading>button,.modal-footer>button,.nav-indicator';
  const frameSelector='.editor-center,.content-page,.analysis-page';
  let uid=0,raf=0,discoveryRaf=0,pointerRaf=0,lastRoot=null,stopped=false,lastPointer=null,activeLight=null,lastScene=null;
  const tintVariables=['--button-glass-tint-alpha','--button-glass-center-green','--button-glass-center-blue'];
  B.buttonGlass={count:0,frames:0,sourceVersion:0,lightingPixels:0,reposition:queue};
  B.buttonGlassReady=Promise.resolve();
  const el=(name,attrs={})=>{const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  const on=(target,type,job,options)=>{target.addEventListener(type,job,options);events.push([target,type,job,options]);};
  const load=url=>B.loadImage(url).then(image=>image.decode?.()).catch(()=>{});
  function sdf(x,y,hw,hh,r){const qx=Math.abs(x)-hw+r,qy=Math.abs(y)-hh+r;return Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-r;}
  const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const luminance=rgb=>rgb.reduce((value,channel,index)=>{const s=channel/255;return value+[.2126,.7152,.0722][index]*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);},0);
  function tint(item,frame){
    const x=Math.round((item.box.left+item.box.width/2)*frame.canvas.width/innerWidth),y=Math.round((item.box.top+item.box.height/2)*frame.canvas.height/innerHeight);if(x<0||y<0||x>=frame.canvas.width||y>=frame.canvas.height)return null;
    const sampled=frame.canvas.getContext('2d').getImageData(x,y,1,1).data;let background=Array.from(sampled).slice(0,3).map(value=>value*sampled[3]/255+245*(1-sampled[3]/255));
    const parent=item.host.parentElement?.closest('[data-liquid-surface]'),color=parent&&getComputedStyle(parent).backgroundColor.match(/^rgba?\(([^)]+)\)$/);
    if(color){const channels=color[1].split(/[,\s/]+/).filter(Boolean).map(Number),alpha=channels[3]??1;if(channels.length>=3)background=background.map((v,i)=>v*(1-alpha)+channels[i]*alpha);}
    const alpha=.72+.24*luminance(background),contrast=factor=>1.05/(luminance(background.map((v,i)=>v*(1-alpha)+[0,136,255][i]*factor*alpha))+.05);
    // Keep the luminous cyan perimeter separate. Only the quiet centre adapts
    // its luminance so small white labels remain readable over actual content.
    let low=0,high=1;for(let i=0;i<12;i++){const mid=(low+high)/2;if(contrast(mid)>=4.7)low=mid;else high=mid;}
    item.host.style.setProperty('--button-glass-tint-alpha',alpha.toFixed(3));item.host.style.setProperty('--button-glass-center-green',String(Math.round(136*low)));item.host.style.setProperty('--button-glass-center-blue',String(Math.round(255*low)));
    return contrast(low);
  }
  function normals(w,h,r,depth){
    const key=[w,h,r,depth].join(':');if(normalCache.has(key)){const cached=normalCache.get(key);normalCache.delete(key);normalCache.set(key,cached);return cached;}
    const points=[],hw=w/2,hh=h/2;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const px=x+.5-hw,py=y+.5-hh,d=-sdf(px,py,hw,hh,r);if(d<0||d>depth)continue;
      let nx=sdf(px+.5,py,hw,hh,r)-sdf(px-.5,py,hw,hh,r),ny=sdf(px,py+.5,hw,hh,r)-sdf(px,py-.5,hw,hh,r),length=Math.hypot(nx,ny)||1;
      const slope=1-smooth(d/depth),nz=Math.sqrt(Math.max(0,1-slope*slope));nx=nx/length*slope;ny=ny/length*slope;
      points.push(((y*w+x)*4),nx,ny,nz,1-smooth(d/depth));
    }
    const data={points:new Float32Array(points),image:new ImageData(w,h)};data.bytes=data.points.byteLength+data.image.data.byteLength;normalCache.set(key,data);let bytes=Array.from(normalCache.values()).reduce((sum,value)=>sum+value.bytes,0);while(normalCache.size>32||bytes>24*1024*1024){const first=normalCache.keys().next().value;if(first===undefined)break;bytes-=normalCache.get(first).bytes;normalCache.delete(first);}return data;
  }
  function light(item,pointer){
    if(!item.normals)return;const n=item.normals,p=n.points,pixels=n.image.data,r=item.box;
    let lx=pointer?(pointer.x-(r.left+r.width/2))/Math.max(25,r.width)*1.25:-.55,ly=pointer?(pointer.y-(r.top+r.height/2))/Math.max(25,r.height)*1.25:-.75,lz=1.15;
    let length=Math.hypot(lx,ly,lz);lx/=length;ly/=length;lz/=length;
    let hx=lx,hy=ly,hz=lz+1;length=Math.hypot(hx,hy,hz);hx/=length;hy/=length;hz/=length;
    for(let i=0;i<p.length;i+=5){const at=p[i],nx=p[i+1],ny=p[i+2],nz=p[i+3],edge=p[i+4],fresnel=.06+.24*Math.pow(1-nz,4),spec=Math.pow(Math.max(0,nx*hx+ny*hy+nz*hz),18),diffuse=Math.max(0,nx*lx+ny*ly+nz*lz),energy=(fresnel+spec*.66-(1-diffuse)*.18)*edge;
      const color=energy>=0?255:0;pixels[at]=pixels[at+1]=pixels[at+2]=color;pixels[at+3]=Math.round(clamp(Math.abs(energy),0,.83)*255);
    }
    // All non-rim pixels remain transparent from ImageData construction. Only
    // upload the four slim frame strips, not a whole document-sized texture.
    const band=item.highlightBand,w=n.image.width,h=n.image.height;
    if(item.frame&&w>band*2&&h>band*2){item.context.putImageData(n.image,0,0,0,0,w,band);item.context.putImageData(n.image,0,0,0,h-band,w,band);item.context.putImageData(n.image,0,0,0,band,band,h-band*2);item.context.putImageData(n.image,0,0,w-band,band,band,h-band*2);}else item.context.putImageData(n.image,0,0);
    B.buttonGlass.lightingPixels=p.length/5;
  }
  function place(item){
    const {host,lens,shade}=item;const w=host.clientWidth,h=host.clientHeight;
    const top=item.frame?host.scrollTop:0,left=item.frame?host.scrollLeft:0;
    for(const layer of [lens,shade])Object.assign(layer.style,{top:top+'px',left:left+'px',width:w+'px',height:h+'px',right:'auto',bottom:'auto'});
    item.box=lens.getBoundingClientRect();item.image.setAttribute('x',-item.box.left);item.image.setAttribute('y',-item.box.top);item.image.setAttribute('width',innerWidth);item.image.setAttribute('height',innerHeight);
  }
  function geometry(item){
    if(!item.host.isConnected)return null;place(item);const w=Math.round(item.host.clientWidth),h=Math.round(item.host.clientHeight);if(w<4||h<4)return null;
    const radius=Math.min(parseFloat(getComputedStyle(item.host).borderRadius)||12,w/2,h/2),prominent=item.host.classList.contains('primary'),edge=item.frame?3.5:prominent?1.3:Math.min(3.6,h*.105),key=[w,h,radius,edge].join(':');if(key===item.key)return null;
    // Lensing has physical depth; the reflected highlight is a separate, much
    // narrower surface. Do not bake a second broad highlight into the map.
    const id='bs-button-glass-'+(++uid),maskId=id+'-rim',scale=item.frame?15:24,map=LiquidGlassOptics.generateDisplacementMap({width:w,height:h,radius,depth:edge,dpr:item.frame ? .65 : 1.25,specular:0,specularAngle:225});
    const filter=LiquidGlassOptics.buildGlassFilter({id,mapUrl:map,scale,blur:.1,chroma:item.frame?0:.055,specular:0,lens:{x:0,y:0,width:w,height:h}}),pad=16,region={x:-pad,y:-pad,width:w+pad*2,height:h+pad*2};
    B.preserveGlassAlpha?.(filter);filter.setAttribute('filterUnits','userSpaceOnUse');filter.setAttribute('primitiveUnits','userSpaceOnUse');for(const[k,v]of Object.entries(region))filter.setAttribute(k,v);for(const primitive of filter.children)if(primitive.localName!=='feImage')for(const[k,v]of Object.entries(region))primitive.setAttribute(k,v);
    if(item.host.classList.contains('primary'))filter.append(el('feColorMatrix',{in:'lens',type:'matrix',values:'.18 0 0 0 0  0 .35 0 0 .45  0 0 .12 0 .88  0 0 0 1 0',...region}));
    const mask=el('mask',{id:maskId,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:0,y:0,width:w,height:h});mask.append(el('rect',{width:w,height:h,rx:radius,fill:'white'}),el('rect',{x:edge,y:edge,width:Math.max(0,w-edge*2),height:Math.max(0,h-edge*2),rx:Math.max(0,radius-edge),fill:'black'}));
    item.defs.replaceChildren(filter,mask);item.group.setAttribute('filter','url(#'+id+')');item.group.setAttribute('mask','url(#'+maskId+')');item.svg.setAttribute('viewBox','0 0 '+w+' '+h);item.svg.setAttribute('width',w);item.svg.setAttribute('height',h);
    const lightingRatio=item.frame?Math.min(.75,1400/w):1.25,lw=Math.max(1,Math.round(w*lightingRatio)),lh=Math.max(1,Math.round(h*lightingRatio)),highlightDepth=item.frame?1.7:prominent?1:1.6;item.shade.width=lw;item.shade.height=lh;item.highlightBand=Math.ceil(highlightDepth*lightingRatio)+2;item.normals=normals(lw,lh,radius*lightingRatio,highlightDepth*lightingRatio);item.key=key;light(item,null);return load(map);
  }
  function queue(){if(stopped||raf)return;raf=requestAnimationFrame(()=>{raf=0;const promises=items.map(geometry).filter(Boolean);if(promises.length)B.buttonGlassReady=Promise.all(promises);});}
  function resetPointer(){if(pointerRaf)cancelAnimationFrame(pointerRaf);pointerRaf=0;lastPointer=null;for(const item of items){item.host.removeAttribute('data-button-pressed');item.host.removeAttribute('data-glass-pressed');if(item===activeLight)light(item,null);}activeLight=null;}
  function cleanup(){if(raf)cancelAnimationFrame(raf);if(discoveryRaf)cancelAnimationFrame(discoveryRaf);raf=discoveryRaf=0;resetPointer();for(const item of items.splice(0)){item.resize.disconnect();item.lens.remove();item.shade.remove();Object.assign(item.host.style,item.style);for(const[key,old]of Object.entries(item.variables))old.value?item.host.style.setProperty(key,old.value,old.priority):item.host.style.removeProperty(key);for(const old of item.children)Object.assign(old.node.style,old.style);for(const[key,value]of Object.entries(item.attributes)){value===null?item.host.removeAttribute(key):item.host.setAttribute(key,value);}}B.buttonGlass.count=B.buttonGlass.frames=0;}
  function mount(){
    lastRoot=document.getElementById('app')?.firstElementChild;if(stopped||transparency.matches||!B.liveGlassSource||!globalThis.LiquidGlassOptics)return;const promises=[];
    const targets=[...Array.from(document.querySelectorAll(buttonSelector)).map(host=>({host,frame:false})),...Array.from(document.querySelectorAll(frameSelector)).map(host=>({host,frame:true}))];
    for(const {host,frame}of targets){const r=host.getBoundingClientRect(),computed=getComputedStyle(host);if(host.disabled||host.closest('[hidden]')||computed.display==='none'||r.width<4||r.height<4)continue;
      const style={position:host.style.position},variables=Object.fromEntries(tintVariables.map(key=>[key,{value:host.style.getPropertyValue(key),priority:host.style.getPropertyPriority(key)}])),children=frame?[]:Array.from(host.children).map(node=>({node,style:{position:node.style.position,zIndex:node.style.zIndex}})),attributes={};for(const key of ['data-button-glass','data-glass-frame','data-live-glass-host','data-button-pressed','data-glass-pressed'])attributes[key]=host.getAttribute(key);
      const nested=!!host.closest('[data-liquid-surface]');
      if(!frame){host.setAttribute('data-button-glass',nested?'contour':'standalone');host.setAttribute('data-live-glass-host','');for(const {node}of children){if(getComputedStyle(node).position==='static')node.style.position='relative';node.style.zIndex='3';}}
      else host.setAttribute('data-glass-frame','');if(computed.position==='static')host.style.position='relative';
      const lens=document.createElement('span'),shade=document.createElement('canvas');lens.className='lq-refraction button-glass-optics';shade.className='lq-sheen button-glass-shading';for(const layer of [lens,shade]){layer.setAttribute('aria-hidden','true');Object.assign(layer.style,{position:'absolute',pointerEvents:'none',borderRadius:'inherit',zIndex:frame?'4':'0'});}shade.style.zIndex=frame?'5':'1';
      const svg=el('svg',{'aria-hidden':'true',focusable:'false',preserveAspectRatio:'none'}),defs=el('defs'),group=el('g'),image=el('image',{preserveAspectRatio:'none'});if(lastScene)image.setAttribute('href',lastScene.url);Object.assign(svg.style,{display:'block',width:'100%',height:'100%',pointerEvents:'none'});group.append(image);svg.append(defs,group);lens.append(svg);host.prepend(lens,shade);
      const item={host,frame,nested,lens,shade,context:shade.getContext('2d'),svg,defs,group,image,style,variables,children,attributes,key:null,resize:new ResizeObserver(queue)};items.push(item);item.resize.observe(host);const ready=geometry(item);if(ready)promises.push(ready);
    }
    B.buttonGlass.count=items.filter(i=>!i.frame).length;B.buttonGlass.frames=items.filter(i=>i.frame).length;promises.push(B.liveGlassSource.capture());B.buttonGlassReady=Promise.all(promises);
  }
  const stop=B.liveGlassSource?.subscribe(frame=>{if(frame.error)return;lastScene=frame;const contrasts=[];for(const item of items){place(item);item.image.setAttribute('href',frame.url);if(!item.frame&&item.host.classList.contains('primary')){const value=tint(item,frame);if(value!==null)contrasts.push(value);}}B.buttonGlass.minimumPrimaryContrast=contrasts.length?Math.min(...contrasts):null;B.buttonGlass.sourceVersion=frame.version;});
  const refresh=()=>{cleanup();mount();},render=B.render;B.render=()=>{const root=document.getElementById('app')?.firstElementChild;render();if(document.getElementById('app')?.firstElementChild!==root)refresh();};
  const root=document.getElementById('app'),observer=new MutationObserver(()=>{if(root.firstElementChild!==lastRoot)refresh();});if(root)observer.observe(root,{childList:true});
  on(window,'scroll',queue,{passive:true,capture:true});on(window,'resize',queue,{passive:true});
  on(window,'toggle',event=>{if(stopped||!event.target.matches?.('details')||discoveryRaf)return;discoveryRaf=requestAnimationFrame(()=>{discoveryRaf=0;refresh();});},{capture:true});
  on(window,'pointermove',event=>{if(motion.matches)return;lastPointer={x:event.clientX,y:event.clientY};if(pointerRaf)return;pointerRaf=requestAnimationFrame(()=>{pointerRaf=0;const p=lastPointer;if(!p)return;const inside=items.filter(i=>p.x>=i.box.left&&p.x<=i.box.right&&p.y>=i.box.top&&p.y<=i.box.bottom),next=inside.find(i=>!i.frame)||inside.find(i=>i.frame);if(activeLight&&activeLight!==next)light(activeLight,null);if(next)light(next,p);activeLight=next;});},{passive:true});
  on(window,'pointerdown',event=>{if(motion.matches)return;const host=event.target.closest?.('[data-button-glass]');host?.setAttribute('data-button-pressed','true');},{passive:true,capture:true});
  const release=()=>{for(const item of items){item.host.removeAttribute('data-button-pressed');item.host.removeAttribute('data-glass-pressed');}};on(window,'pointerup',release,{passive:true,capture:true});on(window,'pointercancel',resetPointer,{passive:true});on(window,'blur',resetPointer);on(window,'pointerout',event=>{if(event.relatedTarget===null)resetPointer();},{passive:true});on(motion,'change',()=>{if(motion.matches)resetPointer();});on(transparency,'change',refresh);
  on(window,'pagehide',()=>{stopped=true;observer.disconnect();stop?.();cleanup();normalCache.clear();lastScene=null;for(const[t,type,job,options]of events)t.removeEventListener(type,job,options);});
})(globalThis.BS ||= {});
