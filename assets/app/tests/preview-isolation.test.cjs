const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../local-storage-bridge.js'), 'utf8');
const trip = 'test-trip', scope = 'guide-import-preview-v1', key = 'orders';
const original = 'travel:' + trip, isolated = original + ':' + scope;
const seed = () => ({ values: { [key]: 'original itinerary copy' }, media: { memories: [], references: [] }, dirty: false, generation: 0 });
const nativeStore = map => ({ getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,String(v)), removeItem: k => map.delete(k) });

// Small asynchronous IndexedDB stand-in; browser behavior is also checked in the preview.
function database(rows) {
  return { transaction() {
    let jobs = 0, closed = false;
    const tx = { objectStore: () => store };
    function finish() { setImmediate(() => { if (!jobs && !closed) { closed = true; tx.oncomplete?.(); } }); }
    const store = {
      get(k) { const request = {}; jobs++; setImmediate(() => { request.result = structuredClone(rows.get(k)); request.onsuccess?.({ target: request }); jobs--; finish(); }); return request; },
      put(v,k) { rows.set(k, structuredClone(v)); finish(); }
    };
    finish(); return tx;
  }};
}
async function open(rows, native, load, session = new Map()) {
  const db = database(rows), handlers = new Map();
  const window = { localStorage: nativeStore(native), TravelPreview: { scope, load },
    addEventListener: (name,fn) => handlers.set(name,fn), dispatchEvent() {} };
  const context = { window, structuredClone, crypto: require('node:crypto').webcrypto, console,
    sessionStorage: nativeStore(session), CustomEvent: class {},
    document: { readyState: 'complete', getElementById: () => ({ textContent: JSON.stringify({ tripId: trip }) }) },
    indexedDB: { open() { const request = {}; setImmediate(() => { request.result = db; request.onsuccess(); }); return request; } } };
  vm.runInNewContext(source, context);
  await new Promise(resolve => window.TravelStorage.whenReady(resolve));
  return { api: window.TravelStorage, handlers };
}

test('first load uses a copy, never original browser data or folder handle', async () => {
  const existing = { values: { [key]: 'protected original' }, dirty: false };
  const rows = new Map([[original + ':saved', existing], [original + ':connection', { handle: { name: 'original folder' } }]]);
  const native = new Map([[key, 'original localStorage']]);
  const { api } = await open(rows, native, async () => seed());
  assert.equal(api.getItem(key), 'original itinerary copy');
  assert.equal(api.metadata, undefined);
  api.setItem(key, 'preview edit'); await api.flushCache();
  assert.deepEqual(rows.get(original + ':saved'), existing);
  assert.equal(native.get(key), 'original localStorage');
  assert.equal(rows.get(isolated + ':saved').values[key], 'preview edit');
  await assert.rejects(() => api.activate(null,null,null,null), /独立副本/);
});

test('reopening preserves new choices and schedule instead of reseeding', async () => {
  const rows = new Map(), native = new Map(); let loads = 0;
  const load = async () => { loads++; return seed(); };
  const first = await open(rows,native,load);
  first.api.setItem('guide-decisions', 'wish'); first.api.setItem('daily-plan', '2026-09-26 afternoon');
  await first.api.flushCache();
  const second = await open(rows,native,load);
  assert.equal(loads,1);
  assert.equal(second.api.getItem('guide-decisions'),'wish');
  assert.equal(second.api.getItem('daily-plan'),'2026-09-26 afternoon');
});

test('two first-open tabs install a baseline once without overwriting edits', async () => {
  const rows = new Map(), native = new Map(); let release;
  const delayed = open(rows,native,() => new Promise(resolve => { release=resolve; }));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const first = await open(rows,native,async () => seed());
  first.api.setItem(key,'first tab changes'); await first.api.flushCache();
  release(seed()); const second = await delayed;
  assert.equal(second.api.getItem(key),'first tab changes');
});

test('a missing baseline reports failure and does not import original working state', async () => {
  const rows = new Map([[original + ':saved', seed()]]), native = new Map([[key,'untouched']]);
  const { api } = await open(rows,native,async () => { throw Error('copy unavailable'); });
  assert.match(api.bootError.message,/copy unavailable/);
  assert.equal(api.getItem(key),null);
  assert.equal(rows.has(isolated + ':saved'),false);
  assert.equal(native.get(key),'untouched');
});

