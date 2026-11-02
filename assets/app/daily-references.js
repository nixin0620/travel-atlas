/* Existing reference photos stay with their original day and backup store. */
(function () {
  'use strict';
  const S = window.TravelStorage;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('travel-handbook-trip-companion-v2', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('day-reference-photos')) request.result.createObjectStore('day-reference-photos', {keyPath:'id'}); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async function transaction(mode, action) {
    const db = await database();
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction('day-reference-photos', mode), request = action(tx.objectStore('day-reference-photos'));
      tx.oncomplete = () => resolve(request.result); tx.onerror = tx.onabort = () => reject(tx.error || Error('照片未能保存'));
    }); } finally { db.close(); }
  }
  const rows = day => S.fileMode ? S.referenceRows(day) : transaction('readonly', store => store.getAll()).then(items => items.filter(row => row.day === day).sort((a,b) => a.createdAt - b.createdAt));
  const put = row => S.fileMode ? S.putReference(row) : transaction('readwrite', store => store.put(row));
  const remove = id => S.fileMode ? S.deleteReference(id) : transaction('readwrite', store => store.delete(id));
  function view(row, trigger) {
    const dialog = document.createElement('dialog'); dialog.className = 'daily-photo-viewer';
    dialog.setAttribute('aria-label', row.name || '参考照片');
    dialog.innerHTML = '<button type="button" aria-label="关闭照片">×</button><img src="'+esc(row.dataUrl)+'" alt="'+esc(row.name)+'">';
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); if (trigger.isConnected) trigger.focus({preventScroll:true}); });
    document.body.append(dialog); dialog.showModal();
  }
  function mount(container, day) {
    if (!container || !Number.isInteger(day) || day < 0) return;
    const box = document.createElement('details'); box.className = 'daily-references';
    box.innerHTML = '<summary>参考照片 <span data-ref-count></span></summary><div class="daily-reference-body"><div class="daily-reference-grid"></div><label class="daily-reference-add">添加照片<input type="file" accept="image/*" multiple></label><p data-ref-status role="status" aria-live="polite"></p></div>';
    container.append(box);
    const grid = box.querySelector('.daily-reference-grid'), input = box.querySelector('input'), status = box.querySelector('[data-ref-status]');
    let busy = false, items = [];
    async function paint() {
      items = await rows(day); if (!box.isConnected) return;
      box.querySelector('[data-ref-count]').textContent = items.length ? items.length + ' 张' : '';
      grid.innerHTML = items.map((row, i) => '<figure><button type="button" data-ref-view="'+i+'" aria-label="查看'+esc(row.name)+'"><img src="'+esc(row.dataUrl)+'" alt="'+esc(row.name)+'" loading="lazy"></button><figcaption><button type="button" data-ref-remove="'+i+'">移除</button></figcaption></figure>').join('');
    }
    grid.addEventListener('click', async event => {
      const button = event.target.closest('button'); if (!button || busy) return;
      if (button.dataset.refView !== undefined) { view(items[Number(button.dataset.refView)], button); return; }
      if (button.dataset.refRemove !== undefined) { button.parentElement.innerHTML = '<button type="button" data-ref-confirm="'+button.dataset.refRemove+'">确认移除</button><button type="button" data-ref-cancel>取消</button>'; return; }
      if (button.hasAttribute('data-ref-cancel')) { await paint(); return; }
      if (button.dataset.refConfirm !== undefined) {
        busy = true; input.disabled = true;
        try { await remove(items[Number(button.dataset.refConfirm)].id); await paint(); status.textContent = '照片已移除'; }
        catch (_) { status.textContent = '未能移除照片，请重试。'; }
        finally { busy = false; input.disabled = false; }
      }
    });
    input.onchange = async () => {
      if (busy) return;
      const selected = Array.from(input.files || []), files = selected.slice(0,6); input.value = '';
      if (!files.length) return; busy = true; input.disabled = true; let added = 0; const errors = [];
      try {
        for (const [index, file] of files.entries()) {
          try {
            const result = await window.TravelImages.compress(file, {profile:'reference', onProgress:text => { status.textContent = text; }});
            await put({id:'trip-photo-'+Date.now()+'-'+index+'-'+Math.random().toString(36).slice(2,7),day,name:result.name,dataUrl:result.dataUrl,createdAt:Date.now()+index}); added++;
          } catch (error) { errors.push(file.name+'：'+error.message); }
        }
        await paint(); status.textContent = [added ? '已添加 '+added+' 张照片。' : '', selected.length > 6 ? '每次最多添加 6 张。' : '', ...errors].join(' ');
      } finally { busy = false; input.disabled = false; }
    };
    paint().catch(() => { status.textContent = '暂时无法读取照片，请重试。'; });
  }
  window.DailyReferences = { mount };
  // Historical photos remain available to the existing backup and storage APIs.
  // Preserve search links elsewhere in the handbook after retiring the companion UI.
  document.addEventListener('click', event => {
    const link = event.target.closest('.is-xhs');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    const query = new URL(link.href).searchParams.get('keyword'); if (!query) return;
    event.preventDefault(); location.href = 'xhsdiscover://search/result?keyword='+encodeURIComponent(query);
  });
})();
