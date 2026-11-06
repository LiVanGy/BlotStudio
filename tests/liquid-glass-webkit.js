(async()=>{
  'use strict';
  // Component-only fixtures. This file is never part of build.mjs's app order.
  const B=BS,tests=[],observations={mediaPreferenceScope:'Native MediaQueryList change handler; OS CSS preference is unchanged',checkNavigation:[]},errors=[];
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const progress=message=>webkit.messageHandlers.qaResult.postMessage({progress:message});
  const navigation=()=>{const node=document.querySelector('.app-header nav');assert(node?.isConnected,'Current workflow navigation is not connected');return node;};
  const check=async(name,job)=>{const node=navigation();observations.checkNavigation.push({name,connected:node.isConnected,isCurrent:node===document.querySelector('.app-header nav')});progress('START '+name);try{await job();tests.push({name,pass:true});progress('PASS '+name);}catch(error){tests.push({name,pass:false,error:error.message});progress('FAIL '+name+': '+error.message);}};
  const deadline=(promise,label,ms=600)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(label+' exceeded '+ms+' ms')),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
  const until=(predicate,label)=>new Promise((resolve,reject)=>{
    let frame=0,done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(frame);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error(label+' exceeded 600 ms')),600),poll=()=>{try{const result=predicate();if(result)finish(null,result);else if(!done)frame=requestAnimationFrame(poll);}catch(error){finish(error);}};poll();
  });
  const twoFrames=()=>deadline(new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),'Compositing two frames');
  const capture=()=>deadline(B.liveGlassSource.capture(),'Live scene capture');
  const observeIdle=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const sourceImage=()=>document.querySelector('.lq-refraction svg>g>image');
  const motionMedia=window.__bsLiquidMedia?.get('(prefers-reduced-motion: reduce)');
  observations.nativeReducedMotion=motionMedia?.matches??matchMedia('(prefers-reduced-motion: reduce)').matches;
  const withMotionEnabled=async job=>{
    assert(motionMedia,'Isolated MediaQueryList fixture unavailable');const own=Object.getOwnPropertyDescriptor(motionMedia,'matches');
    try{
      // The JS interaction contract is tested in both explicit preference states,
      // independently of the CI machine's native setting. CSS remains native.
      Object.defineProperty(motionMedia,'matches',{configurable:true,value:false});motionMedia.dispatchEvent(new Event('change'));await job(motionMedia);
    }finally{
      if(own)Object.defineProperty(motionMedia,'matches',own);else delete motionMedia.matches;motionMedia.dispatchEvent(new Event('change'));window.dispatchEvent(new Event('blur'));
    }
  };
  await B.ready;B.state.ui.tab='edit';B.render();await deadline(B.opticsReady,'Initial optical frame');
  const original=JSON.stringify(B.state.p),r=navigation().getBoundingClientRect(),marker=document.createElement('div');
  marker.dataset.testGlassBackdrop='';Object.assign(marker.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',background:'rgb(255,0,0)',zIndex:'1'});
  document.getElementById('app').append(marker);
  const canvas=B.liveGlassSource.canvas,pixel=()=>{const box=marker.getBoundingClientRect();return Array.from(canvas.getContext('2d').getImageData(Math.floor((box.left+box.width*.7)*canvas.width/innerWidth),Math.floor((box.top+box.height*.5)*canvas.height/innerHeight),1,1).data);};
  await check('Empty production app supplies a read-only live copy of actual visible DOM',async()=>{
    assert(B.state.p.sources.length===0&&B.getGroup().samples.length===0&&B.getGroup().objects.length===0,'Production app is not empty');
    assert(typeof B.syntheticProject==='undefined'&&typeof B.testSamples==='undefined'&&typeof B.demoProject==='undefined','Synthetic helper entered isolated production suite');
    await capture();observations.red=pixel();assert(observations.red[0]>240&&observations.red[2]<20,'Actual red DOM content was not copied: '+observations.red);
  });
  await check('Actual DOM mutation automatically refreshes source pixels and refracting image',async()=>{
    const version=B.liveGlassDiagnostics.version,href=sourceImage().getAttribute('href');marker.style.background='rgb(0,0,255)';
    await until(()=>B.liveGlassDiagnostics.version>version,'Automatic DOM mutation refresh');observations.blue=pixel();
    assert(observations.blue[2]>240&&observations.blue[0]<20,'Blue DOM content was not followed: '+observations.blue);
    assert(sourceImage().getAttribute('href')!==href,'Refracting image retained a static source');
  });
  await check('Compact tone and busy state follow actual sampled backdrop with hysteresis',async()=>{
    marker.style.background='black';await capture();assert(navigation().dataset.glassTone==='dark','Dark actual backdrop did not select light-label material');
    marker.style.background='rgb(105,105,105)';await capture();assert(navigation().dataset.glassTone==='dark','Tone flickered inside the hysteresis band');
    marker.style.background='white';await capture();assert(navigation().dataset.glassTone==='light','Bright actual backdrop did not restore dark labels');
    marker.style.background='black';const half=document.createElement('div');Object.assign(half.style,{position:'absolute',inset:'0 50% 0 0',background:'white'});marker.append(half);await capture();assert(navigation().dataset.glassBusy==='true','High-variance actual backdrop did not request contrast support');
    assert(Array.from(document.querySelectorAll('[data-glass-material="regular"]')).every(el=>!el.hasAttribute('data-glass-tone')),'Large regular surfaces changed tone');
  });
  await check('Live texture stops repainting after the app becomes idle',async()=>{
    await until(()=>!document.getAnimations().some(a=>a.playState==='running'&&!a.effect?.target?.closest?.('[data-live-glass-host],.lq-refraction,.lq-sheen')),'Content animations settling');
    await capture();await twoFrames();const version=B.liveGlassDiagnostics.version;
    // A bounded observation window verifies absence of a continuing render loop.
    await observeIdle(180);assert(B.liveGlassDiagnostics.version===version,'Idle window continuously repaints');observations.idleVersion=version;
  });
  await check('Pointer highlight stays local and resets on blur and reduced motion',async()=>{
    await withMotionEnabled(async media=>{
      await twoFrames();const target=navigation();
      const near=()=>{const box=navigation().getBoundingClientRect();window.dispatchEvent(new PointerEvent('pointermove',{clientX:box.left+box.width/2,clientY:box.top+box.height/2}));};near();await twoFrames();
      observations.pointerNavConnected=target.isConnected;observations.navIsCurrent=target===document.querySelector('.app-header nav');
      assert(Number(navigation().style.getPropertyValue('--glass-pointer-strength'))>.9,'Nearby pointer did not update highlight');
      window.dispatchEvent(new PointerEvent('pointermove',{clientX:5,clientY:innerHeight-5}));await twoFrames();assert(!navigation().style.getPropertyValue('--glass-pointer-strength'),'Far pointer kept the highlight active');
      near();window.dispatchEvent(new Event('blur'));await twoFrames();assert(!navigation().style.getPropertyValue('--glass-pointer-strength'),'Blur left queued pointer work active');
      near();await twoFrames();Object.defineProperty(media,'matches',{configurable:true,value:true});media.dispatchEvent(new Event('change'));
      assert(!navigation().style.getPropertyValue('--glass-pointer-strength'),'Reduced-motion change did not immediately reset highlight');near();await twoFrames();
      assert(!navigation().style.getPropertyValue('--glass-pointer-strength'),'Reduced motion resumed pointer tracking');
    });
  });
  await check('Press feedback is transient and leaves ordinary actions intact',async()=>{
    await withMotionEnabled(async()=>{
      const button=navigation().querySelector('button');try{
        button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));assert(navigation().dataset.glassPressed==='true','Press feedback missing');
        button.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));assert(!navigation().hasAttribute('data-glass-pressed'),'Press feedback stuck after release');
      }finally{
        // Release through the document even if a failed assertion or repaint
        // detached the original button; no test may leave input latched.
        const target=button.isConnected?button:document;target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,button:0}));await twoFrames();
      }
    });
  });
  let menu;
  await check('Long menus remain scrollable while optical decoration stays pinned',async()=>{
    B.state.ui.projectTools=true;B.render();await deadline(B.opticsReady,'Menu optical frame');menu=document.querySelector('.glass-popover');assert(menu,'Project menu missing');
    menu.style.maxHeight='100px';await twoFrames();menu.scrollTop=menu.scrollHeight;menu.dispatchEvent(new Event('scroll'));await twoFrames();
    const decoration=menu.querySelector('.lq-refraction');assert(getComputedStyle(menu).overflowY==='auto'&&menu.scrollHeight>menu.clientHeight,'Glass changed scrollable menu overflow');
    assert(parseFloat(decoration.style.top)===menu.scrollTop,'Decoration did not counter-scroll');assert(Math.abs(decoration.getBoundingClientRect().top-menu.getBoundingClientRect().top-menu.clientTop)<2,'Optical viewport drifted with menu content');observations.menuScrollTop=menu.scrollTop;
  });
  await check('Scientific canvas and project state remain independent of optical rendering',()=>{
    assert(JSON.stringify(B.state.p)===original,'Optical renderer changed project state');const figure=document.querySelector('#figure');assert(figure,'Scientific canvas missing');
    assert(!figure.closest('.lq-refraction')&&getComputedStyle(figure).filter==='none','Scientific canvas entered the optical filter');
    assert(!document.querySelector('.editor-center[data-live-glass-host],.analysis-page[data-live-glass-host],.content-page[data-live-glass-host]'),'Primary content plane received a glass material');
  });
  await check('Final CSS supplies the intended live backdrop and renderer remains error-free',()=>{
    const material=navigation(),computed=getComputedStyle(material);observations.backdrop=computed.backdropFilter||computed.webkitBackdropFilter;
    assert(/blur\(22px\)/.test(observations.backdrop)&&/saturate\((?:1\.15|115%)\)/.test(observations.backdrop),'Final compact backdrop did not win the cascade: '+observations.backdrop);
    assert(!B.liveGlassDiagnostics.lastError&&!B.liquidOptics.lastError,'Optical renderer error: '+B.liveGlassDiagnostics.lastError+' / '+B.liquidOptics.lastError);
    observations.scenePaintMs=B.liveGlassDiagnostics.paintMs;observations.sceneElements=B.liveGlassDiagnostics.sourceElements;
  });
  await check('Page lifecycle releases optical surfaces and stops queued drawing and tracking',async()=>{
    const version=B.liveGlassDiagnostics.version,host=navigation();window.dispatchEvent(new PointerEvent('pointermove',{clientX:100,clientY:30}));
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));assert(B.liquidOptics.count===0&&!document.querySelector('.lq-refraction,.lq-sheen'),'Optical surfaces leaked after pagehide');
    assert(B.liveGlassSource.canvas.width===0&&B.liveGlassSource.canvas.height===0,'Live texture retained its backing buffer after disposal');
    host.style.background='black';window.dispatchEvent(new PointerEvent('pointermove',{clientX:100,clientY:30}));await twoFrames();await observeIdle(120);
    assert(!host.style.getPropertyValue('--glass-pointer-strength'),'Disposed pointer listener resumed tracking');assert(B.liveGlassDiagnostics.version===version,'Disposed source resumed painting');
    B.render();await twoFrames();assert(!document.querySelector('.lq-refraction,.lq-sheen'),'Disposed observer reinstalled optics');assert(JSON.stringify(B.state.p)===original,'Lifecycle disposal changed project state');
  });
  webkit.messageHandlers.qaResult.postMessage({suite:'real WebKit live liquid glass components',passed:tests.filter(t=>t.pass).length,total:tests.length,tests,errors,observations});
})().catch(error=>webkit.messageHandlers.qaResult.postMessage({fatal:String(error),stack:error.stack}));
