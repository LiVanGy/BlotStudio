(async()=>{
  'use strict';
  // Independent production-context fixtures: never bundled into the app.
  const B=BS,tests=[],errors=[],observations={mediaPreferenceScope:'Native MediaQueryList JS listener under explicit enabled/reduced states; OS CSS preference unchanged'};
  const progress=value=>webkit.messageHandlers.qaResult.postMessage({progress:value});
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const check=async(name,job)=>{progress('START '+name);try{await job();tests.push({name,pass:true});progress('PASS '+name);}catch(error){tests.push({name,pass:false,error:error.message});progress('FAIL '+name+': '+error.message);}};
  const wait=(promise,name)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(name+' exceeded 1500 ms (hidden='+document.hidden+')')),1500);Promise.resolve(promise).then(value=>{clearTimeout(timeout);resolve(value);},error=>{clearTimeout(timeout);reject(error);});});
  const frame=()=>wait(new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),'Two compositing frames');
  const ready=async()=>{await wait(B.opticsReady,'Surface optics');await wait(B.buttonGlassReady,'Control optics');await frame();};
  const latest=()=>document.querySelector('.header-actions .primary[data-button-glass]');
  const shader=node=>node.querySelector('.button-glass-shading');
  const signature=canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261;for(const value of pixels)hash=Math.imul(hash^value,16777619);return hash>>>0;};
  const media=window.__bsLiquidMedia?.get('(prefers-reduced-motion: reduce)');
  observations.nativeReducedMotion=media?.matches??matchMedia('(prefers-reduced-motion: reduce)').matches;
  const withMotion=async job=>{assert(media,'MediaQueryList fixture unavailable');const original=Object.getOwnPropertyDescriptor(media,'matches');try{Object.defineProperty(media,'matches',{configurable:true,value:false});media.dispatchEvent(new Event('change'));await job(media);}finally{document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,button:0}));window.dispatchEvent(new Event('blur'));if(original)Object.defineProperty(media,'matches',original);else delete media.matches;media.dispatchEvent(new Event('change'));await frame();}};
  await B.ready;await frame();B.state.ui.tab='edit';B.render();await ready();const original=JSON.stringify(B.state.p);
  await check('Blank production app has visible control-level and frame-level optics without sample data',()=>{
    assert(B.state.p.sources.length===0&&B.getGroup().samples.length===0&&B.getGroup().objects.length===0,'Production context contains test data');assert(typeof B.syntheticProject==='undefined','Synthetic project helper leaked into control suite');
    assert(B.buttonGlass.count>=10&&B.buttonGlass.frames>=1,'Individual controls or frame optics missing');
    const primary=latest();assert(primary&&primary.querySelector('.button-glass-optics feDisplacementMap'),'Primary has no real displacement primitive');assert(shader(primary),'Primary physical lighting layer missing');
    observations.buttonCount=B.buttonGlass.count;observations.frameCount=B.buttonGlass.frames;
  });
  await check('Nested controls share parent material while independent controls have a single live backdrop',()=>{
    const nested=Array.from(document.querySelectorAll('[data-button-glass="contour"]'));assert(nested.length>=3,'Nested controls not represented');
    for(const node of nested){const style=getComputedStyle(node);assert((style.backdropFilter||style.webkitBackdropFilter)==='none','Nested control introduces an additional blur');}
    const style=getComputedStyle(latest());observations.standaloneBackdrop=style.backdropFilter||style.webkitBackdropFilter;assert(/blur\(/.test(observations.standaloneBackdrop),'Standalone primary has no actual backdrop sampling');
  });
  await check('Repainting retains the current live scene immediately and releases old button filters',async()=>{
    const current=await wait(B.liveGlassSource.capture(),'Current scene'),count=document.querySelectorAll('.button-glass-optics').length;
    assert(Array.from(document.querySelectorAll('.button-glass-optics image')).every(image=>image.getAttribute('href')===current.url),'Controls do not share the current scene texture');
    B.render();const images=Array.from(document.querySelectorAll('.button-glass-optics image'));assert(images.length>0&&images.every(image=>!!image.getAttribute('href')),'Repaint exposes an empty optical frame before fresh capture');await ready();
    assert(document.querySelectorAll('.button-glass-optics').length===count,'Repeated render leaks control filters');assert(JSON.stringify(B.state.p)===original,'Repaint changed the scientific project');
  });
  await check('Actual backdrop mutation updates each control lens without changing the project',async()=>{
    const target=latest(),r=target.getBoundingClientRect(),marker=document.createElement('div');Object.assign(marker.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',background:'rgb(220,30,40)',zIndex:'1'});document.getElementById('app').append(marker);
    try{await wait(B.liveGlassSource.capture(),'Red actual content');const image=latest().querySelector('.button-glass-optics image'),before=image.getAttribute('href'),version=B.buttonGlass.sourceVersion;marker.style.background='rgb(20,80,230)';await wait(B.liveGlassSource.capture(),'Blue actual content');assert(image.getAttribute('href')!==before&&B.buttonGlass.sourceVersion>version,'Button lens retained a static backdrop');assert(JSON.stringify(B.state.p)===original,'Content sampling changed project data');}finally{marker.remove();}
  });
  await check('Small white primary labels retain contrast while the luminous rim stays separate',async()=>{
    const target=latest(),r=target.getBoundingClientRect(),marker=document.createElement('div');Object.assign(marker.style,{position:'fixed',left:(r.left-50)+'px',top:(r.top-50)+'px',width:(r.width+100)+'px',height:(r.height+100)+'px',zIndex:'1'});document.getElementById('app').append(marker);
    const linear=value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;},luma=rgb=>.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]),read=value=>value.match(/[\d.]+/g).map(Number),results=[];
    try{for(const background of [[255,255,255],[0,0,0],[0,255,255],[255,255,0]]){
      marker.style.background='rgb('+background.join(',')+')';await wait(B.liveGlassSource.capture(),'Primary label backdrop');const style=getComputedStyle(latest()),fill=read(style.backgroundColor),text=read(style.color),alpha=fill[3]??1,composite=background.map((value,index)=>value*(1-alpha)+fill[index]*alpha),a=luma(text),b=luma(composite),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      results.push({background,fill,text,composite,ratio:Number(ratio.toFixed(2))});observations.primaryLabelContrast=results;assert(ratio>=4.5,'Small label contrast is '+ratio.toFixed(2)+' over '+background+'; fill='+fill+'; text='+text);
    }}finally{marker.remove();}
    assert(latest().querySelector('.button-glass-optics feColorMatrix'),'Tinted refracting perimeter was removed to darken the label');assert(JSON.stringify(B.state.p)===original,'Adaptive label material changed project data');
  });
  await check('Physical edge lighting responds locally and restores after blur or reduced motion',async()=>{
    await withMotion(async m=>{
      const node=latest(),canvas=shader(node),before=signature(canvas),r=node.getBoundingClientRect();window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.right-2,clientY:r.top+3}));await frame();const lit=signature(shader(latest()));assert(lit!==before,'Pointer did not alter edge-normal lighting');
      window.dispatchEvent(new Event('blur'));await frame();assert(signature(shader(latest()))===before,'Blur left dynamic lighting latched');
      window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.right-2,clientY:r.top+3}));await frame();Object.defineProperty(m,'matches',{configurable:true,value:true});m.dispatchEvent(new Event('change'));await frame();assert(signature(shader(latest()))===before,'Reduced motion did not restore steady edge lighting');
      observations.defaultLightingSignature=before;observations.interactiveLightingSignature=lit;
    });
  });
  await check('Press and cancel do not strand either module in an active button state',async()=>{
    await withMotion(async()=>{
      const node=latest();try{
        node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));assert(node.hasAttribute('data-button-pressed'),'Control press feedback absent');assert(!node.hasAttribute('data-glass-pressed'),'Surface controller claimed a control it does not own');
        node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));assert(!node.hasAttribute('data-button-pressed')&&!node.hasAttribute('data-glass-pressed'),'Press release left a latched marker');
        node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));node.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,button:0}));assert(!node.hasAttribute('data-button-pressed')&&!node.hasAttribute('data-glass-pressed'),'Pointer cancel left a latched marker');
      }finally{document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,button:0}));}
    });await ready();
  });
  await check('Frame optical ring follows the visible scroll viewport and excludes the content plane',async()=>{
    B.state.ui.tab='design';B.render();await ready();const pane=document.querySelector('.content-page'),spacer=document.createElement('div');assert(pane?.hasAttribute('data-glass-frame'),'Content frame ring missing');assert(!pane.hasAttribute('data-live-glass-host'),'Content plane was converted into a glass surface');
    spacer.style.height='1600px';pane.append(spacer);try{pane.scrollTop=350;pane.dispatchEvent(new Event('scroll'));await frame();const lens=pane.querySelector(':scope>.button-glass-optics');assert(lens,'Frame optics layer missing');assert(Math.abs(lens.getBoundingClientRect().top-pane.getBoundingClientRect().top-pane.clientTop)<2,'Frame ring scrolls away from the visible edge');assert(parseFloat(lens.style.top)===pane.scrollTop,'Frame decoration does not counter-scroll');observations.frameScrollTop=pane.scrollTop;}finally{spacer.remove();}
    assert(JSON.stringify(B.state.p)===original,'Frame decoration changed project data');
  });
  await check('Primary entry controls receive glass material across workflow pages',async()=>{
    B.state.ui.tab='analysis';B.render();await ready();const primary=document.querySelector('.app-main button.primary');assert(primary?.hasAttribute('data-button-glass'),'Analysis empty-state import entry retained a plain button');assert(primary.querySelector('feDisplacementMap'),'Workflow entry has no live optical lens');assert(parseFloat(getComputedStyle(primary).borderRadius)>=primary.clientHeight/2,'Primary workflow entry is not a capsule');
    assert(JSON.stringify(B.state.p)===original,'Workflow material changed the project');
  });
  await check('Responsive selection geometry survives discovering controls inside a native disclosure',async()=>{
    B.state.ui.tab='design';B.render();await ready();const pane=document.querySelector('.content-page'),active=document.querySelector('.app-header nav button.active'),indicator=document.querySelector('.nav-indicator'),padding=active.style.paddingLeft,details=document.createElement('details'),summary=document.createElement('summary'),button=document.createElement('button');
    summary.textContent='Optical component fixture';button.className='primary';button.textContent='Disclosure action';details.style.marginTop='1200px';details.append(summary,button);
    try{
      active.style.paddingLeft='30px';window.dispatchEvent(new Event('resize'));await frame();assert(Math.abs(parseFloat(indicator.style.width)-active.offsetWidth)<.5,'Selection width did not follow responsive layout');const width=indicator.style.width,left=indicator.style.left;
      pane.append(details);const toggled=new Promise(resolve=>details.addEventListener('toggle',resolve,{once:true}));details.open=true;await wait(toggled,'Native disclosure toggle');await frame();
      assert(button.hasAttribute('data-button-glass')&&button.querySelector('feDisplacementMap'),'Newly revealed offscreen action has no optical material');assert(indicator.style.width===width&&indicator.style.left===left,'Control refresh overwrote navigation geometry owned by the layout');
      pane.scrollTop=details.offsetTop;pane.dispatchEvent(new Event('scroll'));await frame();const r=button.getBoundingClientRect();assert(r.top>=pane.getBoundingClientRect().top&&r.bottom<=innerHeight,'Revealed action did not enter the visible viewport');const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);assert(hit===button||button.contains(hit),'Optical disclosure layers blocked the actual action');
    }finally{details.remove();active.style.paddingLeft=padding;window.dispatchEvent(new Event('resize'));await frame();}
    assert(JSON.stringify(B.state.p)===original,'Disclosure material changed project data');
  });
  await check('Selected navigation lens settles on the same screen coordinates as its capsule',async()=>{
    await withMotion(async()=>{
      document.querySelector('[data-action="tab"][data-id="analysis"]').click();await ready();const indicator=document.querySelector('.nav-indicator');await wait(Promise.all(indicator.getAnimations().map(animation=>animation.finished)),'Navigation material settling');await frame();const layer=indicator.querySelector('.button-glass-optics'),image=layer?.querySelector('image');assert(image,'Selected capsule lens missing');
      const error=Math.abs(Number(image.getAttribute('x'))+layer.getBoundingClientRect().left);observations.settledNavigationAlignment=error;assert(error<.5,'Settled capsule retained an old scene coordinate: '+error);
    });assert(JSON.stringify(B.state.p)===original,'Navigation material changed the project');
  });
  await check('Scientific objects remain outside all control and border filters',async()=>{
    B.state.ui.tab='edit';B.render();await ready();const figure=document.querySelector('#figure');assert(figure&&!figure.closest('.button-glass-optics,.button-glass-shading'),'Scientific figure is inside optical decoration');assert(getComputedStyle(figure).filter==='none','Scientific figure has an optical filter');assert(JSON.stringify(B.state.p)===original,'Scientific model changed during controls checks');assert(!B.liveGlassDiagnostics.lastError&&!B.liquidOptics.lastError,'Live scene renderer reported an error');
  });
  webkit.messageHandlers.qaResult.postMessage({suite:'real WebKit button and frame material components',passed:tests.filter(test=>test.pass).length,total:tests.length,tests,errors,observations});
})().catch(error=>webkit.messageHandlers.qaResult.postMessage({fatal:String(error),stack:error.stack}));
