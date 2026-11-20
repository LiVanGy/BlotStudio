(function(B) {
  'use strict';

  // Convert only the small set of SVG primitives emitted by the statistics page.
  // The figure editor and PowerPoint can then edit every plot mark independently.
  const value=(node,attribute,fallback=0)=>node.hasAttribute(attribute)?Number(node.getAttribute(attribute)):fallback;
  function color(node,attribute,fallback='none'){
    const raw=node.getAttribute(attribute)||fallback;
    const rgb=({black:'#000000',white:'#ffffff'})[raw]||raw;
    const alpha=value(node,attribute+'-opacity',1);
    if(alpha>=1||rgb==='none')return rgb;
    const hex=rgb.length===4?'#'+Array.from(rgb.slice(1),digit=>digit+digit).join(''):rgb;
    return hex+Math.round(255*alpha).toString(16).padStart(2,'0');
  }

  function textObject(node,context){
    const fontSize=value(node,'font-size',13),fontFamily=node.getAttribute('font-family')||'Arial';
    const fontWeight=['bold','700'].includes(node.getAttribute('font-weight'))?700:400;
    const text=node.textContent,align=({middle:'center',end:'right'})[node.getAttribute('text-anchor')]||'left';
    context.font=fontWeight+' '+fontSize+'px '+fontFamily;
    const w=Math.max(1,context.measureText(text).width),h=fontSize*1.25;
    const localX=value(node,'x')+(align==='center'?0:align==='left'?w/2:-w/2);
    const localY=value(node,'y')-fontSize*.90+h/2;
    const transform=node.transform.baseVal.consolidate()?.matrix;
    const center=transform?new DOMPoint(localX,localY).matrixTransform(transform):{x:localX,y:localY};
    const rotation=transform?Math.atan2(transform.b,transform.a)*180/Math.PI:0;
    return B.object('text',{name:text,text,x:center.x-w/2,y:center.y-h/2,w,h,align,rotation,fontSize,fontFamily,fontWeight,fill:color(node,'fill','#000000'),strokeWidth:0});
  }

  function plotMark(node,context){
    if(node.localName==='text')return textObject(node,context);
    if(node.localName==='line'){
      const x1=value(node,'x1'),y1=value(node,'y1'),x2=value(node,'x2'),y2=value(node,'y2');
      const w=Math.hypot(x2-x1,y2-y1),h=value(node,'stroke-width',1);
      if(!w||!h)return null;
      return B.object('rect',{name:'统计图线段',x:(x1+x2-w)/2,y:(y1+y2-h)/2,w,h,rotation:Math.atan2(y2-y1,x2-x1)*180/Math.PI,fill:color(node,'stroke'),stroke:'none',strokeWidth:0});
    }
    const style={fill:color(node,'fill','#000000'),stroke:color(node,'stroke'),strokeWidth:node.hasAttribute('stroke')?value(node,'stroke-width',1):0};
    if(node.localName==='circle'){
      const r=value(node,'r');
      return B.object('rect',{name:'样本点',geometry:'ellipse',x:value(node,'cx')-r,y:value(node,'cy')-r,w:2*r,h:2*r,...style});
    }
    if(node.localName==='rect'){
      const w=value(node,'width'),h=value(node,'height');
      return w&&h?B.object('rect',{name:'统计图矩形',x:value(node,'x'),y:value(node,'y'),w,h,...style}):null;
    }
    if(node.localName==='desc'||node.localName==='title')return null;
    throw Error('无法将图表元素 '+node.localName+' 转为可编辑对象。');
  }

  function currentChart(){
    const data=B.currentStats();
    if(data.error||!data.groups.length)throw Error(data.error||'请先生成有效的分组统计数据。');
    return {data,svg:B.statsChartSVG(data)};
  }

  B.actions['chart-export']=()=>{
    const {data,svg}=currentChart();
    return B.saveFile(data.protein+'-统计图.svg',svg,'image/svg+xml');
  };
  B.actions['chart-to-layout']=()=>{
    const {data,svg}=currentChart();
    const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
    const width=value(root,'width'),height=value(root,'height');
    const context=document.createElement('canvas').getContext('2d');
    const marks=Array.from(root.children,node=>{
      const mark=plotMark(node,context);
      if(mark)mark.opacity=value(node,'opacity',1);
      return mark;
    }).filter(Boolean);
    if(!marks.length||!(width>0&&height>0))throw Error('统计图尺寸或内容无效。');

    B.commit('将统计图快照加入排版',(project,group)=>{
      const padding=20,existing=group.objects.filter(o=>o.visible!==false);
      const bounds=B.bounds(existing);
      let x=padding,y=existing.length?Math.max(padding,Math.ceil(bounds.y+bounds.h)+padding):padding;
      if(y+height+padding>10000){x=Math.max(padding,Math.ceil(bounds.x+bounds.w)+padding);y=padding;}
      if(x+width+padding>10000||y+height+padding>10000||group.objects.length+marks.length>3000){
        throw Error('图表超出画布尺寸或对象数量上限，可单独导出图表 SVG。');
      }
      const groupId=B.uid();
      for(const mark of marks){mark.x+=x;mark.y+=y;mark.groupId=groupId;}
      group.objects.push(...marks);
      group.canvas.width=Math.max(group.canvas.width,Math.ceil(x+width)+padding);
      group.canvas.height=Math.max(group.canvas.height,Math.ceil(y+height)+padding);
      B.state.ui.tab='edit';
      B.state.ui.selected=marks.map(mark=>mark.id);
      B.state.ui.inspector='object';
    },data.protein+' · '+data.groups.map(group=>group.name+' (n='+group.n+')').join(' / '));
    B.fit();
    B.toast('统计图快照已加入排版。解组后可分别编辑，数据变化后可重新加入。');
  };
})(globalThis.BS ||= {});
