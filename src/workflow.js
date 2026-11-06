(function(B){
  'use strict';
  const split=s=>String(s||'').split(/[,，\n]/).map(s=>s.trim()).filter(Boolean);
  B.designSamples=config=>{
    const repeats=Number(config.repeats??1);if(!Number.isInteger(repeats)||repeats<1||repeats>200)throw Error('每组样本数必须为 1–200。');
    let rows=[];
    if(config.mode==='linear')rows=split(config.groups).map(group=>({group,factors:{分组:group}}));
    else if(config.mode==='matrix'){
      const factors=String(config.factors||'').split('\n').filter(s=>s.trim()).map(line=>{const at=line.search(/[:：]/);if(at<1)throw Error('因素请写成“因素名:水平1,水平2”。');return{name:line.slice(0,at).trim(),levels:split(line.slice(at+1))};});
      if(!factors.length||factors.length>5||factors.some(f=>!f.levels.length)||new Set(factors.map(f=>f.name)).size!==factors.length)throw Error('请设置 1–5 个不重名且有水平的因素。');
      rows=[{factors:{}}];for(const f of factors){if(rows.length*f.levels.length*repeats>200)throw Error('设计超过 200 条泳道。');rows=rows.flatMap(r=>f.levels.map(v=>({factors:{...r.factors,[f.name]:v}})));}rows=rows.map(r=>({...r,group:Object.values(r.factors).join(' / ')}));
    }else if(config.mode==='conditions'){
      const conditions=String(config.conditions||'').split('\n').filter(s=>s.trim()).map(line=>{const at=line.search(/[:：]/);if(at<1)throw Error('条件请写成“条件名:-,+,-,+”。');return{name:line.slice(0,at).trim(),values:split(line.slice(at+1)).map(v=>v==='−'?'-':v)};});
      const count=conditions[0]?.values.length;if(!count||conditions.some(c=>c.values.length!==count||c.values.some(v=>!['+','-'].includes(v)))||new Set(conditions.map(c=>c.name)).size!==conditions.length)throw Error('各条件必须具有相同泳道数，且只使用 + 或 -。');
      rows=Array.from({length:count},(_,i)=>{const factors=Object.fromEntries(conditions.map(c=>[c.name,c.values[i]]));return{factors,group:Object.entries(factors).map(([k,v])=>k+v).join(' / ')};});
    }else throw Error('实验设计模式无效。');
    if(!rows.length||rows.length*repeats>200)throw Error('请设置 1–200 条泳道。');
    const counts=new Map();return rows.flatMap(r=>Array.from({length:repeats},()=>{const replicate=(counts.get(r.group)||0)+1;counts.set(r.group,replicate);return{...r,replicate,include:true};})).map((s,i)=>({...s,id:'S'+(i+1)}));
  };
  B.scopedGroups=(p,g,scope)=>scope==='topic'?p.groups.filter(v=>(v.topic||p.name)===(g.topic||p.name)):scope==='experiment'?p.groups.filter(v=>v.experiment===g.experiment&&(v.topic||p.name)===(g.topic||p.name)):[g];
  B.replaceSource=(project,group,imageId,source)=>{
    const image=group.objects.find(v=>v.id===imageId&&v.type==='image');if(!image)throw Error('待替换图像不存在。');if(image.locked)throw Error('请先解锁图像。');
    const previous=project.sources.find(v=>v.id===image.sourceId);project.sources.push(source);image.sourceId=source.id;
    if(previous.width!==source.width||previous.height!==source.height){image.crop={x:0,y:0,w:source.width,h:source.height};image.background=null;image.rois=group.samples.length?B.autoROIs(image.crop,group.samples.length):[];if(image.lockRatio)image.h=image.w*source.height/source.width;}
    return{from:previous.hash||previous.id,to:source.hash||source.id};
  };
  B.linkedSVG=async(p,g)=>{
    let svg=B.svg(p,g);if(B.prepareSVG)svg=await B.prepareSVG(svg);
    const files={},replacements=new Map();let index=0;
    for(const match of svg.matchAll(/href="(data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)"/g)){const url=match[1];if(replacements.has(url))continue;const mime=url.match(/^data:image\/(\w+)/)[1],filename='images/source-'+(++index)+'.'+(mime==='jpeg'?'jpg':mime);files[filename]=B.unbase64(url.split(',')[1]);replacements.set(url,filename);}
    for(const [url,file] of replacements)svg=svg.replaceAll(url,file);
    files['figure.svg']=svg;files['README.txt']='Keep figure.svg and the images folder together. Images are display previews; retain the .wbproj for original quantification.\n';return B.zip(files);
  };
  const oldLayout=B.quickLayout;
  B.quickLayout=(g,opts={})=>{
    if(!opts.extended&&!g.layoutOptions)return oldLayout(g,opts);
    const a={width:640,height:70,gap:20,cropMode:'width',swap:false,groupPosition:'above',groupLine:true,groupGap:8,proteinGap:12,mwGap:8,lineWidth:1.5,showKda:true,showDash:false,syncGroups:false,syncProtein:false,syncMw:false,...g.layoutOptions,...opts};
    if(!['width','height','both','free'].includes(a.cropMode)||!['above','below'].includes(a.groupPosition)||![a.width,a.height,a.gap,a.groupGap,a.proteinGap,a.mwGap,a.lineWidth].every(Number.isFinite))throw Error('快速排版参数无效。');
    const before=JSON.parse(JSON.stringify(g)),images=g.objects.filter(o=>o.type==='image'&&o.visible!==false);if(!images.length)throw Error('请先导入条带。');if(images.some(o=>o.locked)||g.objects.some(o=>o.autoLabel&&o.locked))throw Error('请先解锁条带和自动标签。');
    try{
      const left=a.swap?165:180,right=a.width+left,add=[],fields=[...new Set(g.samples.flatMap(s=>Object.keys(s.factors||{})))],rows=fields.length?fields:['分组'];let y=65+(a.groupPosition==='above'?rows.length*32+20:0);
      const text=(t,x,y,w,size=21,align='left',role='')=>add.push(B.object('text',{text:t,name:t,x,y,w,h:size*1.4,fontSize:size,align,autoLabel:true,labelRole:role}));
      for(const o of images){const c={...o.crop};if(a.cropMode==='both'){const desiredRatio=a.width/a.height;if(c.w/c.h>desiredRatio){const nw=c.h*desiredRatio;c.x+=(c.w-nw)/2;c.w=nw;}else{const nh=c.w/desiredRatio;c.y+=(c.h-nh)/2;c.h=nh;}o.crop=c;}
        const w=a.cropMode==='height'?a.height*c.w/c.h:a.cropMode==='free'?o.w:a.width,h=a.cropMode==='height'||a.cropMode==='both'?a.height:a.cropMode==='free'?o.h:w*c.h/c.w;
        Object.assign(o,{x:left,y,w,h,rotation:o.rotation||0,strokeWidth:a.lineWidth});const protein=o.protein||o.name,mw=(a.showDash?'-':'')+(o.mw||'')+(a.showKda?' kDa':'');
        text(a.swap?mw:protein,5,y+h/2-14,left-(a.swap?a.mwGap:a.proteinGap)-5,22,'right',a.swap?'mw':'protein');text(a.swap?protein:mw,left+w+(a.swap?a.proteinGap:a.mwGap),y+h/2-14,155,22,'left',a.swap?'protein':'mw');y+=h+a.gap;
      }
      rows.forEach((field,row)=>{const yy=a.groupPosition==='above'?24+row*32:y+row*32;for(let start=0;start<g.samples.length;){const value=g.samples[start].factors?.[field]??g.samples[start].group;let end=start+1;while(end<g.samples.length&&(g.samples[end].factors?.[field]??g.samples[end].group)===value)end++;const x=left+a.width*start/g.samples.length,w=a.width*(end-start)/g.samples.length;const pairId=a.syncGroups?'layout-pair-'+B.uid():null;text(value,x,yy,w,20,'center','group');if(pairId)add.at(-1).groupId=pairId;if(a.groupLine)add.push(B.object('line',{name:'分组框线',x:x+3,y:yy+25+a.groupGap,w:Math.max(1,w-6),h:.01,strokeWidth:a.lineWidth,autoLabel:true,labelRole:'group-line',...(pairId?{groupId:pairId}:{})}));start=end;}});
      g.objects=g.objects.filter(o=>!o.autoLabel).concat(add);g.canvas.width=Math.max(400,right+190);g.canvas.height=Math.max(250,y+(a.groupPosition==='below'?rows.length*32:0)+45);if(g.canvas.width>10000||g.canvas.height>10000||g.objects.length>3000)throw Error('排版超过画布或对象上限。');g.layoutOptions=a;
    }catch(error){Object.assign(g,before);throw error;}
  };
  if(!B.state||!B.actions)return;
  const e=B.esc,ui=()=>B.state.ui,p=()=>B.state.p,g=()=>B.getGroup(),o=()=>B.getAnalysis(),actions=B.actions;
  const dialog=(title,body,footer)=>'<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true"><div class="modal-heading"><h2>'+e(title)+'</h2>'+B.ib('close-modal','关闭','close')+'</div><div class="modal-body">'+body+'</div><div class="modal-footer">'+B.btn('close-modal','取消')+footer+'</div></section></div>';
  const input=(field,value,title,attrs='')=>B.input('modal',field,value,title,attrs),select=(field,value,choices,title)=>B.select('modal',field,value,choices,title),check=(field,value,title)=>B.check('modal',field,value,title);
  const textarea=(field,value,title)=>'<label class="field"><span>'+e(title)+'</span><textarea data-scope="modal" data-field="'+field+'" aria-label="'+e(title)+'" rows="4">'+e(value)+'</textarea></label>';
  const modal=B.modal;B.modal=()=>{
    const m=ui().modal;if(!m)return '';
    if(m.type==='methods')return dialog('灰度计算方式',check('applyAll',m.applyAll,'同时应用当前图组的全部蛋白')+check('convert8',m.convert8,'转为 8-bit 灰度图')+select('rgb',m.rgb,[['mean','ImageJ 等权 RGB 平均'],['luminance','加权亮度 0.299 / 0.587 / 0.114']],'彩色图转换')+select('background',m.background,[['none','不扣背景'],['rolling','ImageJ 滚球背景'],['roi','背景框均值']],'背景处理')+input('radius',m.radius,'Rolling Ball Radius px','type="number" min="0" max="100" step="1"')+check('presmooth',m.presmooth,'滚球前 3×3 平滑')+input('rotation',m.rotation||0,'分析校正旋转角度 °','type="number" min="-180" max="180" step="0.5"')+select('method',m.method,[['rect','自动矩形 ROI'],['ellipse','自动椭圆 ROI'],['profile','泳道峰面积']],'选区模式')+select('profileAxis',m.profileAxis||'y',[['y','沿泳道纵向 y'],['x','沿条带横向 x']],'峰图方向')+'<p class="hint">计算使用独立副本，原文件与排版预览均保留。16-bit 转 8-bit 按整张原图范围缩放；半径 0 关闭滚球。切换方法不会改变显示亮度和对比度。</p>',B.btn('apply-methods','应用设置','check','class="primary"'));
    if(m.type==='wizard')return dialog('实验设计',select('mode',m.mode,[['linear','单因素分组'],['matrix','多因素矩阵'],['conditions','± 条件模式']],'设计模式')+input('repeats',m.repeats,'每个组合的样本数','type="number" min="1" max="200"')+textarea('groups',m.groups,'单因素分组（逗号或换行）')+textarea('factors',m.factors,'多因素：每行 因素名:水平1,水平2')+textarea('conditions',m.conditions,'±条件：每行 条件名:-,+,-,+')+'<p class="hint">点击预览核对泳道和分组，再应用。现有 ROI 保留泳道索引；超过新样本数的 ROI 会移除，可撤销。</p>'+(m.preview?'<pre>'+e(m.preview)+'</pre>':''),B.btn('preview-design','预览泳道','grid')+B.btn('apply-design','应用设计','check','class="primary"'));
    if(m.type==='newgroup')return dialog('新建图组',input('name',m.name,'图组名称')+input('topic',m.topic||g().topic||p().name,'所属课题')+input('experiment',m.experiment,'所属实验'),B.btn('create-group','创建图组','plus','class="primary"'));
    if(m.type==='node')return dialog(m.kind==='topic'?'新建课题':'新建实验',input('name',m.name,'名称')+(m.kind==='experiment'?input('topic',m.topic,'所属课题'):''),B.btn('save-node',m.old?'保存':'创建','plus','class="primary"'));
    if(m.type==='delete-node')return dialog('删除目录', '<p>删除 '+e(m.name)+'。图组可从“找回图组”恢复；提升下级会保留全部图组。</p>',B.btn('promote-node','仅删除本项，下级提升一级','folder')+B.btn('cascade-node','删除本项及全部下级','trash'));
    if(m.type==='recovery')return dialog('找回图组',((p().deletedGroups||[]).map(v=>'<div class="button-row"><span>'+e(v.group.name)+' · '+e(v.time)+'</span>'+B.btn('restore-group','恢复图组','','data-id="'+v.group.id+'"')+'</div>').join('')||'<p>没有已删除图组。</p>'),B.btn('close-modal','完成','check'));
    if(m.type==='export-scope')return dialog('导出灰度数据',select('scope',m.scope,[['current','当前图组'],['experiment','当前实验'],['topic','当前课题']],'数据范围'),B.btn('export-scoped','导出 Excel','export','class="primary"'));
    if(m.type==='layout')return dialog('快速排版',input('width',m.width,'统一宽度 px','type="number" min="100" max="5000"')+input('height',m.height,'统一高度 px','type="number" min="1" max="1000"')+select('cropMode',m.cropMode,[['width','仅统一宽度'],['height','仅统一高度'],['both','统一高度和宽度（中心裁剪）'],['free','自由裁剪 / 保留尺寸']],'图片裁剪方式')+input('gap',m.gap,'行间距 px','type="number" min="0" max="500"')+input('groupGap',m.groupGap,'分组名与框线 px','type="number" min="0" max="50"')+input('proteinGap',m.proteinGap,'蛋白名与条带 px','type="number" min="0" max="50"')+input('mwGap',m.mwGap,'分子量与条带 px','type="number" min="0" max="50"')+input('lineWidth',m.lineWidth,'框线粗细 px','type="number" min="0" max="20" step="0.5"')+select('groupPosition',m.groupPosition,[['above','条带上方'],['below','条带下方']],'分组名位置')+check('swap',m.swap,'交换蛋白和分子量位置')+check('groupLine',m.groupLine,'显示分组框线')+check('showKda',m.showKda,'显示 kDa')+check('showDash',m.showDash,'分子量前显示横线')+check('syncGroups',m.syncGroups,'同步分组文字与框线')+check('syncProtein',m.syncProtein,'同步蛋白名样式')+check('syncMw',m.syncMw,'同步分子量样式')+'<p class="hint">统一高宽使用中心裁剪，不拉伸条带。全部标签、框线和图片仍为独立可编辑对象。自动排版可撤销。</p>',B.btn('apply-layout','应用排版','bolt','class="primary"'));
    if(m.type==='export'){
      let html=modal();html=html.replace('<option value="svg"','<option value="jpg" '+(m.format==='jpg'?'selected':'')+'>JPG · 组图</option><option value="svg-linked" '+(m.format==='svg-linked'?'selected':'')+'>SVG · 链接图片 ZIP</option><option value="svg"');
      return html.replace('<p class="hint">',select('quality',m.quality||.94,[[1,'100%'],[.94,'94% 推荐'],[.85,'85%']],'JPG 质量')+'<p class="hint">');
    }
    return modal();
  };
  const header=B.header;B.header=()=>header().replace('<div class="header-actions">','<div class="header-actions"><div class="menu-wrap project-menu">'+B.btn('project-menu','项目工具','grid')+(ui().projectTools?'<div class="dropdown">'+B.btn('wizard','实验设计向导','grid')+B.btn('export-scope','分范围导出','export')+B.btn('workspace','文件管理','folder')+'</div>':'')+'</div>');
  const sidebar=B.sidebar;B.sidebar=()=>{
    let html=sidebar();const project=p(),current=g(),topics=[...new Set([...(project.topics||[]),...project.groups.map(v=>v.topic||project.name)])];
    let tree='<div class="tree"><button class="tree-root" data-action="project-name">'+e(project.name)+'</button>';
    for(const topic of topics){const topicKey='topic:'+topic,topicClosed=(ui().collapsedFolders||[]).includes(topicKey);const groups=project.groups.filter(v=>(v.topic||project.name)===topic),experiments=[...new Set([...groups.map(v=>v.experiment),...(project.experiments||[]).filter(v=>v.topic===topic).map(v=>v.name)])];
      tree+='<div class="experiment-row">'+B.ib('toggle-folder',topicClosed?'展开课题':'收起课题',topicClosed?'plus':'minus','data-id="'+e(topicKey)+'"')+'<b>课题 · '+e(topic)+'</b>'+B.ib('select-topic','选择课题 '+topic,'check','data-topic="'+e(topic)+'"')+B.ib('edit-topic','编辑课题 '+topic,'layers','data-topic="'+e(topic)+'"')+B.ib('delete-topic','删除课题 '+topic,'trash','data-topic="'+e(topic)+'"')+'</div>';
      if(topicClosed)continue;for(const experiment of experiments){const experimentKey='experiment:'+topic+' / '+experiment,experimentClosed=(ui().collapsedFolders||[]).includes(experimentKey);tree+='<div class="experiment-row" style="padding-left:20px">'+B.ib('toggle-folder',experimentClosed?'展开实验':'收起实验',experimentClosed?'plus':'minus','data-id="'+e(experimentKey)+'"')+'实验 · '+e(experiment)+B.ib('select-experiment','选择实验 '+experiment,'check','data-topic="'+e(topic)+'" data-name="'+e(experiment)+'"')+B.ib('edit-experiment','编辑实验 '+experiment,'layers','data-topic="'+e(topic)+'" data-name="'+e(experiment)+'"')+B.ib('delete-experiment','删除实验 '+experiment,'trash','data-topic="'+e(topic)+'" data-name="'+e(experiment)+'"')+'</div>';
        if(experimentClosed)continue;for(const gr of groups.filter(v=>v.experiment===experiment)){tree+='<div class="tree-group '+(gr.id===current.id?'active':'')+'"><input type="checkbox" aria-label="选择图组 '+e(gr.name)+'" data-scope="checkgroup" data-field="'+gr.id+'" '+(ui().checkedGroups.includes(gr.id)?'checked':'')+'><button data-action="group" data-id="'+gr.id+'">'+e(gr.name)+'</button>'+B.ib('group-menu','图组操作','layers','data-id="'+gr.id+'"')+'</div>';if(gr.id===current.id)tree+=gr.objects.filter(v=>v.type==='image').map(image=>'<button class="protein-row" data-action="protein" data-id="'+image.id+'">'+e(image.protein||image.name)+'<small>'+e({control:'内参',total:'总蛋白',target:'目的'}[image.kind]||'')+'</small></button>').join('');}
      }
    }
    tree+='</div>';const start=html.indexOf('<div class="tree">'),end=html.indexOf('<div class="sidebar-tools">',start);if(start>=0&&end>start)html=html.slice(0,start)+tree+html.slice(end);
    return html.replace('<div class="tree">','<div class="sidebar-tools">'+B.btn('select-all-groups','全选','check')+B.btn('clear-group-selection','取消选择','close')+B.btn('new-topic','新建课题','folder')+B.btn('new-experiment','新建实验','plus')+B.btn('recover-groups','找回图组','undo')+'</div><div class="tree">');
  };
  const design=B.design;B.design=()=>design().replace('<div class="design-detail">','<div class="design-detail">'+B.input('group','topic',g().topic||p().name,'所属课题'));
  const analysis=B.analysis;B.analysis=()=>{
    let html=analysis();if(!o())return html;
    const opts=o().analysis,images=g().objects.filter(v=>v.type==='image'&&v.id!==o().id),choices=[['','未指定'],...images.map(v=>[v.id,v.protein||v.name])];
    html=html.replace('<div class="analysis-tools">','<div class="analysis-settings">'+B.select('analysis','kind',o().kind||'target',[['target','目的蛋白'],['control','内参'],['total','总蛋白']],'蛋白类型')+B.select('analysis','controlId',o().controlId||'',choices,'内参蛋白')+B.select('analysis','totalId',o().totalId||'',choices,'总蛋白')+B.btn('methods','灰度计算方式','grid')+B.btn('detect-rois','自动定位条带','bolt')+B.btn('reupload-image','重新上传此蛋白','image')+'</div><div class="analysis-tools">');
    if(opts?.rotation)html=html.replace('选中 ROI 的原图坐标','选中 ROI 的校正副本坐标').replace('<svg id="analysis-image"', '<svg data-analysis-rotation="'+opts.rotation+'" id="analysis-image"');
    if(opts?.method==='ellipse')html=html.replace(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" fill="(#13897d[^"]+)"/g,(_,x,y,w,h,fill)=>'<ellipse cx="'+(+x+(+w)/2)+'" cy="'+(+y+(+h)/2)+'" rx="'+(+w)/2+'" ry="'+(+h)/2+'" fill="'+fill+'"');
    if(opts)html=html.replace('定量始终读取原始 '+(p().sources.find(s=>s.id===o().sourceId)?.bitDepth)+'-bit 像素。','分析使用独立副本；计算位深 '+(opts.convert8?8:p().sources.find(s=>s.id===o().sourceId)?.bitDepth)+'-bit，方法 '+e(opts.method)+'，背景 '+e(opts.background)+'。');
    if(opts?.method==='profile'){
      const records=B.records(p(),g()).filter(r=>r.objectId===o().id),r=records.find(r=>r.roi.id===ui().roiId)||records[0];
      if(r?.profile){const a=r.profile,high=Math.max(1,...a.values),points=a.values.map((v,i)=>(i*700/Math.max(1,a.values.length-1))+','+(150-v/high*140)).join(' '),base=a.baseline.map((v,i)=>(i*700/Math.max(1,a.values.length-1))+','+(150-v/high*140)).join(' ');html+='<div class="profile-panel"><h3>泳道峰图 · '+e(r.sampleId)+'</h3><svg viewBox="0 0 710 170" role="img" aria-label="泳道峰图"><polyline points="'+points+'" fill="none" stroke="#13897d" stroke-width="2"/><polyline points="'+base+'" fill="none" stroke="#d6952d"/></svg><p>正信号与线性基线之间的梯形积分面积：'+B.format(a.area)+'</p>'+B.input('baseline','baselineStart',r.roi.baselineStart??Math.min(...a.values),'基线起点','type="number" min="0" step="0.1"')+B.input('baseline','baselineEnd',r.roi.baselineEnd??Math.min(...a.values),'基线终点','type="number" min="0" step="0.1"')+'</div>';ui().profileRoiId=r.roi.id;}
    }
    return html;
  };
  const stats=B.stats;B.stats=()=>stats().replace('<option value="ratio"','<option value="controlRatio" '+(ui().metric==='controlRatio'?'selected':'')+'>目的 / 内参比值</option><option value="totalRatio" '+(ui().metric==='totalRatio'?'selected':'')+'>部分 / 总蛋白比值</option><option value="ratio"');
  const inspector=B.inspector;B.inspector=()=>{const html=inspector(),sel=g().objects.filter(v=>ui().selected.includes(v.id));if(!sel.length)return html;return html.replace('<h3>边框</h3>','<h3>文字与线型</h3>'+B.select('object','script',sel[0].script||'normal',[['normal','普通'],['super','上标'],['sub','下标']],'文字基线')+B.select('object','dash',sel[0].dash||'solid',[['solid','实线'],['dash','虚线'],['dot','点线']],'线型')+'<h3>边框</h3>');};
  Object.assign(actions,{
    'select-all-groups':()=>{ui().checkedGroups=p().groups.map(v=>v.id);B.render();},
    'clear-group-selection':()=>{ui().checkedGroups=[];B.render();},
    'toggle-folder':el=>{const all=ui().collapsedFolders||[];ui().collapsedFolders=all.includes(el.dataset.id)?all.filter(v=>v!==el.dataset.id):[...all,el.dataset.id];B.render();},
    'project-menu':()=>{ui().projectTools=!ui().projectTools;B.render();},
    'reupload-image':()=>{const current=o();if(!current||current.locked)throw Error('请选择未锁定的蛋白。');const snapshot=p(),groupId=g().id,imageId=current.id,input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/tiff,.tif,.tiff';input.addEventListener('change',async()=>{try{if(!input.files[0])return;const sources=await B.importImage(input.files[0]);if(p()!==snapshot)throw Error('导入期间项目已改变，请重新选择替换图像。');if(sources.length!==1)throw Error('替换图像时请使用单页文件；多页 TIFF 可通过“添加图像”导入。');B.commit('替换蛋白原图（原来源保留）',project=>B.replaceSource(project,project.groups.find(v=>v.id===groupId),imageId,sources[0]));B.toast('已替换图像，旧原图仍保留在项目来源中。');}catch(error){B.toast(error.message);}});input.click();},
    'create-group':()=>{const m=ui().modal;if(!m.name?.trim())throw Error('请填写图组名称。');B.commit('新建图组',project=>{const group=B.blankGroup(m.name.trim(),m.experiment||'实验 01');group.topic=m.topic||g().topic||project.name;project.groups.push(group);ui().group=group.id;ui().modal=null;});},
    methods:()=>{ui().modal={type:'methods',...(o().analysis||{...B.analysisDefaults(),convert8:false,background:o().background?'roi':'none'})};B.render();},
    'apply-methods':()=>{const m=ui().modal,a=B.validateAnalysis(Object.fromEntries(['convert8','rgb','background','radius','presmooth','method','rotation','profileAxis'].map(k=>[k,m[k]])));if(m.applyAll)B.commit('统一图组灰度分析方法',(_project,group)=>{const images=group.objects.filter(v=>v.type==='image');if(images.some(v=>v.locked))throw Error('请先解锁全部蛋白，再统一方法。');for(const image of images){image.analysis={...a};for(const roi of image.rois)delete roi.shape;}ui().modal=null;});else B.editAnalysis('设置灰度分析方法',v=>{v.analysis={...a};for(const r of v.rois)delete r.shape;ui().modal=null;});},
    'detect-rois':()=>B.editAnalysis('自动定位条带',(v,project,group)=>{v.analysis ||= B.analysisDefaults();const s=project.sources.find(s=>s.id===v.sourceId);if(!group.samples.length)throw Error('请先在实验设计中设置样本与分组。');v.rois=B.detectBandROIs(s,v.crop,group.samples.length,v.analysis,v.polarity);ui().roiId=v.rois[0]?.id||'';}),
    wizard:()=>{ui().projectTools=false;ui().modal={type:'wizard',mode:'linear',repeats:1,groups:'',factors:'',conditions:''};B.render();},
    'preview-design':()=>{const m=ui().modal;m.preview=B.designSamples(m).map((v,i)=>(i+1)+'\t'+v.id+'\t'+v.group+'\t重复 '+v.replicate).join('\n');B.render();},
    'apply-design':()=>{const m=ui().modal,samples=B.designSamples(m);B.commit('应用实验设计',(project,group)=>{group.samples=samples;group.design={mode:m.mode};for(const image of group.objects.filter(v=>v.type==='image'))image.rois=image.rois.filter(r=>r.sampleIndex<samples.length);ui().modal=null;});},
    'new-topic':()=>{ui().modal={type:'node',kind:'topic',name:'新课题'};B.render();},
    'new-experiment':()=>{ui().modal={type:'node',kind:'experiment',name:'新实验',topic:g().topic||p().name};B.render();},
    'save-node':()=>{const m=ui().modal;if(!m.name?.trim())throw Error('名称不能为空。');B.commit('新建'+(m.kind==='topic'?'课题':'实验'),project=>{project.topics ||= [];project.experiments ||= [];if(m.old){for(const group of project.groups){if(m.kind==='topic'&&(group.topic||project.name)===m.old)group.topic=m.name.trim();if(m.kind==='experiment'&&group.experiment===m.old&&(group.topic||project.name)===m.topic)group.experiment=m.name.trim();}if(m.kind==='topic'){project.topics=project.topics.map(t=>t===m.old?m.name.trim():t);project.experiments.forEach(v=>{if(v.topic===m.old)v.topic=m.name.trim();});}else project.experiments.forEach(v=>{if(v.topic===m.topic&&v.name===m.old)v.name=m.name.trim();});ui().modal=null;return;}if(m.kind==='topic'){if(project.topics.includes(m.name.trim()))throw Error('课题名称已存在。');project.topics.push(m.name.trim());}else{const topic=m.topic?.trim()||project.name;if(project.experiments.some(v=>v.topic===topic&&v.name===m.name.trim()))throw Error('实验名称已存在。');project.experiments.push({topic,name:m.name.trim()});}ui().modal=null;});},
    'edit-topic':el=>{ui().modal={type:'node',kind:'topic',old:el.dataset.topic,name:el.dataset.topic};B.render();},
    'edit-experiment':el=>{ui().modal={type:'node',kind:'experiment',old:el.dataset.name,name:el.dataset.name,topic:el.dataset.topic};B.render();},
    'delete-topic':el=>{ui().modal={type:'delete-node',kind:'topic',name:el.dataset.topic};B.render();},
    'delete-experiment':el=>{ui().modal={type:'delete-node',kind:'experiment',name:el.dataset.name,topic:el.dataset.topic};B.render();},
    'promote-node':()=>B.removeDirectory(false),
    'cascade-node':()=>B.removeDirectory(true),
    'select-topic':el=>{ui().checkedGroups=p().groups.filter(v=>(v.topic||p().name)===el.dataset.topic).map(v=>v.id);B.render();},
    'select-experiment':el=>{ui().checkedGroups=p().groups.filter(v=>(v.topic||p().name)===el.dataset.topic&&v.experiment===el.dataset.name).map(v=>v.id);B.render();},
    'recover-groups':()=>{ui().modal={type:'recovery'};B.render();},
    'restore-group':el=>B.commit('恢复已删除图组',project=>{const i=(project.deletedGroups||[]).findIndex(v=>v.group.id===el.dataset.id);if(i<0)throw Error('恢复记录不存在。');const restored=project.deletedGroups.splice(i,1)[0].group;if(project.groups.some(v=>v.id===restored.id))throw Error('图组已存在。');project.groups.push(restored);ui().group=restored.id;ui().modal=null;}),
    'export-scope':()=>{ui().projectTools=false;ui().modal={type:'export-scope',scope:'current'};B.render();},
    'export-scoped':async()=>{const scope=ui().modal.scope,groups=B.scopedGroups(p(),g(),scope),data=B.workbook([{name:'图组灰度汇总',rows:[['课题','实验','图组',...B.resultRows([])[0]],...groups.flatMap(group=>B.resultRows(B.records(p(),group)).slice(1).map(row=>[group.topic||p().name,group.experiment,group.name,...row]))]}]);await B.saveFile('BlotStudio-'+scope+'.xlsx',data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');ui().modal=null;B.render();},
    'quick-layout':()=>{ui().modal={type:'layout',extended:true,width:640,height:70,gap:20,cropMode:'width',swap:false,groupPosition:'above',groupLine:true,groupGap:8,proteinGap:12,mwGap:8,lineWidth:1.5,showKda:true,showDash:false,...g().layoutOptions};B.render();},
    'apply-layout':()=>{const m=ui().modal;B.commit('快速排版',(project,group)=>{B.quickLayout(group,m);ui().modal=null;ui().selected=[];});B.fit();}
  });
  B.removeDirectory=cascade=>{const m=ui().modal;B.commit(cascade?'删除目录与下级至恢复区':'删除目录并提升下级',project=>{const match=gr=>m.kind==='topic'?(gr.topic||project.name)===m.name:gr.experiment===m.name&&(gr.topic||project.name)===m.topic;const affected=project.groups.filter(match);if(cascade){project.deletedGroups ||= [];for(const group of affected)project.deletedGroups.push({group:JSON.parse(JSON.stringify(group)),time:new Date().toISOString()});project.groups=project.groups.filter(gr=>!match(gr));}else for(const group of affected){if(m.kind==='topic')group.topic='未分类课题';else group.experiment='未分类实验';}project.topics=(project.topics||[]).filter(t=>m.kind!=='topic'||t!==m.name);project.experiments=(project.experiments||[]).filter(v=>m.kind==='topic'?v.topic!==m.name:!(v.topic===m.topic&&v.name===m.name));if(!project.groups.length)project.groups=[B.blankGroup()];ui().group=project.groups[0].id;ui().modal=null;});};
  const deleteGroup=actions.deletegroup;actions.deletegroup=el=>{const target=p().groups.find(v=>v.id===el.dataset.id);if(!target)return;B.commit('删除图组至恢复区',project=>{project.deletedGroups ||= [];project.deletedGroups.push({group:JSON.parse(JSON.stringify(target)),time:new Date().toISOString()});project.groups=project.groups.filter(v=>v.id!==target.id);if(!project.groups.length)project.groups=[B.blankGroup()];ui().group=project.groups[0].id;ui().modal=null;});};
  const doExport=B.doExport;B.doExport=async()=>{const m=ui().modal;if(!m||!['jpg','svg-linked'].includes(m.format))return doExport();if(ui().exporting)throw Error('正在导出。');ui().exporting=true;try{const name=g().name.replace(/[\\/:*?"<>|]/g,'_');let data,mime,ext;if(m.format==='svg-linked'){data=await B.linkedSVG(p(),g());mime='application/zip';ext='zip';}else{const scale=Number(m.scale),quality=Number(m.quality||.94);if(![1,2,3,4].includes(scale)||![1,.94,.85].includes(quality))throw Error('JPG 导出参数无效。');const canvas=await B.rasterize(B.svg(p(),g()),g().canvas.width*scale,g().canvas.height*scale);data=B.unbase64(canvas.toDataURL('image/jpeg',quality).split(',')[1]);mime='image/jpeg';ext='jpg';}const result=await B.saveFile(name+'.'+ext,data,mime);ui().modal=null;B.render();B.toast(result.status==='saved'?'文件已保存。':'已请求浏览器下载，请核对下载记录。');}finally{ui().exporting=false;}};
  const imported=B.importFiles;B.importFiles=async files=>{const old=new Set(p().sources.map(s=>s.id));await imported(files);if(!p().sources.some(s=>!old.has(s.id)))return;B.commit('为新图像创建分析选区',(project)=>{for(const group of project.groups)for(const image of group.objects.filter(v=>v.type==='image'&&!old.has(v.sourceId)&&!v.rois.length)){image.analysis=B.analysisDefaults();image.kind='target';image.rois=group.samples.length?B.detectBandROIs(project.sources.find(s=>s.id===image.sourceId),image.crop,group.samples.length,image.analysis,image.polarity):[];}});};
  document.addEventListener('change',ev=>{const el=ev.target;if(el.dataset.scope!=='baseline')return;try{const value=Number(el.value);if(!Number.isFinite(value)||value<0)throw Error('基线必须为非负有限数值。');B.editAnalysis('调整峰图基线',image=>{const r=image.rois.find(r=>r.id===ui().profileRoiId);if(!r)throw Error('请先选择泳道。');r[el.dataset.field]=value;});}catch(error){B.toast(error.message);}});
  const commitStyle=B.commit;B.commit=(label,job,detail='')=>commitStyle(label,(project,group)=>{const before=new Map(group.objects.map(v=>[v.id,{...v}]));job(project,group);const opts=group.layoutOptions||{},styles=['fontFamily','fontSize','fontWeight','italic','fill','script','stroke','strokeWidth','dash','opacity'];for(const [role,enabled] of [['group',opts.syncGroups],['group-line',opts.syncGroups],['protein',opts.syncProtein],['mw',opts.syncMw]]){if(!enabled)continue;const changed=group.objects.find(v=>v.labelRole===role&&before.has(v.id)&&styles.some(key=>v[key]!==before.get(v.id)[key]));if(!changed)continue;for(const target of group.objects.filter(v=>v.labelRole===role&&!v.locked))for(const key of styles)if(changed[key]!==before.get(changed.id)[key])target[key]=changed[key];}},detail);
  const renderDisplay=B.render;let displayGeneration=0;B.render=()=>{renderDisplay();const generation=++displayGeneration,images=g().objects.filter(v=>v.type==='image'&&v.visible!==false),jobs=images.map(image=>{const source=p().sources.find(s=>s.id===image.sourceId);if(!source)return null;const params={grayscale:!!image.grayscale,brightness:B.num(image.brightness,100),contrast:B.num(image.contrast,100),invert:!!image.invert};return B.cachedDisplay(source.url,params)?null:B.displayURL(source.url,params);}).filter(Boolean);if(jobs.length)Promise.all(jobs).then(()=>{if(generation===displayGeneration)B.render();}).catch(error=>B.toast(error.message));};
  let clipboard=[],clipboardSources=[];
  const sameOriginal=(a,b)=>{const keys=Object.keys(a).filter(key=>key!=='id');return keys.length===Object.keys(b).filter(key=>key!=='id').length&&keys.every(key=>a[key]===b[key]);};
  document.addEventListener('keydown',ev=>{
    if(!(ev.metaKey||ev.ctrlKey)||!['c','x','v'].includes(ev.key.toLowerCase())||ev.target.matches('input,textarea,select,[contenteditable="true"]')||ui().tab!=='edit'||ui().modal)return;
    ev.preventDefault();const key=ev.key.toLowerCase();
    if(key==='c'||key==='x'){
      clipboard=JSON.parse(JSON.stringify(g().objects.filter(v=>ui().selected.includes(v.id))));
      const sourceIds=new Set(clipboard.filter(v=>v.type==='image').map(v=>v.sourceId));
      // Original source objects are immutable. Keep them with the clipboard so
      // switching projects cannot orphan a pasted figure or substitute pixels.
      clipboardSources=p().sources.filter(source=>sourceIds.has(source.id));
      if(key==='x')actions.delete();else B.toast('已复制 '+clipboard.length+' 个对象。');
    }else if(clipboard.length)B.commit('粘贴对象',(project,group)=>{
      const sourceIds=new Map();
      for(const source of clipboardSources){
        let original=project.sources.find(current=>sameOriginal(current,source));
        if(!original){original=project.sources.some(current=>current.id===source.id)?{...source,id:B.uid()}:source;project.sources.push(original);}
        sourceIds.set(source.id,original.id);
      }
      const ids=new Map(clipboard.map(v=>[v.id,B.uid()])),items=clipboard.map(v=>{
        const copy=JSON.parse(JSON.stringify(v));copy.id=ids.get(v.id);copy.x+=20;copy.y+=20;
        if(copy.type==='image'){copy.sourceId=sourceIds.get(v.sourceId)||v.sourceId;copy.rois=[];copy.referenceId='';copy.controlId='';copy.totalId='';}
        if(copy.groupId)copy.groupId='paste'+ids.get(clipboard[0].id)+copy.groupId;return copy;
      });
      group.objects.push(...items);ui().selected=items.map(v=>v.id);
    });
  });
})(globalThis.BS ||= {});
