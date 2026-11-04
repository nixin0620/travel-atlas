/* Synthetic regressions only: no browser profile, private baseline or user folder. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../footprint-memoir-core.js');
const L = require('../local-files-core.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = id => html.match(new RegExp('<script[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</script>'))[1];
const atlas = JSON.parse(script('china-footprints-data'));
const known = new Set(atlas.cities.map(city => city.id));
const cityA = atlas.cities[0].id, cityB = atlas.cities[1].id;
const memoirKey = 'travel-footprints:memoir:v1';
const plain = value => JSON.parse(JSON.stringify(value));
const visit = (id, cityId = cityA, startDate = '', trip = '', order = 1, endDate = '') => ({ id, cityId, startDate, endDate, trip, order });
const memoir = visits => ({ version: 1, visits, wishes: [] });

function backupCore() {
  const context = { FootprintMemoirCore: C, module: { exports: {} } };
  vm.runInNewContext(script('guide-backup-feature'), context);
  return context.module.exports;
}
const B = backupCore();
const config = B.config({ tripId: 'memoir-regression' }, { trip_id: 'memoir-pack', todo_revision: '1' }, 'test');
const validators = { memoir: value => C.clean(value, known) };
function backup() {
  return { type: B.TYPE, version: B.VERSION, tripId: config.tripId, packingTripId: config.packingTripId,
    createdAt: '2026-10-23T00:00:00Z', records: Object.fromEntries(Object.keys(config.slots).map(key => [key, null])),
    media: { memories: [], references: [] } };
}
function storage(values = new Map()) {
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test('travel chronology uses explicit valid dates and retains undated and repeated visits', () => {
  const raw = memoir([visit('first', cityA, '2023-12-31'), visit('repeat', cityA, '2024-02-29'), visit('unknown', cityB), visit('future', cityB, '2027-01-01')]);
  const clean = C.clean(raw, known), visited = { [cityA]: '2099-01-01', [cityB]: '1900-01-01' };
  assert.deepEqual(C.years(clean, visited, '2026-10-23'), ['2023', '2024']);
  const replay = C.replay(clean, visited, '2024', 1, '2026-10-23');
  assert.deepEqual(replay.lit, [cityA]);
  assert.deepEqual(replay.unknown, [cityB]);
  assert.equal(clean.visits.length, 4);
  assert.throws(() => C.clean(memoir([visit('bad', cityA, '2025-02-29')]), known));
  assert.throws(() => C.clean(memoir([visit('bad', cityA, '2026-02-02', '', 1, '2026-02-01')]), known));
  assert.throws(() => C.clean(memoir([visit('bad', cityA, '', '', 1, '2026-02-01')]), known));
});

test('the same visit resolver preserves an explicitly selected repeat and falls back within its city', () => {
  const data = memoir([visit('old', cityA, '2020-01-01', 'First'), visit('named', cityA, '2024-01-01', 'Return'), visit('latest', cityA, '2025-01-01', 'Recent'), visit('other', cityB, '2026-01-01', 'Return')]);
  assert.equal(C.currentVisit(data, cityA, 'old', '').id, 'old');
  assert.equal(C.currentVisit(data, cityA, '', 'Return').id, 'named');
  assert.equal(C.currentVisit(data, cityA, 'missing', '').id, 'latest');
  assert.equal(C.currentVisit(data, cityA, 'other', '').id, 'latest');
  assert.equal(C.currentVisit(data, 'not-in-atlas', '', ''), undefined);
  assert.deepEqual(C.route(memoir([visit('third', cityA, '', 'Loop', 3), visit('second', cityB, '', 'Loop', 2), visit('first', cityA, '', 'Loop', 1)]), 'Loop').map(v => v.cityId), [cityA, cityB, cityA]);
});

test('the current route retains a return city while collapsing consecutive days in one city', () => {
  const cities = [{ id: 'beijing', name: '北京', full: '北京市', aliases: ['Beijing'] }, { id: 'shanghai', name: '上海', full: '上海市' }];
  const itinerary = { days: [{ city: '北京' }, { city: '北京市' }, { city: '上海' }, { city: '上海市' }, { city: 'Beijing' }], destinations: [{ name: '北京' }, { name: '上海' }] };
  const before = structuredClone(itinerary);
  assert.deepEqual(C.currentRoute(itinerary, cities, ['beijing', 'shanghai']), ['beijing', 'shanghai', 'beijing']);
  assert.deepEqual(itinerary, before);
});

test('current routes use repeated destinations when days are absent and retain a copied fallback', () => {
  const cities = [{ id: 'a', name: '甲城', full: '甲城市' }, { id: 'b', name: '乙城', full: '乙城市' }];
  assert.deepEqual(C.currentRoute({ destinations: [{ name: '甲城' }, { name: '乙城' }, { name: '甲城市' }] }, cities), ['a', 'b', 'a']);
  const fallback = ['a', 'b', 'a'], route = C.currentRoute(undefined, cities, fallback);
  assert.deepEqual(route, fallback);
  route.pop();
  assert.deepEqual(fallback, ['a', 'b', 'a']);
});

test('complete backups validate memoir cities before any restore writes', () => {
  const raw = backup(); raw.records.memoir = memoir([visit('valid')]);
  assert.doesNotThrow(() => B.validate(raw, config, validators));
  for (const value of [memoir([visit('unknown', 'not-in-atlas')]), { ...memoir([]), wishes: ['not-in-atlas'] }]) {
    raw.records.memoir = value;
    assert.throws(() => B.validate(raw, config, validators));
  }
});

test('legacy full backups preserve omitted memoir while explicit null clears it', async () => {
  const original = JSON.stringify({ ...memoir([visit('kept')]), wishes: [cityB] });
  const store = storage(new Map([[memoirKey, original]]));
  let mediaWrites = 0;
  const io = { storage: store, readMedia: async () => { throw Error('media:null must not read photos'); }, writeMedia: async () => { mediaWrites++; } };
  const legacy = backup(); delete legacy.records.memoir; legacy.media = null;
  B.validate(legacy, config, validators);
  // The UI validates again at confirmation; preservation must survive both passes.
  B.validate(legacy, config, validators);
  await B.restore(legacy, config, io);
  assert.equal(store.getItem(memoirKey), original);
  const explicit = backup(); explicit.records.memoir = null; explicit.media = null;
  B.validate(explicit, config, validators);
  await B.restore(explicit, config, io);
  assert.equal(store.getItem(memoirKey), null);
  assert.equal(mediaWrites, 0);
});

test('memoir and unchanged photo bytes survive full backup, asset packing and restore', async () => {
  const raw = backup(), photo = 'data:image/jpeg;base64,/9j/YWJj';
  raw.records.memoir = { ...memoir([visit('first', cityA, '2020-01-01', 'Loop', 1), visit('repeat', cityA, '2025-01-01', 'Loop', 3)]), wishes: [cityB] };
  raw.media.memories = [{ id: 'city:' + cityA, note: 'Synthetic saved memory', updatedAt: '', photos: [{ id: 'unchanged', data: photo }] }];
  B.validate(raw, config, validators);
  const packed = await L.pack(raw, {}, 1);
  const restored = await L.unpack(packed.document, async name => packed.assets.get(name), value => B.validate(value, config, validators));
  assert.deepEqual(plain(restored.backup), plain(raw));
  const store = storage(); let media;
  await B.restore(restored.backup, config, { storage: store, readMedia: async () => ({ memories: [], references: [] }), writeMedia: async value => { media = value; } });
  assert.deepEqual(JSON.parse(store.getItem(memoirKey)), raw.records.memoir);
  assert.equal(media.memories[0].photos[0].data, photo);
});

// A transactional IndexedDB stand-in: aborted writes never reach durable rows.
function database(rows, control) {
  return { transaction(_store, mode) {
    let jobs = 0, finished = false;
    const writes = new Map();
    const tx = { objectStore: () => store, abort() { if (finished) return; finished = true; setImmediate(() => tx.onabort?.()); } };
    const finish = () => setImmediate(() => {
      if (jobs || finished) return;
      finished = true;
      if (mode === 'readwrite' && control.failNextWrite) {
        control.failNextWrite = false; tx.error = Error('synthetic storage failure'); tx.onabort?.(); return;
      }
      for (const [key, value] of writes) rows.set(key, structuredClone(value));
      if (mode === 'readwrite') control.commits.push([...writes].map(([key, value]) => [key, structuredClone(value)]));
      tx.oncomplete?.();
    });
    const store = {
      get(key) { const request = {}; jobs++; setImmediate(() => { request.result = structuredClone(writes.has(key) ? writes.get(key) : rows.get(key)); request.onsuccess?.({ target: request }); jobs--; finish(); }); return request; },
      put(value, key) { writes.set(key, structuredClone(value)); finish(); }
    };
    finish(); return tx;
  } };
}
async function openStorage(initial) {
  const rows = new Map(), control = { commits: [], failNextWrite: false }, db = database(rows, control);
  const source = fs.readFileSync(path.join(root, 'local-storage-bridge.js'), 'utf8');
  const window = { localStorage: storage(), TravelPreview: { scope: 'memoir-regression', load: async () => structuredClone(initial) }, addEventListener() {}, dispatchEvent() {} };
  class FileReader {
    readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = 'data:' + blob.type + ';base64,' + Buffer.from(bytes).toString('base64'); this.onload?.(); }, error => { this.error = error; this.onerror?.(); }); }
  }
  const context = { window, structuredClone, crypto: require('node:crypto').webcrypto, console, Blob, FileReader, fetch,
    Event: class {}, CustomEvent: class {}, sessionStorage: storage(),
    document: { readyState: 'complete', getElementById: () => ({ textContent: JSON.stringify({ tripId: 'memoir-regression' }) }) },
    indexedDB: { open() { const request = {}; setImmediate(() => { request.result = db; request.onsuccess(); }); return request; } } };
  vm.runInNewContext(source, context);
  await new Promise(resolve => window.TravelStorage.whenReady(resolve));
  assert.equal(window.TravelStorage.bootError, null);
  control.commits.length = 0;
  return { api: window.TravelStorage, rows, control, savedKey: 'travel:memoir-regression:memoir-regression:saved' };
}
function storageFixture() {
  return { values: { [memoirKey]: JSON.stringify(memoir([visit('old')])), unrelated: 'retained' },
    media: { memories: [{ id: 'city:' + cityA, note: 'Old note', photos: [{ id: 'old-photo', data: 'data:image/jpeg;base64,/9j/b2xk' }] }, { id: 'city:' + cityB, note: 'Unrelated', photos: [] }], references: [{ id: 'reference', day: 1, name: 'Synthetic', dataUrl: 'data:image/jpeg;base64,/9j/cmVm' }] },
    dirty: false, generation: 0, updatedAt: '2026-10-23T00:00:00Z' };
}
const newRow = () => ({ id: 'city:' + cityA, note: 'New note', photos: [{ id: 'new-photo', blob: new Blob([new Uint8Array([255, 216, 255, 110, 101, 119])], { type: 'image/jpeg' }) }] });

test('saving photos with memoir commits both in the same durable workspace snapshot', async () => {
  const initial = storageFixture(), { api, rows, control, savedKey } = await openStorage(initial);
  const next = JSON.stringify(memoir([visit('new', cityA, '2026-10-01')]));
  await api.putMemories([newRow()], { [memoirKey]: next });
  const saved = rows.get(savedKey);
  assert.equal(saved.values[memoirKey], next);
  assert.equal(saved.media.memories.find(row => row.id === 'city:' + cityA).photos[0].data, 'data:image/jpeg;base64,/9j/bmV3');
  assert.equal(saved.values.unrelated, initial.values.unrelated);
  assert.deepEqual(saved.media.references, initial.media.references);
  assert.deepEqual(saved.media.memories.find(row => row.id === 'city:' + cityB), initial.media.memories[1]);
  for (const commit of control.commits) for (const [key, value] of commit) if (key === savedKey) {
    assert.equal(value.values[memoirKey], next, 'no photo-only intermediate save');
    assert.equal(value.media.memories.find(row => row.id === 'city:' + cityA).note, 'New note', 'no memoir-only intermediate save');
  }
});

test('failed combined photo and memoir write leaves existing in-memory and durable data intact', async () => {
  const initial = storageFixture(), { api, rows, control, savedKey } = await openStorage(initial);
  const before = structuredClone(rows.get(savedKey));
  control.failNextWrite = true;
  await assert.rejects(api.putMemories([newRow()], { [memoirKey]: JSON.stringify(memoir([visit('new')])) }), /synthetic storage failure/);
  assert.deepEqual(rows.get(savedKey), before);
  assert.deepEqual(plain(api.state.values), initial.values);
  assert.deepEqual(plain(api.state.media), initial.media);
});

// Run the real preparation code with inert elements; rendering is intentionally
// outside this harness because import preflight must complete before any I/O.
function memoirAPI(initial) {
  const source = fs.readFileSync(path.join(root, 'footprint-memoir.js'), 'utf8');
  const begin = source.indexOf('function init(){'), end = source.indexOf('\nfunction route(){', begin);
  assert(begin >= 0 && end > begin, 'memoir preparation initializer remains discoverable');
  const visitListener = source.split('\n').find(line => line.startsWith("$('[data-mm-visit]').addEventListener"));
  assert(visitListener, 'the actual visit-selector listener remains discoverable');
  const elements = new Map();
  const element = () => ({ dataset: {}, hidden: false, value: '', listeners: {}, classList: { contains: () => false, add() {} },
    setAttribute() {}, before() {}, after() {}, append() {}, prepend() {}, addEventListener(type, fn) { this.listeners[type] = fn; }, querySelectorAll: () => [] });
  const map = element();
  map.querySelector = selector => { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); };
  const store = storage(new Map([[memoirKey, JSON.stringify(initial)]]));
  let writes = 0;
  const window = { FootprintMemoirCore: C, FootprintAtlas: {}, TravelStorage: { ...store, setItem(key, value) { writes++; store.setItem(key, value); }, flushCache: async () => {} } };
  const document = { getElementById: id => id === 'china-footprints' ? map : { textContent: JSON.stringify(atlas) }, createElement: element };
  const context = { window, document, console, crypto: require('node:crypto').webcrypto, queue() {} };
  vm.runInNewContext(source.slice(begin, end) + '\n' + visitListener + '\n}\ninit();', context);
  return { api: window.FootprintMemoir, store, writes: () => writes,
    field: selector => elements.get(selector),
    selectVisit(id) { const selector = elements.get('[data-mm-visit]'); selector.value = id; selector.listeners.change({ target: selector }); }
  };
}

test('saving after switching visits commits every draft and preserves unrelated records', async () => {
  const original = { ...memoir([visit('first', cityA, '2020-01-01', 'First'), visit('repeat', cityA, '2021-01-01', 'Return'), visit('other-city', cityB, '2019-01-01')]), wishes: [cityB] };
  const { api, store, writes, field, selectVisit } = memoirAPI(original);
  assert.equal(writes(), 0, 'initializing the editor must not rewrite stored data');
  api.openEditor('city:' + cityA);
  assert.equal(field('[data-mm-visit]').value, 'repeat');
  field('[data-mm-start]').value = '2022-02-02';
  field('[data-mm-end]').value = '2022-02-03';
  field('[data-mm-trip-name]').value = 'Second trip';
  field('[data-mm-order]').value = '3';
  selectVisit('first');
  field('[data-mm-start]').value = '2023-03-03';
  field('[data-mm-trip-name]').value = 'Revised first';
  selectVisit('repeat');
  assert.equal(field('[data-mm-start]').value, '2022-02-02', 'switching back restores its draft');
  selectVisit('first');
  const prepared = api.prepareSave('city:' + cityA);
  assert.equal(writes(), 0, 'preparation must not persist any subset of the edits');
  assert.deepEqual(plain(api.snapshot()), original);
  await prepared.commit();
  const saved = JSON.parse(store.getItem(memoirKey)), records = new Map(saved.visits.map(v => [v.id, v]));
  assert.deepEqual(records.get('repeat'), visit('repeat', cityA, '2022-02-02', 'Second trip', 3, '2022-02-03'));
  assert.deepEqual(records.get('first'), visit('first', cityA, '2023-03-03', 'Revised first'));
  assert.deepEqual(records.get('other-city'), original.visits[2]);
  assert.deepEqual(saved.wishes, original.wishes);
  assert.equal(writes(), 1);
  assert.deepEqual(plain(api.snapshot()), saved);
});

test('an invalid parked visit draft rejects the entire save before storage changes', () => {
  const invalid = [
    { '[data-mm-start]': '9999-01-01' },
    { '[data-mm-start]': '2024-02-02', '[data-mm-end]': '2024-02-01' },
    { '[data-mm-order]': '0' }
  ];
  for (const fields of invalid) {
    const original = memoir([visit('first', cityA, '2020-01-01'), visit('repeat', cityA, '2021-01-01')]);
    const { api, store, writes, field, selectVisit } = memoirAPI(original);
    api.openEditor('city:' + cityA);
    for (const [selector, value] of Object.entries(fields)) field(selector).value = value;
    selectVisit('first');
    field('[data-mm-start]').value = '2023-03-03';
    assert.throws(() => api.prepareSave('city:' + cityA));
    assert.equal(writes(), 0);
    assert.deepEqual(JSON.parse(store.getItem(memoirKey)), original);
    assert.deepEqual(plain(api.snapshot()), original);
  }
});

test('cached deletions and a new visit save together without dropping another city', async () => {
  const original = memoir([visit('first', cityA, '2020-01-01'), visit('repeat', cityA, '2021-01-01'), visit('other-city', cityB, '2019-01-01')]);
  const { api, store, field, selectVisit } = memoirAPI(original);
  api.openEditor('city:' + cityA);
  field('[data-mm-remove]').checked = true;
  selectVisit('first');
  field('[data-mm-start]').value = '2022-02-02';
  selectVisit('');
  field('[data-mm-start]').value = '2024-04-04';
  field('[data-mm-trip-name]').value = 'New trip';
  field('[data-mm-order]').value = '2';
  await api.prepareSave('city:' + cityA).commit();
  const saved = JSON.parse(store.getItem(memoirKey));
  assert.equal(saved.visits.length, 3);
  assert.equal(saved.visits.some(v => v.id === 'repeat'), false);
  assert.equal(saved.visits.find(v => v.id === 'first').startDate, '2022-02-02');
  assert.deepEqual(saved.visits.find(v => v.id === 'other-city'), original.visits[2]);
  const added = saved.visits.find(v => !original.visits.some(old => old.id === v.id));
  assert.deepEqual(added, visit(added.id, cityA, '2024-04-04', 'New trip', 2));
});

test('legacy import preflight rejects merged visit overflow before metadata or media writes', () => {
  const original = memoir(Array.from({ length: 5000 }, (_, i) => visit('kept-' + i)));
  const { api, store, writes } = memoirAPI(original);
  const before = store.getItem(memoirKey);
  assert.throws(() => api.prepareImport(memoir([visit('incoming')])));
  assert.equal(writes(), 0);
  assert.equal(store.getItem(memoirKey), before);
  assert.equal(api.snapshot().visits.length, 5000);
});

test('prepared legacy imports leave saved data untouched until accepted or committed', async () => {
  const original = memoir([visit('existing', cityA, '2020-01-01')]);
  const { api, store, writes } = memoirAPI(original);
  const prepared = api.prepareImport(memoir([visit('existing', cityA, '2025-01-01'), visit('new', cityB, '2026-01-01')]));
  assert.equal(prepared.key, memoirKey);
  const value = JSON.parse(prepared.value);
  assert.equal(value.visits.length, 2);
  assert.equal(value.visits[0].startDate, '2020-01-01');
  assert.equal(writes(), 0);
  assert.deepEqual(plain(api.snapshot()), original);
  await prepared.commit();
  assert.deepEqual(JSON.parse(store.getItem(memoirKey)), value);
  assert.deepEqual(plain(api.snapshot()), value);
});

function memoryWriter(fileMode, before, hooks = {}) {
  const source = script('china-province-memories-controller');
  const block = source.match(/async function writeRecords\([\s\S]*?(?=\nfunction currentRegion\()/)?.[0];
  assert(block, 'the actual memory persistence function is available');
  const rows = new Map(before.map(row => [row.id, row]));
  const db = { transaction() {
    const next = new Map(rows), tx = { objectStore: () => ({ put: row => next.set(row.id, row), delete: id => next.delete(id) }) };
    setImmediate(() => { rows.clear(); for (const [key, value] of next) rows.set(key, value); tx.oncomplete?.(); });
    return tx;
  } };
  const window = { TravelStorage: { fileMode, putMemories: hooks.putMemories } };
  const context = { window, dbPromise: Promise.resolve(db), records: new Map(rows), allRecords: async () => [...rows.values()], console };
  const write = vm.runInNewContext(block + '\nwriteRecords;', context);
  return { write, rows };
}

test('memory controller passes the combined bundle to storage and accepts only after success', async () => {
  let accept = 0, calls = 0;
  const bundle = { key: memoirKey, value: JSON.stringify(memoir([visit('new')])), accept() { accept++; }, commit() { throw Error('must use combined workspace save'); } };
  const { write } = memoryWriter(true, [], { async putMemories(rows, values) {
    calls++; assert.equal(accept, 0); assert.equal(rows[0].id, 'city:' + cityA); assert.deepEqual(plain(values), { [memoirKey]: bundle.value });
  } });
  await write([newRow()], bundle);
  assert.equal(calls, 1); assert.equal(accept, 1);
  const failed = memoryWriter(true, [], { async putMemories() { throw Error('synthetic failure'); } });
  await assert.rejects(failed.write([newRow()], bundle), /synthetic failure/);
  assert.equal(accept, 1);
});

test('native memory save rolls back edited photos if memoir commit fails', async () => {
  const old = { id: 'city:' + cityA, note: 'Retained', photos: [{ id: 'old', blob: new Blob(['original bytes'], { type: 'image/jpeg' }) }] };
  const { write, rows } = memoryWriter(false, [old]);
  let accepted = false;
  const bundle = { key: memoirKey, value: '{}', accept() { accepted = true; }, async commit() { throw Error('synthetic metadata failure'); } };
  await assert.rejects(write([newRow()], bundle), /synthetic metadata failure/);
  assert.equal(rows.get(old.id).note, old.note);
  assert.equal(rows.get(old.id).photos[0].id, old.photos[0].id);
  assert.equal(await rows.get(old.id).photos[0].blob.text(), 'original bytes');
  assert.equal(accepted, false);
});
