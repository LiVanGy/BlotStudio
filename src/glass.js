(function(B){
  'use strict';
  // Presentation-only composition. Existing action IDs, fields and scientific
  // modules remain the source of truth; this layer owns disclosure/navigation.
  if(!B.state||!B.actions)return;
  const e=B.esc,ui=()=>B.state.ui;
  B.icons.more='M5 12h.01M12 12h.01M19 12h.01';
  B.icons.spark='M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z';
  B.icons.sidebar='M3 4h18v16H3zM9 4v16';
  B.icons.properties='M3 4h18v16H3zM15 4v16';
  const sidebarHidden=()=>ui().sidebarHidden??(ui().tab==='edit'&&innerWidth<960);
  const parse=html=>{const t=document.createElement('template');t.innerHTML=html;return t;};
  const item=(action,title,icon,extra='')=>B.btn(action,title,icon,extra);
  const menuButton=(id,title,icon='more',extra='')=>B.btn('glass-menu',title,icon,'data-id="'+id+'" aria-haspopup="menu" aria-expanded="'+(ui().glassMenu===id)+'" '+extra);
  const section=(title,body)=>'<div class="menu-section"><p>'+title+'</p>'+body+'</div>';
  B.glassMenu=()=>{
    const id=ui().projectTools?'project-tools':ui().glassMenu;if(!id)return'';
    const selected=B.getGroup().objects.filter(o=>ui().selected.includes(o.id)),count=selected.length;let body='';
    if(id==='project-tools')body=section('项目',item('newproject','新建项目','plus')+item('open','打开项目','folder')+item('workspace','文件管理与备份','save'))+section('工作流',item('wizard','实验设计向导','grid')+item('export-scope','按范围导出数据','export')+item('audit','操作记录','layers')+item('toggle-sidebar',sidebarHidden()?'显示项目目录':'收起项目目录','sidebar')+item('help','使用帮助','help'));
    if(id==='create')body=section('新建',item('newgroup','图组','image')+item('new-experiment','实验','folder')+item('new-topic','课题','plus'));
    if(id==='project')body=section('项目目录',item('select-all-groups','全选图组','check')+item('clear-group-selection','取消选择','close')+item('recover-groups','找回图组','undo')+item('open','打开项目','folder')+item('newproject','新建项目','plus'));
    if(id==='insert')body=section('插入对象',item('add','文字','text','data-id="text"')+[['rect','矩形'],['line','线段'],['arrow','箭头'],['bracket','分组括号']].map(([type,name])=>item('add',name,type,'data-id="'+type+'"')).join(''));
    if(id==='arrange')body=section('对齐与分布','<div class="menu-align-grid">'+[['left','左对齐'],['center','水平居中'],['right','右对齐'],['top','顶部对齐'],['middle','垂直居中'],['bottom','底部对齐']].map(([type,name])=>B.ib('align',name,type,'data-id="'+type+'" '+(count<2?'disabled':''))).join('')+'</div>'+item('align','水平等距','grid','data-id="distributeX" '+(count<3?'disabled':''))+item('align','垂直等距','grid','data-id="distributeY" '+(count<3?'disabled':'')))+section('对象',item('duplicate','复制对象','copy',count?'':'disabled')+item('group-objects','组合','layers',count<2?'disabled':'')+item('ungroup-objects','取消组合','layers',count?'':'disabled')+item('delete','删除所选','trash',selected.some(o=>!o.locked)?'':'disabled'));
    if(id==='analysis-more')body=section('选区',item('auto-rois','按泳道生成 ROI','grid')+item('copy-rois','同步到其他蛋白','copy')+item('clear-rois','清空 ROI','trash')+item('clear-bg','清除背景','close'))+section('原图',item('reupload-image','重新上传此蛋白','image')+item('original','导出原始文件','save'));
    if(!body)return'';
    const a=ui().glassAnchor||{x:innerWidth-286,y:66};
    return'<div class="glass-menu-shade" data-action="glass-close-menu"></div><div class="glass-popover" role="menu" aria-label="工具菜单" style="left:'+Math.max(12,Math.min(a.x,innerWidth-280))+'px;top:'+Math.min(a.y,innerHeight-390)+'px">'+body+'</div>';
  };
  B.header=()=>{
    const stage=ui().tab,names=[['design','实验设计','grid'],['analysis','图片分析','image'],['edit','排版编辑','layers'],['stats','统计结果','chart']];
    return'<header class="app-header"><div class="brand"><span class="brand-mark">'+B.icon('layers',22)+'</span><div><strong>BlotStudio</strong><span class="brand-caption">研究图像工作台</span></div></div><nav aria-label="WB 工作流程"><span class="nav-indicator" aria-hidden="true"></span>'+names.map(([id,name,icon])=>'<button data-action="tab" data-id="'+id+'" aria-current="'+(stage===id?'page':'false')+'" class="'+(stage===id?'active':'')+'">'+B.icon(icon,15)+'<span>'+name+'</span></button>').join('')+'</nav><div class="header-actions">'+B.btn('save','保存项目','save','class="save-project"')+B.btn('export','导出','export','class="primary"')+B.ib('project-menu','项目工具','more','aria-haspopup="menu" aria-expanded="'+!!ui().projectTools+'"')+'</div></header>'+B.glassMenu();
  };
  B.toolbar=()=>{
    if(ui().tab!=='edit')return'';
    const hasImage=B.getGroup().objects.some(o=>o.type==='image'&&ui().selected.includes(o.id));
    const module=(title,body)=>'<div class="tool-module"><span class="module-caption">'+title+'</span><div class="module-controls">'+body+'</div></div>';
    return'<div class="toolbar glass-toolbar">'+module('画布',B.btn('tool','选择','select','data-id="select" class="'+(ui().tool==='select'?'chosen':'')+'"')+B.ib('tool','移动画布','hand','data-id="hand" aria-pressed="'+(ui().tool==='hand')+'"')+B.ib('crop','裁剪','crop',hasImage?'':'disabled'))+module('内容',B.btn('import','导入图像','image')+menuButton('insert','插入','plus'))+module('对象',menuButton('arrange','排列','layers'))+'<span class="toolbar-spacer"></span><div class="history-controls">'+B.ib('undo','撤销 ⌘Z','undo',B.state.past.length?'':'disabled')+B.ib('redo','重做 ⇧⌘Z','redo',B.state.future.length?'':'disabled')+'</div>'+B.btn('quick-layout','快速排版','spark','class="layout-primary"')+'</div>';
  };
  const sidebar=B.sidebar;
  B.sidebar=()=>{
    const t=parse(sidebar()),root=t.content.querySelector('.sidebar');
    root.hidden=sidebarHidden();
    const heading=root.querySelector('.panel-heading');heading.innerHTML='<h2>项目</h2><div class="sidebar-heading-actions">'+menuButton('create','新建','plus')+menuButton('project','项目管理')+'</div>';
    root.querySelectorAll('.sidebar-tools').forEach(n=>n.remove());
    if(ui().checkedGroups.length){const div=document.createElement('div');div.className='selection-strip';div.innerHTML='<span>已选 '+ui().checkedGroups.length+' 个图组</span>'+(ui().checkedGroups.length>1?B.btn('merge','合并','layers'):'')+B.ib('clear-group-selection','取消选择','close');heading.after(div);}
    root.querySelectorAll('.experiment-row').forEach(row=>{
      const controls=Array.from(row.querySelectorAll('button')).filter(b=>b.dataset.action!=='toggle-folder');
      const details=document.createElement('details');details.className='row-actions';details.innerHTML='<summary aria-label="目录操作">'+B.icon('more',16)+'</summary><div class="row-action-list"></div>';
      controls.forEach(button=>{const action=button.dataset.action,label=action.startsWith('select-')?'选择全部':action.startsWith('edit-')?'重命名':'删除';button.className='row-command';button.innerHTML='<span>'+label+'</span>';details.lastElementChild.append(button);});row.append(details);
    });
    root.querySelectorAll('[data-action="group-menu"]').forEach(b=>b.innerHTML=B.icon('more',16));
    const foot=root.querySelector('.sidebar-bottom > span');if(foot)foot.textContent='离线模式';
    return t.innerHTML;
  };
  // Editing tools float over the actual canvas. Panning content underneath
  // them gives the material a real, changing backdrop rather than wallpaper.
  const editorToolbar=B.toolbar;B.toolbar=()=>'';
  const editor=B.editor;B.editor=()=>{
    const t=parse(editor()),bar=t.content.querySelector('.document-bar'),root=t.content.querySelector('.editor-center');
    root.prepend(parse(editorToolbar()).content);
    const controls=document.createElement('div');controls.className='view-controls';controls.innerHTML=B.ib('toggle-sidebar',sidebarHidden()?'显示项目目录':'收起项目目录','sidebar','aria-pressed="'+!sidebarHidden()+'"')+B.ib('toggle-inspector',ui().inspectorHidden?'显示对象属性':'收起对象属性','properties','aria-pressed="'+!ui().inspectorHidden+'"');bar.prepend(controls);if(!B.getGroup().objects.length){const root=t.content.querySelector('.editor-center');root.classList.add('is-empty');const empty=document.createElement('div');empty.className='workspace-empty';empty.innerHTML='<span class="empty-mark">'+B.icon('image',31)+'</span><h1>开始一张新的 WB 图</h1><p>设置实验分组，导入原始图像。<br>你的分析与排版将从这里开始。</p><div class="button-row">'+B.btn('start-design','设置分组','grid','class="primary"')+B.btn('start-import','导入原图','plus')+'</div>';root.append(empty);}return t.innerHTML;
  };
  function fold(key,title,contents,open=false,extra=''){
    const expanded=ui().glassFolds?.[key]??open;
    return'<details class="disclosure-panel '+extra+'" data-glass-fold="'+key+'" '+(expanded?'open':'')+'><summary>'+title+'<span class="disclosure-chevron">'+B.icon('down',14)+'</span></summary><div class="disclosure-body">'+contents+'</div></details>';
  }
  const inspector=B.inspector;
  B.inspector=()=>{
    const t=parse(inspector()),root=t.content.querySelector('.inspector'),sections=Array.from(root.querySelectorAll('.inspector-section'));
    root.hidden=!!ui().inspectorHidden;
    sections.forEach((section,i)=>{const h=section.querySelector('h3');if(!h)return;const title=h.textContent,open=i===0||title==='文字';h.remove();const unit=section.querySelector('.section-title');if(unit?.textContent.trim()==='px')unit.remove();section.replaceWith(parse(fold('inspector-'+title,e(title),section.innerHTML,open)).content);});
    const h=root.querySelector('.panel-heading h2');if(h)h.textContent=ui().inspector==='canvas'?'画布设置':'对象属性';
    return t.innerHTML;
  };
  const analysis=B.analysis;
  B.analysis=()=>{
    const t=parse(analysis()),page=t.content.querySelector('.analysis-page');if(!page)return t.innerHTML;
    const panels=Array.from(page.querySelectorAll('.analysis-settings')),identity=document.createElement('div');identity.className='analysis-identity';
    const label=field=>panels.flatMap(p=>Array.from(p.querySelectorAll('.field'))).find(n=>n.querySelector('[data-field="'+field+'"]'));
    for(const key of ['analysisId','protein','mw','kind','polarity']){const n=label(key);if(n)identity.append(n);}
    const refs=document.createElement('div');refs.className='reference-fields';for(const key of ['referenceId','controlId','totalId']){const n=label(key);if(n)refs.append(n);}
    panels[0].before(identity);panels[0].before(parse(fold('references','参照与归一化',refs.outerHTML,false,'reference-disclosure')).content);panels.forEach(p=>p.remove());
    const old=page.querySelector('.analysis-tools'),svg=page.querySelector('#analysis-image'),source=B.state.p.sources.find(s=>s.id===B.getAnalysis()?.sourceId),percent=source&&svg?Math.round(Number(svg.getAttribute('width'))/source.width*100):100;
    const toolbar=document.createElement('div');toolbar.className='analysis-tools roi-toolbar';toolbar.innerHTML='<div class="roi-segments">'+[['roi','框选条带'],['background','框选背景'],['crop','框选裁剪']].map(([id,title])=>B.btn('analysis-tool',title,id==='crop'?'crop':'rect','data-id="'+id+'" class="'+(ui().analysisTool===id?'chosen':'')+'"')).join('')+'</div><div class="roi-commands">'+B.btn('detect-rois','自动定位条带','spark')+B.btn('methods','灰度计算方式','grid')+menuButton('analysis-more','更多操作')+'</div><span class="toolbar-spacer"></span><div class="roi-zoom">'+B.ib('analysis-zoom-out','缩小原图','minus')+'<span>'+percent+'%</span>'+B.ib('analysis-zoom-in','放大原图','plus')+'</div>';old.replaceWith(toolbar);
    page.querySelector('[data-action="original"]')?.remove();page.querySelector('.page-heading').append(parse(B.btn('import','添加图像','plus')).content);
    const ij=page.querySelector('.imagej-panel');if(ij)ij.replaceWith(parse(fold('imagej','ImageJ 测量与曲线',ij.innerHTML,false)).content);
    const coordinates=page.querySelector('.roi-editor');if(coordinates){const h=coordinates.querySelector('h3'),title=h?.textContent||'ROI 坐标';h?.remove();coordinates.replaceWith(parse(fold('roi-coordinates',title,coordinates.innerHTML,!!ui().roiId)).content);}
    page.querySelector('.analysis-readout')?.classList.add('solid-panel');
    return t.innerHTML;
  };
  // Native details retain their own focus. Record disclosure state only in UI,
  // so editing/repainting doesn't reset a panel or affect the project/history.
  document.addEventListener('toggle',event=>{const node=event.target;if(node.matches?.('[data-glass-fold]')){ui().glassFolds ||= {};ui().glassFolds[node.dataset.glassFold]=node.open;}},true);
  const projectMenu=B.actions['project-menu'];B.actions['project-menu']=el=>{ui().glassMenu=null;ui().shapeMenu=false;return projectMenu(el);};
  B.actions['glass-menu']=el=>{const rect=el.getBoundingClientRect();ui().projectTools=false;ui().glassMenu=ui().glassMenu===el.dataset.id?null:el.dataset.id;ui().glassAnchor={x:rect.left,y:rect.bottom+9};B.render();};
  B.actions['toggle-sidebar']=()=>{ui().sidebarHidden=!sidebarHidden();B.render();if(ui().tab==='edit')B.fit();};
  B.actions['toggle-inspector']=()=>{ui().inspectorHidden=!ui().inspectorHidden;B.render();if(ui().tab==='edit')B.fit();};
  B.actions['start-design']=()=>B.actions.wizard();B.actions['start-import']=()=>B.actions.import();
  B.actions['glass-close-menu']=()=>{ui().glassMenu=null;ui().projectTools=false;B.render();};
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-action]');if(!button||['glass-menu','project-menu','glass-close-menu'].includes(button.dataset.action))return;ui().glassMenu=null;ui().projectTools=false;document.querySelectorAll('.glass-popover,.glass-menu-shade').forEach(n=>n.remove());},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(ui().glassMenu||ui().projectTools)){ui().glassMenu=null;ui().projectTools=false;B.render();}},true);
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)'),render=B.render;
  function alignNavigation(){
    const nav=document.querySelector('.app-header nav'),active=nav?.querySelector('button.active'),indicator=nav?.querySelector('.nav-indicator');
    if(!indicator||!active)return null;
    Object.assign(indicator.style,{left:active.offsetLeft+'px',top:active.offsetTop+'px',width:active.offsetWidth+'px',height:active.offsetHeight+'px'});
    return{active,indicator};
  }
  let navigationFrame=0;addEventListener('resize',()=>{if(navigationFrame)return;navigationFrame=requestAnimationFrame(()=>{navigationFrame=0;alignNavigation();B.buttonGlass?.reposition?.();});},{passive:true});
  addEventListener('pagehide',()=>{if(navigationFrame)cancelAnimationFrame(navigationFrame);navigationFrame=0;});
  B.render=()=>{
    const old=document.querySelector('.app-header nav button.active')?.getBoundingClientRect();
    render();
    const aligned=alignNavigation();if(!aligned)return;const{active,indicator}=aligned;
    const current=active.getBoundingClientRect();
    if(old&&!reduceMotion.matches&&Math.abs(old.left-current.left)>2)indicator.animate([{transform:'translateX('+(old.left-current.left)+'px) scaleX('+(old.width/current.width)+')'},{transform:'translateX(0) scaleX(1)'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'}).finished.then(()=>{if(indicator.isConnected)B.buttonGlass?.reposition?.();}).catch(()=>{});
  };
})(globalThis.BS ||= {});
