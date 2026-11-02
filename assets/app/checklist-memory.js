(function () {
  'use strict';
  const app = document.querySelector('[data-packing-app]');
  if (!app || !window.PackingCore) return;
  const C = window.PackingCore;
  const $ = selector => app.querySelector(selector);
  const dialog = $('[data-pack-dialog]');
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const attr = escape;
  let seed;
  try { seed = JSON.parse($('#packing-data').textContent); } catch (_) { return; }
  const storageKey = 'travel-handbook-packing:v3:' + seed.trip_id;
  let storageOK = true, onlyPending = false, history = [], opener, draggedId, preview = [], selected = new Set();
  let imported = [], selectedScenes = new Set(), lastMessage = '', persistBlocked = false;
  const read = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { storageOK = false; return fallback; }
  };
  const legacyDestination = (document.body.dataset.handbookDestinationShort || document.title || 'travel').toLowerCase();
  const legacy = read('travel-handbook-checklist:v2:' + legacyDestination, {});
  let state = C.initial(seed, legacy, read('travel-handbook-packing-legacy', []), read('travel-handbook-booking-legacy', []));
  let saved = null, savedRaw = null;
  try { savedRaw = localStorage.getItem(storageKey); saved = savedRaw ? JSON.parse(savedRaw) : null; }
  catch (_) {
    if (savedRaw) { persistBlocked = true; lastMessage = '保存的清单格式无法读取，旧数据已保留。请先导出备份。'; }
    else storageOK = false;
  }
  if (saved) {
    try { state = C.validate(saved); }
    catch (_) { persistBlocked = true; lastMessage = '保存的清单格式无法读取。本次先显示初稿，旧数据会保留；可导出备份后再清理。'; }
  }
  if (saved && !persistBlocked && (seed.todo_revision || 0) > state.todo_revision) {
    state = C.refreshTodos(state, seed);
    try {
      const backupKey = storageKey + ':before-todos-' + seed.todo_revision;
      if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, savedRaw);
      localStorage.setItem(storageKey, JSON.stringify(state));
      lastMessage = '出发前待办已精简，已保留自添事项和行李清单。';
    } catch (_) {
      storageOK = false; persistBlocked = true;
      lastMessage = '待办已更新，但本机无法保存；旧记录仍保留，请先导出清单。';
    }
  }
  function status(message) {
    lastMessage = message || '';
    $('[data-pack-live]').textContent = lastMessage;
    const dialogStatus = dialog.querySelector('[data-dialog-status]'); if (dialogStatus) dialogStatus.textContent = lastMessage;
  }
  function persist() {
    if (persistBlocked) { status('旧的保存数据无法读取，本次修改暂未写入。请先导出备份。'); return; }
    try { localStorage.setItem(storageKey, JSON.stringify(state)); storageOK = true; }
    catch (_) { storageOK = false; }
  }
  function commit(next, message, focusSelector) {
    history.push(C.clone(state)); if (history.length > 20) history.shift();
    state = next; persist(); render(focusSelector);
    status((message || '已保存修改。') + (!storageOK || persistBlocked ? ' 本次修改仅保留在当前页面，请导出备份。' : ''));
  }
  function mutate(action, message, focusSelector) { commit(C.apply(state, action), message, focusSelector); }
  function row(item, todo = false) {
    const note = todo ? item.note : [item.timing, item.note].filter(Boolean).join(' · ');
    return `<li class="pack-item${item.done ? ' is-packed' : ''}" data-item="${attr(item.id)}">
      <button class="pack-drag" type="button" draggable="true" data-drag="${attr(item.id)}" data-action="edit-item" data-id="${attr(item.id)}" aria-label="拖动${attr(item.name)}排序，或点击选择位置" title="拖动排序；点击也可移动">⋮⋮</button>
      <label class="pack-item-label"><input type="checkbox" data-check="${attr(item.id)}" ${item.done ? 'checked' : ''}><span class="pack-emoji" aria-hidden="true">${escape(item.emoji)}</span><span class="pack-item-copy"><b>${escape(item.name)}</b>${note ? `<small>${escape(note)}</small>` : ''}</span>${!todo && item.quantity ? `<span class="pack-quantity">×${item.quantity}</span>` : ''}</label>
      <button class="pack-icon" type="button" data-action="edit-item" data-id="${attr(item.id)}" aria-label="编辑${attr(item.name)}">•••</button></li>`;
  }
  function categoryCard(c) {
    const done = c.items.filter(i => i.done).length, items = C.visibleItems(c, onlyPending), todo = c.id === 'todo';
    return `<article class="pack-category${todo ? ' pack-todos' : ''}" data-category="${attr(c.id)}"><header class="pack-category-head"><h3><span aria-hidden="true">${escape(c.emoji)}</span> ${escape(c.name)}</h3><span class="pack-category-count">${done} / ${c.items.length}</span>${todo ? '' : `<button class="pack-icon" type="button" data-action="edit-category" data-id="${attr(c.id)}" aria-label="管理${attr(c.name)}分类">•••</button>`}</header><ul class="pack-items">${items.map(i => row(i, todo)).join('') || `<li class="pack-empty">${onlyPending && c.items.length ? '这一类已准备妥当 ✓' : '还没有内容，按需要添加。'}</li>`}</ul><button class="pack-add-row" type="button" data-action="add-item" data-category-id="${attr(c.id)}">＋ 添加${todo ? '待办' : '物品'}</button></article>`;
  }
  function render(focusSelector) {
    const stat = C.stats(state), todo = C.stats(state, true);
    $('[data-pack-percent]').textContent = stat.percent + '%';
    $('[data-pack-count]').textContent = `行李 ${stat.done} / ${stat.total} 项`;
    $('[data-pack-progress]').max = stat.total || 1;
    $('[data-pack-progress]').value = stat.done;
    $('[data-pack-progress]').setAttribute('aria-valuetext', `${stat.done} 项已准备，共 ${stat.total} 项`);
    $('[data-pack-content]').innerHTML = categoryCard(state.categories[0]) + `<div class="pack-section-label"><h3>收进行李</h3><span>${stat.total && stat.done === stat.total ? '行李准备好了，安心出发。' : '每一件，都为旅程刚刚好'}</span></div><div class="pack-grid">` + state.categories.slice(1).map(categoryCard).join('') + '</div>';
    $('.pack-todos .pack-category-count').textContent = `${todo.done}/${todo.total}`;
    $('[data-pack-save]').textContent = storageOK && !persistBlocked ? '修改自动保存在本机' : '当前无法保存 · 请导出备份';
    $('[data-action="undo"]').disabled = !history.length;
    if (focusSelector) { const el = $(focusSelector); if (el) el.focus({preventScroll: true}); }
  }
  function show(title, body) {
    opener = dialog.open ? opener : document.activeElement;
    dialog.innerHTML = `<div class="pack-dialog-head"><div><p class="pack-kicker">PACKING STUDIO</p><h3 id="pack-dialog-title">${escape(title)}</h3></div><button class="pack-icon" type="button" data-action="close" aria-label="关闭窗口">×</button></div><div class="pack-dialog-body">${body}<p class="pack-live" role="status" aria-live="polite" data-dialog-status></p></div>`;
    if (!dialog.open) dialog.showModal();
    const focus = dialog.querySelector('[autofocus], input:not([type="checkbox"]), textarea, button');
    if (focus) focus.focus();
  }
  function close() { dialog.close(); }
  dialog.addEventListener('close', () => {
    if (opener && opener.isConnected) opener.focus({preventScroll: true});
    else $('[data-action="add-item"]').focus({preventScroll: true});
  });
  function options(current) { return state.categories.map(c => `<option value="${attr(c.id)}" ${c.id === current ? 'selected' : ''}>${escape(c.emoji + ' ' + c.name)}</option>`).join(''); }
  function editItem(id, categoryId) {
    const found = id ? C.find(state, id) : null, item = found ? found.item : {name:'', emoji:categoryId === 'todo' ? '📌' : '🎒', quantity:null, note:'', timing:''};
    const current = found ? found.category.id : categoryId || (state.categories[1] || state.categories[0]).id;
    show(id ? '编辑清单内容' : '添加到清单', `<form data-form="item" data-id="${attr(id || '')}">
      <div class="pack-form-pair"><label>Emoji<input name="emoji" value="${attr(item.emoji)}" maxlength="24"></label><label>名称<input name="name" value="${attr(item.name)}" maxlength="120" required autofocus placeholder="例如：充电宝"></label></div>
      <div class="pack-form-columns"><label>放入分类<select name="categoryId">${options(current)}</select></label><label>数量（可留空）<input name="quantity" type="number" min="1" max="999" step="1" value="${item.quantity || ''}" placeholder="不填则不显示"></label></div>
      <label>备注<input name="note" maxlength="600" value="${attr(item.note)}" placeholder="例如：两人共用，放随身包"></label><label>准备时间（可留空）<input name="timing" maxlength="80" value="${attr(item.timing)}" placeholder="例如：出发前一天"></label>
      <p class="pack-form-error" role="alert"></p>
      <div class="pack-dialog-actions">${id ? `<button type="button" class="pack-link pack-danger" data-action="delete-item" data-id="${attr(id)}">删除这项</button>` : '<button type="button" class="pack-link" data-action="add-category">＋ 新增分类</button>'}<button type="submit" class="pack-button">保存</button></div></form>
      ${id ? `<div class="pack-reorder"><span>在同一准备状态中排序</span><button class="pack-small-button" type="button" data-action="step-item" data-id="${attr(id)}" data-delta="-1">↑ 上移</button><button class="pack-small-button" type="button" data-action="step-item" data-id="${attr(id)}" data-delta="1">↓ 下移</button></div>` : ''}`);
  }
  function editCategory(id) {
    const c = id ? C.category(state, id) : {name:'', emoji:'🎒'};
    show(id ? '管理分类' : '新增分类', `<form data-form="category" data-id="${attr(id || '')}"><div class="pack-form-pair"><label>Emoji<input name="emoji" value="${attr(c.emoji)}" maxlength="24"></label><label>分类名称<input name="name" value="${attr(c.name)}" maxlength="50" required autofocus placeholder="例如：摄影"></label></div><p class="pack-form-error" role="alert"></p><div class="pack-dialog-actions">${id ? `<button class="pack-link pack-danger" type="button" data-action="confirm-delete-category" data-id="${attr(id)}">删除分类</button>` : '<span></span>'}<button class="pack-button" type="submit">保存</button></div></form>${id ? `<div class="pack-reorder"><span>调整分类顺序</span><button class="pack-small-button" type="button" data-action="move-category" data-id="${attr(id)}" data-delta="-1">↑ 前移</button><button class="pack-small-button" type="button" data-action="move-category" data-id="${attr(id)}" data-delta="1">↓ 后移</button></div>` : ''}`);
  }
  function suggestionPool() {
    const values = [...(seed.suggestions || []), ...seed.scenes.filter(s => selectedScenes.has(s.id)).flatMap(s => s.suggestions || [])];
    return C.missing(state, [...C.suggestions(values), ...imported]);
  }
  function suggestionRows() {
    const rows = preview.map((s, i) => `<label class="pack-suggestion"><input type="checkbox" data-suggestion="${i}" ${selected.has(i) ? 'checked' : ''}><span><strong>${escape(s.emoji)} ${escape(s.name)}${s.quantity ? ' ×' + s.quantity : ''}</strong><small>${escape(s.category_name)} · ${escape(s.reason)}</small></span></label>`).join('');
    dialog.querySelector('[data-suggestion-list]').innerHTML = rows || '<p class="pack-empty">当前建议已覆盖。可选择其他场景，或请 AI 根据新行程重新检查。</p>';
    updateSuggestionCount();
  }
  function updateSuggestionCount() {
    const button = dialog.querySelector('[data-action="accept-suggestions"]');
    button.textContent = `加入选中的 ${selected.size} 项`; button.disabled = !selected.size;
  }
  function showSuggestions() {
    preview = suggestionPool(); selected = new Set();
    show('✨ AI 补充 · 你来决定', `<div class="pack-ai-context"><strong>${escape(seed.destination)} · ${escape(seed.days)} 天</strong><p>${escape(seed.weather_note)}</p></div><p class="pack-help">这里是生成手册时整理的建议；网页不会实时调用 AI 或天气服务。选择需要的再加入。清单里已有或你已删除的同名物品不会重复推荐；也可以把最新清单交给 AI 重新检查。</p>
      ${seed.scenes.length ? `<div class="pack-scenes"><span>补充行程场景</span>${seed.scenes.map(s => `<label><input type="checkbox" data-scene="${attr(s.id)}" ${selectedScenes.has(s.id) ? 'checked' : ''}><span>${escape(s.emoji)} ${escape(s.name)}</span></label>`).join('')}</div>` : ''}
      <div class="pack-suggestion-heading"><b>可能还用得上</b><button class="pack-link" type="button" data-action="select-suggestions">全选</button></div><div data-suggestion-list></div>
      <div class="pack-dialog-actions"><button class="pack-link" type="button" data-action="close">暂时不用</button><button class="pack-button" type="button" data-action="accept-suggestions" disabled>加入选中的 0 项</button></div>
      <details class="pack-ai-refresh"><summary>行程有变化？请 AI 重新补漏</summary><p class="pack-help">复制含现有清单的需求，发给当前对话中的 AI；将返回的 JSON 粘贴到下方，仍需预览确认后才会加入。</p><label>补充说明<textarea data-ai-context rows="2" maxlength="3000" placeholder="例如：新增一天游泳；预计下雨；带相机"></textarea></label><button class="pack-small-button" type="button" data-action="copy-prompt">复制补漏需求</button><label>AI 返回的建议<textarea data-ai-import rows="4" maxlength="100000" placeholder='[{"name":"泳镜","emoji":"🥽","category_name":"游泳","reason":"新增游泳安排"}]'></textarea></label><p class="pack-form-error" role="alert"></p><button class="pack-small-button" type="button" data-action="import-suggestions">预览新建议</button></details>`);
    suggestionRows();
  }
  async function copyPrompt() {
    const context = dialog.querySelector('[data-ai-context]').value;
    const snapshot = {destination:seed.destination, days:seed.days, travelers:seed.travelers, weather_note:seed.weather_note, itinerary:seed.itinerary || [], intentionally_removed:state.dismissed, categories:state.categories};
    const prompt = `请为这份旅行清单查漏补缺。只建议缺少的内容，尊重我删除或修改后的选择，不要覆盖现有清单；如缺少日期，不要声称有实时天气。根据我补充的安排判断场景，避免同义重复。只返回 JSON 数组，每项包含 name, emoji, quantity（可选正整数）, category_id（已有分类时填写）, category_name, category_emoji, reason。不要提供服药或剂量建议。\n补充安排：${context || '无'}\n当前清单：\n${JSON.stringify(snapshot, null, 2)}`;
    try { await navigator.clipboard.writeText(prompt); status('补漏需求已复制，发给当前对话中的 AI 即可。'); }
    catch (_) {
      let output = dialog.querySelector('[data-copy-fallback]');
      if (!output) { output = document.createElement('textarea'); output.dataset.copyFallback = ''; output.rows = 6; output.setAttribute('aria-label', '手动复制补漏需求'); dialog.querySelector('.pack-ai-refresh').append(output); }
      output.value = prompt; output.focus(); output.select(); status('无法自动复制，已展开需求文字，请手动复制。');
    }
  }
  function exportBackup() {
    const payload = JSON.stringify({destination:seed.destination, trip_id:seed.trip_id, state, previous_todos_backup: read(storageKey + ':before-todos-' + seed.todo_revision, null), ...(persistBlocked ? {unreadable_saved_data: savedRaw} : {})}, null, 2);
    show('导出清单备份', '<p class="pack-help">复制保存以下文字，可交给 AI 恢复清单或继续修改。</p><textarea data-backup rows="12" aria-label="清单备份"></textarea><button class="pack-button" type="button" data-action="close">完成</button>');
    dialog.querySelector('[data-backup]').value = payload;
    dialog.querySelector('[data-backup]').select();
  }
  app.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]'); if (!form) return;
    event.preventDefault();
    try {
      const fields = Object.fromEntries(new FormData(form)), id = form.dataset.id || null;
      if (form.dataset.form === 'item') mutate({type:'save-item', id, categoryId:fields.categoryId, value:fields}, '清单已更新。');
      if (form.dataset.form === 'category') mutate({type:'save-category', id, name:fields.name, emoji:fields.emoji}, '分类已更新。');
      close();
    } catch (error) { form.querySelector('.pack-form-error').textContent = error.message; }
  });
  app.addEventListener('change', event => {
    const target = event.target;
    try {
      if (target.matches('input[type="checkbox"][data-check]')) {
        const focus = `[data-check="${CSS.escape(target.dataset.check)}"]`;
        mutate({type:'toggle', id:target.dataset.check, done:target.checked}, target.checked ? '已准备，移至分类末尾。' : '已标记为未准备。', onlyPending ? '[data-pack-filter]' : focus);
      } else if (target.matches('[data-pack-filter]')) { onlyPending = target.checked; render(); }
      else if (target.matches('[data-suggestion]')) { const index = Number(target.dataset.suggestion); target.checked ? selected.add(index) : selected.delete(index); updateSuggestionCount(); }
      else if (target.matches('[data-scene]')) {
        const selectedNames = new Set([...selected].map(i => C.key(preview[i].name)));
        target.checked ? selectedScenes.add(target.dataset.scene) : selectedScenes.delete(target.dataset.scene);
        preview = suggestionPool(); selected = new Set(preview.flatMap((s,i) => selectedNames.has(C.key(s.name)) ? [i] : [])); suggestionRows();
      }
    } catch (error) { status(error.message); }
  });
  app.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const id = button.dataset.id;
    try {
      switch (button.dataset.action) {
        case 'close': close(); break;
        case 'add-item': editItem(null, button.dataset.categoryId); break;
        case 'edit-item': editItem(id); break;
        case 'add-category': editCategory(); break;
        case 'edit-category': editCategory(id); break;
        case 'delete-item': mutate({type:'delete-item', id}, '已删除，可撤销。'); close(); break;
        case 'confirm-delete-category': {
          const c = C.category(state, id);
          show('删除这个分类？', `<p>将删除「${escape(c.name)}」及其中 ${c.items.length} 项内容。删除后可在清单顶部撤销。</p><div class="pack-dialog-actions"><button class="pack-link" type="button" data-action="edit-category" data-id="${attr(id)}">返回</button><button class="pack-button" type="button" data-action="delete-category" data-id="${attr(id)}">确认删除</button></div>`); break;
        }
        case 'delete-category': mutate({type:'delete-category', id}, '分类已删除，可撤销。'); close(); break;
        case 'move-category': mutate({type:'move-category', id, delta:Number(button.dataset.delta)}, '分类顺序已更新。'); break;
        case 'step-item': mutate({type:'step-item', id, delta:Number(button.dataset.delta)}, '物品顺序已更新。'); break;
        case 'undo': if (history.length) { state = history.pop(); persist(); render('[data-action="undo"]'); status('已撤销上一步。'); } break;
        case 'suggest': showSuggestions(); break;
        case 'select-suggestions': selected = selected.size === preview.length ? new Set() : new Set(preview.map((_,i) => i)); suggestionRows(); break;
        case 'accept-suggestions': {
          const values = [...selected].map(i => preview[i]), missing = C.missing(state, values);
          if (missing.length) commit(C.addSuggestions(state, missing), `已加入 ${missing.length} 项建议，可继续编辑。`);
          close(); break;
        }
        case 'copy-prompt': await copyPrompt(); break;
        case 'import-suggestions': {
          const raw = dialog.querySelector('[data-ai-import]').value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
          imported = C.suggestions(JSON.parse(raw)); preview = suggestionPool(); selected = new Set(); suggestionRows();
          dialog.querySelector('.pack-form-error').textContent = ''; status('新建议已载入，请选择后加入。'); break;
        }
        case 'backup': exportBackup(); break;
      }
    } catch (error) { const output = dialog.open && dialog.querySelector('.pack-form-error'); if (output) output.textContent = error instanceof SyntaxError ? 'JSON 格式有误，请粘贴 AI 返回的完整数组。' : error.message; else status(error.message); }
  });
  app.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-drag]'); if (!handle) return;
    draggedId = handle.dataset.drag; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedId); handle.closest('.pack-item').classList.add('is-dragging');
  });
  function clearDrop() { app.querySelectorAll('.is-drop-target,.is-drop-before,.is-drop-after').forEach(el => el.classList.remove('is-drop-target','is-drop-before','is-drop-after')); }
  app.addEventListener('dragover', event => {
    const target = event.target.closest('[data-category]'); if (!draggedId || !target) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearDrop(); target.classList.add('is-drop-target');
    const row = event.target.closest('[data-item]');
    if (row && row.dataset.item !== draggedId) row.classList.add(event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 ? 'is-drop-before' : 'is-drop-after');
  });
  app.addEventListener('drop', event => {
    const target = event.target.closest('[data-category]'); if (!draggedId || !target) return;
    event.preventDefault();
    try {
      const row = event.target.closest('[data-item]'); let beforeId = row ? row.dataset.item : null;
      if (row && event.clientY >= row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2) {
        const visible = C.visibleItems(C.category(state, target.dataset.category), onlyPending), index = visible.findIndex(i => i.id === row.dataset.item);
        beforeId = visible[index+1] ? visible[index+1].id : null;
      }
      if (!row || row.dataset.item !== draggedId) mutate({type:'move-item', id:draggedId, categoryId:target.dataset.category, beforeId}, '位置已更新；已准备物品始终位于分类末尾。');
    } catch (error) { status(error.message); }
    draggedId = null; clearDrop();
  });
  app.addEventListener('dragend', () => { draggedId = null; clearDrop(); app.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging')); });
  app.querySelectorAll('.pack-js').forEach(el => el.hidden = false);
  const backup = document.createElement('button'); backup.type = 'button'; backup.className = 'pack-link'; backup.dataset.action = 'backup'; backup.textContent = '导出清单'; $('.pack-footer').append(backup);
  render(); status(lastMessage);
})();
