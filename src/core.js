(function(B) {
  'use strict';
  B.VERSION = '0.4.0';
  B.uid = () => 'b' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).replaceAll('-', '');
  B.clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  B.num = (v,f=0) => Number.isFinite(Number(v)) ? Number(v) : f;
  B.esc = s => String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  B.clone = p => ({...JSON.parse(JSON.stringify({...p,sources:[]})),sources:p.sources.map(source=>Object.freeze(source))});
  B.log = (p, action, detail='') => {p.audit.push({time:new Date().toISOString(),action,detail});};
  B.base64 = bytes => {let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
  B.unbase64 = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  B.utf8 = s => new TextEncoder().encode(s);
  B.MAX_PROJECT_BYTES = 220*1024*1024;
  const sourceJsonBytes=new WeakMap();
  B.projectBytes=p=>{
    // Keep the empty [] already included in the metadata JSON, then account for
    // each source and its separating commas. No combined base64 JSON is built.
    let bytes=B.utf8(JSON.stringify({...p,sources:[]})).length;
    for(const source of p.sources){
      // Production sources contain primitive fields. A shallow-frozen imported
      // extension with nested metadata is recomputed, since its children may move.
      const stable=Object.isFrozen(source)&&Object.values(source).every(v=>v===null||['string','number','boolean','undefined'].includes(typeof v));
      let size=stable?sourceJsonBytes.get(source):undefined;
      if(size===undefined){size=B.utf8(JSON.stringify(source)).length;if(stable)sourceJsonBytes.set(source,size);}
      bytes+=size;
    }
    return bytes+Math.max(0,p.sources.length-1);
  };
  B.projectSizeError=()=>Error('项目容量超过 '+(B.MAX_PROJECT_BYTES>=1048576?(B.MAX_PROJECT_BYTES/1048576).toLocaleString('en-US',{maximumFractionDigits:2})+' MiB':B.MAX_PROJECT_BYTES+' 字节')+' 上限。请先保存当前项目，再新建另一个项目分别存放；仅拆分图组不能减小同一项目的容量。');
  B.assertProjectSize=p=>{const bytes=B.projectBytes(p);if(bytes>B.MAX_PROJECT_BYTES)throw B.projectSizeError();return bytes;};
  B.crc32 = bytes => {let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  B.zip = entries => {
    const chunks=[],central=[];let offset=0;
    const header=(size,fn)=>{const a=new Uint8Array(size);fn(new DataView(a.buffer));return a;};
    for(const [name,value] of Object.entries(entries)){
      const n=B.utf8(name),data=typeof value==='string'?B.utf8(value):value,crc=B.crc32(data);
      const h=header(30,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);});
      chunks.push(h,n,data);
      const c=header(46,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);});
      central.push(c,n);offset+=30+n.length+data.length;
    }
    const clen=central.reduce((s,a)=>s+a.length,0),end=header(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,Object.keys(entries).length,true);v.setUint16(10,Object.keys(entries).length,true);v.setUint32(12,clen,true);v.setUint32(16,offset,true);});
    const out=new Uint8Array(offset+clen+22);let i=0;for(const a of [...chunks,...central,end]){out.set(a,i);i+=a.length;}return out;
  };
  B.csv = rows => '\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  B.workbook = sheets => {
    if(!Array.isArray(sheets)||!sheets.length||sheets.length>30)throw Error('工作簿必须包含 1–30 个工作表。');
    const ns='http://schemas.openxmlformats.org',used=new Set(),files={};
    sheets=sheets.map((s,i)=>{const base=String(s.name||'Sheet '+(i+1)).replace(/[\\\/\?\*\[\]:]/g,'_').slice(0,31)||'Sheet';let name=base,suffix=1;while(used.has(name)){const tail='_'+suffix++;name=base.slice(0,31-tail.length)+tail;}used.add(name);if(!Array.isArray(s.rows))throw Error('工作表内容无效。');return {...s,name};});
    files['[Content_Types].xml']='<Types xmlns="'+ns+'/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
    files['_rels/.rels']='<Relationships xmlns="'+ns+'/package/2006/relationships"><Relationship Id="rId1" Type="'+ns+'/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml']='<workbook xmlns="'+ns+'/spreadsheetml/2006/main" xmlns:r="'+ns+'/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+B.esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
    files['xl/_rels/workbook.xml.rels']='<Relationships xmlns="'+ns+'/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+ns+'/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>';
    const column=index=>{let s='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
    sheets.forEach((s,i)=>{files['xl/worksheets/sheet'+(i+1)+'.xml']='<worksheet xmlns="'+ns+'/spreadsheetml/2006/main"><sheetData>'+s.rows.map((row,y)=>'<row r="'+(y+1)+'">'+row.map((v,x)=>{const ref=column(x)+(y+1);return Number.isFinite(v)?'<c r="'+ref+'"><v>'+v+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+B.esc(v)+'</t></is></c>';}).join('')+'</row>').join('')+'</sheetData></worksheet>';});return B.zip(files);
  };
  B.xlsx = rows => B.workbook([{name:'WB data',rows}]);
  B.object = (type, props={}) => ({id:B.uid(),type,name:type==='text'?'文本':'图像',x:80,y:80,w:200,h:36,rotation:0,opacity:1,visible:true,locked:false,fill:'#20252c',stroke:'#20252c',strokeWidth:1,fontSize:22,fontFamily:'Arial',fontWeight:400,align:'left',...props});
  B.imageObject=(s,i=0)=>B.object('image',{name:s.name,sourceId:s.id,x:180,y:140+i*90,w:640,h:640*s.height/s.width,crop:{x:0,y:0,w:s.width,h:s.height},brightness:100,contrast:100,invert:false,flipX:false,flipY:false,grayscale:true,lockRatio:true,protein:s.name.replace(/\.[^.]+$/,''),mw:'',referenceId:'',rois:[],background:null,polarity:'dark'});
  B.blankGroup=(name='新图组',experiment='实验 01')=>({id:B.uid(),name,experiment,status:'进行中',canvas:{width:1000,height:590,background:'#ffffff',dpi:300},samples:Array.from({length:12},(_,i)=>({id:'S'+(i+1),group:['Control','Low','Medium','High'][Math.floor(i/3)],replicate:i%3+1,include:true})),objects:[],notes:''});
  B.blankProject=()=>{const g=B.blankGroup();return {format:'BlotStudio',version:1,id:B.uid(),name:'WB 实验项目',activeGroup:g.id,groups:[g],sources:[],sampleLibrary:[],antibodies:[],plan:[],audit:[],demo:false};};
  B.assertRect=(s,r,label='选区')=>{if(!r||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>s.width+1e-7||r.y+r.h>s.height+1e-7)throw Error(label+' 超出原图范围或尺寸无效。');return r;};
  const validatedSources=new WeakSet();
  B.validate = p => {
    const id=v=>typeof v==='string'&&/^[-\w]+$/.test(v),text=v=>typeof v==='string',color=v=>typeof v==='string'&&/^(#[a-fA-F0-9]{3}|#[a-fA-F0-9]{4}|#[a-fA-F0-9]{6}|#[a-fA-F0-9]{8}|none|transparent)$/.test(v);
    if(p?.format!=='BlotStudio'||p.version!==1||!id(p.id)||!text(p.name)||!Array.isArray(p.groups)||!Array.isArray(p.sources)||!Array.isArray(p.audit)||!p.groups.length)throw Error('不是可识别的 BlotStudio v1 项目。');
    if(p.groups.length>200||p.sources.length>500||p.audit.length>100000)throw Error('项目过大，请拆分后再导入。');
    const sources=new Map();
    for(const s of p.sources){
      if(!s||!id(s.id)||sources.has(s.id))throw Error('图像 ID 无效或重复。');if(Object.isFrozen(s)&&validatedSources.has(s)){sources.set(s.id,s);continue;}
      if(!s||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.url)||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width*s.height>32000000||![8,16].includes(s.bitDepth)||!id(s.id)||sources.has(s.id)||!text(s.name))throw Error('图像数据无效。');
      const expected=s.width*s.height*(s.bitDepth/8);
      if(!text(s.pixels)||s.pixels.length!==Math.ceil(expected/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s.pixels))throw Error('原始像素长度不匹配，不能打开损坏的项目。');
      try{if(atob(s.pixels).length!==expected)throw Error();}catch{throw Error('原始像素长度不匹配，不能打开损坏的项目。');}
      if(s.original!==undefined&&(!text(s.original)||!/^data:image\/(png|jpeg|webp|tiff);base64,[A-Za-z0-9+/]*={0,2}$/.test(s.original)))throw Error('原始文件数据格式无效。');
      Object.freeze(s);sources.set(s.id,s);validatedSources.add(s);
    }
    const groupIds=new Set();
    for(const g of p.groups){
      if(!g||!id(g.id)||groupIds.has(g.id)||!text(g.name)||!text(g.experiment))throw Error('图组信息无效或 ID 重复。');groupIds.add(g.id);
      if(!g.canvas||![g.canvas.width,g.canvas.height].every(n=>Number.isFinite(n)&&n>=100&&n<=10000)||!color(g.canvas.background)||![150,300,600].includes(Number(g.canvas.dpi))||!Array.isArray(g.objects)||g.objects.length>3000||!Array.isArray(g.samples)||!g.samples.length||g.samples.length>200)throw Error('画布参数无效。');
      const sampleIds=new Set();for(const s of g.samples){if(!s||!text(s.id)||!s.id.trim()||sampleIds.has(s.id)||!text(s.group)||!s.group.trim()||!Number.isInteger(s.replicate)||s.replicate<1)throw Error('样本 ID、分组或重复编号无效。');sampleIds.add(s.id);}
      const objectIds=new Set(),imageIds=new Set(g.objects.filter(o=>o?.type==='image').map(o=>o.id));
      for(const o of g.objects){
        if(!o||!['image','text','rect','line','arrow','bracket'].includes(o.type)||!id(o.id)||objectIds.has(o.id)||![o.x,o.y,o.w,o.h,o.rotation,o.opacity].every(Number.isFinite)||o.w<=0||o.h<=0||o.w>10000||o.h>10000||o.opacity<0||o.opacity>1)throw Error('对象参数无效。');objectIds.add(o.id);
        if(o.type==='image'){
          const s=sources.get(o.sourceId);if(!s)throw Error('图像来源缺失。');B.assertRect(s,o.crop,'裁剪范围');
          if(!Array.isArray(o.rois)||o.rois.length>g.samples.length||new Set(o.rois.map(r=>r?.id)).size!==o.rois.length||new Set(o.rois.map(r=>r?.sampleIndex)).size!==o.rois.length)throw Error('ROI 参数无效或同一泳道有重复 ROI。');
          for(const r of o.rois){if(!r||!id(r.id)||!Number.isInteger(r.sampleIndex)||r.sampleIndex<0||r.sampleIndex>=g.samples.length)throw Error('ROI 样本对应关系无效。');B.assertRect(s,r,'条带 ROI');}
          if(o.background)B.assertRect(s,o.background,'背景 ROI');
          if(o.referenceId&&(o.referenceId===o.id||!imageIds.has(o.referenceId)))throw Error('参照蛋白缺失或不能引用自身。');
          for(const key of ['brightness','contrast'])if(!Number.isFinite(o[key])||o[key]<0||o[key]>200)throw Error('图像显示参数无效。');
          if(!['dark','light'].includes(o.polarity))throw Error('信号方向无效。');
        }
        for(const k of ['fill','stroke'])if(o[k]!==undefined&&!color(o[k]))throw Error('颜色格式无效。');
        if(o.strokeWidth!==undefined&&(!Number.isFinite(o.strokeWidth)||o.strokeWidth<0||o.strokeWidth>20))throw Error('线宽无效。');
        if(o.fontFamily&&!['Arial','Times New Roman','Helvetica','Georgia','Courier New','PingFang SC'].includes(o.fontFamily))throw Error('字体格式无效。');
        if(o.type==='text'&&(!text(o.text)||!Number.isFinite(o.fontSize)||o.fontSize<6||o.fontSize>300))throw Error('文字参数无效。');
      }
    }
    if(!groupIds.has(p.activeGroup))p.activeGroup=p.groups[0].id;
    for(const key of ['sampleLibrary','antibodies','plan']){p[key] ||= [];if(!Array.isArray(p[key])||p[key].some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.values(r).some(v=>!['string','number','boolean'].includes(typeof v))))throw Error('资料库数据无效。');}
    if(p.audit.some(r=>!r||![r.time,r.action,r.detail].every(text)))throw Error('操作记录数据无效。');
    B.assertProjectSize(p);
    return p;
  };
  B.bounds = objects => {if(!objects.length)return {x:0,y:0,w:0,h:0};let x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));return{x,y,w:Math.max(...objects.map(o=>o.x+o.w))-x,h:Math.max(...objects.map(o=>o.y+o.h))-y};};
  B.alignObjects=(objects,mode)=>{const b=B.bounds(objects),axis=mode==='distributeY'?'y':'x',dim=axis==='x'?'w':'h';if(mode.startsWith('distribute')){if(objects.length<3)return;const a=objects.slice().sort((a,b)=>a[axis]-b[axis]),gap=(b[dim]-a.reduce((s,o)=>s+o[dim],0))/(a.length-1);let n=b[axis];for(const o of a){o[axis]=n;n+=o[dim]+gap;}return;}for(const o of objects){if(mode==='left')o.x=b.x;if(mode==='center')o.x=b.x+(b.w-o.w)/2;if(mode==='right')o.x=b.x+b.w-o.w;if(mode==='top')o.y=b.y;if(mode==='middle')o.y=b.y+(b.h-o.h)/2;if(mode==='bottom')o.y=b.y+b.h-o.h;if(mode==='width')o.w=objects[0].w;if(mode==='height')o.h=objects[0].h;}};
})(globalThis.BS ||= {});
