(function () {
  'use strict';
  const S = window.TravelStorage, C = window.TravelLocalCore, R = window.TravelLocalReview;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const copy = v => structuredClone(v);
  function init() {
    const B = window.TravelBackup;
    if (!B) return;
    let dir = null, connected = false, timer, running = null, busy = false, preview = null, status = '', error = false;
    const supported = !S.previewMode && !!(window.showDirectoryPicker && window.isSecureContext && crypto.subtle);
    const dialog = document.createElement('dialog'); dialog.className = 'lf-dialog'; dialog.id = 'local-files-dialog'; dialog.setAttribute('aria-labelledby', 'lf-title');
    dialog.innerHTML = `<header><h2 id="lf-title">保存设置</h2><button type="button" data-lf-close aria-label="关闭数据与备份">×</button></header>
      <section class="lf-body" id="lf-panel-save" aria-labelledby="lf-title">
      <div class="lf-save-overview"><i class="lf-shortcut-dot" aria-hidden="true"></i><div><h3 data-lf-heading></h3><p data-lf-summary role="status" aria-live="polite"></p></div></div>
      <div class="lf-actions" data-lf-connect-actions><button type="button" class="lf-primary" data-lf-choose>选择保存文件夹</button><button type="button" class="lf-primary" data-lf-reconnect hidden>连接原来的文件夹</button></div>
      <section class="lf-preview" data-lf-preview hidden aria-labelledby="lf-review-title"><h3 id="lf-review-title"></h3><p data-lf-review-intro></p>
      <details class="lf-diff-review" data-lf-diff-review><summary><b>查看具体差异</b><span data-lf-diff-summary></span></summary><div class="lf-differences" data-lf-differences></div></details>
      <fieldset class="lf-choice-cards" data-lf-choice-cards><legend>你想继续使用哪一份？</legend><label><input type="radio" name="lf-version" value="browser" data-lf-choice><span><b>继续用当前页面</b><small>保留此页面里的编辑、选择与删除。</small></span></label><label><input type="radio" name="lf-version" value="file" data-lf-choice><span><b>改用文件夹记录</b><small>把页面换成文件夹里保存的那份。</small></span></label></fieldset>
      <div class="lf-result" data-lf-result hidden role="status" aria-live="polite"></div>
      <p class="lf-fine" data-lf-scope></p>
      <div class="lf-actions lf-review-actions"><button type="button" class="lf-primary" data-lf-confirm disabled>先选择要保留的记录</button><button type="button" data-lf-cancel>暂不连接</button></div>
      <p class="lf-fine lf-reassurance">确认前不会替换任何内容；确认后会保留两份原始记录的备份。</p></section>
      <section class="lf-settings" data-lf-settings><div class="lf-folder-info" data-lf-folder-info><span>保存位置</span><b data-lf-folder-name></b></div><div class="lf-actions" data-lf-folder-actions><button type="button" data-lf-save hidden>立即保存</button></div><p data-lf-message hidden></p></section>
      <details class="lf-history"><summary>历史版本</summary><button type="button" data-lf-history>读取历史版本</button><div data-lf-history-list></div><div data-lf-drafts></div><p data-lf-history-status role="status" aria-live="polite"></p></details></section>
      <section id="lf-panel-backup" aria-labelledby="lf-title" hidden><div data-lf-backup-content></div><details class="lf-legacy"><summary>旧版地图备份</summary><p>兼容以前单独导出的足迹文件；导入时合并保留现有足迹。</p><div class="lf-actions"><button type="button" data-lf-map-export>导出地图</button><button type="button" data-lf-map-import>导入旧地图备份</button></div><p data-lf-map-status role="status" aria-live="polite"></p></details></section>`;
    document.body.append(dialog);
    const $ = q => dialog.querySelector(q);
    B.mount($('[data-lf-backup-content]'));
    for (const [id, name] of [['tb-export','export'],['tb-file','import'],['tb-share','share']]) {
      document.getElementById(id)?.closest('.tb-card')?.setAttribute('data-lf-backup-card', name);
    }
    const quick = document.createElement('div'); quick.className = 'lf-quick'; quick.id = 'local-files-menu'; quick.hidden = true; quick.tabIndex = -1; quick.setAttribute('role','region'); quick.setAttribute('aria-label','数据与备份');
    quick.innerHTML = `<div class="lf-quick-status"><i class="lf-shortcut-dot" aria-hidden="true"></i><div><b data-lfq-state></b><p data-lfq-summary></p></div></div>
      <div class="lf-quick-actions"><button type="button" data-lfq="export"><span>导出备份<small>包含行程与照片</small></span><i aria-hidden="true">↓</i></button><button type="button" data-lfq="import"><span>导入备份</span><i aria-hidden="true">↑</i></button></div>
      <div class="lf-quick-footer"><button type="button" data-lfq="save">保存设置</button><details><summary>其他操作 <span aria-hidden="true">⌄</span></summary><div><button type="button" data-lfq="history">历史版本</button><button type="button" data-lfq="share">分享行程</button><button type="button" data-lfq="legacy">旧版地图备份</button></div></details></div><p class="lf-quick-feedback" data-lfq-feedback role="status" aria-live="polite" hidden></p>`;
    document.body.append(quick);
    let returnFocus = null, quickAnchor = null, quickTrigger = null, exporting = false;
    function closeQuick(focus = false) {
      quick.hidden = true; quickTrigger?.setAttribute('aria-expanded','false');
      if (focus && quickAnchor?.isConnected) quickAnchor.focus({preventScroll:true});
    }
    function positionQuick() {
      if (quick.hidden || !quickAnchor) return;
      const r = quickAnchor.getBoundingClientRect(), gap = 10, w = quick.offsetWidth, h = quick.offsetHeight;
      const desktop = quickAnchor.closest('.desktop-chapter-rail');
      const left = desktop ? desktop.getBoundingClientRect().right + gap : r.left;
      const top = desktop ? r.bottom - h : r.top - h - gap >= 12 ? r.top - h - gap : r.bottom + gap;
      quick.style.left = Math.max(12,Math.min(left,innerWidth-w-12))+'px';
      quick.style.top = Math.max(12,Math.min(top,innerHeight-h-12))+'px';
    }
    function openQuick(button, anchor) {
      if(window.TravelBackupCenter){window.TravelBackupCenter.open();return;}
      if (!quick.hidden && quickTrigger === button) { closeQuick(true); return; }
      closeQuick(); quickTrigger = button;
      const more = button.closest('.guide-mobile-more'); quickAnchor = anchor || more?.querySelector('summary') || button;
      if (more) more.open = false;
      quick.querySelector('details').open = false;
      quick.querySelector('[data-lfq-feedback]').hidden = true;
      quick.hidden = false; button.setAttribute('aria-expanded','true'); render(); positionQuick(); quick.focus({preventScroll:true});
    }
    new ResizeObserver(positionQuick).observe(quick);
    document.addEventListener('pointerdown',e=>{if(!quick.hidden&&!quick.contains(e.target)&&!quickTrigger?.contains(e.target))closeQuick();});
    document.addEventListener('focusin',e=>{if(!quick.hidden&&!quick.contains(e.target)&&e.target!==quickTrigger)closeQuick();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!quick.hidden){e.preventDefault();closeQuick(true);}});
    window.addEventListener('resize',positionQuick);
    window.addEventListener('scroll',e=>{if(!quick.hidden&&!quick.contains(e.target))closeQuick();},{capture:true,passive:true});
    function selectPanel(name = 'save') {
      if (busy || B.busy) return;
      if (!['save','backup','import','history','share','legacy'].includes(name)) name='save';
      const backup = ['backup','import','share','legacy'].includes(name);
      dialog.dataset.view = name;
      $('#lf-title').textContent = {save:'保存设置',backup:'备份与分享',import:'导入备份',history:'历史版本',share:'分享行程',legacy:'旧版地图备份'}[name];
      $('#lf-panel-save').hidden = backup; $('#lf-panel-backup').hidden = !backup;
      if(name==='history') $('.lf-history').open=true; if(name==='legacy') $('.lf-legacy').open=true;
    }
    quick.addEventListener('click',e=>{
      const action=e.target.closest('[data-lfq]')?.dataset.lfq; if(!action||busy||B.busy)return;
      if(action==='export') { exporting=true; $('#tb-media').checked=true; $('#tb-export').click(); }
      else show(action);
    });
    new MutationObserver(()=>{
      if(exporting){const feedback=quick.querySelector('[data-lfq-feedback]');feedback.textContent=$('#tb-status').textContent;feedback.hidden=!feedback.textContent;}
      quick.querySelectorAll('button').forEach(b=>b.disabled=busy||B.busy);
    }).observe($('[data-lf-backup-content]'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled']});
    const mapStatus = document.querySelector('[data-fp-status]');
    if (mapStatus) new MutationObserver(() => { $('[data-lf-map-status]').textContent = mapStatus.textContent; }).observe(mapStatus, { childList: true, subtree: true, characterData: true });
    for (const action of ['export', 'import']) {
      const source = document.querySelector('[data-fp-' + action + ']'), target = $('[data-lf-map-' + action + ']');
      if (source) new MutationObserver(() => { target.disabled = source.disabled; }).observe(source, { attributes: true, attributeFilter: ['disabled'] });
    }
    $('[data-lf-map-export]').onclick = () => document.querySelector('[data-fp-export]')?.click();
    $('[data-lf-map-import]').onclick = () => document.querySelector('[data-fp-import]')?.click();
    function settings() {
      const destination = String(document.body.dataset.handbookDestination || 'guide').toLowerCase();
      return { theme: S.getItem('travel-handbook-theme:' + destination), lastSection: S.getItem('travel-handbook-last-section:v1:' + B.config.tripId) };
    }
    // Consumers report the same file state as the save controls; a working copy is not a disk save.
    function getSaveState() {
      return {
        state: error || S.cacheError ? 'error' : S.previewMode ? 'browser' : preview ? 'review' : busy && !connected ? 'checking' : !S.fileMode ? 'browser' : !connected ? 'disconnected' : S.dirty ? 'pending' : 'saved',
        fileMode: S.fileMode, dirty: S.dirty, connected, folderName: dir?.name || S.metadata?.name || '', message: status
      };
    }
    function render() {
      const current = getSaveState(), saveState = current.state;
      const saveLabel = { browser: '保存在当前浏览器', disconnected: '需要连接', pending: '正在保存…', saved: '已保存到电脑', error: '保存需处理', review: '需要确认记录', checking: '正在检查…' }[saveState];
      dialog.dataset.state = saveState;
      $('[data-lf-heading]').textContent = saveState === 'review' ? preview.history ? '恢复以前的记录' : preview.file.data ? preview.groups.length ? '两份记录不一样' : '可以继续自动保存' : '准备好保存了' : saveLabel;
      $('[data-lf-summary]').textContent = error || S.cacheError ? status || '保存遇到问题。请重新连接，或先导出备份。'
        : S.previewMode ? '新版的选择和日程保存在此浏览器，与原版分开。可导出备份留底；清除浏览器数据会删除这里的修改。'
        : !supported ? '当前浏览器暂不支持写入文件夹，可到「备份与分享」下载留底。'
        : saveState === 'review' ? '看清楚下面的结果，再确认。'
        : saveState === 'checking' ? '正在读取记录，请稍候。'
        : saveState === 'browser' ? '选一次文件夹，之后的行程、足迹和照片会自动保存在那里。'
        : saveState === 'disconnected' ? '浏览器需要你重新允许保存。点击下面的按钮即可。'
        : saveState === 'pending' ? '正在保存这次修改，请稍候。'
        : '修改会自动保存，无需手动操作。';
      document.querySelectorAll('[data-lf-shortcut]').forEach(button => {
        const label = button.querySelector('[data-lf-label]');
        if (label.textContent !== saveLabel) label.textContent = saveLabel;
        button.dataset.state = saveState; button.removeAttribute('title');
        button.setAttribute('aria-label', '数据与备份，' + saveLabel);
      });
      document.querySelectorAll('.guide-mobile-more').forEach(menu => {
        menu.dataset.saveState = saveState;
        const label = menu.querySelector('[data-guide-more-label]');
        const text = saveState === 'error' ? '更多 · 保存需处理' : saveState === 'review' ? '更多 · 待确认' : saveState === 'disconnected' || saveState === 'pending' ? '更多 · 待保存' : '更多';
        if (label.textContent !== text) label.textContent = text;
      });
      quick.dataset.state=saveState;
      quick.querySelector('[data-lfq-state]').textContent=saveLabel;
      quick.querySelector('[data-lfq-summary]').textContent={saved:'修改会自动保存',pending:'这次修改还在保存中',browser:'内容暂存在当前浏览器',disconnected:'重新连接后可继续保存',error:'打开保存设置查看原因',review:'打开保存设置确认记录',checking:'正在核对保存状态'}[saveState];
      quick.querySelectorAll('button').forEach(b=>b.disabled=busy||B.busy);
      quick.querySelector('[data-lfq="history"]').hidden=!S.previewMode&&!S.metadata?.handle;
      $('[data-lf-folder-info]').hidden=!current.folderName;
      $('[data-lf-folder-name]').textContent=current.folderName;
      $('[data-lf-message]').textContent = status; $('[data-lf-history-status]').textContent=error?status:'';
      const hasFolder = !!S.metadata?.handle, choosing = !!preview;
      const choose = $('[data-lf-choose]'), chooseHome = $(hasFolder ? '[data-lf-folder-actions]' : '[data-lf-connect-actions]');
      if (choose.parentNode !== chooseHome) chooseHome.append(choose);
      choose.textContent = hasFolder ? '更换文件夹' : '选择保存文件夹'; choose.classList.toggle('lf-primary', !hasFolder);
      $('[data-lf-connect-actions]').hidden = S.previewMode || choosing || busy || connected;
      if (S.previewMode) { $('.lf-history').hidden = false; $('[data-lf-history]').hidden = true; }
      $('[data-lf-reconnect]').hidden = !hasFolder || connected;
      $('[data-lf-save]').hidden = !connected || !S.dirty;
      $('[data-lf-save]').disabled = busy || !connected;
      choose.disabled = busy || !supported; $('[data-lf-reconnect]').disabled = busy || !supported;
      $('[data-lf-confirm]').disabled = busy || !preview?.choice;
      $('[data-lf-cancel]').disabled = busy;
      dialog.querySelectorAll('[data-lf-choice]').forEach(input => input.disabled = busy);
      window.dispatchEvent(new CustomEvent('travel:local-save-state', { detail: getSaveState() }));
    }
    function message(text, bad = false) { status = text; error = bad; render(); }
    async function show(panel = 'save') {
      if(window.TravelBackupCenter){window.TravelBackupCenter.open(panel==='import'?'import':'home');return;}
      if (busy || B.busy) return;
      if (!dialog.open) { returnFocus = quick.hidden ? document.activeElement : quickAnchor; closeQuick(); dialog.showModal(); }
      selectPanel(panel); $('[data-lf-close]').focus();
      $('[data-lf-drafts]').textContent='正在读取历史草稿…';
      const drafts = (await S.drafts().catch(() => [])).sort((a,b)=>(Date.parse(b.value.updatedAt)||0)-(Date.parse(a.value.updatedAt)||0));
      $('[data-lf-drafts]').innerHTML = drafts.length ? '<h4>保留的历史草稿</h4>' + drafts.map((r, i) => '<button type="button" data-lf-draft="' + i + '">' + esc(new Date(r.value.updatedAt).toLocaleString('zh-CN')) + ' · 导出当前版本并恢复</button>').join('') : (S.previewMode?'<p>暂无需要恢复的历史草稿。</p>':'');
      $('[data-lf-drafts]').onclick = async e => {
        const button = e.target.closest('[data-lf-draft]'); if (!button) return;
        const entry = drafts[Number(button.dataset.lfDraft)];
        if (!entry || busy) return;
        // Export the current page before selecting a pending working copy.
        busy=true;button.disabled=true;
        try { await download(); await S.recoverDraft(entry.key); location.reload(); }
        catch (error) { message('未能恢复历史草稿：'+error.message,true); }
        finally { busy=false;button.disabled=false;render(); }
      };
    }
    $('[data-lf-close]').onclick = () => { if (!busy && !B.busy) dialog.close(); };
    dialog.addEventListener('cancel', e => { if (busy || B.busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus(); else document.querySelector('[data-settings-open]')?.focus(); });
    async function download() {
      const raw = await B.snapshot(true), url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = '旅行整份备份-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    const cityData = JSON.parse(document.getElementById('china-footprints-data').textContent);
    const names = { cities: Object.fromEntries([...cityData.provinces, ...cityData.cities].map(c => [c.id, c.name])), picks: {} };
    const pickSpecs = [['sightPicks','[data-sv-id]','svId','name'],['foodPicks','[data-food-id]','foodId','name'],['shoppingPicks','[data-sg-id]','sgId','sgName'],['experiencePicks','[data-xp-id]','xpId','name']];
    function refreshNames() { for (const [slot,selector,id,name] of pickSpecs) document.querySelectorAll(selector).forEach(el => { names.picks[slot + ':' + el.dataset[id]] = el.dataset[name] || el.querySelector('h3,h4')?.textContent || el.dataset[id]; }); }
    const dateLabel = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '保存时间未知';
    function totals(raw) { const n = R.summary(raw); return `<div class="lf-totals">${[[n.orders,'笔订单'],[n.arrangements,'条每日安排'],[n.picks,'个想去'],[n.cities,'座点亮城市'],[n.photos,'张照片']].map(([v,k])=>'<span><b>'+v+'</b>'+k+'</span>').join('')}</div>`; }
    function renderReview() {
      if (!preview) return;
      const { file, current, groups, history } = preview;
      const different = !!file.data && groups.length > 0;
      $('#lf-review-title').textContent = history ? '先看看恢复后会变什么' : different ? '这些地方不同' : file.data ? '两边内容一致' : '保存当前页面到「' + dir.name + '」';
      $('#lf-review-title').hidden = different && !history;
      $('[data-lf-review-intro]').textContent = file.data ? (history ? '历史版本时间：' : '文件夹记录保存于 ') + dateLabel(file.document?.savedAt || file.data.backup.createdAt) : '这是一个新的数据文件夹，将保存当前页面的所有记录。';
      $('[data-lf-diff-review]').hidden = !groups.length;
      $('[data-lf-diff-review]').open = false;
      $('[data-lf-diff-summary]').textContent = groups.map(g => g.label).join('、') + '有不同';
      $('[data-lf-differences]').innerHTML = groups.map(g => `<details class="lf-diff-group"><summary><span><b>${esc(g.label)}</b><small>${esc(g.rows.slice(0,2).map(r=>r.label).join('、'))}${g.rows.length>2?'…':''}</small></span><span>${g.rows.length} 处不同</span></summary><div class="lf-diff-columns"><span>当前页面</span><span>${history?'历史版本':'文件夹记录'}</span></div>${g.rows.map(r => `<article class="lf-diff-row"><h4>${esc(r.label)}</h4><div><p>${esc(r.current)}</p><p>${esc(r.file)}</p></div></article>`).join('')}</details>`).join('');
      $('[data-lf-choice-cards]').hidden = !different || history;
      for (const input of dialog.querySelectorAll('[data-lf-choice]')) {
        input.checked = input.value === preview.choice;
        const label = input.closest('label'); label.querySelector('.lf-totals')?.remove();
        label.insertAdjacentHTML('beforeend', totals(input.value === 'browser' ? current : file.data?.backup));
      }
      $('[data-lf-scope]').textContent = different && !history ? '会完整使用你选中的那份，不会拼接两份订单，也不会自动补回已取消的足迹。' : '';
      $('[data-lf-preview]').hidden = false;
      updateReviewChoice();
    }
    function updateReviewChoice() {
      if (!preview) return;
      const selected = preview.choice, history = preview.history, selectedRaw = selected === 'file' ? preview.file.data.backup : preview.current;
      const result = $('[data-lf-result]'); result.hidden = !selected;
      const hasChoices = !history && preview.groups.length;
      result.innerHTML = selected ? hasChoices ? '<b>' + (selected === 'browser' ? '页面内容不变，更新文件夹里的记录。' : '页面将换成文件夹里的记录。') + '</b><p>连接后，后续修改会自动保存到这个文件夹。</p>' : '<b>' + (history ? '恢复后将使用' : '将继续使用这些内容') + '</b>' + totals(selectedRaw) : '';
      $('[data-lf-cancel]').textContent = history ? '暂不恢复' : '暂不连接';
      $('[data-lf-confirm]').textContent = !selected ? '先选择要保留的记录' : history ? '恢复这个版本' : selected === 'file' ? preview.groups.length ? '载入文件夹记录并连接' : '连接并继续自动保存' : preview.file.data ? '保存当前页面并连接' : '保存并开始自动保存';
      render();
    }
    async function stage(handle) {
      if (running) await running.catch(() => {});
      clearTimeout(timer); connected = false; dir = handle; busy = true; preview = null; $('[data-lf-preview]').hidden = true;
      message('正在读取两份记录…');
      try {
        if (await dir.queryPermission({ mode: 'readwrite' }) !== 'granted') throw Error('需要允许读写这个文件夹，才能继续保存。');
        const file = await C.read(dir, B.validate), current = await B.snapshot(true), currentSettings = settings();
        refreshNames();
        const groups = file.data ? R.compare(current, file.data.backup, names, currentSettings, file.data.settings) : [];
        preview = { file, current, currentSettings, groups, stamp: R.signature(current,currentSettings), choice: file.data ? groups.length ? '' : 'file' : 'browser' };
        renderReview(); message('两份记录都还保留原样，请确认要继续使用的内容。');
      } catch (e) { message('未连接：' + e.message, true); }
      finally { busy = false; render(); }
    }
    dialog.querySelectorAll('[data-lf-choice]').forEach(input => input.onchange = () => { if (!preview || busy) return; preview.choice = input.value; updateReviewChoice(); });
    $('[data-lf-cancel]').onclick = () => { if (busy) return; preview = null; $('[data-lf-preview]').hidden = true; message('已取消本次连接，页面和文件夹都未替换。'); };
    $('[data-lf-choose]').onclick = async () => {
      try { const handle = await window.showDirectoryPicker({ id: 'travel-user-data', mode: 'readwrite', startIn: 'documents' }); await stage(handle); }
      catch (e) { if (e.name !== 'AbortError') message('无法选择文件夹：' + e.message, true); }
    };
    $('[data-lf-reconnect]').onclick = async () => {
      const handle = S.metadata?.handle; if (!handle) return;
      try {
        if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') { message('未取得授权。修改仍在本机工作副本，可先下载备份。', true); return; }
        if (S.fileMode) await reconnect(handle); else await stage(handle);
      } catch (e) { message('连接失败：' + e.message, true); }
    };
    async function preserve(raw) {
      const backups = await dir.getDirectoryHandle('backups', { create: true });
      const name = 'browser-before-connect-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8) + '.json';
      await C.atomic(await backups.getFileHandle(name, { create: true }), JSON.stringify(raw, null, 2));
    }
    async function accept() {
      if (busy || B.busy || !preview?.choice) return;
      busy = true; const selected = preview;
      message('正在保留原始备份并连接…');
      try {
        const current = await B.snapshot(true), currentSettings = settings();
        if (R.signature(current,currentSettings) !== selected.stamp) {
          busy = false;
          if (!selected.history) await stage(dir);
          else { selected.current = current; selected.currentSettings = currentSettings; selected.stamp = R.signature(current,currentSettings); selected.groups = R.compare(current,selected.file.data.backup,names,currentSettings,selected.file.data.settings); renderReview(); }
          message('页面刚有新的修改，已更新对比。请重新确认。'); return;
        }
        const fresh = await C.read(dir, B.validate);
        if (fresh.hash !== selected.file.hash) { busy = false; await stage(dir); message('文件夹里的记录刚有变化，已更新对比。请重新选择。'); return; }
        const raw = selected.choice === 'browser' ? copy(current) : copy(selected.file.data.backup);
        const pageSettings = selected.choice === 'browser' ? currentSettings : copy(selected.file.data.settings);
        B.validate(raw); await preserve(current);
        // A complete selected snapshot is used; no implicit union can restore intentional deletions.
        const generation = S.generation;
        if (R.signature(await B.snapshot(true), settings()) !== selected.stamp) throw Error('页面又有新修改，请重新核对后保存。');
        const revision = selected.history || selected.choice === 'browser' ? (fresh.data?.revision || 0) + 1 : fresh.data.revision;
        const hash = selected.history || selected.choice === 'browser' ? await C.save(dir, await C.pack(raw, pageSettings, revision), fresh.hash) : fresh.hash;
        if (S.generation !== generation || R.signature(await B.snapshot(true), settings()) !== selected.stamp) throw Error('所选版本已处理，但页面又有新修改；请重新核对，当前页面仍保留。');
        if (selected.choice === 'file' && !selected.history) {
          const latest = await C.fileText(dir, 'travel.json');
          if (await C.hashText(latest) !== fresh.hash) throw Error('文件夹里的记录又有变化，请重新连接核对。');
          const backups = await dir.getDirectoryHandle('backups', { create: true });
          await C.atomic(await backups.getFileHandle('file-before-connect-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + fresh.hash.slice(0,10) + '.json', { create: true }), fresh.text);
        }
        await S.activate(raw, pageSettings, B.config, dir, hash, revision);
        preview = null; message('已保存到电脑，正在打开旅行…'); location.reload();
      } catch (e) { message('未完成：' + e.message, true); }
      finally { busy = false; render(); }
    }
    $('[data-lf-confirm]').onclick = accept;
    async function reconnect(handle) {
      if (busy) return;
      busy = true; dir = handle; message('正在检查磁盘版本…');
      try {
        const file = await C.read(dir, B.validate);
        if (!file.data) throw Error('原 travel.json 已被移动或删除，请选择正确的数据文件夹。');
        if (file.hash !== S.state.expectedHash) {
          connected = false; busy = false;
          if (!S.dirty) {
            await S.activate(file.data.backup, file.data.settings, B.config, dir, file.hash, file.data.revision); location.reload(); return;
          }
          await stage(dir); return;
        }
        connected = true; message('已连接 ' + dir.name + ' / travel.json' + (S.dirty ? '，准备写入未落盘修改。' : ' · ' + new Date(file.document.savedAt).toLocaleString('zh-CN')));
      } catch (e) { connected = false; message('未连接：' + e.message, true); }
      finally { busy = false; render(); }
      if (connected && S.dirty) schedule();
    }
    async function flush() {
      if (S.previewMode) { await S.flushCache(); return; }
      clearTimeout(timer);
      if (running) { await running; if (S.dirty && connected) return flush(); return; }
      if (!S.fileMode || !S.dirty) return;
      if (!connected || !dir) throw Error('请先重新授权并连接文件夹；修改尚未写入磁盘。');
      running = (async () => {
        const generation = S.generation, before = copy(S.state);
        message('正在写入本地文件…');
        try {
          const records = {};
          for (const [slot, info] of Object.entries(B.config.slots)) { const v = before.values[info.key] ?? null; records[slot] = v === null ? null : slot === 'mapProvider' ? v : JSON.parse(v); }
          const raw = {type: 'travel-handbook-backup', version: 1, tripId: B.config.tripId, packingTripId: B.config.packingTripId, createdAt: new Date().toISOString(), records, media: before.media};
          B.validate(raw);
          const destination = String(document.body.dataset.handbookDestination || 'guide').toLowerCase();
          const savedSettings = {theme: before.values['travel-handbook-theme:' + destination] || null, lastSection: before.values['travel-handbook-last-section:v1:' + B.config.tripId] || null};
          const revision = before.revision + 1;
          const packed = await C.pack(raw, savedSettings, revision);
          const hash = await C.save(dir, packed, S.state.expectedHash);
          try { await S.checkpoint(hash, revision, generation, before); } catch (e) { e.diskWritten = true; throw e; }
          message(S.dirty ? '本次版本已落盘，正在保存后续修改…' : '已写入 ' + dir.name + ' / travel.json · ' + new Date().toLocaleTimeString('zh-CN'));
        } catch (e) { connected = false; message((e.diskWritten ? '文件已写入，但本机工作副本同步失败：' : '尚未写入文件：') + e.message + ' 请保留当前页面，或下载整份备份。', true); throw e; }
      })();
      try { await running; } finally { running = null; }
      if (S.dirty && connected) return flush();
    }
    function schedule() {
      if (S.previewMode) { render(); return; }
      if (!S.fileMode) return;
      message(connected ? '修改已进入本机工作副本，稍后自动写入文件。' : '修改暂存在本机工作副本，请连接文件夹完成落盘。');
      clearTimeout(timer); if (connected) timer = setTimeout(() => flush().catch(() => {}), 1200);
    }
    S.subscribe(schedule);
    $('[data-lf-save]').onclick = () => flush().catch(e => message(e.message, true));
    window.addEventListener('travel-storage-error', e => message(S.previewMode ? e.detail : '本机工作副本保存失败：' + e.detail + ' 请立即写入文件或下载备份。', true));
    window.addEventListener('travel-storage-recovered', () => message('修改已保存。'));
    document.addEventListener('visibilitychange', () => { if (document.hidden && connected) flush().catch(() => {}); });
    $('[data-lf-history]').onclick = async () => {
      if (busy || B.busy) return;
      const handle = dir || S.metadata?.handle;
      if (!handle) { message('请先选择数据文件夹。'); return; }
      try {
        if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw Error('需要文件夹授权。');
        dir = handle;
        const folder = await dir.getDirectoryHandle('backups'), files = [];
        for await (const [name, h] of folder.entries()) if (h.kind === 'file' && name.endsWith('.json')) files.push(name);
        files.sort().reverse();
        $('[data-lf-history-list]').innerHTML = files.length ? files.slice(0, 50).map(name => '<button type="button" data-lf-version="' + esc(name) + '">' + esc(name) + '</button>').join('') : '<p>还没有历史版本。</p>';
        $('[data-lf-history-list]').onclick = async e => {
          const name = e.target.closest('[data-lf-version]')?.dataset.lfVersion; if (!name) return;
          if (busy || B.busy) return;
          try {
            if (running) await running.catch(() => {});
            const f = await (await folder.getFileHandle(name)).getFile(); if (f.size > C.MAX) throw Error('版本文件过大。');
            const doc = JSON.parse(await f.text()); let data;
            if (doc.type === C.TYPE) data = await C.unpack(doc, async path => (await (await (await dir.getDirectoryHandle('images')).getFileHandle(path.slice(7))).getFile()).arrayBuffer(), B.validate);
            else { B.validate(doc); if (doc.media === null) throw Error('此版本未包含完整照片，请通过「备份与分享」恢复。'); data = { backup: doc, settings: settings(), revision: 0 }; }
            const text = await C.fileText(dir, 'travel.json');
            const current = await B.snapshot(true);
            const currentSettings = settings(); refreshNames();
            connected = false; clearTimeout(timer);
            preview = { file: { data, document: doc, hash: text ? await C.hashText(text) : null }, current, currentSettings, groups: R.compare(current,data.backup,names,currentSettings,data.settings), stamp: R.signature(current,currentSettings), choice: 'file', history: true };
            renderReview(); message('正在预览历史版本。点击确认后才会恢复。');
            $('[data-lf-preview]').scrollIntoView({block:'start',behavior:'smooth'});
          } catch (e) { message('无法读取历史版本：' + e.message, true); }
        };
      } catch (e) { if(e.name==='NotFoundError') $('[data-lf-history-list]').innerHTML='<p>还没有历史版本。</p>'; else message(e.message,true); }
    };
    window.TravelLocalFiles = { open: show, flush, get connected() { return connected; }, get status() { return status; }, get saveState() { return getSaveState(); } };
    if (S.bootError) message('无法读取本机工作副本：' + S.bootError.message + ' 请保留已有文件，不要导入空记录。', true);
    else if (S.previewMode) message('当前为独立副本，可导出备份保存。原版数据文件夹未连接。');
    else if (!supported) message('此浏览器不支持直接写入文件夹。请用 Chrome / Edge 打开，或使用整份备份导入导出。');
    else if (S.fileMode) {
      message('正在检查文件夹授权…');
      const handle = S.metadata?.handle;
      if (handle) handle.queryPermission({ mode: 'readwrite' }).then(p => p === 'granted' ? reconnect(handle) : message('浏览器需要重新授权文件夹。当前展示上次工作副本，尚未核对磁盘版本。')).catch(e => message(e.message, true));
      else message('未找到文件夹授权，请重新选择数据文件夹。');
    } else message('当前内容仍在浏览器中。连接 user-data 后，配置和图片才会自动写入项目文件夹。');
  }
  S.whenReady(init);
})();
