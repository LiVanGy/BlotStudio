(async()=>{
  const B=BS;
  await B.ready;
  const bytes=B.unbase64(window.testTiff);
  const file=new File([bytes],'SYNTHETIC-raw.tif',{type:'image/tiff'});
  await B.importFiles([file]);
  const g=B.getGroup(),o=g.objects[0],s=B.state.p.sources[0];
  g.name='IOQA';g.canvas={width:200,height:120,dpi:300,background:'#ffffff'};
  g.samples=[{id:'S1',group:'C',replicate:1,include:true}];
  Object.assign(o,{x:3,y:4,w:73,h:39,strokeWidth:0,protein:'Protein Q',analysis:{...B.analysisDefaults(),convert8:false,background:'roi',method:'rect'},background:{x:2,y:0,w:2,h:1},rois:[{id:B.uid(),x:0,y:0,w:2,h:1,sampleIndex:0}]});
  g.objects.push(B.object('rect',{name:'Red patch',x:80,y:10,w:40,h:30,fill:'#ff0000',strokeWidth:0}),B.object('text',{name:'Label',x:30,y:75,w:100,h:30,text:'WB 01',fontSize:18}));
  B.validate(B.state.p);
  const saved={};let cur='';
  B.saveFile=async(name,data)=>{if(data instanceof Blob)data=new Uint8Array(await data.arrayBuffer());if(typeof data==='string')data=B.utf8(data);saved[cur]=B.base64(data);return{status:'saved'};};
  for(const format of ['project','originals','csv','xlsx','svg','svg-linked','pptx','png','jpg','tiff']){
    cur=format;B.state.ui.modal={type:'export',format,scale:1,quality:.94};await B.doExport();
  }
  const redSamples={};
  for(const [format,mime] of [['png','image/png'],['jpg','image/jpeg']]){
    const image=await B.loadImage('data:'+mime+';base64,'+saved[format]);
    const canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    redSamples[format]={size:[image.width,image.height],color:Array.from(ctx.getImageData(100,25,1,1).data)};
  }
  await B.openProject(new File([B.unbase64(saved.project)],'test.wbproj'));
  const roundtrip=JSON.stringify(B.state.p)===new TextDecoder().decode(B.unbase64(saved.project));
  webkit.messageHandlers.qaResult.postMessage({saved,roundtrip,redSamples});
})().catch(e=>webkit.messageHandlers.qaResult.postMessage({error:String(e),stack:e.stack}));
