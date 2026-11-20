(function(B){
  'use strict';
  const e=B.esc,ic=B.icon;
  B.btn=(action,label,icon='',extra='')=>'<button type="button" data-action="'+action+'" '+extra+' title="'+e(label)+'" aria-label="'+e(label)+'">'+(icon?ic(icon):'')+(label?'<span>'+e(label)+'</span>':'')+'</button>';
  B.ib=(action,label,icon,extra='')=>'<button type="button" class="icon-btn" data-action="'+action+'" '+extra+' title="'+e(label)+'" aria-label="'+e(label)+'">'+ic(icon)+'</button>';
  B.input=(scope,field,value,label='',opts='')=>'<label class="field">'+(label?'<span>'+e(label)+'</span>':'')+'<input data-scope="'+scope+'" data-field="'+field+'" value="'+e(value)+'" aria-label="'+e(label||field)+'" '+opts+'></label>';
  B.select=(scope,field,value,options,label='')=>'<label class="field">'+(label?'<span>'+e(label)+'</span>':'')+'<select data-scope="'+scope+'" data-field="'+field+'" aria-label="'+e(label||field)+'">'+options.map(([v,t])=>'<option value="'+e(v)+'" '+(String(value)===String(v)?'selected':'')+'>'+e(t)+'</option>').join('')+'</select></label>';
  B.check=(scope,field,value,label)=>'<label class="check"><input type="checkbox" data-scope="'+scope+'" data-field="'+field+'" '+(value?'checked':'')+'>'+e(label)+'</label>';
  B.range=(scope,field,value,min,max,label,suffix='')=>'<label class="range-field"><span>'+e(label)+'</span><input type="range" min="'+min+'" max="'+max+'" value="'+value+'" data-scope="'+scope+'" data-field="'+field+'" aria-label="'+e(label)+'"><output>'+value+suffix+'</output></label>';
  B.getGroup=()=>B.state.p.groups.find(g=>g.id===B.state.ui.group)||B.state.p.groups[0];
  B.getAnalysis=()=>{const g=B.getGroup();return g.objects.find(o=>o.type==='image'&&o.id===B.state.ui.analysisId)||g.objects.find(o=>o.type==='image');};
  B.header=()=>{
    const {ui,p}=B.state;
    return '<header class="app-header"><div class="brand"><svg width="29" height="32" viewBox="0 0 32 34"><path fill="#14867c" d="M10 2h13L12 20H0z"/><path fill="#0a5e5a" d="M21 14h11L22 32H9z"/></svg><strong>BlotStudio</strong><small>FREE</small></div><nav aria-label="WB 工作流程">'+[['design','实验设计'],['analysis','图片分析'],['edit','排版编辑'],['stats','统计结果']].map(([id,t],i)=>'<button data-action="tab" data-id="'+id+'" class="'+(ui.tab===id?'active':'')+'"><i>'+(i+1)+'</i>'+t+'</button>').join('')+'</nav><div class="header-actions">'+B.ib('help','使用帮助','help')+B.btn('save','保存项目','folder')+B.btn('export','导出','export','class="primary"')+'</div></header>';
  };
  B.toolbar=()=>{
    const {ui,p,past,future}=B.state,g=B.getGroup(),s=ui.selected,selected=g.objects.filter(o=>s.includes(o.id));
    return'<div class="toolbar"><div class="toolset">'+(ui.tab==='edit'?B.btn('tool','选择','select','data-id="select" class="'+(ui.tool==='select'?'chosen':'')+'"')+B.btn('tool','移动','hand','data-id="hand" class="'+(ui.tool==='hand'?'chosen':'')+'"')+B.btn('crop','裁剪','crop'):'<strong class="toolbar-title">'+({analysis:'原图与灰度分析',design:'实验工作台',stats:'灰度统计与归一化'}[ui.tab])+'</strong>')+'</div><div class="toolset">'+B.btn('import','添加图像','image')+(ui.tab==='edit'?B.btn('add','添加文本','text','data-id="text"')+'<div class="menu-wrap">'+B.btn('shape-menu','形状','rect')+(ui.shapeMenu?'<div class="dropdown">'+[['rect','矩形'],['line','线段'],['arrow','箭头'],['bracket','分组括号']].map(([id,t])=>B.btn('add',t,id,'data-id="'+id+'"')).join('')+'</div>':'')+'</div>':'')+'</div>'+(ui.tab==='edit'?'<div class="toolset align-tools">'+['left','center','right','top','middle','bottom'].map(a=>B.ib('align',{left:'左对齐',center:'水平居中',right:'右对齐',top:'顶部对齐',middle:'垂直居中',bottom:'底部对齐'}[a],a,'data-id="'+a+'" '+(s.length<2?'disabled':''))).join('')+'</div>':'')+'<div class="toolset">'+B.ib('undo','撤销 ⌘Z','undo',past.length?'':'disabled')+B.ib('redo','重做 ⇧⌘Z','redo',future.length?'':'disabled')+'</div><div class="toolbar-spacer"></div>'+(ui.tab==='edit'?B.btn('quick-layout','快速排版','bolt')+B.ib('duplicate','复制对象 ⌘D','copy',s.length?'':'disabled')+B.ib('delete','删除所选','trash',selected.some(o=>!o.locked)?'':'disabled'):B.btn('open','打开项目','folder'))+'</div>';
  };
  B.sidebar=()=>{
    const {p,ui}=B.state,g=B.getGroup(),images=g.objects.filter(o=>o.type==='image'),exp=[...new Set(p.groups.map(g=>g.experiment))];
    return'<aside class="sidebar"><div class="panel-heading"><h2>项目目录</h2>'+B.ib('newgroup','新建图组','plus')+'</div><div class="tree"><button class="tree-root" data-action="project-name">'+ic('down',14)+ic('folder',18)+'<span>'+e(p.name)+'</span></button>'+exp.map(ex=>'<div class="experiment-row">'+ic('down',13)+ic('folder',17)+'<span>'+e(ex)+'</span></div>'+p.groups.filter(v=>v.experiment===ex).map(gr=>'<div class="tree-group '+(gr.id===g.id?'active':'')+'"><input type="checkbox" aria-label="选择图组 '+e(gr.name)+'" data-scope="checkgroup" data-field="'+gr.id+'" '+(ui.checkedGroups.includes(gr.id)?'checked':'')+'><button data-action="group" data-id="'+gr.id+'">'+ic('folder',16)+'<span>'+e(gr.name)+'</span></button>'+B.ib('group-menu','图组操作','layers','data-id="'+gr.id+'"')+'</div>'+(gr.id===g.id?images.map(o=>'<button class="protein-row '+(ui.analysisId===o.id&&ui.tab==='analysis'?'active':'')+'" data-action="protein" data-id="'+o.id+'">'+ic('image',16)+'<span>'+e(o.protein||o.name)+'</span><small>'+e(o.mw?o.mw+' kDa':'')+'</small></button>').join(''):'')).join('')).join('')+'</div><div class="sidebar-tools">'+B.btn('open','打开','folder')+B.btn('newproject','新项目','plus')+(ui.checkedGroups.length>1?B.btn('merge','合并所选图组','layers'):'')+'</div><div class="panel-heading layer-heading"><h2>图层 <small>'+g.objects.length+'</small></h2>'+B.ib('layers-order','图层管理','layers')+'</div><div class="layer-list">'+g.objects.slice().reverse().map(o=>'<div class="layer-row '+(ui.selected.includes(o.id)?'active':'')+'">'+B.ib('visibility',o.visible===false?'显示图层':'隐藏图层',o.visible===false?'hide':'eye','data-id="'+o.id+'"')+'<button class="layer-select" data-action="select-object" data-id="'+o.id+'">'+(o.type==='image'?'<img alt="" src="'+e(p.sources.find(s=>s.id===o.sourceId)?.url||'')+'">':'<span class="layer-type">'+(o.type==='text'?'T':ic(o.type,16))+'</span>')+'<span>'+e(o.name)+'</span></button>'+B.ib('lock',o.locked?'解锁图层':'锁定图层',o.locked?'lock':'unlock','data-id="'+o.id+'"')+'</div>').join('')+'</div><div class="sidebar-bottom">'+B.btn('audit','操作记录','layers')+'<span>v'+B.VERSION+' · MIT</span></div></aside>';
  };
  B.selectionMarkup=(selected,zoom)=>{
    const visible=selected.filter(o=>o.visible!==false);
    const editable=visible.filter(o=>!o.locked);
    const handlePositions=[
      ['nw',0,0],['n',.5,0],['ne',1,0],['w',0,.5],
      ['e',1,.5],['sw',0,1],['s',.5,1],['se',1,1]
    ];
    function outline(frame,handleId){
      const rotation=frame.rotation||0;
      const size=8/zoom;
      let handles='';
      if(handleId){
        for(const [direction,fx,fy] of handlePositions){
          const angle=Math.atan2(fy-.5,fx-.5)+rotation*Math.PI/180;
          const cursor=['ew-resize','nwse-resize','ns-resize','nesw-resize'][(Math.round(angle/(Math.PI/4))%4+4)%4];
          handles+='<rect data-resize="'+handleId+'" data-handle="'+direction+'" class="resize-handle" style="cursor:'+cursor+'" x="'+(frame.w*fx-size/2)+'" y="'+(frame.h*fy-size/2)+'" width="'+size+'" height="'+size+'" fill="white" stroke="#13897d" stroke-width="'+1.2/zoom+'"/>';
        }
      }
      return '<g class="selection" transform="translate('+frame.x+' '+frame.y+') rotate('+rotation+' '+frame.w/2+' '+frame.h/2+')"><rect width="'+frame.w+'" height="'+frame.h+'" fill="none" stroke="#13897d" stroke-width="'+1.4/zoom+'" pointer-events="none"/>'+handles+'</g>';
    }
    let markup=visible.map(o=>outline(o,editable.length===1&&!o.locked?o.id:'')).join('');
    if(editable.length>1)markup+=outline(B.bounds(editable),editable[0].id);
    return markup;
  };
  B.canvasMarkup=()=>{
    const {p,ui}=B.state,g=B.getGroup(),z=ui.zoom,selected=g.objects.filter(o=>ui.selected.includes(o.id));
    return'<div class="ruler-h">'+Array.from({length:21},(_,i)=>'<span style="left:'+(i*100*z)+'px">'+(i*100)+'</span>').join('')+'</div><div class="ruler-v">'+Array.from({length:12},(_,i)=>'<span style="top:'+(i*100*z)+'px">'+(i*100)+'</span>').join('')+'</div><div class="artboard-wrap" style="width:'+g.canvas.width*z+'px;height:'+g.canvas.height*z+'px"><svg class="artboard" id="figure" width="'+g.canvas.width*z+'" height="'+g.canvas.height*z+'" viewBox="0 0 '+g.canvas.width+' '+g.canvas.height+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="WB 可编辑画布"><rect class="canvas-bg" width="100%" height="100%" fill="'+e(g.canvas.background)+'"/>'+g.objects.filter(o=>o.visible!==false).map(o=>'<g data-object="'+o.id+'" class="figure-object '+(o.locked?'locked':'')+'">'+B.objectMarkup(o,p.sources)+'</g>').join('')+B.selectionMarkup(selected,z)+(ui.marquee?'<rect class="marquee" x="'+ui.marquee.x+'" y="'+ui.marquee.y+'" width="'+ui.marquee.w+'" height="'+ui.marquee.h+'" fill="#14867c15" stroke="#14867c" stroke-dasharray="4 3"/>':'')+(ui.guideX!==null?'<path d="M'+ui.guideX+' 0V'+g.canvas.height+'" stroke="#e481a0" stroke-width="1"/>':'')+(ui.guideY!==null?'<path d="M0 '+ui.guideY+'H'+g.canvas.width+'" stroke="#e481a0" stroke-width="1"/>':'')+'</svg></div>';
  };
  B.editor=()=>'<section class="editor-center"><div class="document-bar"><span>'+e(B.getGroup().experiment)+' <b>/</b> '+e(B.getGroup().name)+'</span>'+B.check('ui','snap',B.state.ui.snap,'对象吸附')+'<span class="muted">拖动对象 · ⌘/Shift 多选 · 方向键微调</span></div><div class="canvas-viewport '+(B.state.ui.tool==='hand'?'hand-tool':'')+'" id="viewport"><div id="canvas-content">'+B.canvasMarkup()+'</div></div><div class="zoom-control">'+B.btn('fit','适应画布','fit')+'<span class="divider"></span>'+B.ib('zoom-out','缩小','minus')+'<span class="zoom-number">'+Math.round(B.state.ui.zoom*100)+'%</span>'+B.ib('zoom-in','放大','plus')+'</div></section>';
  B.inspector=()=>{
    const {ui}=B.state,g=B.getGroup(),objects=g.objects.filter(o=>ui.selected.includes(o.id)),o=objects[0],scope='object';
    return'<aside class="inspector"><div class="panel-heading"><h2>属性</h2>'+ic('layers',17)+'</div><div class="inspector-tabs"><button data-action="inspector-tab" data-id="object" class="'+(ui.inspector==='object'?'active':'')+'">对象</button><button data-action="inspector-tab" data-id="canvas" class="'+(ui.inspector==='canvas'?'active':'')+'">画布</button></div>'+(ui.inspector==='canvas'?'<div class="inspector-section"><h3>画布设置</h3><div class="field-grid">'+B.input('canvas','width',g.canvas.width,'宽 px','type="number" min="100" max="10000"')+B.input('canvas','height',g.canvas.height,'高 px','type="number" min="100" max="10000"')+'</div>'+B.select('canvas','preset','', [['','自定义'],['1000,590','WB 横版 1000 × 590'],['1200,1200','正方形 1200 × 1200'],['2480,3508','A4 · 300 dpi']],'尺寸预设')+B.input('canvas','background',g.canvas.background,'背景','type="color"')+B.select('canvas','dpi',g.canvas.dpi,[[150,'150 dpi'],[300,'300 dpi'],[600,'600 dpi']],'导出分辨率')+'<p class="hint">DPI 决定印刷尺寸；像素倍率在导出时设置。</p></div>':!o?'<div class="empty-inspector">'+ic('select',34)+'<h3>选择一个对象</h3><p>编辑位置、尺寸、文字和图像显示。按住 ⌘ 或 Shift 可选择多个对象。</p>'+B.btn('import','导入第一张条带','image')+'</div>':'<div class="inspector-section"><div class="section-title"><h3>'+(objects.length>1?'已选 '+objects.length+' 个对象':'位置与大小')+'</h3><span class="muted">px</span></div>'+B.input(scope,'name',o.name,'名称')+'<div class="field-grid">'+[['x','X'],['y','Y'],['w','宽'],['h','高']].map(([f,t])=>B.input(scope,f,Math.round(o[f]*10)/10,t,'type="number" step="0.1" '+(['w','h'].includes(f)?'min="1"':''))).join('')+'</div><div class="field-grid">'+B.input(scope,'rotation',o.rotation,'角度 °','type="number" step="0.5"')+B.check(scope,'lockRatio',o.lockRatio,'锁定比例')+'</div>'+B.range(scope,'opacity',Math.round(o.opacity*100),0,100,'不透明度','%')+'</div>'+(o.type==='image'?'<div class="inspector-section"><h3>图像显示</h3>'+B.range(scope,'brightness',o.brightness,0,200,'亮度','%')+B.range(scope,'contrast',o.contrast,0,200,'对比度','%')+'<div class="check-grid">'+B.check(scope,'grayscale',o.grayscale,'灰度显示')+B.check(scope,'invert',o.invert,'反相显示')+'</div><div class="button-row">'+B.btn('flip','水平翻转','flip','data-id="flipX"')+B.btn('flip','垂直翻转','flip','data-id="flipY"')+'</div><div class="preserved">'+ic('check',14)+'原图已保留 · 定量不受显示调整影响</div>'+B.btn('crop','编辑裁剪与 ROI','crop','class="full"')+B.btn('reset-image','还原显示','rotate','class="full"')+'</div>':o.type==='text'?'<div class="inspector-section"><h3>文字</h3><label class="field"><textarea data-scope="object" data-field="text" aria-label="文字内容" rows="3">'+e(o.text)+'</textarea></label>'+B.select(scope,'fontFamily',o.fontFamily,['Arial','Times New Roman','Helvetica','Georgia','Courier New','PingFang SC','Microsoft YaHei','SimSun'].map(x=>[x,x]),'字体')+'<div class="field-grid">'+B.input(scope,'fontSize',o.fontSize,'字号 px','type="number" min="6" max="300"')+B.input(scope,'fill',o.fill,'颜色','type="color"')+'</div><div class="check-grid">'+B.check(scope,'fontWeight',o.fontWeight===700,'加粗')+B.check(scope,'italic',o.italic,'斜体')+'</div>'+B.select(scope,'align',o.align,[['left','左对齐'],['center','居中'],['right','右对齐']],'文字对齐')+'</div>':'<div class="inspector-section"><h3>形状</h3>'+B.input(scope,'fill',o.fill==='none'?'#ffffff':o.fill,'填充色','type="color"')+B.check(scope,'noFill',o.fill==='none','无填充')+'</div>')+'<div class="inspector-section"><h3>边框</h3><div class="field-grid">'+B.input(scope,'strokeWidth',o.strokeWidth,'线宽 px','type="number" min="0" max="20" step="0.2"')+B.input(scope,'stroke',o.stroke,'线色','type="color"')+'</div></div><div class="inspector-section"><h3>对齐</h3><div class="alignment-grid">'+['left','center','right','top','middle','bottom'].map(a=>B.ib('align',a,a,'data-id="'+a+'" '+(objects.length<2?'disabled':''))).join('')+'</div><div class="button-row">'+B.btn('align','水平等距','grid','data-id="distributeX" '+(objects.length<3?'disabled':''))+B.btn('align','垂直等距','grid','data-id="distributeY" '+(objects.length<3?'disabled':''))+'</div><div class="button-row">'+B.btn('group-objects','组合','layers',objects.length<2?'disabled':'')+B.btn('ungroup-objects','取消组合','layers')+'</div></div><div class="inspector-section"><h3>图层顺序</h3><div class="alignment-grid four">'+[['front','置顶','layers'],['up','上移一层','up'],['down','下移一层','down'],['back','置底','layers']].map(([id,t,i])=>B.ib('order',t,i,'data-id="'+id+'"')).join('')+'</div></div>')+'</aside>';
  };
  B.analysis=()=>{
    const {p,ui}=B.state,g=B.getGroup(),o=B.getAnalysis(),s=o&&p.sources.find(s=>s.id===o.sourceId);if(!o||!s)return'<section class="content-page empty-page">'+ic('image',48)+'<h1>从一张原始 WB 图像开始</h1><p>导入 PNG、JPEG 或 8/16-bit TIFF，再框选条带和背景。</p>'+B.btn('import','导入原始图像','image','class="primary"')+'</section>';
    const cropMode=ui.analysisTool==='crop',rotation=o.analysis?.rotation||0;
    const separateFrames=cropMode&&rotation!==0;
    const src={...o,x:0,y:0,w:s.width,h:s.height,rotation:cropMode?0:rotation,crop:{x:0,y:0,w:s.width,h:s.height},flipX:false,flipY:false,strokeWidth:0},rois=separateFrames?[]:o.rois,records=B.records(p,g).filter(r=>r.objectId===o.id),z=Math.min(1.2,Math.max(.15,ui.analysisZoom||Math.min(900/s.width,420/s.height)));
    const roiMarkup=(r,i)=>{
      const method=o.analysis&&(r.shape||o.analysis.method);
      const shape=method==='ellipse'
        ?'<ellipse cx="'+(r.x+r.w/2)+'" cy="'+(r.y+r.h/2)+'" rx="'+r.w/2+'" ry="'+r.h/2
        :'<rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h;
      return '<g data-roi="'+r.id+'">'+shape+'" fill="'+(ui.roiId===r.id?'#13897d30':'#13897d15')+'" stroke="#13897d" stroke-width="'+1.5/z+'"/><text x="'+(r.x+2/z)+'" y="'+Math.max(12/z,r.y-3/z)+'" font-size="'+12/z+'" fill="#0b6f65">'+(i+1)+'</text></g>';
    };
    return'<section class="analysis-page"><div class="page-heading"><div><h1>原图与灰度分析</h1><p>'+e(s.name)+' <span class="tag">'+s.bitDepth+'-bit 原始像素</span> '+s.width+' × '+s.height+' px</p></div>'+B.btn('original','导出原始文件','save')+'</div><div class="analysis-settings">'+B.select('analysis-ui','analysisId',o.id,g.objects.filter(v=>v.type==='image').map(v=>[v.id,v.protein||v.name]),'图像')+B.input('analysis','protein',o.protein,'蛋白')+B.input('analysis','mw',o.mw,'分子量 kDa')+B.select('analysis','referenceId',o.referenceId,[['','不归一到参照'],...g.objects.filter(v=>v.type==='image'&&v.id!==o.id).map(v=>[v.id,v.protein||v.name])],'参照蛋白')+B.select('analysis','polarity',o.polarity,[['dark','深色条带 / 浅背景'],['light','浅色条带 / 深背景']],'信号方向')+'</div><div class="analysis-tools">'+[['roi','框选条带','rect'],['background','框选背景','rect'],['crop','框选裁剪','crop']].map(([id,t,icon])=>B.btn('analysis-tool',t,icon,'data-id="'+id+'" class="'+(ui.analysisTool===id?'chosen':'')+'"')).join('')+B.btn('auto-rois','按泳道生成 ROI','grid')+B.btn('copy-rois','同步到其他蛋白','copy')+B.btn('clear-rois','清空 ROI','trash')+B.btn('clear-bg','清除背景','close')+'<span class="toolbar-spacer"></span>'+B.ib('analysis-zoom-out','缩小原图','minus')+'<span>'+Math.round(z*100)+'%</span>'+B.ib('analysis-zoom-in','放大原图','plus')+'</div><div class="analysis-image-scroll"><svg '+(cropMode?'data-display-crop="true" ':'')+'id="analysis-image" width="'+s.width*z+'" height="'+s.height*z+'" viewBox="0 0 '+s.width+' '+s.height+'" role="img" aria-label="原图 ROI 框选区">'+B.objectMarkup(src,p.sources)+(cropMode||!rotation?'<rect x="'+o.crop.x+'" y="'+o.crop.y+'" width="'+o.crop.w+'" height="'+o.crop.h+'" fill="none" stroke="#d6952d" stroke-width="'+1.5/z+'" stroke-dasharray="6 4" pointer-events="none"/>':'')+rois.map(roiMarkup).join('')+(o.background&&!separateFrames?'<rect x="'+o.background.x+'" y="'+o.background.y+'" width="'+o.background.w+'" height="'+o.background.h+'" fill="#477bc020" stroke="#477bc0" stroke-width="'+1.5/z+'"/>':'')+(ui.analysisRect?'<rect x="'+ui.analysisRect.x+'" y="'+ui.analysisRect.y+'" width="'+ui.analysisRect.w+'" height="'+ui.analysisRect.h+'" fill="#d6952d30" stroke="#d6952d" stroke-width="'+1.5/z+'"/>':'')+'</svg></div><div class="analysis-caption"><span><i class="legend green"></i>条带 ROI</span><span><i class="legend blue"></i>背景 ROI</span><span><i class="legend amber"></i>显示裁剪范围</span><span>'+(separateFrames?'在未旋转原图上拖框裁剪。':'在图像上拖框，拖动已选条带框可调整位置。')+'定量始终读取原始 '+s.bitDepth+'-bit 像素。</span></div><div class="split-row"><div class="analysis-readout"><h3>定量设置</h3>'+B.range('analysis','brightness',o.brightness,0,200,'显示亮度','%')+B.range('analysis','contrast',o.contrast,0,200,'显示对比度','%')+'<p class="hint">深色条带：校正积分 = 背景均值 × ROI 面积 − ROI 像素和。无背景框时使用反相积分。负值保留，并从比值/统计中排除。</p></div><div class="roi-editor"><h3>选中 ROI 的原图坐标</h3>'+(rois.find(r=>r.id===ui.roiId)?'<div class="field-grid four">'+['x','y','w','h'].map(f=>B.input('roi',f,Math.round(rois.find(r=>r.id===ui.roiId)[f]),f.toUpperCase(),'type="number" min="0"')).join('')+'</div>'+B.select('roi','sampleIndex',rois.find(r=>r.id===ui.roiId).sampleIndex,g.samples.map((s,i)=>[i,s.id+' · '+s.group]),'对应样本')+B.btn('delete-roi','删除此 ROI','trash'):'<p class="hint">点击原图中的绿色框，精确修改位置和尺寸。</p>')+'</div></div>'+(B.imagejPanel?B.imagejPanel(p,g,o,s):'')+'<div class="section-title"><h2>灰度结果 <small>'+records.length+' 个 ROI</small></h2><div class="button-row">'+B.btn('results-xlsx','导出 Excel','export')+B.btn('to-stats','查看统计','chart')+'</div></div><div class="table-scroll"><table><thead><tr><th>ROI</th><th>样本</th><th>分组</th><th>面积 px²</th><th>原始积分</th><th>校正积分</th><th>目的/参照</th><th>提示</th></tr></thead><tbody>'+records.map((r,i)=>'<tr class="'+(r.issue?'warning-row':'')+'" data-action="roi-select" data-id="'+r.roi.id+'"><td>'+(i+1)+'</td><td>'+e(r.sampleId)+'</td><td>'+e(r.group)+'</td><td>'+r.area+'</td><td>'+B.format(r.raw)+'</td><td>'+B.format(r.corrected)+'</td><td>'+B.format(r.ratio)+'</td><td>'+e(r.issue||'—')+'</td></tr>').join('')+'</tbody></table></div></section>';
  };
  B.format=v=>v===null||v===undefined||!Number.isFinite(v)?'—':Math.abs(v)>=1000000?Number(v).toExponential(3):Number(v).toLocaleString('en-US',{maximumFractionDigits:4});
  B.design=()=>{
    const {p,ui}=B.state,g=B.getGroup(),tabs=[['groups','分组与泳道'],['samples','样品库'],['antibodies','抗体库'],['plan','上样与一抗计划']];
    let body='';
    if(ui.designTab==='groups')body='<div class="page-heading"><div><h1>分组与泳道</h1><p>按实际上样顺序维护样本；图像 ROI 与样本按泳道对应。</p></div>'+B.btn('add-sample','添加泳道','plus','class="primary"')+'</div><div class="design-grid"><div class="design-detail">'+B.input('group','name',g.name,'图组名称')+B.input('group','experiment',g.experiment,'所属实验')+B.select('group','status',g.status,[['进行中','进行中'],['已完成','已完成']],'状态')+'<label class="field"><span>实验备注</span><textarea rows="4" data-scope="group" data-field="notes" aria-label="实验备注">'+e(g.notes)+'</textarea></label><p class="hint">泳道是图像位置；重复编号用于记录。技术重复不能直接当作独立生物学重复。</p></div><div class="table-scroll"><table><thead><tr><th>泳道</th><th>样本 ID</th><th>实验分组</th><th>重复编号</th><th>纳入统计</th><th></th></tr></thead><tbody>'+g.samples.map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+B.input('sample',i+'.id',s.id,'样本 '+(i+1))+'</td><td>'+B.input('sample',i+'.group',s.group,'分组 '+(i+1))+'</td><td>'+B.input('sample',i+'.replicate',s.replicate,'重复 '+(i+1),'type="number" min="1"')+'</td><td>'+B.check('sample',i+'.include',s.include!==false,'纳入')+'</td><td>'+B.ib('remove-sample','删除泳道','trash','data-id="'+i+'"')+'</td></tr>').join('')+'</tbody></table></div></div>';
    else {const schema=B.schemas[ui.designTab],list=p[ui.designTab==='samples'?'sampleLibrary':ui.designTab];body='<div class="page-heading"><div><h1>'+schema.title+'</h1><p>'+schema.description+'</p></div>'+B.btn('library-add','添加记录','plus','class="primary"')+'</div><div class="table-scroll"><table><thead><tr>'+schema.fields.map(([f,t])=>'<th>'+e(t)+'</th>').join('')+'<th>操作</th></tr></thead><tbody>'+list.map((r,i)=>'<tr>'+schema.fields.map(([f])=>'<td>'+e(r[f]||'—')+'</td>').join('')+'<td><div class="button-row">'+B.btn('library-edit','编辑','','data-id="'+i+'"')+B.ib('library-delete','删除记录','trash','data-id="'+i+'"')+'</div></td></tr>').join('')+'</tbody></table></div>'+(list.length?'':'<div class="empty-list">'+ic('folder',30)+'<p>尚无记录。添加的信息会随项目一起保存。</p></div>');}
    return'<section class="content-page"><div class="subnav">'+tabs.map(([id,t])=>'<button data-action="design-tab" data-id="'+id+'" class="'+(ui.designTab===id?'active':'')+'">'+t+'</button>').join('')+'</div>'+body+'</section>';
  };
  B.schemas={samples:{title:'样品库',description:'记录来源、浓度和批次，便于追溯上样信息。',fields:[['name','样本 ID'],['group','分组'],['source','来源'],['concentration','浓度及单位'],['batch','批次'],['notes','备注']]},antibodies:{title:'抗体库',description:'记录一抗、二抗及对应条件。',fields:[['protein','靶蛋白'],['brand','厂家'],['catalog','货号'],['lot','批号'],['host','宿主'],['dilution','稀释比例'],['secondary','二抗'],['notes','备注']]},plan:{title:'上样与一抗计划',description:'维护胶、膜、泳道、上样量和孵育条件。',fields:[['membrane','胶/膜编号'],['lane','泳道'],['sample','样本 ID'],['amount','上样量及单位'],['protein','蛋白'],['antibody','一抗及条件'],['notes','备注']]}};
  const chartDefaults={mode:'bars',error:'sd',title:'',axisLabel:''};
  const chartText=(value,limit)=>typeof value==='string'?Array.from(value.trim()).slice(0,limit).join(''):'';
  B.chartStyleKey=data=>{
    const {ui}=B.state;
    const groupIds=ui.checkedGroups.length?[...ui.checkedGroups].sort():[B.getGroup().id];
    return JSON.stringify([groupIds,data.protein,ui.metric,ui.normalize?data.control:null]);
  };
  B.chartStyle=data=>{
    const value=B.state.p.chartStyles?.[B.chartStyleKey(data)];
    return {
      mode:value?.mode==='points'?'points':chartDefaults.mode,
      error:['sd','sem','none'].includes(value?.error)?value.error:chartDefaults.error,
      title:chartText(value?.title,100),axisLabel:chartText(value?.axisLabel,60)
    };
  };
  const chartAxis=(data,normalize,metric)=>{
    if(normalize)return 'Relative signal (control mean = 1)';
    if(metric==='ratio')return 'Target / reference';
    if(metric==='controlRatio')return 'Target / loading control';
    if(metric==='totalRatio')return 'Target / total protein';
    if(metric==='raw')return 'Integrated signal (gray level × pixel)';
    return data.rows?.[0]?.method==='profile'?'Peak area (mean intensity × profile pixel)':'Corrected signal (gray level × pixel)';
  };
  const glyphWidth=(char,size)=>size*(char.codePointAt(0)>255?1:.62);
  const textWidth=(label,size)=>Array.from(label).reduce((width,char)=>width+glyphWidth(char,size),0);
  const groupLabelLines=label=>{
    const lines=[];let line='',width=0;
    for(const character of String(label)){
      const next=glyphWidth(character,13);
      if(width+next>154){lines.push(line);line='';width=0;}
      line+=character;width+=next;
    }
    lines.push(line);
    return lines;
  };
  B.chartSVG=(data,title,normalize=false,style=chartDefaults,metric='corrected')=>{
    const groups=data.groups,heading=style.title||title,axisLabel=style.axisLabel||chartAxis(data,normalize,metric);
    const labels=groups.map(group=>groupLabelLines(group.name));
    let columnWidth=75,labelLines=1;
    for(const lines of labels){
      labelLines=Math.max(labelLines,lines.length);
      for(const line of lines)columnWidth=Math.max(columnWidth,textWidth(line,13)+22);
    }
    const left=86,rightMargin=30,top=54;
    const width=Math.ceil(Math.max(760,left+rightMargin+columnWidth*groups.length,textWidth(heading,18)+40));
    const right=width-rightMargin,bottom=top+Math.max(270,Math.ceil(textWidth(axisLabel,13)+14));
    const height=bottom+72+labelLines*16,step=(right-left)/Math.max(1,groups.length);
    const colors=['#183f48','#368d81','#487d98','#8b6847'],fills=['#a9bdc1','#b1d5ce','#bdd3df','#dac9b7'];
    let lower=0,upper=0;
    const uncertainty=group=>style.error!=='none'&&group.n>1&&Number.isFinite(group[style.error])?group[style.error]:null;
    // Work in scaled units so a very large finite range or a very small signal still projects correctly.
    let scale=0;
    for(const group of groups){
      scale=Math.max(scale,Math.abs(group.mean),uncertainty(group)||0);
      for(const value of group.values)scale=Math.max(scale,Math.abs(value));
    }
    scale=scale||1;
    for(const group of groups){
      const mean=group.mean/scale,error=(uncertainty(group)||0)/scale;
      lower=Math.min(lower,mean-error);upper=Math.max(upper,mean+error);
      for(const value of group.values){lower=Math.min(lower,value/scale);upper=Math.max(upper,value/scale);}
    }
    const margin=(upper-lower)*.08;
    if(lower<0)lower-=margin;
    if(upper>0)upper+=margin;
    if(upper===lower)upper=1;
    const y=scaled=>bottom-(scaled-lower)/(upper-lower)*(bottom-top);
    const ink='#273c45';
    const line=(x1,y1,x2,y2,color=ink,weight=1.4)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="'+weight+'"/>';
    const text=(x,y,value,size=13,anchor='middle',extra='')=>'<text x="'+x+'" y="'+y+'" font-family="Arial" font-size="'+size+'" text-anchor="'+anchor+'" fill="'+ink+'" '+extra+'>'+e(value)+'</text>';
    const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+e(heading)+'"><rect x="0" y="0" width="'+width+'" height="'+height+'" fill="#ffffff"/>',text(width/2,28,heading,18)];
    const ticks=Array.from({length:5},(_,i)=>lower+(upper-lower)*i/4);
    if(lower<0&&upper>0){
      const nearZero=ticks.findIndex(tick=>Math.abs(tick)<(upper-lower)*.06);
      if(nearZero>=0)ticks[nearZero]=0;else ticks.push(0);
    }
    for(const tick of ticks){
      const value=tick*scale,absolute=Math.abs(value);
      const label=absolute!==0&&(absolute<.001||absolute>=1e6)?value.toExponential(2):B.format(value);
      svg.push(line(left,y(tick),right,y(tick),'#e3e9ec',1),text(left-10,y(tick)+4,label,12,'end'));
    }
    svg.push(line(left,top,left,bottom),line(left,y(0),right,y(0)));
    for(let i=0;i<groups.length;i++){
      const group=groups[i],x=left+step*(i+.5),mean=group.mean/scale,meanY=y(mean),color=colors[i%colors.length];
      const half=Math.min(24,step*.29),error=uncertainty(group);
      if(style.mode==='bars')svg.push('<rect x="'+(x-half)+'" y="'+Math.min(meanY,y(0))+'" width="'+half*2+'" height="'+Math.abs(meanY-y(0))+'" fill="'+fills[i%fills.length]+'"/>');
      if(error!==null){
        const high=y(mean+error/scale),low=y(mean-error/scale),cap=half*.4;
        svg.push(line(x,high,x,low),line(x-cap,high,x+cap,high),line(x-cap,low,x+cap,low));
      }
      const extent=Math.min(half-3,4*(group.values.length-1));
      group.values.forEach((value,index)=>{
        const jitter=group.values.length===1?0:extent*(2*index/(group.values.length-1)-1);
        svg.push('<circle cx="'+(x+jitter)+'" cy="'+y(value/scale)+'" r="3.5" fill="'+color+'" stroke="#ffffff" stroke-width=".8"/>');
      });
      if(style.mode==='points')svg.push(line(x-half,meanY,x+half,meanY,ink,2.2));
      labels[i].forEach((label,index)=>svg.push(text(x,bottom+22+index*16,label)));
      svg.push(text(x,bottom+22+labelLines*16,'n = '+group.n,11));
    }
    const legend='Points = samples · '+(style.mode==='bars'?'Bars':'Lines')+' = means'+(style.error==='none'?'':' · Error bars = '+style.error.toUpperCase());
    svg.push(text((left+right)/2,height-12,legend,12),text(0,0,axisLabel,13,'middle','transform="translate(18 '+((top+bottom)/2)+') rotate(-90)"'),'</svg>');
    return svg.join('');
  };
  B.statsChartSVG=(data=B.currentStats())=>B.chartSVG(data,data.protein+(B.getGroup().demo?' · 演示数据':''),B.state.ui.normalize,B.chartStyle(data),B.state.ui.metric);
  B.currentStats=()=>{const {p,ui}=B.state,g=B.getGroup(),groups=ui.checkedGroups.length?p.groups.filter(v=>ui.checkedGroups.includes(v.id)):[g],records=groups.flatMap(gr=>B.records(p,gr).map(r=>({...r,imageGroup:gr.name}))),proteins=[...new Set(records.map(r=>r.protein))],protein=proteins.includes(ui.statsProtein)?ui.statsProtein:proteins[0]||'',control=ui.control||g.samples[0]?.group||'',data=B.statData(records,protein,ui.metric,control,ui.normalize);if(!data.rows.length&&!data.error&&protein)data.error=ui.metric==='ratio'?'当前蛋白尚无有效参照比值。请设置参照蛋白并框选对应泳道，或改选背景校正积分。':'没有纳入的有效正值。请检查 ROI、背景框和样本纳入状态。';return{...data,records,proteins,protein,control};};
  B.stats=()=>{
    const {ui,p}=B.state,d=B.currentStats(),groups=[...new Set(d.records.map(r=>r.group))];
    return'<section class="content-page stats-page"><div class="page-heading"><div><h1>灰度统计与归一化</h1><p>当前图组'+(ui.checkedGroups.length?' · 已合并 '+ui.checkedGroups.length+' 个选中图组':'')+' · 使用原始像素计算的积分信号</p></div><div class="button-row">'+B.btn('results-xlsx','导出数据','export')+B.btn('chart-options','图表样式','chart',d.groups.length?'':'disabled')+B.btn('chart-to-layout','加入排版','layers',d.groups.length?'':'disabled')+B.btn('chart-export','导出图表 SVG','export',d.groups.length?'':'disabled')+'</div></div>'+(!d.proteins.length?'<div class="empty-list">'+ic('chart',42)+'<h2>还没有可统计的 ROI</h2><p>先在图片分析中框选条带，并设置泳道和参照蛋白。</p>'+B.btn('to-analysis','前往图片分析','image','class="primary"')+'</div>':'<div class="stats-controls">'+B.select('ui','statsProtein',d.protein,d.proteins.map(x=>[x,x]),'目的蛋白')+B.select('ui','metric',ui.metric,[['corrected','背景校正积分'],['raw','原始积分'],['ratio','目的 / 参照比值']],'统计指标')+B.select('ui','control',d.control,groups.map(x=>[x,x]),'对照组')+B.check('ui','normalize',ui.normalize,'对照均值归一化为 1')+'</div>'+(d.error?'<p class="notice">'+e(d.error)+'</p>':'')+'<div class="stats-grid"><div class="chart-panel">'+(d.groups.length?'<div class="chart-preview"><div style="min-width:'+(d.groups.length>5?75*d.groups.length+116:0)+'px">'+B.statsChartSVG(d)+'</div></div>':'<p class="empty-list">暂无可绘制的统计值</p>')+'</div><div class="summary-panel"><h3>描述统计</h3><table><thead><tr><th>分组</th><th>n</th><th>均值</th><th>SD</th><th>SEM</th></tr></thead><tbody>'+d.groups.map(g=>'<tr><td>'+e(g.name)+'</td><td>'+g.n+'</td><td>'+B.format(g.mean)+'</td><td>'+B.format(g.sd)+'</td><td>'+B.format(g.sem)+'</td></tr>').join('')+'</tbody></table>'+B.check('ui','inferential',ui.inferential,'显示 Welch t 检验（各组 vs 对照）')+(ui.inferential?'<p class="hint">双侧、独立样本，Holm 多重比较校正。n &lt; 2 或方差为 0 时不报告 P 值。技术重复不能直接作为独立样本。</p><table><thead><tr><th>比较组</th><th>原始 P</th><th>Holm P</th></tr></thead><tbody>'+d.tests.map(t=>'<tr><td>'+e(t.group)+'</td><td>'+B.format(t.p)+'</td><td>'+B.format(t.adjusted)+'</td></tr>').join('')+'</tbody></table>':'')+'</div></div><div class="section-title"><h2>纳入统计的数据</h2><span class="muted">在实验设计中调整纳入状态；重复、非正信号或缺失参照需核查</span></div><div class="table-scroll"><table><thead><tr><th>图组</th><th>蛋白</th><th>样本</th><th>分组</th><th>重复</th><th>校正积分</th><th>目的/参照</th><th>当前统计值</th></tr></thead><tbody>'+d.rows.map(r=>'<tr><td>'+e(r.imageGroup)+'</td><td>'+e(r.protein)+'</td><td>'+e(r.sampleId)+'</td><td>'+e(r.group)+'</td><td>'+r.replicate+'</td><td>'+B.format(r.corrected)+'</td><td>'+B.format(r.ratio)+'</td><td>'+B.format(r.value)+'</td></tr>').join('')+'</tbody></table></div>')+'</section>';
  };
  B.modal=()=>{
    const {ui,p}=B.state,m=ui.modal;if(!m)return'';let title='',body='',footer='';const input=(f,v,t,opts='')=>B.input('modal',f,v,t,opts);
    if(m.type==='export'){title='导出';body=B.select('modal','format',m.format,[['png','PNG · 组图'],['svg','SVG · 可编辑矢量文字'],['pptx','PowerPoint · 独立图片与文本'],['tiff','TIFF · 8-bit RGB 排版图'],['xlsx','Excel · 原始灰度与比值'],['csv','CSV · 原始灰度与比值'],['project','项目文件 · 含原图与编辑记录'],['originals','原图与记录 ZIP'],['audit','操作记录 CSV']],'文件格式')+B.select('modal','scale',m.scale,[[1,'1× 原始画布像素'],[2,'2× 像素'],[3,'3× 像素'],[4,'4× 像素']],'PNG / TIFF 像素倍率')+'<p class="hint">导出不加水印。演示项目的“演示数据”图注是可编辑文本。SVG 保留文字和形状；PPTX 中每条图片和每段文字可分别编辑。TIFF 排版输出为 8-bit RGB，不替代原始定量 TIFF。</p>';footer=B.btn('do-export','导出文件','export','class="primary"');}
    else if(m.type==='help'){title='BlotStudio 使用帮助';body='<div class="help-text"><p><b>1. 实验设计</b>：设置泳道、样本和分组，记录样品、抗体及上样计划。</p><p><b>2. 图片分析</b>：导入原图，框选裁剪范围与 ROI。原生支持标准 8/16-bit 灰度 TIFF（未压缩、LZW、PackBits、Deflate）；不支持的格式会明确报错。</p><p><b>3. 排版编辑</b>：所有图片、文本和形状均独立。拖动、右下角缩放，使用属性精确调整；多选后对齐、等距、组合。双击图片进入裁剪和分析，双击文字进入内容编辑。</p><p><b>4. 统计结果</b>：按泳道匹配参照蛋白，支持目的/内参、部分/总蛋白比值，再按对照均值归一化。展示单点、均值与 SD，可选择双侧 Welch 检验及 Holm 校正。</p><p><b>快捷键</b>：⌘/Ctrl+Z 撤销，⇧⌘Z / Ctrl+Y 重做，⌘D 复制，⌘G 组合，⇧⌘G 取消组合，⌘A 全选，⌘S 保存；方向键移动 1 px，Shift+方向键移动 10 px；Delete 删除，Esc 取消选择。</p><p><b>保存</b>：自动保存到当前浏览器 / 应用本地，并可导出含原图的 .wbproj 项目。请定期导出备份。没有账号、联网请求、订阅、数量付费限制或水印。</p><p><b>定量边界</b>：所有计算基于原始亮度像素，显示增强不改变计算；RGB 使用 0.299 R + 0.587 G + 0.114 B。灰度积分不是光密度或绝对蛋白含量。无背景 ROI 时报告反相/正向积分；不同曝光、位深或膜间的绝对积分不能直接比较。重复样本 ID、缺失参照、非正信号、饱和应先核查。</p><p>源码以 MIT 许可提供，可自行修改。当前版本 v'+B.VERSION+'。本版本为独立实现；不读取参考软件的代码或项目。</p></div>';}
    else if(m.type==='audit'){title='操作记录';body='<div class="audit-list">'+p.audit.slice().reverse().map(r=>'<div><time>'+e(r.time.replace('T',' ').slice(0,19))+'</time><strong>'+e(r.action)+'</strong><p>'+e(r.detail)+'</p></div>').join('')+'</div>';footer=B.btn('audit-export','导出记录','export');}
    else if(m.type==='group-menu'){const g=p.groups.find(g=>g.id===m.id);title='图组 · '+g.name;body=input('name',g.name,'名称')+input('experiment',g.experiment,'所属实验');footer=B.btn('clonegroup','复制图组','copy','data-id="'+g.id+'"')+B.btn('deletegroup','删除图组','trash','data-id="'+g.id+'" '+(p.groups.length===1?'disabled':''))+B.btn('save-group','保存','','class="primary"');}
    else if(m.type==='library'){const schema=B.schemas[ui.designTab];title=(m.index===null?'添加':'编辑')+schema.title+'记录';body=schema.fields.map(([f,t])=>input(f,m.record[f]||'',t)).join('');footer=B.btn('save-library','保存记录','save','class="primary"');}
    else if(m.type==='layout'){title='快速排版';body=input('width',m.width,'统一条带宽度 px','type="number" min="100" max="5000"')+input('gap',m.gap,'条带行距 px','type="number" min="0" max="500"')+'<p class="hint">按图层中的图像顺序排版，生成独立的蛋白名、分子量和分组标签。手工添加的文本、形状保留；先前自动标签会更新。可撤销。</p>';footer=B.btn('apply-layout','应用排版','bolt','class="primary"');}
    else if(m.type==='newgroup'){title='新建图组';body=input('name',m.name,'图组名称')+input('experiment',m.experiment,'所属实验');footer=B.btn('create-group','创建图组','plus','class="primary"');}
    else if(m.type==='project-name'){title='项目名称';body=input('name',m.name,'名称');footer=B.btn('save-name','保存','save','class="primary"');}
    else if(m.type==='newproject'){title='新建项目';body=input('name',m.name,'项目名称')+'<p class="hint">开始前可先保存当前项目。创建后可以撤销返回。</p>';footer=B.btn('save','保存当前项目','save')+B.btn('create-project','创建空项目','plus','class="primary"');}
    return'<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">'+title+'</h2>'+B.ib('close-modal','关闭','close')+'</div><div class="modal-body">'+body+'</div><div class="modal-footer">'+B.btn('close-modal','关闭')+footer+'</div></section></div>';
  };
  B.render=()=>{
    const {ui,p}=B.state,g=B.getGroup();document.title='BlotStudio · '+p.name;
    document.getElementById('app').innerHTML=B.header()+B.toolbar()+'<main class="app-main '+(ui.tab==='edit'?'editing':'')+'">'+B.sidebar()+(ui.tab==='edit'?B.editor()+B.inspector():ui.tab==='analysis'?B.analysis():ui.tab==='design'?B.design():B.stats())+'</main><footer class="statusbar"><span><i class="status-dot"></i>本地离线 · 所有功能免费</span><span class="save-status">'+e(ui.saveStatus)+'</span><span class="status-spacer"></span>'+(g.demo?'<span class="demo-status">演示项目 · 模拟数据</span>':'')+'<span>已选择 '+ui.selected.length+' 个对象</span><span>画布 '+g.canvas.width+' × '+g.canvas.height+'</span></footer>'+B.modal()+'<div class="toast '+(ui.toast?'visible':'')+'" role="status">'+e(ui.toast||'')+'</div>';
    const viewport=document.getElementById('viewport');if(viewport){viewport.scrollLeft=ui.scrollX||0;viewport.scrollTop=ui.scrollY||0;viewport.onscroll=()=>{ui.scrollX=viewport.scrollLeft;ui.scrollY=viewport.scrollTop;};}
  };
})(globalThis.BS ||= {});
