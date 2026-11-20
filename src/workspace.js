(function(B){
  'use strict';
  const pending=new Map(),backups=new Map();
  let directory=null;
  B.workspaceResult=(id,status,message='')=>{const request=pending.get(id);if(!request)return;pending.delete(id);clearTimeout(request.timer);status==='ok'?request.resolve(message):request.reject(Error(status==='cancelled'?'已取消选择目录。':message||'目录操作失败。'));};
  const native=body=>{if(globalThis.chrome?.webview?.postMessage){chrome.webview.postMessage({type:'workspace',...body});return true;}if(globalThis.webkit?.messageHandlers?.saveFile){webkit.messageHandlers.saveFile.postMessage(body);return true;}return false;};
  const request=body=>new Promise((resolve,reject)=>{const id=B.uid(),timer=setTimeout(()=>{pending.delete(id);reject(Error('目录操作未完成，请检查窗口。'));},120000);pending.set(id,{resolve,reject,timer});try{if(!native({...body,id})){clearTimeout(timer);pending.delete(id);reject(Error('当前环境不支持原生目录操作。'));}}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
  B.workspaceState={path:'未选择',sync:false,status:'尚未写入'};
  B.chooseWorkspace=async()=>{let path;if(globalThis.showDirectoryPicker&&!globalThis.chrome?.webview&&!globalThis.webkit?.messageHandlers?.saveFile){directory=await showDirectoryPicker({mode:'readwrite'});path=directory.name;}else path=await request({workspace:'choose'});B.workspaceState.path=path;B.workspaceState.status='目录已选择，尚未写入';B.render();};
  const writeProject=async project=>{
    B.validate(project);
    if(B.workspaceState.path==='未选择')throw Error('请先选择存储路径。');
    const name='BlotStudio-'+project.id+'.wbproj',text=JSON.stringify(project);
    B.workspaceState.status='正在写入…';
    try{
      if(directory){
        const file=await directory.getFileHandle(name,{create:true});
        const writer=await file.createWritable();
        await writer.write(text);
        await writer.close();
      }else{
        await request({workspace:'write',name,data:B.base64(B.utf8(text))});
      }
      B.workspaceState.status='已写入 '+new Date().toLocaleTimeString();
      return true;
    }catch(error){
      B.workspaceState.status='写入失败：'+error.message;
      throw error;
    }
  };

  let writeQueue=Promise.resolve();
  const enqueue=project=>{
    const job=writeQueue.catch(()=>{}).then(()=>writeProject(project));
    writeQueue=job;
    return job;
  };
  const markPending=project=>{
    const previous=backups.get(project.id);
    if(previous?.project===project)return previous;
    clearTimeout(previous?.timer);
    const backup={project};
    backups.set(project.id,backup);
    return backup;
  };
  const writeBackup=backup=>{
    clearTimeout(backup.timer);
    if(backup.job)return backup.job;
    backup.job=enqueue(backup.project).then(result=>{
      const id=backup.project.id;
      if(backups.get(id)===backup)backups.delete(id);
      return result;
    },error=>{
      backup.job=null;
      throw error;
    });
    return backup.job;
  };

  B.syncWorkspace=()=>{
    const project=B.state.p;
    return B.workspaceState.sync?writeBackup(markPending(project)):enqueue(project);
  };
  const schedule=()=>{
    if(!B.workspaceState.sync)return;
    const backup=markPending(B.state.p);
    clearTimeout(backup.timer);
    backup.timer=setTimeout(async()=>{
      try{await writeBackup(backup);}
      catch(error){B.toast('项目「'+backup.project.name+'」备份失败：'+error.message);}
      B.render();
    },1500);
  };
  const cancelScheduled=()=>{
    for(const backup of backups.values())clearTimeout(backup.timer);
    backups.clear();
  };
  const persist=B.persist;
  B.persist=()=>{persist();schedule();};
  const flush=B.flushSave;
  B.flushSave=async()=>{
    if(!await flush())return false;
    if(!B.workspaceState.sync)return true;
    markPending(B.state.p);
    const results=await Promise.allSettled(Array.from(backups.values(),writeBackup));
    return results.every(result=>result.status==='fulfilled');
  };
  const modal=B.modal;B.modal=()=>{if(B.state.ui.modal?.type!=='workspace')return modal();return'<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true"><div class="modal-heading"><h2>文件管理</h2>'+B.ib('close-modal','关闭','close')+'</div><div class="modal-body"><p>已选择的存储路径：'+B.esc(B.workspaceState.path)+'</p><p>'+B.esc(B.workspaceState.status)+'</p><p class="hint">目录备份包含完整项目、原图、ROI、图层和操作记录。每个项目使用唯一文件名，写入成功后才报告完成。重新启动后请重新选择目录。</p></div><div class="modal-footer">'+B.btn('choose-workspace','选择存储路径','folder')+B.btn('sync-workspace','立即备份 / 重试','save')+B.btn('toggle-workspace-sync',B.workspaceState.sync?'关闭同步':'开启同步','check')+'</div></section></div>';};
  Object.assign(B.actions,{
    workspace:()=>{B.state.ui.projectTools=false;B.state.ui.modal={type:'workspace'};B.render();},
    'choose-workspace':()=>B.chooseWorkspace(),
    'sync-workspace':async()=>{await B.syncWorkspace();B.render();B.toast('目录备份已写入。');},
    'toggle-workspace-sync':()=>{if(B.workspaceState.path==='未选择')throw Error('请先选择存储路径。');B.workspaceState.sync=!B.workspaceState.sync;if(B.workspaceState.sync)schedule();else cancelScheduled();B.render();}
  });
})(globalThis.BS ||= {});
