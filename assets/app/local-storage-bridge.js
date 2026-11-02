/* Browser storage is a working copy; a folder remains the portable source of truth. */
(function () {
  'use strict';
  const clone = v => structuredClone(v);
  let db, state = null, metadata = null, namespace, tab, pending = Promise.resolve(), bootError = null;
  let previewRevision = 0, pendingWrites = 0;
  const preview = window.TravelPreview;
  const nativeKey = key => preview ? preview.scope + ':' + key : key;
  const native = { getItem: key => window.localStorage.getItem(nativeKey(key)),
    setItem: (key, value) => window.localStorage.setItem(nativeKey(key), value),
    removeItem: key => window.localStorage.removeItem(nativeKey(key)) };
  const callbacks = [], listeners = new Set();
  let ready = false, batching = 0, dirtyDuringBatch = false;
  function emit() { if (batching) { dirtyDuringBatch = true; return; } for (const fn of listeners) fn(); }
  function transaction(mode, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', mode), store = tx.objectStore('entries'); let value, failure;
      const abort = error => { failure = error; tx.abort(); };
      tx.oncomplete = () => resolve(value); tx.onabort = () => reject(failure || tx.error || Error('本机工作副本无法保存。')); tx.onerror = () => {};
      try { action(store, v => { value = v; }, abort); } catch(error) { abort(error); }
    });
  }
  const get = key => transaction('readonly', (s, set) => { s.get(key).onsuccess = e => set(e.target.result); });
  const put = (key, value) => transaction('readwrite', s => s.put(value, key));
  const workKey = () => namespace + ':draft:' + tab;
  function persist() {
    if (!state) return Promise.resolve();
    const copy = clone(state);
    pendingWrites++;
    pending = pending.catch(() => {}).then(async () => {
      let conflict = false, revision = previewRevision;
      await transaction('readwrite', s => {
        if (!preview) { s.put(copy, workKey()); return; }
        const request = s.get(namespace + ':saved');
        request.onsuccess = () => {
          const latest = request.result, currentRevision = latest?.previewRevision || 0;
          if (currentRevision !== previewRevision) {
            // Preserve both complete versions. Never merge snapshots implicitly:
            // a union could undo an intentional removal in the other page.
            conflict = true; copy.previewConflict = true;
            const conflictKey = workKey() + ':conflict:' + crypto.randomUUID();
            s.put(copy, conflictKey); s.put(copy, workKey()); return;
          }
          revision = currentRevision + 1; copy.previewRevision = revision;
          delete copy.previewConflict;
          s.put(copy, workKey()); s.put(copy, namespace + ':saved');
        };
      });
      if (conflict) throw Error('另一页面已更新旅行，本页修改已保留为历史草稿。可先导出本页备份，再刷新继续。');
      previewRevision = revision;
      if (preview) state.previewRevision = revision;
      if (api.cacheError) {
        api.cacheError = null;
        window.dispatchEvent(new Event('travel-storage-recovered'));
        emit();
      }
    }).finally(() => { pendingWrites--; emit(); });
    pending.catch(e => { api.cacheError = e; window.dispatchEvent(new CustomEvent('travel-storage-error', { detail: e.message })); });
    return pending;
  }
  function changed() {
    if (!state) return;
    state.dirty = true; state.generation++; state.updatedAt = new Date().toISOString(); persist(); emit();
  }
  function setItem(key, value) {
    value = String(value);
    if (!state) { native.setItem(key, value); return; }
    if (state.values[key] === value) return;
    state.values[key] = value; changed();
  }
  function removeItem(key) {
    if (!state) { native.removeItem(key); return; }
    if (!Object.hasOwn(state.values, key)) return;
    delete state.values[key]; changed();
  }
  async function boot() {
    namespace = 'travel:' + (JSON.parse(document.getElementById('journey-seed').textContent).tripId) + (preview ? ':' + preview.scope : '');
    try {
      tab = sessionStorage.getItem(namespace + ':tab') || crypto.randomUUID(); sessionStorage.setItem(namespace + ':tab', tab);
      db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('travel-handbook-local-files-v1', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('entries');
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        r.onblocked = () => reject(Error('本机文件工作副本被占用，请关闭同一手册的其他页面后重试。'));
      });
      metadata = await get(namespace + ':connection');
      const own = await get(workKey()), saved = await get(namespace + ':saved');
      const ownRevision=own?.previewRevision||0,savedRevision=saved?.previewRevision||0;
      const preferOwn=own?.dirty&&!own.previewConflict&&
        (ownRevision>savedRevision||(ownRevision===savedRevision&&(own.updatedAt||'')>=(saved?.updatedAt||'')));
      state = preview
        ? preferOwn ? own : saved || own || null
        : own?.dirty ? own : saved || own || null;
      if(preview&&own?.dirty&&!own.previewConflict&&state===saved&&
          (own.updatedAt!==saved.updatedAt||own.previewRevision!==saved.previewRevision)){
        await transaction('readwrite',s=>{
          s.put(own,workKey()+':previous:'+crypto.randomUUID());
          s.put(saved,workKey());
        });
      }
      if (preview && !state) {
        const initial = await preview.load();
        // Install once, transactionally. Another tab may have saved while we loaded.
        await transaction('readwrite', s => {
          const request = s.get(namespace + ':saved');
          request.onsuccess = () => {
            state = request.result || initial;
            if (!request.result) s.put(initial, namespace + ':saved');
            s.put(state, workKey());
          };
        });
      }
      previewRevision = state?.previewRevision || 0;
    } catch (e) { bootError = e; }
    ready = true;
    for (const fn of callbacks) try { fn(); } catch (e) { console.error(e); }
    callbacks.length = 0;
  }
  const api = window.TravelStorage = {
    get previewMode() { return !!preview; },
    get fileMode() { return !!state; }, get dirty() { return !!state?.dirty; }, get generation() { return state?.generation || 0; },
    get state() { return state; }, get metadata() { return metadata; }, get bootError() { return bootError; },
    cacheError: null,
    getItem: key => state ? state.values[key] ?? null : native.getItem(key), setItem, removeItem,
    whenReady(fn) { if (ready) fn(); else callbacks.push(fn); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async flushCache() { await pending; },
    get namespace() { return namespace; },
    get saving() { return pendingWrites > 0; },
    async recoveryHistory() {
      if (!db) throw bootError || Error('浏览器存储不可用。');
      return (await get(namespace + ':backup-history')) || [];
    },
    async keepRecovery(backup) {
      if (!db) throw bootError || Error('无法保存恢复前快照，已停止恢复。');
      const entry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), backup: clone(backup) };
      // Only explicit restores create a version; typing and ordinary saves do not.
      await transaction('readwrite', (s, set, abort) => {
        const request = s.get(namespace + ':backup-history');
        request.onsuccess = () => { try { s.put([entry, ...(request.result || [])].slice(0, 5), namespace + ':backup-history'); } catch(error) { abort(error); } };
      });
      return entry.id;
    },
    async replaceBackup(raw, c, preserveMemoir, expectedGeneration) {
      if (!state) throw Error('当前存储不支持整份事务恢复。');
      await pending;
      if (state.generation !== expectedGeneration) throw Error('准备恢复期间数据发生变化，请重新选择备份。');
      const next = clone(state);
      for (const [slot, info] of Object.entries(c.slots)) {
        if (slot === 'memoir' && preserveMemoir) continue;
        const value = raw.records[slot];
        if (value === null) delete next.values[info.key];
        else next.values[info.key] = slot === 'mapProvider' ? value : JSON.stringify(value);
      }
      if (raw.media !== null) next.media = clone(raw.media);
      next.generation++; next.dirty = true; next.updatedAt = new Date().toISOString();
      let conflict = false;
      await transaction('readwrite', (s, set, abort) => {
        const request = s.get(namespace + ':saved');
        request.onsuccess = () => {
          try {
          if (preview && (request.result?.previewRevision || 0) !== previewRevision) { conflict = true; return; }
          if (preview) { next.previewRevision = previewRevision + 1; delete next.previewConflict; }
          s.put(next, workKey());
          if (preview) s.put(next, namespace + ':saved');
          } catch(error) { abort(error); }
        };
      });
      if (conflict) throw Error('另一页面已更新数据，请刷新后重新恢复。');
      // Publish the complete bundle only after IndexedDB commits successfully.
      state = next; previewRevision = next.previewRevision || 0; api.cacheError = null; emit();
    },

    async batch(fn) { batching++; try { return await fn(); } finally { batching--; if (!batching && dirtyDuringBatch) { dirtyDuringBatch = false; emit(); } } },
    async activate(backup, settings, c, handle, hash, revision) {
      if (preview) throw Error('此新版使用独立副本，不连接原版数据文件夹。请使用导出备份保存。');
      if (!db) throw bootError || Error('无法建立本机工作副本。');
      const values = {};
      for (const [slot, info] of Object.entries(c.slots)) if (backup.records[slot] !== null) values[info.key] = slot === 'mapProvider' ? backup.records[slot] : JSON.stringify(backup.records[slot]);
      const destination = String(document.body.dataset.handbookDestination || 'guide').toLowerCase();
      if (settings.theme) values['travel-handbook-theme:' + destination] = settings.theme;
      if (settings.lastSection) values['travel-handbook-last-section:v1:' + c.tripId] = settings.lastSection;
      const next = { values, media: clone(backup.media), expectedHash: hash, revision, dirty: false, generation: 0, updatedAt: new Date().toISOString() };
      const meta = { handle, name: handle.name, updatedAt: next.updatedAt };
      // Commit everything together; a failed import leaves the existing state intact.
      await transaction('readwrite', s => { s.put(next, workKey()); s.put(next, namespace + ':saved'); s.put(meta, namespace + ':connection'); });
      state = next; metadata = meta; api.cacheError = null;
    },
    async checkpoint(hash, revision, generation, savedSnapshot) {
      const clean = { ...clone(savedSnapshot), expectedHash: hash, revision, dirty: false };
      state.expectedHash = hash; state.revision = revision; if (state.generation === generation) state.dirty = false;
      await pending.catch(() => {});
      const current = clone(state);
      await transaction('readwrite', s => { s.put(clean, namespace + ':saved'); s.put(current, workKey()); });
      api.cacheError = null;
    },
    readMedia() { return clone(state.media); },
    async writeMedia(media) { state.media = clone(media); changed(); await pending; },
    async memoryRows() {
      return Promise.all(state.media.memories.map(async r => ({ ...r, photos: await Promise.all(r.photos.map(async p => ({ id: p.id, blob: await (await fetch(p.data)).blob() }))) })));
    },
    async putMemories(rows, valueUpdates = {}) {
      const list = new Map(state.media.memories.map(r => [r.id, r]));
      for (const row of rows) {
        if (!row.note && !row.photos.length) { list.delete(row.id); continue; }
        const photos = await Promise.all(row.photos.map(async p => ({ id: p.id, data: await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(p.blob); }) })));
        list.set(row.id, { id: row.id, note: row.note, updatedAt: row.updatedAt || '', photos });
      }
      const before = clone(state);
      state.media.memories = [...list.values()];
      for (const [key, value] of Object.entries(valueUpdates)) state.values[key] = String(value);
      changed(); const generation = state.generation;
      try { await pending; } catch (error) {
        if (state.generation === generation) { state = before; emit(); }
        throw error;
      }
    },
    async referenceRows(day) { return clone(state.media.references.filter(r => r.day === day).sort((a, b) => a.createdAt - b.createdAt)); },
    async putReference(row) { state.media.references = [...state.media.references.filter(r => r.id !== row.id), clone(row)]; changed(); await pending; },
    async deleteReference(id) { state.media.references = state.media.references.filter(r => r.id !== id); changed(); await pending; },
    async drafts() {
      if (!db) return [];
      return transaction('readonly', (s, set) => {
        const rows = [], r = s.openCursor(); r.onsuccess = () => { const c = r.result; if (!c) { set(rows); return; } if (String(c.key).startsWith(namespace + ':draft:') && c.key !== workKey() && c.value.dirty) rows.push({ key: c.key, value: c.value }); c.continue(); };
      });
    },
    async recoverDraft(key) {
      await pending.catch(() => {});
      const next = await get(key); if (!next?.dirty) throw Error('未找到未落盘版本。');
      if (preview) {
        // An explicit restore keeps a recoverable copy of the current version.
        await transaction('readwrite', s => {
          const request = s.get(namespace + ':saved');
          request.onsuccess = () => {
            const latest = request.result;
            if (latest) s.put({...latest,dirty:true},workKey()+':before-restore:'+crypto.randomUUID());
            next.previewRevision = (latest?.previewRevision || 0) + 1;
            delete next.previewConflict;
            s.put(next,workKey()); s.put(next,namespace+':saved');
          };
        });
        previewRevision = next.previewRevision; api.cacheError = null;
      } else await put(workKey(), next);
      state = next;
    },
  };
  window.addEventListener('beforeunload', e => { if (pendingWrites > 0 || (!preview && state?.dirty) || api.cacheError) { e.preventDefault(); e.returnValue = ''; } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