test('an older open page cannot overwrite a newer trip; its changes remain recoverable', async () => {
  const rows=new Map(),native=new Map(),session=new Map();
  const first=await open(rows,native,async()=>seed()),second=await open(rows,native,async()=>seed(),session);
  first.api.setItem('guide-decisions','wish');await first.api.flushCache();
  second.api.setItem('daily-plan','older page edit');
  await assert.rejects(second.api.flushCache(),/另一页面/);
  assert.equal(rows.get(isolated+':saved').values['guide-decisions'],'wish');
  assert.equal(rows.get(isolated+':saved').values['daily-plan'],undefined);
  const conflict=[...rows].find(([k])=>k.includes(':conflict:'));
  assert.equal(conflict[1].values['daily-plan'],'older page edit');
  assert(second.api.cacheError);
  // A caller rolling back its own failed operation must not erase the snapshot
  // of the edit that caused the conflict.
  second.api.removeItem('daily-plan');
  await assert.rejects(second.api.flushCache(),/另一页面/);
  assert.equal(rows.get(conflict[0]).values['daily-plan'],'older page edit');
  assert.equal([...rows.keys()].filter(k=>k.includes(':conflict:')).length,2);
  const reopened=await open(rows,native,async()=>seed(),session);
  assert.equal(reopened.api.getItem('guide-decisions'),'wish');
  assert.equal(reopened.api.getItem('daily-plan'),null);
  // Restoring is explicit and preserves the version it replaces as well.
  await reopened.api.recoverDraft(conflict[0]);
  assert.equal(rows.get(isolated+':saved').values['daily-plan'],'older page edit');
  assert([...rows].some(([k,v])=>k.includes(':before-restore:')&&v.values['guide-decisions']==='wish'));
});

test('queued saves from one page keep all edits and advance only after successful writes',async()=>{
  const rows=new Map(),native=new Map(),{api}=await open(rows,native,async()=>seed());
  api.setItem('one','1');api.setItem('two','2');api.setItem('three','3');
  await api.flushCache();
  assert.equal(rows.get(isolated+':saved').previewRevision,3);
  assert.equal(rows.get(isolated+':saved').values.one,'1');
  assert.equal(rows.get(isolated+':saved').values.three,'3');
  assert.equal(api.cacheError,null);
});

test('legacy tabs without a revision use the newer saved copy instead of an older dirty draft',async()=>{
 const old={...seed(),dirty:true,updatedAt:'2026-10-13T00:00:00Z',values:{[key]:'older draft'}};
 const current={...seed(),dirty:true,updatedAt:'2026-10-20T00:00:00Z',values:{[key]:'newer trip'}};
 const rows=new Map([[isolated+':saved',current],[isolated+':draft:old-tab',old]]);
  const {api}=await open(rows,new Map(),async()=>seed(),new Map([[isolated+':tab','old-tab']]));
  assert.equal(api.getItem(key),'newer trip');
  const previous=[...rows].find(([key])=>key.includes(':previous:'));
  assert.equal(previous[1].values[key],'older draft');
  api.setItem('guide-decisions','wish');await api.flushCache();
  assert.equal(rows.get(previous[0]).values[key],'older draft');
  assert.equal(rows.get(isolated+':saved').values[key],'newer trip');
});

test('refresh is guarded while the browser save is still in flight, then released after commit',async()=>{
 const rows=new Map(),native=new Map(),{api,handlers}=await open(rows,native,async()=>seed());
 let guarded=false;
 const unload=()=>{guarded=false;handlers.get('beforeunload')({preventDefault(){guarded=true;}});return guarded;};
 assert.equal(unload(),false);
 api.setItem('daily-plan',JSON.stringify({time:'09:30',endTime:'11:00'}));
 assert.equal(unload(),true);
 await api.flushCache();
 assert.equal(unload(),false);
 const reopened=await open(rows,native,async()=>seed());
 assert.deepEqual(JSON.parse(reopened.api.getItem('daily-plan')),{time:'09:30',endTime:'11:00'});
});
