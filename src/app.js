(function(B){
  'use strict';
  B.state={p:null,past:[],future:[],ui:{tab:'edit',group:'',selected:[],checkedGroups:[],tool:'select',inspector:'object',zoom:.8,snap:true,scrollX:0,scrollY:0,guideX:null,guideY:null,analysisId:'',analysisTool:'roi',analysisZoom:0,roiId:'',analysisRect:null,designTab:'groups',metric:'ratio',statsProtein:'',control:'',normalize:true,inferential:false,saveStatus:'正在读取本地项目…',modal:null,shapeMenu:false,toast:''}};
  let saveTimer,toastTimer,gesture=null,resizeTimer,projectEpoch=0,pointerControl=false,pendingRender=false,renderTimer;
  const renderNow=B.render;
  B.render=()=>{if(pointerControl){pendingRender=true;return;}pendingRender=false;const active=document.activeElement,scope=active?.dataset?.scope,field=active?.dataset?.field,start=active?.selectionStart,end=active?.selectionEnd;renderNow();if(scope&&field&&document.querySelectorAll){const next=Array.from(document.querySelectorAll('[data-scope][data-field]')).find(el=>el.dataset.scope===scope&&el.dataset.field===field);if(next){next.focus({preventScroll:true});if(Number.isInteger(start)&&next.setSelectionRange)try{next.setSelectionRange(start,end);}catch{}}}};
  B.flushRender=()=>{if(pendingRender&&!pointerControl)B.render();};
  B.flushSave=async()=>{clearTimeout(saveTimer);try{B.validate(B.state.p);await B.db.write(B.state.p);B.state.ui.saveStatus='已自动保存到本地';return true;}catch{B.state.ui.saveStatus='自动保存失败 · 请导出项目备份';return false;}};
  B.toast=message=>{B.state.ui.toast=message;const el=document.querySelector('.toast');if(el){el.textContent=message;el.classList.add('visible');}clearTimeout(toastTimer);toastTimer=setTimeout(()=>{B.state.ui.toast='';document.querySelector('.toast')?.classList.remove('visible');},4500);};
  B.persist=()=>{const {ui,p}=B.state;ui.saveStatus='正在保存到本地…';const el=document.querySelector('.save-status');if(el)el.textContent=ui.saveStatus;clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{const current=B.state.p;try{B.validate(current);await B.db.write(current);if(current===B.state.p)ui.saveStatus='已自动保存到本地';}catch(err){ui.saveStatus='自动保存不可用 · 请导出项目备份';}const target=document.querySelector('.save-status');if(target)target.textContent=ui.saveStatus;},650);};
  B.commit=(label,fn,detail='')=>{const st=B.state,old=st.p,before=JSON.parse(JSON.stringify(st.ui)),p=B.clone(old);try{fn(p,p.groups.find(g=>g.id===st.ui.group)||p.groups[0]);st.ui.group=p.groups.some(g=>g.id===st.ui.group)?st.ui.group:p.groups[0].id;p.activeGroup=st.ui.group;B.log(p,label,detail);B.validate(p);st.p=p;st.ui.selected=st.ui.selected.filter(id=>B.getGroup().objects.some(o=>o.id===id));B.render();st.past.push(old);if(st.past.length>35)st.past.shift();st.future=[];if(old.id!==p.id)projectEpoch++;B.persist();}catch(error){st.p=old;for(const key of Object.keys(st.ui))if(!(key in before))delete st.ui[key];Object.assign(st.ui,before);try{B.render();}catch{}throw error;}};
  B.editAnalysis=(label,fn)=>B.commit(label,(p,g)=>{const o=g.objects.find(v=>v.id===B.getAnalysis()?.id);if(!o)throw Error('请先选择图像。');if(o.locked)throw Error('此图像已锁定，请先解锁再修改分析。');fn(o,p,g);});
  B.selectObject=(id,multi=false)=>{const {ui}=B.state,g=B.getGroup(),o=g.objects.find(v=>v.id===id);if(!o)return;let ids=o.groupId&&!multi?g.objects.filter(v=>v.groupId===o.groupId).map(v=>v.id):[id];ui.selected=multi?(ui.selected.includes(id)?ui.selected.filter(v=>!ids.includes(v)):[...new Set([...ui.selected,...ids])]):ids;ui.inspector='object';};
  B.editSelected=(label,fn)=>B.commit(label,(p,g)=>g.objects.filter(o=>B.state.ui.selected.includes(o.id)&&!o.locked).forEach(o=>fn(o,p,g)));
  B.fit=()=>{const v=document.getElementById('viewport'),g=B.getGroup();if(v){B.state.ui.zoom=B.clamp(Math.min((v.clientWidth-86)/g.canvas.width,(v.clientHeight-108)/g.canvas.height),.1,1.5);B.state.ui.scrollX=0;B.state.ui.scrollY=0;B.render();}};
  B.performUndo=redo=>{const st=B.state,from=redo?st.future:st.past,to=redo?st.past:st.future;if(!from.length)return;to.push(st.p);st.p=from.pop();if(!st.p.groups.some(g=>g.id===st.ui.group))st.ui.group=st.p.groups[0].id;st.ui.selected=[];st.ui.checkedGroups=st.ui.checkedGroups.filter(id=>st.p.groups.some(g=>g.id===id));st.p.activeGroup=st.ui.group;B.validate(st.p);B.persist();B.render();};
  B.cloneGroup=(g,name)=>{const out=JSON.parse(JSON.stringify(g)),ids=new Map(g.objects.map(o=>[o.id,B.uid()]));out.id=B.uid();out.name=name||g.name+' 副本';for(const o of out.objects){o.id=ids.get(o.id);o.referenceId=ids.get(o.referenceId)||'';if(o.groupId)o.groupId='clone'+out.id+o.groupId;for(const r of o.rois||[])r.id=B.uid();}return out;};
  B.importFiles=async files=>{
    const targetProject=B.state.p.id,targetGroup=B.getGroup().id,epoch=projectEpoch,successes=[],errors=[];B.toast('正在解码图像，原图会保留在项目内…');
    for(const file of files){try{successes.push(...await B.importImage(file));}catch(err){errors.push(file.name+'：'+err.message);}}
    if(B.state.p.id!==targetProject||epoch!==projectEpoch)throw Error('导入期间项目已切换。没有把图像写入其他项目，请重新导入。');
    if(!B.state.p.groups.some(g=>g.id===targetGroup))throw Error('原导入图组已被删除，请重新选择图组。');
    let importedName='';
    if(successes.length)B.commit('导入原图',(p)=>{let g=p.groups.find(g=>g.id===targetGroup);const activate=B.state.ui.group===targetGroup;if(g.demo){g=B.blankGroup('我的 WB 图组',g.experiment);p.groups.push(g);}importedName=g.name;
      for(const source of successes){p.sources.push(source);const o=B.imageObject(source,g.objects.filter(o=>o.type==='image').length),scale=Math.min(1,380/o.h);o.w*=scale;o.h*=scale;g.objects.push(o);if(activate){B.state.ui.analysisId=o.id;B.state.ui.selected=[o.id];}}
      if(activate){B.state.ui.group=g.id;B.state.ui.tab='analysis';B.state.ui.analysisZoom=0;}
    },successes.map(s=>s.name+' · '+s.bitDepth+'-bit · '+s.hash).join('\n'));
    B.toast((successes.length?'已导入 '+successes.length+' 张原图到「'+importedName+'」。':'')+(errors.length?errors.join('\n'):'可按泳道生成 ROI，再框选背景。'));
  };
  B.openProject=async file=>{if(file.size>B.MAX_PROJECT_BYTES)throw B.projectSizeError();const p=B.validate(JSON.parse(await file.text()));projectEpoch++;B.state.past.push(B.state.p);B.state.future=[];B.state.p=p;B.state.ui.group=p.activeGroup||p.groups[0].id;B.state.ui.selected=[];B.state.ui.analysisId='';B.state.ui.checkedGroups=[];B.state.ui.modal=null;B.state.ui.shapeMenu=false;B.state.ui.analysisRect=null;B.state.ui.marquee=null;B.state.ui.guideX=null;B.state.ui.guideY=null;gesture=null;pointerControl=false;B.persist();B.render();B.fit();B.toast('项目已恢复，原图和编辑对象均已载入。');};
  B.dataExport=(format='xlsx')=>{
    const {p,ui}=B.state,g=B.getGroup(),stats=ui.tab==='stats'?B.currentStats():null,records=stats?stats.records:B.records(p,g),sheets=[{name:'灰度原始数据',rows:B.resultRows(records)}];
    if(stats){sheets.push({name:'统计纳入值',rows:[['指标',ui.metric],['目的蛋白',stats.protein],['对照组',stats.control],['按对照均值归一化',ui.normalize?'是':'否'],['提示',stats.error||''],[],['图组','蛋白','样本','分组','重复编号','统计值'],...stats.rows.map(r=>[r.imageGroup,r.protein,r.sampleId,r.group,r.replicate,r.value])]},{name:'描述统计',rows:[['分组','n','均值','SD','SEM'],...stats.groups.map(g=>[g.name,g.n,g.mean,Number.isFinite(g.sd)?g.sd:'',Number.isFinite(g.sem)?g.sem:''])]});if(ui.inferential)sheets.push({name:'Welch及Holm',rows:[['双侧独立样本 Welch t 检验，各组相对对照；Holm 校正'],['比较组','t','自由度','原始P','Holm P'],...stats.tests.map(t=>[t.group,...[t.t,t.df,t.p,t.adjusted].map(v=>Number.isFinite(v)?v:'')])]});}
    return format==='csv'?B.csv(sheets.flatMap(s=>[[s.name],...s.rows,[]])):B.workbook(sheets);
  };
  B.doExport=async()=>{
    const {p,ui}=B.state,g=B.getGroup(),m=ui.modal;if(ui.exporting)throw Error('正在导出，请先完成或取消保存。');if(!m||m.type!=='export')throw Error('请先选择导出格式。');
    B.validate(p);ui.exporting=true;const fmt=m.format,scale=Number(m.scale||1),name=g.name.replace(/[\\/:*?"<>|]/g,'_');B.toast('正在生成导出文件…');let result;
    try{
      if(fmt==='project')result=await B.saveFile(p.name+'.wbproj',JSON.stringify(p),'application/json');
      else if(fmt==='svg')result=await B.saveFile(name+'.svg',B.svg(p,g),'image/svg+xml');
      else if(fmt==='pptx')result=await B.saveFile(name+'.pptx',await B.pptx(p,g),'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      else if(fmt==='csv'||fmt==='xlsx')result=await B.saveFile(name+'.'+fmt,B.dataExport(fmt),fmt==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else if(fmt==='audit')result=await B.saveFile(name+'-操作记录.csv',B.csv([['时间 UTC','操作','说明'],...p.audit.map(r=>[r.time,r.action,r.detail])]),'text/csv');
      else if(fmt==='originals'){const files={'project.wbproj':JSON.stringify(p),'audit.csv':B.csv([['时间 UTC','操作','说明'],...p.audit.map(r=>[r.time,r.action,r.detail])])};p.sources.forEach((s,i)=>{const original=s.original||s.url,ext=original.match(/^data:image\/(\w+)/)?.[1]||'png';files['originals/'+(i+1)+'-'+s.name.replace(/[\\/:*?"<>|]/g,'_')+'.'+ext]=B.unbase64(original.split(',')[1]);});result=await B.saveFile(name+'-原图与记录.zip',B.zip(files));}
      else if(['png','tiff'].includes(fmt)){if(![1,2,3,4].includes(scale))throw Error('像素倍率无效。');const c=await B.rasterize(B.svg(p,g),g.canvas.width*scale,g.canvas.height*scale);if(fmt==='png')result=await B.saveFile(name+'.png',await B.pngDpi(c,g.canvas.dpi),'image/png');else result=await B.saveFile(name+'.tiff',B.encodeTIFF(c.getContext('2d').getImageData(0,0,c.width,c.height).data,c.width,c.height,Number(g.canvas.dpi)),'image/tiff');}
      else throw Error('不支持的导出格式。');
      if(ui.modal===m)ui.modal=null;B.render();B.toast(result.status==='saved'?'文件已保存。':'已请求浏览器下载，请在下载记录中确认文件。');
    }finally{ui.exporting=false;}
  };
  const actions={
    tab:el=>{B.state.ui.tab=el.dataset.id;B.state.ui.shapeMenu=false;B.render();if(el.dataset.id==='edit')B.fit();},
    group:el=>{if(!B.state.p.groups.some(g=>g.id===el.dataset.id))return;B.state.ui.group=el.dataset.id;B.state.p={...B.state.p,activeGroup:el.dataset.id};B.persist();B.state.ui.selected=[];B.state.ui.analysisId='';B.state.ui.analysisZoom=0;B.render();if(B.state.ui.tab==='edit')B.fit();},
    protein:el=>{const {ui}=B.state;ui.analysisId=el.dataset.id;ui.selected=[el.dataset.id];ui.tab='analysis';ui.analysisZoom=0;B.render();},
    'select-object':(el,ev)=>{B.selectObject(el.dataset.id,ev.shiftKey||ev.metaKey||ev.ctrlKey);B.render();},
    tool:el=>{B.state.ui.tool=el.dataset.id;B.render();},
    'shape-menu':()=>{B.state.ui.shapeMenu=!B.state.ui.shapeMenu;B.render();},
    'inspector-tab':el=>{B.state.ui.inspector=el.dataset.id;B.render();},
    import:()=>document.getElementById('images-input').click(),
    open:()=>document.getElementById('project-input').click(),
    save:async()=>{B.validate(B.state.p);const result=await B.saveFile(B.state.p.name+'.wbproj',JSON.stringify(B.state.p),'application/json');B.persist();B.toast(result.status==='saved'?'项目备份已保存。':'已请求浏览器下载项目备份，请在下载记录中确认。');},
    export:()=>{B.state.ui.modal={type:'export',format:'png',scale:2};B.render();},
    'do-export':()=>B.doExport(),
    help:()=>{B.state.ui.modal={type:'help'};B.render();},
    audit:()=>{B.state.ui.modal={type:'audit'};B.render();},
    'audit-export':()=>B.saveFile('BlotStudio-操作记录.csv',B.csv([['时间 UTC','操作','说明'],...B.state.p.audit.map(r=>[r.time,r.action,r.detail])]),'text/csv'),
    'close-modal':()=>{B.state.ui.modal=null;B.render();},
    newgroup:()=>{B.state.ui.modal={type:'newgroup',name:'新图组',experiment:B.getGroup().experiment};B.render();},
    'create-group':()=>{const m=B.state.ui.modal;if(!m.name?.trim())throw Error('请填写图组名称。');B.commit('新建图组',(p)=>{const g=B.blankGroup(m.name.trim(),m.experiment||'实验 01');p.groups.push(g);B.state.ui.group=g.id;B.state.ui.modal=null;});},
    'project-name':()=>{B.state.ui.modal={type:'project-name',name:B.state.p.name};B.render();},
    'save-name':()=>{const name=B.state.ui.modal.name?.trim();if(!name)throw Error('请填写项目名称。');B.commit('重命名项目',p=>{p.name=name;B.state.ui.modal=null;});},
    newproject:()=>{B.state.ui.modal={type:'newproject',name:'我的 WB 项目'};B.render();},
    'create-project':()=>{const name=B.state.ui.modal.name||'我的 WB 项目';B.commit('创建空项目',p=>{Object.assign(p,B.blankProject());p.name=name;B.state.ui.group=p.activeGroup;B.state.ui.modal=null;B.state.ui.selected=[];B.state.ui.checkedGroups=[];B.state.ui.analysisId='';});},
    'group-menu':el=>{const g=B.state.p.groups.find(g=>g.id===el.dataset.id);B.state.ui.modal={type:'group-menu',id:g.id,name:g.name,experiment:g.experiment};B.render();},
    'save-group':()=>{const m=B.state.ui.modal;B.commit('修改图组',p=>{const g=p.groups.find(g=>g.id===m.id);g.name=m.name.trim()||g.name;g.experiment=m.experiment.trim()||g.experiment;B.state.ui.modal=null;});},
    clonegroup:el=>B.commit('复制图组',p=>{const copy=B.cloneGroup(p.groups.find(g=>g.id===el.dataset.id));p.groups.push(copy);B.state.ui.group=copy.id;B.state.ui.modal=null;}),
    deletegroup:el=>{if(B.state.p.groups.length===1)return;B.commit('删除图组（可撤销）',p=>{p.groups=p.groups.filter(g=>g.id!==el.dataset.id);B.state.ui.checkedGroups=B.state.ui.checkedGroups.filter(v=>v!==el.dataset.id);B.state.ui.modal=null;});},
    merge:()=>B.commit('合并图组到多面板画布',(p)=>{const selected=p.groups.filter(g=>B.state.ui.checkedGroups.includes(g.id));if(selected.length<2)return;const g=B.blankGroup('合并组图',selected[0].experiment);g.samples=JSON.parse(JSON.stringify(selected[0].samples));let offset=0;selected.forEach((v,i)=>{const clone=B.cloneGroup(v);for(const o of clone.objects){o.x+=offset;o.rois=[];o.referenceId='';if(o.autoLabel&&o.text==='A')o.text=String.fromCharCode(65+i);}g.objects.push(...clone.objects);g.canvas.height=Math.max(g.canvas.height,v.canvas.height);offset+=v.canvas.width+60;});g.canvas.width=offset-60;if(g.canvas.width>10000)throw Error('合并画布超过 10000 px，请减少图组。');g.notes='多面板排版副本。原组图和原分析保留；本副本不汇总 ROI。';p.groups.push(g);B.state.ui.group=g.id;B.state.ui.selected=[];B.state.ui.tab='edit';B.state.ui.checkedGroups=[];}),
    add:el=>{const type=el.dataset.id;B.commit('添加'+type,(p,g)=>{const o=B.object(type,{name:type==='text'?'新文本':{rect:'矩形',line:'线段',arrow:'箭头',bracket:'分组括号'}[type],text:'双击编辑文本',x:80,y:70,w:type==='text'?240:160,h:type==='text'?32:type==='rect'?80:type==='bracket'?16:30,fill:type==='rect'?'none':'#20252c',strokeWidth:type==='text'?0:1.5});g.objects.push(o);B.state.ui.selected=[o.id];B.state.ui.shapeMenu=false;B.state.ui.inspector='object';});},
    delete:()=>B.commit('删除对象（可撤销）',(p,g)=>{const ids=B.state.ui.selected;g.objects=g.objects.filter(o=>!ids.includes(o.id)||o.locked);const remaining=new Set(g.objects.map(o=>o.id));for(const o of g.objects)if(o.referenceId&&!remaining.has(o.referenceId))o.referenceId='';B.state.ui.selected=[];}),
    duplicate:()=>B.commit('复制对象',(p,g)=>{const objects=g.objects.filter(o=>B.state.ui.selected.includes(o.id)),mapping=new Map(objects.map(o=>[o.id,B.uid()]));const added=objects.map(o=>{const c=JSON.parse(JSON.stringify(o));c.id=mapping.get(o.id);c.x+=20;c.y+=20;c.name+=' 副本';c.groupId=c.groupId?'copy'+Date.now()+c.groupId:'';if(c.referenceId)c.referenceId=mapping.get(c.referenceId)||c.referenceId;for(const r of c.rois||[])r.id=B.uid();return c;});g.objects.push(...added);B.state.ui.selected=added.map(o=>o.id);}),
    visibility:el=>B.commit('切换图层显示',(p,g)=>{const o=g.objects.find(o=>o.id===el.dataset.id);o.visible=o.visible===false;}),
    lock:el=>B.commit('切换图层锁定',(p,g)=>{const o=g.objects.find(o=>o.id===el.dataset.id);o.locked=!o.locked;}),
    undo:()=>B.performUndo(false),redo:()=>B.performUndo(true),
    align:el=>B.commit('对齐 / 等距',(p,g)=>B.alignObjects(g.objects.filter(o=>B.state.ui.selected.includes(o.id)&&!o.locked),el.dataset.id)),
    'group-objects':()=>{const id=B.uid();B.editSelected('组合对象',o=>o.groupId=id);},
    'ungroup-objects':()=>B.editSelected('取消组合',o=>delete o.groupId),
    order:el=>B.commit('调整图层顺序',(p,g)=>{const sel=B.state.ui.selected.filter(id=>!g.objects.find(o=>o.id===id)?.locked),mode=el.dataset.id;if(mode==='front'||mode==='back'){const a=g.objects.filter(o=>sel.includes(o.id)),b=g.objects.filter(o=>!sel.includes(o.id));g.objects=mode==='front'?[...b,...a]:[...a,...b];}else{const a=g.objects,step=mode==='up'?1:-1;for(let i=step>0?a.length-2:1;step>0?i>=0:i<a.length;i-=step){if(sel.includes(a[i].id)&&!a[i].locked&&!sel.includes(a[i+step].id))[a[i],a[i+step]]=[a[i+step],a[i]];}}}),
    'layers-order':()=>{B.state.ui.inspector='object';B.state.ui.tab='edit';B.render();},
    'quick-layout':()=>{B.state.ui.modal={type:'layout',width:640,gap:36};B.render();},
    'apply-layout':()=>{const m=B.state.ui.modal;B.commit('快速排版',(p,g)=>{B.quickLayout(g,{width:B.clamp(Number(m.width),100,5000),gap:B.clamp(Number(m.gap),0,500)});B.state.ui.modal=null;B.state.ui.selected=[];});B.fit();},
    crop:()=>{const o=B.getGroup().objects.find(o=>B.state.ui.selected.includes(o.id)&&o.type==='image');if(!o){B.toast('请先选择一张条带图像。');return;}B.state.ui.analysisId=o.id;B.state.ui.tab='analysis';B.state.ui.analysisTool='crop';B.state.ui.analysisZoom=0;B.render();},
    'reset-image':()=>B.editSelected('还原图像显示',o=>{if(o.type==='image')Object.assign(o,{brightness:100,contrast:100,invert:false,grayscale:true,flipX:false,flipY:false,rotation:0,opacity:1});}),
    flip:el=>B.editSelected('翻转图像显示',o=>{if(o.type==='image')o[el.dataset.id]=!o[el.dataset.id];}),
    fit:()=>B.fit(),
    'zoom-in':()=>{B.state.ui.zoom=B.clamp(B.state.ui.zoom*1.15,.1,3);B.render();},
    'zoom-out':()=>{B.state.ui.zoom=B.clamp(B.state.ui.zoom/1.15,.1,3);B.render();},
    'analysis-tool':el=>{B.state.ui.analysisTool=el.dataset.id;B.render();},
    'auto-rois':()=>B.editAnalysis('按泳道生成 ROI',(o,p,g)=>{o.rois=B.autoROIs(o.crop,g.samples.length);B.state.ui.roiId=o.rois[0]?.id||'';}),
    'copy-rois':()=>B.commit('同步 ROI 到同尺寸图像',(p,g)=>{const from=g.objects.find(v=>v.id===B.getAnalysis().id),s=p.sources.find(s=>s.id===from.sourceId);let count=0;for(const o of g.objects.filter(o=>o.type==='image'&&o.id!==from.id)){const t=p.sources.find(v=>v.id===o.sourceId);if(!o.locked&&s.width===t.width&&s.height===t.height){o.rois=from.rois.map(r=>({...r,id:B.uid()}));count++;}}if(!count)throw Error('没有可编辑且原图尺寸完全相同的其他蛋白。请先解锁，或为不同尺寸图片单独框选。');}),
    'clear-rois':()=>B.editAnalysis('清空 ROI（可撤销）',o=>o.rois=[]),
    'clear-bg':()=>B.editAnalysis('清除背景 ROI',o=>o.background=null),
    'delete-roi':()=>B.editAnalysis('删除单个 ROI',(o)=>{o.rois=o.rois.filter(r=>r.id!==B.state.ui.roiId);B.state.ui.roiId='';}),
    'roi-select':el=>{B.state.ui.roiId=el.dataset.id;B.render();},
    'analysis-zoom-in':()=>{const o=B.getAnalysis(),s=B.state.p.sources.find(s=>s.id===o.sourceId);B.state.ui.analysisZoom=(B.state.ui.analysisZoom||Math.min(900/s.width,420/s.height))*1.25;B.render();},
    'analysis-zoom-out':()=>{const o=B.getAnalysis(),s=B.state.p.sources.find(s=>s.id===o.sourceId);B.state.ui.analysisZoom=(B.state.ui.analysisZoom||Math.min(900/s.width,420/s.height))/1.25;B.render();},
    original:()=>{const o=B.getAnalysis(),s=B.state.p.sources.find(s=>s.id===o.sourceId),data=s.original||s.url;return B.saveFile(s.originalName||s.name+(s.original?'':'.png'),B.unbase64(data.split(',')[1]),data.split(';')[0].slice(5));},
    'to-stats':()=>{B.state.ui.tab='stats';B.render();},'to-analysis':()=>{B.state.ui.tab='analysis';B.render();},
    'results-xlsx':()=>B.saveFile(B.getGroup().name+'-灰度数据.xlsx',B.dataExport('xlsx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    'imagej-measure-export':()=>B.exportImagej('measure'),
    'imagej-profile-export':()=>B.exportImagej('profile'),
    'imagej-bundle':()=>B.exportImagej('bundle'),
    'chart-export':()=>{const d=B.currentStats();return B.saveFile(d.protein+'-统计图.svg',B.chartSVG(d,d.protein+(B.getGroup().demo?' · 演示数据':''),B.state.ui.normalize),'image/svg+xml');},
    'design-tab':el=>{B.state.ui.designTab=el.dataset.id;B.render();},
    'add-sample':()=>B.commit('添加泳道',(p,g)=>{if(g.samples.length>=200)throw Error('每个图组最多 200 条泳道。');let n=g.samples.length+1;while(g.samples.some(s=>s.id==='S'+n))n++;g.samples.push({id:'S'+n,group:g.samples.at(-1)?.group||'Control',replicate:1,include:true});}),
    'remove-sample':el=>B.commit('删除泳道（可撤销）',(p,g)=>{if(g.samples.length<=1)throw Error('至少保留一条泳道。');const index=Number(el.dataset.id);g.samples.splice(index,1);for(const o of g.objects.filter(o=>o.type==='image'))o.rois=o.rois.filter(r=>r.sampleIndex!==index).map(r=>({...r,sampleIndex:r.sampleIndex>index?r.sampleIndex-1:r.sampleIndex}));}),
    'library-add':()=>{B.state.ui.modal={type:'library',index:null,record:{}};B.render();},
    'library-edit':el=>{const key=B.state.ui.designTab==='samples'?'sampleLibrary':B.state.ui.designTab;B.state.ui.modal={type:'library',index:Number(el.dataset.id),record:{...B.state.p[key][Number(el.dataset.id)]}};B.render();},
    'library-delete':el=>B.commit('删除资料记录（可撤销）',p=>{const key=B.state.ui.designTab==='samples'?'sampleLibrary':B.state.ui.designTab;p[key].splice(Number(el.dataset.id),1);}),
    'save-library':()=>{const m=B.state.ui.modal,key=B.state.ui.designTab==='samples'?'sampleLibrary':B.state.ui.designTab;B.commit('保存资料记录',p=>{if(m.index===null)p[key].push(m.record);else p[key][m.index]=m.record;B.state.ui.modal=null;});}
  };
  B.actions=actions;
  document.addEventListener('click',async ev=>{const el=ev.target.closest('[data-action]');pointerControl=false;if(!el||el.disabled||!B.state.p){B.flushRender();return;}try{const job=actions[el.dataset.action]?.(el,ev);B.flushRender();await job;}catch(err){B.flushRender();B.toast(err.message||String(err));}});
  document.addEventListener('change',async ev=>{
    const el=ev.target;if(el.id==='images-input'){const files=Array.from(el.files);el.value='';try{await B.importFiles(files);}catch(err){B.toast(err.message);}return;}if(el.id==='project-input'){try{if(el.files[0])await B.openProject(el.files[0]);}catch(err){B.toast(err.message);}el.value='';return;}
    const scope=el.dataset.scope,field=el.dataset.field;if(!scope||!B.state.p)return;let value=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?Number(el.value):el.value;
    try{
      if(scope==='modal'){const m=B.state.ui.modal;if(m.type==='library')m.record[field]=value;else m[field]=value;return;}
      if(scope==='checkgroup'){B.state.ui.checkedGroups=value?[...new Set([...B.state.ui.checkedGroups,field])]:B.state.ui.checkedGroups.filter(v=>v!==field);B.render();return;}
      if(scope==='ui'||scope==='analysis-ui'){B.state.ui[field]=value;if(field==='analysisId'){B.state.ui.roiId='';B.state.ui.analysisZoom=0;}B.render();return;}
      B.commit('修改 '+field,(p,g)=>{
        if((el.type==='number'||el.type==='range')&&!Number.isFinite(value))throw Error('请输入有限的有效数值。');
        if(scope==='canvas'){if(field==='preset'&&value){const [w,h]=value.split(',').map(Number);g.canvas.width=w;g.canvas.height=h;}else if(['width','height'].includes(field))g.canvas[field]=B.clamp(value,100,10000);else g.canvas[field]=field==='dpi'?Number(value):value;return;}
        if(scope==='group'){g[field]=value;return;}
        if(scope==='sample'){const [idx,key]=field.split('.');if(key==='id'&&(!String(value).trim()||g.samples.some((s,i)=>i!==Number(idx)&&s.id===String(value).trim())))throw Error('样本 ID 必须非空且在本图组中唯一。');g.samples[Number(idx)][key]=key==='id'?String(value).trim():value;return;}
        if(scope==='roi'){const o=g.objects.find(o=>o.id===B.getAnalysis().id),r=o.rois.find(r=>r.id===B.state.ui.roiId),s=p.sources.find(s=>s.id===o.sourceId);if(!r)return;if(o.locked)throw Error('此图像已锁定，请先解锁再修改 ROI。');if(field==='sampleIndex'){const idx=Number(value);if(o.rois.some(v=>v.id!==r.id&&v.sampleIndex===idx))throw Error('同一个蛋白的样本不能重复分配 ROI。');r.sampleIndex=idx;}else{const limits={x:[0,s.width-r.w],y:[0,s.height-r.h],w:[Math.min(1,s.width-r.x),s.width-r.x],h:[Math.min(1,s.height-r.y),s.height-r.y]};if(!limits[field])throw Error('ROI 字段无效。');r[field]=B.clamp(value,...limits[field]);B.assertRect(s,r,'条带 ROI');}return;}
        const objects=scope==='analysis'?[g.objects.find(o=>o.id===B.getAnalysis().id)]:g.objects.filter(o=>B.state.ui.selected.includes(o.id));
        if(!objects.some(o=>o&&!o.locked))throw Error('对象已锁定，请先解锁再编辑。');for(const o of objects.filter(o=>o&&!o.locked)){let v=value;if(field==='opacity')v=value/100;if(field==='fontWeight')v=value?700:400;if(field==='noFill'){o.fill=value?'none':'#ffffff';continue;}if(['w','h'].includes(field)){v=B.clamp(value,1,10000);if(o.lockRatio){const other=field==='w'?'h':'w';o[other]=o[other]*v/o[field];}}if(field==='fontSize')v=B.clamp(value,6,300);if(field==='strokeWidth')v=B.clamp(value,0,20);o[field]=v;if(field==='protein')o.name=v;}
      });
    }catch(err){B.render();B.toast(err.message);}
  });
  const point=(svg,ev)=>{const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
  const rectFrom=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)});
  B.refreshCanvas=()=>{const c=document.getElementById('canvas-content');if(c)c.innerHTML=B.canvasMarkup();};
  document.addEventListener('pointerdown',ev=>{
    if(ev.button!==0||!B.state.p)return;pointerControl=!!ev.target.closest('button,[data-action],input,select,textarea');if(B.state.ui.modal)return;const fig=ev.target.closest('#figure'),analysis=ev.target.closest('#analysis-image'),vp=ev.target.closest('#viewport'),{ui,p}=B.state;
    if(vp&&ui.tool==='hand'){gesture={type:'pan',x:ev.clientX,y:ev.clientY,left:vp.scrollLeft,top:vp.scrollTop,vp};ev.preventDefault();return;}
    if(analysis){const o=B.getAnalysis();if(o.locked){B.toast('此图像已锁定，请先解锁再框选。');return;}const s=p.sources.find(s=>s.id===o.sourceId),start=point(analysis,ev),roiEl=ev.target.closest('[data-roi]');if(roiEl&&ui.analysisTool==='roi'){ui.roiId=roiEl.dataset.roi;gesture={type:'roi-move',start,base:p,objectId:o.id,roiId:roiEl.dataset.roi,svg:analysis,rect:{...o.rois.find(r=>r.id===roiEl.dataset.roi)}};}else gesture={type:'analysis',start,base:p,objectId:o.id,svg:analysis,mode:ui.analysisTool,width:s.width,height:s.height};ev.preventDefault();return;}
    if(!fig)return;const start=point(fig,ev),resize=ev.target.closest('[data-resize]'),object=ev.target.closest('[data-object]');
    if(resize){const o=B.getGroup().objects.find(o=>o.id===resize.dataset.resize);if(o.locked)return;gesture={type:'resize',start,base:p,objects:B.getGroup().objects.filter(o=>ui.selected.includes(o.id)&&!o.locked),bounds:B.bounds(B.getGroup().objects.filter(o=>ui.selected.includes(o.id))),svg:fig};ev.preventDefault();return;}
    if(object){const id=object.dataset.object,o=B.getGroup().objects.find(o=>o.id===id);if(ev.shiftKey||ev.metaKey||ev.ctrlKey||!ui.selected.includes(id))B.selectObject(id,ev.shiftKey||ev.metaKey||ev.ctrlKey);if(!o.locked){gesture={type:'move',start,base:p,objects:B.getGroup().objects.filter(o=>ui.selected.includes(o.id)&&!o.locked),svg:fig};}B.render();ev.preventDefault();return;}
    if(!ev.shiftKey&&!ev.metaKey)ui.selected=[];gesture={type:'marquee',start,svg:fig,prior:ui.selected.slice()};ui.marquee={x:start.x,y:start.y,w:0,h:0};B.refreshCanvas();ev.preventDefault();
  });
  document.addEventListener('pointermove',ev=>{
    if(!gesture)return;const ge=gesture,ui=B.state.ui;
    if(ge.type==='pan'){ge.vp.scrollLeft=ge.left-(ev.clientX-ge.x);ge.vp.scrollTop=ge.top-(ev.clientY-ge.y);return;}
    // The original SVG can be detached after render; map through the current SVG instead.
    const svg=document.getElementById(ge.type==='analysis'||ge.type==='roi-move'?'analysis-image':'figure');if(!svg)return;const at=point(svg,ev),dx=at.x-ge.start.x,dy=at.y-ge.start.y;ge.moved=Math.abs(dx)+Math.abs(dy)>.5;
    if(ge.type==='marquee'){ui.marquee=rectFrom(ge.start,at);B.refreshCanvas();return;}
    if(ge.type==='analysis'){ui.analysisRect=rectFrom(ge.start,{x:B.clamp(at.x,0,ge.width),y:B.clamp(at.y,0,ge.height)});const current=document.querySelector('#analysis-image .live-rect');if(current)current.remove();const r=ui.analysisRect,node=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const [k,v] of Object.entries(r))node.setAttribute(k,v);node.setAttribute('class','live-rect');node.setAttribute('fill','#d6952d30');node.setAttribute('stroke','#d6952d');node.setAttribute('stroke-width','1');node.setAttribute('pointer-events','none');svg.append(node);return;}
    if(ge.type==='roi-move'){const p=B.clone(ge.base),g=p.groups.find(g=>g.id===ui.group),o=g.objects.find(o=>o.id===ge.objectId),s=p.sources.find(s=>s.id===o.sourceId),r=o.rois.find(r=>r.id===ge.roiId);r.x=B.clamp(ge.rect.x+dx,0,s.width-r.w);r.y=B.clamp(ge.rect.y+dy,0,s.height-r.h);B.state.p=p;const node=svg.querySelector('[data-roi="'+ge.roiId+'"] rect');if(node){node.setAttribute('x',r.x);node.setAttribute('y',r.y);}return;}
    const p=B.clone(ge.base),g=p.groups.find(g=>g.id===ui.group);ui.guideX=null;ui.guideY=null;
    if(ge.type==='move'){
      let mx=dx,my=dy;if(ui.snap&&!ev.altKey){const b=B.bounds(ge.objects),others=g.objects.filter(o=>!ui.selected.includes(o.id)&&o.visible!==false),xs=[0,g.canvas.width/2,g.canvas.width,...others.flatMap(o=>[o.x,o.x+o.w/2,o.x+o.w])],ys=[0,g.canvas.height/2,g.canvas.height,...others.flatMap(o=>[o.y,o.y+o.h/2,o.y+o.h])];const snap=(edges,targets,delta)=>{let best=5/ui.zoom,result={delta,guide:null};for(const v of edges)for(const t of targets){const d=t-v-delta;if(Math.abs(d)<best){best=Math.abs(d);result={delta:delta+d,guide:t};}}return result;};const x=snap([b.x,b.x+b.w/2,b.x+b.w],xs,mx),y=snap([b.y,b.y+b.h/2,b.y+b.h],ys,my);mx=x.delta;my=y.delta;ui.guideX=x.guide;ui.guideY=y.guide;}
      for(const base of ge.objects){const o=g.objects.find(o=>o.id===base.id);o.x=base.x+mx;o.y=base.y+my;}
    }else if(ge.type==='resize'){
      if(ge.objects.length===1){const base=ge.objects[0],o=g.objects.find(o=>o.id===base.id),r=(base.rotation||0)*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r),lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos;let w=Math.max(2,base.w+lx),h=Math.max(2,base.h+ly);if(base.lockRatio||ev.shiftKey)h=w*base.h/base.w;const ax=base.x+base.w/2+cos*(-base.w/2)-sin*(-base.h/2),ay=base.y+base.h/2+sin*(-base.w/2)+cos*(-base.h/2);o.x=ax+cos*w/2-sin*h/2-w/2;o.y=ay+sin*w/2+cos*h/2-h/2;o.w=w;o.h=h;
      }else{const b=ge.bounds,sx=Math.max(.05,(b.w+dx)/b.w),sy=ev.shiftKey?sx:Math.max(.05,(b.h+dy)/b.h);for(const base of ge.objects){const o=g.objects.find(o=>o.id===base.id);o.x=b.x+(base.x-b.x)*sx;o.y=b.y+(base.y-b.y)*sy;o.w=base.w*sx;o.h=base.h*sy;}}
    }B.state.p=p;B.refreshCanvas();
  });
  const endGesture=()=>{
    if(!gesture)return;const ge=gesture,ui=B.state.ui;gesture=null;ui.guideX=null;ui.guideY=null;
    try{
      if(ge.type==='marquee'){const r=ui.marquee;ui.selected=[...new Set([...ge.prior,...B.getGroup().objects.filter(o=>o.visible!==false&&o.x>=r.x&&o.y>=r.y&&o.x+o.w<=r.x+r.w&&o.y+o.h<=r.y+r.h).map(o=>o.id)])];ui.marquee=null;B.render();return;}
      if(ge.type==='analysis'){const r=ui.analysisRect;ui.analysisRect=null;if(!r||r.w<2||r.h<2){B.render();return;}B.commit(ge.mode==='crop'?'修改显示裁剪范围':ge.mode==='background'?'框选背景 ROI':'框选条带 ROI',(p,g)=>{const o=g.objects.find(o=>o.id===ge.objectId);if(o.locked)throw Error('此图像已锁定，请先解锁。');const s=p.sources.find(s=>s.id===o.sourceId),rect=B.rectPixels(s,r);if(ge.mode==='crop'){o.crop=rect;if(o.lockRatio)o.h=o.w*rect.h/rect.w;}else if(ge.mode==='background')o.background=rect;else{let i=0;while(o.rois.some(r=>r.sampleIndex===i))i++;if(i>=g.samples.length)throw Error('每条泳道已有一个 ROI。请删除多余框或添加泳道。');const roi={...rect,id:B.uid(),sampleIndex:i};o.rois.push(roi);ui.roiId=roi.id;}});return;}
      if(['move','resize','roi-move'].includes(ge.type)&&ge.moved){B.log(B.state.p,ge.type==='move'?'移动对象':ge.type==='resize'?'缩放对象':'移动 ROI','原图像素未修改。');B.validate(B.state.p);B.state.past.push(ge.base);if(B.state.past.length>35)B.state.past.shift();B.state.future=[];B.persist();B.render();}else if(ge.type!=='pan'){if(ge.base)B.state.p=ge.base;B.render();}
    }catch(err){B.state.p=ge.base;ui.analysisRect=null;B.render();B.toast(err.message);}
  };
  document.addEventListener('pointerup',()=>{endGesture();clearTimeout(renderTimer);renderTimer=setTimeout(()=>{pointerControl=false;B.flushRender();},0);});document.addEventListener('pointercancel',()=>{if(gesture?.base)B.state.p=gesture.base;gesture=null;B.state.ui.marquee=null;B.state.ui.analysisRect=null;B.state.ui.guideX=null;B.state.ui.guideY=null;pointerControl=false;B.render();});
  document.addEventListener('dblclick',ev=>{const node=ev.target.closest('[data-object]');if(!node)return;const o=B.getGroup().objects.find(o=>o.id===node.dataset.object);B.state.ui.selected=[o.id];if(o.type==='image')actions.crop();else if(o.type==='text'){B.state.ui.inspector='object';B.render();document.querySelector('[data-scope="object"][data-field="text"]')?.focus();}});
  document.addEventListener('keydown',ev=>{
    if(!B.state.p)return;const mod=ev.metaKey||ev.ctrlKey,key=ev.key.toLowerCase(),ui=B.state.ui,editing=ev.target.matches('input,textarea,select,[contenteditable="true"]');if(mod&&key==='s'){ev.preventDefault();if(editing)ev.target.dispatchEvent(new Event('change',{bubbles:true}));Promise.resolve(actions.save()).catch(err=>B.toast(err.message));return;}if(editing)return;
    if(ev.key==='Escape'){ui.modal=null;ui.selected=[];ui.shapeMenu=false;B.render();return;}
    if(ui.modal)return;
    if(mod&&['z','y','s','d','a','g'].includes(key)){ev.preventDefault();if(key==='z')B.performUndo(ev.shiftKey);if(key==='y')B.performUndo(true);if(key==='s')actions.save();if(key==='d')actions.duplicate();if(key==='a'){ui.selected=B.getGroup().objects.filter(o=>o.visible!==false).map(o=>o.id);B.render();}if(key==='g')actions[ev.shiftKey?'ungroup-objects':'group-objects']();return;}
    if(ui.tab==='edit'&&(ev.key==='Delete'||ev.key==='Backspace')&&ui.selected.length){ev.preventDefault();actions.delete();return;}
    if(ui.tab==='edit'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)&&ui.selected.length){ev.preventDefault();const n=ev.shiftKey?10:1;B.editSelected('方向键微调',o=>{if(ev.key==='ArrowLeft')o.x-=n;if(ev.key==='ArrowRight')o.x+=n;if(ev.key==='ArrowUp')o.y-=n;if(ev.key==='ArrowDown')o.y+=n;});}
  });
  document.addEventListener('dragover',ev=>{if(ev.dataTransfer?.types.includes('Files')){ev.preventDefault();document.body.classList.add('dragging');}});document.addEventListener('dragleave',ev=>{if(!ev.relatedTarget)document.body.classList.remove('dragging');});document.addEventListener('drop',async ev=>{ev.preventDefault();document.body.classList.remove('dragging');const files=Array.from(ev.dataTransfer?.files||[]);try{const project=files.find(f=>f.name.endsWith('.wbproj'));if(project)await B.openProject(project);else if(files.length)await B.importFiles(files);}catch(err){B.toast(err.message);}});
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(B.state.p&&B.state.ui.tab==='edit')B.fit();},200);});
  B.ready=(async()=>{try{const saved=await B.db.read();B.state.p=saved?B.validate(saved):B.demoProject();B.state.ui.saveStatus=saved?'已恢复本地项目':'演示项目已就绪';}catch(err){B.state.p=B.demoProject();B.state.ui.saveStatus='自动保存不可用 · 可导出项目备份';}B.state.ui.group=B.state.p.activeGroup||B.state.p.groups[0].id;B.state.ui.selected=B.getGroup().objects.filter(o=>o.type==='image').slice(0,1).map(o=>o.id);B.render();requestAnimationFrame(()=>B.fit());})();
})(globalThis.BS ||= {});
