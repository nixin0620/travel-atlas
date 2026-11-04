/* Transactional storage tests use synthetic records only. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../local-storage-bridge.js'),'utf8');
const config={slots:{footprints:{key:'footprints'},guideImports:{key:'guides'},dailyPlan:{key:'plan'},sightPicks:{key:'picks'},memoir:{key:'memoir'}}};
const scope='backup-unit',namespace='travel:unit:'+scope;
const makeBackup=(label='new')=>({records:{footprints:{cities:[{id:'city-a'}]},guideImports:{items:[{sourceId:'dot:a',choice:'must',place:{name:label},sources:[{guideId:'guide-a',imageIndices:[0]}]}],guides:[{id:'guide-a',images:[{data:'photo'}]}]},dailyPlan:{entries:[{id:'entry-a',sourceId:'dot:a'}]},sightPicks:{choices:{'dot:a':'must'}},memoir:{visits:[{cityId:'city-a'}],wishes:[]}},media:{memories:[{id:'city:city-a',note:label,photos:[{id:'photo-a',data:'photo bytes'}]}],references:[{id:'reference-a',day:1,dataUrl:'reference bytes'}]}});
const initial=()=>({values:{theme:'keep',footprints:'old',memoir:'original memoir'},media:{memories:[],references:[]},generation:0,dirty:false});
const native=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
function database(rows,fault){return{transaction(){
 const staged=new Map(structuredClone([...rows]));let jobs=0,aborted=false,closed=false;
 const tx={objectStore:()=>store,abort(){if(closed)return;aborted=true;closed=true;setImmediate(()=>tx.onabort?.());}};
 const finish=()=>setImmediate(()=>{if(!closed&&!jobs){closed=true;rows.clear();for(const [k,v]of staged)rows.set(k,v);tx.oncomplete?.();}});
 const store={get(k){const r={};jobs++;setImmediate(()=>{if(!aborted){r.result=structuredClone(staged.get(k));r.onsuccess?.({target:r});}jobs--;finish();});return r;},put(v,k){if(fault.fail?.(k,v))throw Object.assign(Error('storage full'),{name:'QuotaExceededError'});staged.set(k,structuredClone(v));finish();}};
 finish();return tx;
}};}
async function open(rows=new Map(),fault={},session=new Map()){
 const db=database(rows,fault),window={localStorage:native(new Map()),TravelPreview:{scope,load:async()=>initial()},addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(source,{window,structuredClone,crypto:require('node:crypto').webcrypto,sessionStorage:native(session),console,Event:class{},CustomEvent:class{},document:{readyState:'complete',getElementById:()=>({textContent:'{"tripId":"unit"}'})},indexedDB:{open(){const r={};setImmediate(()=>{r.result=db;r.onsuccess();});return r;}}});
 await new Promise(r=>window.TravelStorage.whenReady(r));return{api:window.TravelStorage,rows};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test('whole bundle is committed together; repeat restore and reload preserve IDs, images and unrelated settings',async()=>{
 const {api,rows}=await open();const raw=makeBackup();await api.keepRecovery(raw);await api.replaceBackup(raw,config,false,0);
 const first=plain(api.state);await api.replaceBackup(raw,config,false,1);assert.deepEqual(plain(api.state.values),first.values);assert.deepEqual(plain(api.state.media),raw.media);
 const loaded=(await open(rows)).api;assert.deepEqual(plain(loaded.state.media),raw.media);assert.equal(loaded.getItem('theme'),'keep');
 const guide=JSON.parse(loaded.getItem('guides')),plan=JSON.parse(loaded.getItem('plan'));assert.equal(guide.items[0].sourceId,plan.entries[0].sourceId);assert.equal(guide.guides[0].images[guide.items[0].sources[0].imageIndices[0]].data,'photo');
});
test('restore snapshots retain newest five; ordinary inputs create no versions',async()=>{
 const {api}=await open();for(let i=0;i<7;i++)await api.keepRecovery(makeBackup(String(i)));
 const history=await api.recoveryHistory();assert.equal(history.length,5);assert.deepEqual(plain(history.map(x=>x.backup.media.memories[0].note)),['6','5','4','3','2']);
 for(let i=0;i<4;i++)api.setItem('notes',String(i));await api.flushCache();assert.equal((await api.recoveryHistory()).length,5);
});
test('a full snapshot store blocks recovery before touching current content',async()=>{
 const fault={}, {api,rows}=await open(new Map(),fault),before=structuredClone([...rows]);fault.fail=k=>k.endsWith(':backup-history');
 await assert.rejects(api.keepRecovery(makeBackup()),{name:'QuotaExceededError'});assert.deepEqual([...rows],before);assert.equal(api.getItem('footprints'),'old');
});
test('quota failure after first put aborts both draft and saved bundle; safety snapshot survives',async()=>{
 const fault={}, {api,rows}=await open(new Map(),fault);await api.keepRecovery(makeBackup('recovery'));const old=plain(api.state),before=structuredClone([...rows]);fault.fail=k=>k.endsWith(':saved');
 await assert.rejects(api.replaceBackup(makeBackup(),config,false,0),{name:'QuotaExceededError'});assert.deepEqual(plain(api.state),old);assert.deepEqual([...rows],before);
 fault.fail=null;const reopened=(await open(rows)).api;assert.equal(reopened.getItem('footprints'),'old');assert.equal((await reopened.recoveryHistory())[0].backup.media.memories[0].note,'recovery');
});
test('generation changes and another tab updates cannot be overwritten by a stale restore',async()=>{
 const {api,rows}=await open();api.setItem('other','new edit');await api.flushCache();await assert.rejects(api.replaceBackup(makeBackup(),config,false,0),/发生变化/);
 const second=(await open(rows)).api;api.setItem('other','latest');await api.flushCache();await assert.rejects(second.replaceBackup(makeBackup(),config,false,second.generation),/另一页面/);assert.equal(rows.get(namespace+':saved').values.other,'latest');
});
test('legacy backups preserve omitted memoir and photographs',async()=>{
 const {api}=await open();const raw=makeBackup();raw.records.memoir=null;raw.media=null;await api.replaceBackup(raw,config,true,0);assert.equal(api.getItem('memoir'),'original memoir');assert.deepEqual(plain(api.state.media),{memories:[],references:[]});
});
