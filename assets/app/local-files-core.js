/* Local folder format. Images are immutable; travel.json is committed last. */
(function (global) {
  'use strict';
  const TYPE = 'travel-handbook-local', VERSION = 1, MAX = 80 * 1024 * 1024;
  const imagePattern = /^data:image\/(jpeg|png|webp|gif|avif);base64,([A-Za-z0-9+/]+={0,2})$/;
  const pathPattern = /^images\/([a-f0-9]{64})\.(jpg|png|webp|gif|avif)$/;
  const clone = v => JSON.parse(JSON.stringify(v));
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  const hashText = text => hash(new TextEncoder().encode(text));
  function safe(value, depth = 0) {
    if (depth > 35) throw Error('数据结构过深。');
    if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('数据包含不支持的字段。');
      safe(v, depth + 1);
    }
  }
  async function pack(backup, settings, revision) {
    const assets = new Map();
    let expandedImages = 0;
    async function walk(v) {
      if (typeof v === 'string') {
        const m = imagePattern.exec(v);
        if (m) {
          expandedImages += v.length;
          if (expandedImages > MAX) throw Error('完整旅行数据超过 80 MB，尚未写入文件。请先导出并整理照片。');
          const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
          const digest = await hash(bytes), ext = m[1] === 'jpeg' ? 'jpg' : m[1];
          const path = 'images/' + digest + '.' + ext;
          assets.set(path, bytes);
          return { $image: path };
        }
        return v;
      }
      if (Array.isArray(v)) return Promise.all(v.map(walk));
      if (v && typeof v === 'object') {
        const out = {};
        for (const [k, item] of Object.entries(v)) out[k] = await walk(item);
        return out;
      }
      return v;
    }
    safe(backup); safe(settings);
    const document = { type: TYPE, version: VERSION, revision, savedAt: new Date().toISOString(), backup: await walk(backup), settings: clone(settings || {}) };
    if (new TextEncoder().encode(JSON.stringify(document)).length + expandedImages > MAX) throw Error('完整旅行数据超过 80 MB，尚未写入文件。');
    return { document, assets, text: JSON.stringify(document, null, 2) + '\n' };
  }
  async function unpack(doc, getImage, validate) {
    safe(doc);
    if (!doc || doc.type !== TYPE || doc.version !== VERSION || !Number.isSafeInteger(doc.revision) || doc.revision < 1 || !doc.backup || doc.backup.media === null) throw Error('不是完整的本地旅行文件。');
    if (!doc.settings || Object.keys(doc.settings).some(k => !['theme', 'lastSection'].includes(k)) || Object.values(doc.settings).some(v => v !== null && (typeof v !== 'string' || v.length > 200))) throw Error('页面设置格式不正确。');
    let size = new TextEncoder().encode(JSON.stringify(doc)).length;
    const cache = new Map();
    async function walk(v) {
      if (v && typeof v === 'object' && Object.hasOwn(v, '$image')) {
        const m = typeof v.$image === 'string' && pathPattern.exec(v.$image);
        if (!m || Object.keys(v).length !== 1) throw Error('图片路径不安全或格式不正确。');
        if (!cache.has(v.$image)) cache.set(v.$image, (async () => {
          const bytes = new Uint8Array(await getImage(v.$image));
          if (await hash(bytes) !== m[1]) throw Error('图片缺失或已损坏：' + v.$image);
          let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return 'data:image/' + (m[2] === 'jpg' ? 'jpeg' : m[2]) + ';base64,' + btoa(binary);
        })());
        const result = await cache.get(v.$image); size += result.length;
        if (size > MAX) throw Error('此旅行文件超过 80 MB 的当前读取上限。');
        return result;
      }
      if (Array.isArray(v)) return Promise.all(v.map(walk));
      if (v && typeof v === 'object') {
        const out = {}; for (const [k, item] of Object.entries(v)) out[k] = await walk(item); return out;
      }
      return v;
    }
    const backup = await walk(doc.backup);
    validate(backup);
    return { backup, settings: clone(doc.settings), revision: doc.revision };
  }
  async function fileText(dir, name) {
    try { return await (await (await dir.getFileHandle(name)).getFile()).text(); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  }
  async function read(dir, validate) {
    const text = await fileText(dir, 'travel.json');
    if (text === null) return { text: null, hash: null, document: null, data: null };
    if (new TextEncoder().encode(text).length > MAX) throw Error('travel.json 过大。');
    let doc; try { doc = JSON.parse(text); } catch (_) { throw Error('travel.json 无法解析，原文件未改动。可从 backups 恢复。'); }
    const data = await unpack(doc, async path => {
      try {
        const images = await dir.getDirectoryHandle('images');
        const f = await (await images.getFileHandle(path.slice(7))).getFile();
        if (f.size > 16 * 1024 * 1024) throw Error('图片过大。');
        return f.arrayBuffer();
      } catch (e) { throw Error('无法读取图片 ' + path + '：' + e.message); }
    }, validate);
    return { text, hash: await hashText(text), document: doc, data };
  }
  async function atomic(handle, contents) {
    let writer;
    try { writer = await handle.createWritable({ mode: 'exclusive' }); await writer.write(contents); await writer.close(); }
    catch (e) { if (writer) await writer.abort().catch(() => {}); throw e; }
  }
  const autoVersion = /^travel-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{10}\.json$/;
  async function historyFiles(folder) {
    const files=[];
    for await(const [name,handle] of folder.entries()) if(handle.kind==='file'&&autoVersion.test(name)) files.push(name);
    return files.sort().reverse();
  }
  async function pruneHistory(folder) {
    for(const name of (await historyFiles(folder)).slice(5)) await folder.removeEntry(name);
  }
  async function save(dir, packed, expectedHash) {
    // Lock the current JSON BEFORE comparing revisions. Never use a siloed writer.
    const handle = await dir.getFileHandle('travel.json', { create: true });
    let writer;
    try {
      writer = await handle.createWritable({ mode: 'exclusive' });
      const old = await (await handle.getFile()).text();
      const actual = old ? await hashText(old) : null;
      if (actual !== expectedHash) { const e = Error('磁盘上的行程已被另一页面修改。已停止写入，请先比较两个版本。'); e.code = 'CONFLICT'; throw e; }
      const images = await dir.getDirectoryHandle('images', { create: true });
      for (const [path, bytes] of packed.assets) {
        const name = path.slice(7), h = await images.getFileHandle(name, { create: true });
        const previous = new Uint8Array(await (await h.getFile()).arrayBuffer());
        if (previous.length && await hash(previous) !== name.split('.')[0]) throw Error('图片文件已损坏，未覆盖：' + path);
        if (!previous.length) await atomic(h, bytes);
      }
      if (old) {
        const backups = await dir.getDirectoryHandle('backups', { create: true });
        const files=await historyFiles(backups),latest=files[0];
        const latestTime=latest?Date.parse(latest.slice(7,31).replace(/T(\d+)-(\d+)-(\d+)-(\d+)/,'T$1:$2:$3.$4')):0;
        // File autosaves continue, but historical versions are spaced ten minutes apart.
        if(!latest||Date.now()-latestTime>=10*60*1000){
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          await atomic(await backups.getFileHandle('travel-' + stamp + '-' + actual.slice(0, 10) + '.json', { create: true }), old);
        }
        await pruneHistory(backups);
      }
      await writer.write(packed.text); await writer.close(); writer = null;
      const resultHash = await hashText(packed.text);
      if (await hashText(await (await handle.getFile()).text()) !== resultHash) throw Error('文件在写入后又发生变化，请重新连接并检查。');
      return resultHash;
    } catch (e) { if (writer) await writer.abort().catch(() => {}); throw e; }
  }
  function merge(a, b, prefer = 'browser') {
    const result = clone(a), conflicts = [];
    for (const key of Object.keys(result.records)) {
      const x = a.records[key], y = b.records[key];
      if (x === null) result.records[key] = clone(y);
      else if (y !== null && JSON.stringify(x) !== JSON.stringify(y)) {
        if (key === 'footprints') {
          const cities = new Map([...y.cities, ...x.cities].map(c => [c.id, c]));
          result.records[key] = { ...x, cities: [...cities.values()] };
        } else { conflicts.push(key); result.records[key] = clone(prefer === 'file' ? y : x); }
      }
    }
    result.media = { memories: [], references: [] };
    for (const key of ['memories', 'references']) {
      const rows = new Map((a.media?.[key] || []).map(r => [r.id, r]));
      for (const row of b.media?.[key] || []) {
        if (rows.has(row.id) && JSON.stringify(rows.get(row.id)) !== JSON.stringify(row)) {
          conflicts.push(key + ':' + row.id);
          if (prefer === 'file') rows.set(row.id, row);
        } else rows.set(row.id, row);
      }
      result.media[key] = [...rows.values()].map(clone);
    }
    result.createdAt = new Date().toISOString();
    return { backup: result, conflicts };
  }
  const core = { TYPE, VERSION, MAX, pack, unpack, read, save, atomic, hashText, merge, fileText, pruneHistory };
  global.TravelLocalCore = core;
  if (typeof module === 'object' && module.exports) module.exports = core;
})(typeof window === 'object' ? window : globalThis);
