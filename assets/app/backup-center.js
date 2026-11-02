/* One compact, shared backup surface. Data remains in the existing storage bundle. */
(function () {
  'use strict';
  window.TravelStorage.whenReady(() => {
    const B = window.TravelBackup, S = window.TravelStorage;
    if (!B) return;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const icons = {
      down: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
      up: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
      disk: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      history: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6m3-4v6l4 2"/>'
    };
    const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';
    const dialog = document.createElement('dialog');
    dialog.id='backup-center';dialog.className='bc-dialog';dialog.setAttribute('aria-labelledby','bc-title');
    dialog.innerHTML='<header><button type="button" data-bc-back aria-label="返回设置" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h2 id="bc-title">数据与备份</h2><button type="button" data-bc-close aria-label="关闭数据与备份">×</button></header><div class="bc-body"></div><p class="bc-status" role="status" aria-live="polite" hidden></p><input type="file" data-bc-file accept=".json,application/json" aria-label="选择旅行备份文件" hidden>';
    document.body.append(dialog);
    const body=dialog.querySelector('.bc-body'),status=dialog.querySelector('.bc-status'),fileInput=dialog.querySelector('[data-bc-file]');
    let busy=false,pending=null,history=[],returnFocus=null,restored=false,view='home',openToken=0,onBack=null,backRequested=false;
    const formatDate=s=>new Date(s).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const formatSize=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
    function message(text){status.textContent=text;status.hidden=!text;}
    function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));dialog.querySelectorAll('button,input').forEach(n=>n.disabled=value);}
    function render(name,html){view=name;dialog.querySelector('h2').textContent=name;body.innerHTML=html;body.scrollTop=0;message('');}
    function saveState(){
      const node=body.querySelector('[data-bc-save]');if(!node)return;
      const bad=S.bootError||S.cacheError;
      node.textContent=bad?'当前数据尚未全部保存':S.saving?'正在保存到当前浏览器…':'数据保存在当前浏览器';
      const detail=body.querySelector('[data-bc-save-detail]');
      detail.textContent=bad?'请先备份到电脑，再释放浏览器存储空间。':'包含足迹、攻略、My Pick、日程和照片';
      node.parentElement.classList.toggle('is-error',!!bad);
    }
    function home(){
      pending=null;
      render('数据与备份',`<div class="bc-save">${icon('disk')}<div><b data-bc-save></b><p data-bc-save-detail></p></div></div>
      <div class="bc-actions"><button type="button" class="bc-action bc-primary" data-bc="export">${icon('down')}<span><b>备份到电脑</b><small>导出全部数据到一个文件</small></span><span class="bc-chevron" aria-hidden="true">›</span></button>
      <button type="button" class="bc-action" data-bc="choose">${icon('up')}<span><b>从备份恢复</b><small>选择文件后预览内容</small></span><span class="bc-chevron" aria-hidden="true">›</span></button></div>
      ${history.length?`<button type="button" class="bc-history-link" data-bc="history">${icon('history')}<span>恢复前快照 <small>最近 ${history.length} 份</small></span><span aria-hidden="true">›</span></button>`:''}`);
      saveState();
    }
    function summary(raw,name,size){
      pending=raw;const n=B.counts(raw);
      render('备份内容预览',`<p class="bc-filename">${esc(name)}</p><p class="bc-meta">${formatDate(raw.createdAt)}${size?' · '+formatSize(size):''}</p>
      <dl class="bc-counts">${[['足迹城市',n.cities],['导入地点',raw.records.guideImports?.items?.length||0],['My Pick',n.picks],['日程安排',n.arrangements],['交通 / 住宿',n.orders],['照片 / 样片',raw.media===null?'未包含':n.photos]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
      <div class="bc-warning"><b>将覆盖当前旅行数据</b><p>备份中的空项也会替换现有内容。恢复前会自动保留当前完整快照。${raw.media===null?'此旧备份不含照片，当前照片和回忆会保留。':''}</p></div>
      <div class="bc-footer"><button type="button" data-bc="home">取消</button><button type="button" class="bc-primary" data-bc="restore">覆盖并恢复</button></div>`);
    }
    function download(raw,prefix){
      const text=JSON.stringify(raw,null,2),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob);
      const stamp=new Date().toISOString().replace(/[:.]/g,'-'),name=prefix+'-'+stamp+'.json';
      const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      return {name,size:blob.size};
    }
    async function exportAll(){
      setBusy(true);message('正在打包全部数据和照片…');
      try{
        const raw=await B.snapshot(true),file=download(raw,'travel-backup');
        render('备份已生成',`<div class="bc-success">${icon('check')}<h3>整份备份已开始下载</h3><p>请在浏览器下载列表中确认保存。</p></div><div class="bc-file-info"><b>${esc(file.name)}</b><small>${formatSize(file.size)} · ${formatDate(raw.createdAt)}</small></div><p class="bc-meta">电脑上的备份由你保管，不会被自动清理。</p><button type="button" class="bc-primary bc-full" data-bc="home">完成</button>`);
      }catch(error){message('导出失败：'+error.message);}finally{setBusy(false);}
    }
    async function restore(){
      if(!pending)return;setBusy(true);message('正在保留当前快照并恢复，请勿关闭页面…');
      try{
        const n=await B.apply(pending);restored=true;
        render('恢复完成',`<div class="bc-success">${icon('check')}<h3>数据已成功恢复</h3><p>${n.cities} 座足迹城市 · ${n.arrangements} 项日程 · ${n.photos} 张照片 / 样片</p></div><p class="bc-meta">恢复前的数据已保留，可在「数据与备份」中找回。</p><button type="button" class="bc-primary bc-full" data-bc="done">完成并查看</button>`);
      }catch(error){message((error.name==='QuotaExceededError'?'存储空间不足，恢复未完成。':error.message)+' 请保留备份文件。');}
      finally{try{history=await S.recoveryHistory();}catch(_){}setBusy(false);}
    }
    function showHistory(){
      render('恢复前快照',`<p class="bc-meta">仅在恢复前保存，最多保留最近 5 份。</p><div class="bc-history-list">${history.map((entry,i)=>`<button type="button" data-bc-history="${i}"><span><b>${formatDate(entry.createdAt)}</b><small>${B.counts(entry.backup).cities} 座足迹城市 · ${B.counts(entry.backup).photos} 张照片 / 样片</small></span><span>预览 ›</span></button>`).join('')}</div><button type="button" class="bc-full" data-bc="home">返回</button>`);
    }
    async function chooseFile(){
      render('从备份恢复',`<button type="button" class="bc-upload" data-bc="file">${icon('up')}<b>选择备份文件</b><small>旅行整份备份 · .json</small></button><p class="bc-meta">先预览内容，再确认覆盖。</p><button type="button" class="bc-full" data-bc="home">返回</button>`);
      fileInput.click();
    }
    fileInput.addEventListener('change',async()=>{
      const file=fileInput.files?.[0];if(!file||busy)return;pending=null;setBusy(true);message('正在验证备份…');
      try{if(file.size>window.TravelBackupCore.MAX_BYTES)throw Error('文件超过 80 MB，无法导入。');const raw=B.validate(JSON.parse(await file.text()));summary(raw,file.name,file.size);}
      catch(error){message('未载入，当前数据未更改。'+(error instanceof SyntaxError?'文件已损坏或不是有效的 JSON。':error.message));}
      finally{fileInput.value='';setBusy(false);}
    });
    body.addEventListener('click',async e=>{
      if(busy)return;const h=e.target.closest('[data-bc-history]');
      if(h){const entry=history[Number(h.dataset.bcHistory)];if(entry)try{summary(B.validate(structuredClone(entry.backup)),'恢复前快照',0);}catch(error){message(error.message);}return;}
      const action=e.target.closest('[data-bc]')?.dataset.bc;
      if(action==='home')home();else if(action==='export')await exportAll();else if(action==='choose')await chooseFile();else if(action==='file')fileInput.click();else if(action==='restore')await restore();else if(action==='history')showHistory();else if(action==='done')location.reload();
    });
    function close(){if(!busy){if(restored)location.reload();else dialog.close();}}
    dialog.querySelector('[data-bc-close]').onclick=close;
    dialog.querySelector('[data-bc-back]').onclick=()=>{if(!busy&&onBack){if(restored){location.reload();return;}backRequested=true;dialog.close();}};
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('close',()=>{
      openToken++;
      const goBack=backRequested?onBack:null;backRequested=false;onBack=null;
      if(goBack)goBack();else if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    });
    S.subscribe(saveState);window.addEventListener('travel-storage-error',saveState);window.addEventListener('travel-storage-recovered',saveState);
    window.TravelBackupCenter={async open(mode='home',options={}){
      if(busy)return;
      onBack=typeof options.onBack==='function'?options.onBack:null;backRequested=false;
      dialog.querySelector('[data-bc-back]').hidden=!onBack;
      if(!dialog.open){returnFocus=options.returnFocus||document.activeElement;dialog.showModal();}restored=false;home();
      const token=++openToken;
      try{history=await S.recoveryHistory();}catch(_){history=[];}
      if(token!==openToken||!dialog.open||busy||view!=='数据与备份')return;
      if(mode==='import')chooseFile();else home();dialog.querySelector('[data-bc-close]').focus({preventScroll:true});
    }};
    B.open=()=>window.TravelBackupCenter.open();
  });
})();
