(function(B){
  'use strict';
  // A read-only live texture of this application's visible DOM/scene. This is
  // deliberately not advertised as a browser compositor screenshot: CSS blur
  // still samples the actual backdrop, while this controlled scene copy gives
  // the thin refracting rim live content on WebKit as well as Chromium.
  // No source image, model, export buffer, selection or interactive node is changed.
  const omitted='.lq-refraction,.lq-sheen,.live-glass-source,.glass-menu-shade,.modal-shade,.toast,[data-live-glass-host],script,style,link,template';
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const clients=new Set(),cache=new Map(),events=[];
  let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
  const translucent=matchMedia('(prefers-reduced-transparency: reduce)'),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let raf=0,timer=0,generation=0,painting=false,pending=false,version=0,lastPaint=0,lastTarget=null,disposed=false;
  const state={kind:'read-only-app-scene',version:0,paintMs:0,sourceElements:0,lastError:null};
  B.liveGlassDiagnostics=state;
  const intersects=(a,b)=>a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
  const intersect=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
  const viewport=()=>({left:0,top:0,right:innerWidth,bottom:innerHeight});
  const visible=node=>{const s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;};
  const noColor=value=>!value||value==='transparent'||/rgba\([^)]*,\s*0\s*\)$/.test(value);
  function clipFor(node){
    let clip=viewport();
    for(let p=node.parentElement;p&&p!==document.documentElement;p=p.parentElement){const s=getComputedStyle(p);if(/hidden|clip|auto|scroll/.test(s.overflow+s.overflowX+s.overflowY)){const r=p.getBoundingClientRect();clip=intersect(clip,r);}}
    return clip;
  }
  const saveClip=clip=>{ctx.save();ctx.beginPath();ctx.rect(clip.left,clip.top,Math.max(0,clip.right-clip.left),Math.max(0,clip.bottom-clip.top));ctx.clip();};
  function image(url){
    if(!url||!/^data:image\/|^blob:/.test(url))return Promise.resolve(null);
    if(cache.has(url)){const entry=cache.get(url);cache.delete(url);cache.set(url,entry);return entry.promise;}
    const entry={bytes:url.length*2,promise:null};
    entry.promise=B.loadImage(url).then(async img=>{await img.decode?.();entry.bytes+=img.width*img.height*4;let bytes=0;for(const item of cache.values())bytes+=item.bytes;while(cache.size>12||bytes>64*1024*1024){const key=cache.keys().next().value;if(key===undefined)break;bytes-=cache.get(key).bytes;cache.delete(key);}return img;}).catch(()=>{cache.delete(url);return null;});
    cache.set(url,entry);return entry.promise;
  }
  function pathShape(node){
    const name=node.localName,val=(n,d=0)=>{const text=node.getAttribute(n),number=Number(text??d);return Number.isFinite(number)?number:(node[n]?.baseVal?.value??d);},path=new Path2D();
    if(name==='path')return new Path2D(node.getAttribute('d')||'');
    if(name==='rect'){const x=val('x'),y=val('y'),w=val('width',node.width?.baseVal?.value),h=val('height',node.height?.baseVal?.value),r=Math.min(val('rx'),w/2,h/2);if(![x,y,w,h,r].every(Number.isFinite))return null;if(path.roundRect)path.roundRect(x,y,w,h,r);else path.rect(x,y,w,h);}
    else if(name==='ellipse'||name==='circle')path.ellipse(val('cx'),val('cy'),val(name==='circle'?'r':'rx'),val(name==='circle'?'r':'ry'),0,0,Math.PI*2);
    else if(name==='line'){path.moveTo(val('x1'),val('y1'));path.lineTo(val('x2'),val('y2'));}
    else if(name==='polygon'||name==='polyline'){const points=(node.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number);for(let i=0;i+1<points.length;i+=2)i?path.lineTo(points[i],points[i+1]):path.moveTo(points[i],points[i+1]);if(name==='polygon')path.closePath();}
    else return null;
    return path;
  }
  function svgCommands(root,commands){
    const rect=root.getBoundingClientRect(),clip=intersect(clipFor(root),rect);
    for(const node of root.querySelectorAll('rect,path,circle,ellipse,line,polyline,polygon,image,text')){
      if(node.closest('defs,clipPath,mask,pattern')||!visible(node))continue;
      const s=getComputedStyle(node),matrix=node.getScreenCTM();if(!matrix)continue;
      const m=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f],alpha=Number(s.opacity)||1;
      if(node.localName==='image'){
        const val=n=>Number(node.getAttribute(n)||0),url=node.getAttribute('href')||node.getAttribute('xlink:href'),params=node.getAttribute('data-bs-display');
        const resolved=params&&B.displayURL?B.displayURL(url,JSON.parse(params)):Promise.resolve(url);
        const bitmap=resolved.then(image),box=[val('x'),val('y'),val('width'),val('height')];
        commands.push(async()=>{const img=await bitmap;if(!img)return;saveClip(clip);ctx.transform(...m);ctx.globalAlpha=alpha;ctx.drawImage(img,...box);ctx.restore();});
      }else if(node.localName==='text'){
        const spans=node.querySelectorAll('tspan'),size=parseFloat(s.fontSize)||13,font=[s.fontStyle,s.fontWeight,s.fontSize,s.fontFamily].join(' '),fill=s.fill||s.color,anchor=node.getAttribute('text-anchor');
        let y=Number(node.getAttribute('y')||0);const texts=[];
        for(const span of spans.length?spans:[node]){if(span!==node)y+=Number(span.getAttribute('dy')||0);texts.push({text:span.textContent,x:Number(span.getAttribute('x')??node.getAttribute('x')??0),y,shift:span.getAttribute('baseline-shift')});}
        commands.push(()=>{saveClip(clip);ctx.transform(...m);ctx.globalAlpha=alpha;ctx.font=font;ctx.fillStyle=fill;ctx.textAlign=anchor==='middle'?'center':anchor==='end'?'right':'left';ctx.textBaseline='alphabetic';for(const t of texts)ctx.fillText(t.text,t.x,t.y+(t.shift==='super'?-size*.35:t.shift==='sub'?size*.2:0));ctx.restore();});
      }else{
        const shape=pathShape(node);if(!shape)continue;const fill=s.fill,stroke=s.stroke,line=parseFloat(s.strokeWidth)||0,dashes=(s.strokeDasharray||'').split(/[ ,]+/).map(parseFloat).filter(Number.isFinite);
        commands.push(()=>{saveClip(clip);ctx.transform(...m);ctx.globalAlpha=alpha;if(fill&&fill!=='none'&&!noColor(fill)){ctx.fillStyle=fill;ctx.fill(shape);}if(stroke&&stroke!=='none'&&line>0){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.setLineDash(dashes);ctx.stroke(shape);}ctx.restore();});
      }
    }
  }
  function textCommands(text,commands){
    if(!text.textContent.trim())return;const parent=text.parentElement;if(!parent||parent.closest(omitted)||parent.namespaceURI!=='http://www.w3.org/1999/xhtml'||!visible(parent))return;
    const style=getComputedStyle(parent),range=document.createRange();range.selectNodeContents(text);const rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0&&intersects(r,viewport()));if(!rects.length)return;
    const clip=clipFor(parent),font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' '),color=style.color,alpha=Number(style.opacity)||1,fragments=[];
    if(rects.length===1){const r=rects[0];fragments.push({text:text.textContent.replace(/\s+/g,' '),x:r.left,y:r.top+(r.height-parseFloat(style.fontSize))/2});}
    else{let at=0;for(const char of Array.from(text.textContent)){range.setStart(text,at);at+=char.length;range.setEnd(text,at);const r=range.getBoundingClientRect();if(r.width>0&&r.height>0&&intersects(r,viewport()))fragments.push({text:char,x:r.left,y:r.top+(r.height-parseFloat(style.fontSize))/2});}}
    commands.push(()=>{saveClip(clip);ctx.globalAlpha=alpha;ctx.font=font;ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='top';for(const f of fragments)ctx.fillText(f.text,f.x,f.y);ctx.restore();});
  }
  function collect(){
    const commands=[],view=viewport();
    const walk=node=>{
      if(node.nodeType===Node.TEXT_NODE){textCommands(node,commands);return;}
      if(node.nodeType!==Node.ELEMENT_NODE||node.matches(omitted)||!visible(node))return;
      const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
      if(node!==document.body&&node!==document.getElementById('app')&&(rect.width<.1||rect.height<.1||!intersects(rect,view)))return;
      if(node.namespaceURI==='http://www.w3.org/2000/svg'){if(node.localName==='svg')svgCommands(node,commands);return;}
      const clip=clipFor(node),background=style.backgroundColor,radius=Math.min(parseFloat(style.borderRadius)||0,rect.width/2,rect.height/2),border=style.borderTopColor,width=parseFloat(style.borderTopWidth)||0;
      if(!noColor(background)||width>0&&!noColor(border))commands.push(()=>{saveClip(clip);ctx.beginPath();if(ctx.roundRect)ctx.roundRect(rect.left,rect.top,rect.width,rect.height,radius);else ctx.rect(rect.left,rect.top,rect.width,rect.height);if(!noColor(background)){ctx.fillStyle=background;ctx.fill();}if(width>0&&!noColor(border)){ctx.strokeStyle=border;ctx.lineWidth=width;ctx.stroke();}ctx.restore();});
      if(node.localName==='img'){const bitmap=image(node.currentSrc||node.src);commands.push(async()=>{const img=await bitmap;if(img){saveClip(clip);ctx.drawImage(img,rect.left,rect.top,rect.width,rect.height);ctx.restore();}});return;}
      if(node.matches('input:not([type="range"]):not([type="checkbox"]),textarea,select')){const value=node.localName==='select'?node.selectedOptions[0]?.textContent:node.value,x=rect.left+parseFloat(style.paddingLeft||0),y=rect.top+(rect.height-parseFloat(style.fontSize))/2,font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].join(' ');commands.push(()=>{saveClip(intersect(clip,rect));ctx.font=font;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=style.color;ctx.fillText(value||'',x,y);ctx.restore();});return;}
      for(const child of node.childNodes)walk(child);
    };
    walk(document.body);return commands;
  }
  async function paint(){
    raf=0;timer=0;if(disposed)return;if(painting){pending=true;return;}if(!clients.size||translucent.matches||document.hidden)return;
    const mine=++generation,start=performance.now();painting=true;pending=false;
    try{
      // Small, shared texture: no per-frame full-resolution screenshot/encoding.
      const ratio=Math.min(.8,1200/innerWidth),w=Math.max(1,Math.ceil(innerWidth*ratio)),h=Math.max(1,Math.ceil(innerHeight*ratio));canvas.width=w;canvas.height=h;ctx.setTransform(ratio,0,0,ratio,0,0);
      // The body is painted by collect(). Seed only the root canvas so a
      // translucent body is not composited twice into the optical scene.
      const background=getComputedStyle(document.documentElement).backgroundColor;ctx.fillStyle=noColor(background)?'rgba(0,0,0,0)':background;ctx.fillRect(0,0,innerWidth,innerHeight);
      const commands=collect();state.sourceElements=commands.length;
      for(const draw of commands){await draw();if(mine!==generation)return;}
      const url=canvas.toDataURL('image/png');lastPaint=performance.now();state.version=++version;state.paintMs=Math.round((lastPaint-start)*10)/10;state.lastError=null;
      const result={url,canvas,width:innerWidth,height:innerHeight,version};readyResolve(result);for(const callback of clients)callback(result);
    }catch(error){state.lastError=String(error.message||error);for(const callback of clients)callback({error:state.lastError});}
    finally{
      painting=false;
      // Follow actual transitions already running in the app; never animate an
      // invented wallpaper or keep an idle render loop alive for decoration.
      const animated=!reducedMotion.matches&&document.getAnimations?.().some(a=>a.playState==='running'&&!a.effect?.target?.closest?.(omitted));
      if(pending||animated)invalidate();
    }
  }
  function invalidate(){
    if(disposed||!clients.size||translucent.matches)return;if(painting){generation++;pending=true;return;}if(raf||timer)return;
    const interval=Math.max(16,Math.min(60,state.paintMs*2||16)),remaining=interval-(performance.now()-lastPaint);if(remaining>0)timer=setTimeout(()=>{timer=0;raf=requestAnimationFrame(paint);},remaining);else raf=requestAnimationFrame(paint);
  }
  const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.parentElement?.closest(omitted)&&!r.target.closest?.(omitted)))invalidate();});
  observer.observe(document.getElementById('app')||document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','value','href','x','y','width','height','transform','d','fill','stroke','open','hidden']});
  const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);events.push([target,type,handler,options]);};
  for(const type of ['scroll','resize','input','change','load','transitionend','animationend'])listen(window,type,invalidate,{passive:true,capture:true});
  listen(window,'pointerover',event=>{if(event.target!==lastTarget){lastTarget=event.target;invalidate();}},{passive:true});
  listen(document,'visibilitychange',()=>{if(!document.hidden)invalidate();});listen(translucent,'change',invalidate);
  B.liveGlassSource={ready,subscribe(callback){clients.add(callback);invalidate();return()=>{clients.delete(callback);};},capture(){return new Promise((resolve,reject)=>{const stop=this.subscribe(frame=>{stop();frame.error?reject(Error(frame.error)):resolve(frame);});});},invalidate,canvas,diagnostics:state,
    destroy(){disposed=true;clients.clear();observer.disconnect();for(const[target,type,handler,options]of events)target.removeEventListener(type,handler,options);if(raf)cancelAnimationFrame(raf);if(timer)clearTimeout(timer);generation++;cache.clear();canvas.width=0;canvas.height=0;}};
})(globalThis.BS ||= {});
