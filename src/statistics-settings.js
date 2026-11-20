(function(B){
  'use strict';
  const mapped=(map,key)=>map&&Object.hasOwn(map,key)&&typeof map[key]==='string'?map[key]:key;
  B.aliasMap=text=>{
    const pairs=String(text||'').split('\n').map(v=>v.trim()).filter(Boolean).map(line=>{const at=line.indexOf('=');if(at<1||!line.slice(at+1).trim())throw Error('映射请逐行写成 原名称=统计名称。');return[line.slice(0,at).trim(),line.slice(at+1).trim()];});
    if(pairs.length>500||new Set(pairs.map(v=>v[0])).size!==pairs.length)throw Error('映射重复或超过上限。');return Object.fromEntries(pairs);
  };
  B.statisticsRecords=(records,settings={})=>records.map(record=>({...record,originalGroup:record.group,originalProtein:record.protein,group:mapped(settings.groups,record.group),protein:mapped(settings.proteins,record.protein)}));
  if(!B.state||!B.actions)return;
  const previous=B.currentStats;
  B.currentStats=()=>{
    const settings=B.state.p.statisticsSettings;if(!settings)return previous();
    const {p,ui}=B.state,g=B.getGroup(),selected=ui.checkedGroups.length?p.groups.filter(v=>ui.checkedGroups.includes(v.id)):[g],records=B.statisticsRecords(selected.flatMap(group=>B.records(p,group).map(r=>({...r,imageGroup:group.name}))),settings),proteins=[...new Set(records.map(v=>v.protein))],protein=proteins.includes(ui.statsProtein)?ui.statsProtein:proteins[0]||'',control=ui.control||mapped(settings.groups,g.samples[0]?.group)||'',data=B.statData(records,protein,ui.metric,control,ui.normalize);
    return{...data,records,proteins,protein,control};
  };
  const stats=B.stats;B.stats=()=>stats().replace('<div class="stats-controls">','<div class="button-row">'+B.btn('statistics-settings','编辑统计分组 / 蛋白名称','grid')+B.btn('clear-statistics-settings','撤销统计映射','undo')+'</div><div class="stats-controls">');
  const modal=B.modal;B.modal=()=>{
    if(B.state.ui.modal?.type==='chart-options'){
      const m=B.state.ui.modal;
      const fields=B.select('modal','mode',m.mode,[['bars','柱形 + 样本散点'],['points','样本散点 + 均值线']],'图表类型')
        +B.select('modal','error',m.error,[['sd','标准差（SD）'],['sem','均值标准误（SEM）'],['none','隐藏误差线']],'误差线')
        +B.input('modal','title',m.title,'图标题','maxlength="100" placeholder="自动使用蛋白名称"')
        +B.input('modal','axisLabel',m.axisLabel,'纵轴标题','maxlength="60" placeholder="自动使用统计指标及单位"');
      return '<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true"><div class="modal-heading"><h2>统计图样式</h2>'
        +B.ib('close-modal','关闭','close')+'</div><div class="modal-body">'+fields+'</div><div class="modal-footer">'
        +B.btn('close-modal','取消')+B.btn('apply-chart-options','应用','check','class="primary"')+'</div></section></div>';
    }
    if(B.state.ui.modal?.type!=='statistics-settings')return modal();const m=B.state.ui.modal;
    return'<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true"><div class="modal-heading"><h2>编辑统计分组与蛋白名称</h2>'+B.ib('close-modal','关闭','close')+'</div><div class="modal-body"><p class="hint">每行填写“原名称=统计名称”。仅改变统计视图；原始图组、样本、ROI 和蛋白名称保留。合并后重复的样本 ID 仍会阻止虚增 n。</p><label class="field"><span>统计分组映射</span><textarea data-scope="modal" data-field="groups" aria-label="统计分组映射" rows="6">'+B.esc(m.groups)+'</textarea></label><label class="field"><span>蛋白名称映射</span><textarea data-scope="modal" data-field="proteins" aria-label="蛋白名称映射" rows="6">'+B.esc(m.proteins)+'</textarea></label></div><div class="modal-footer">'+B.btn('apply-statistics-settings','应用统计映射','check')+'</div></section></div>';
  };
  Object.assign(B.actions,{
    'chart-options':()=>{
      const data=B.currentStats();
      if(!data.groups.length)throw Error(data.error||'请先获取有效的定量结果。');
      B.state.ui.modal={type:'chart-options',key:B.chartStyleKey(data),...B.chartStyle(data)};
      B.render();
    },
    'apply-chart-options':()=>{
      const {key,mode,error,title,axisLabel}=B.state.ui.modal;
      if(!['bars','points'].includes(mode)||!['sd','sem','none'].includes(error))throw Error('图表设置无效。');
      B.commit('修改统计图样式',project=>{
        if(!project.chartStyles||typeof project.chartStyles!=='object'||Array.isArray(project.chartStyles))project.chartStyles={};
        project.chartStyles[key]={mode,error,title:String(title).trim().slice(0,100),axisLabel:String(axisLabel).trim().slice(0,60)};
        B.state.ui.modal=null;
      });
    },
    'statistics-settings':()=>{const settings=B.state.p.statisticsSettings||{},text=map=>Object.entries(map||{}).map(([a,b])=>a+'='+b).join('\n');B.state.ui.modal={type:'statistics-settings',groups:text(settings.groups),proteins:text(settings.proteins)};B.render();},
    'apply-statistics-settings':()=>{const m=B.state.ui.modal,settings={groups:B.aliasMap(m.groups),proteins:B.aliasMap(m.proteins)};B.commit('修改统计名称映射',project=>project.statisticsSettings=settings);B.state.ui.modal=null;B.render();},
    'clear-statistics-settings':()=>B.commit('撤销统计名称映射',project=>delete project.statisticsSettings)
  });
})(globalThis.BS ||= {});
