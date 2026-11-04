'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), os=require('node:os');
const root=path.join(__dirname,'../assets/app'), html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const script=id=>html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1];
const builder=require('../scripts/build-trip.cjs'), Plan=require('../assets/app/travel-plan-core.js'), Imports=require('../assets/app/dot-import-core.js');
const tripId='bootstrap-test',scope='bootstrap-isolated',namespace='travel:'+tripId+':'+scope;
const empty=()=>({values:{},media:{memories:[],references:[],memoirs:[]},dirty:false,generation:0});
const native=map=>({get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-initial-'));
 try {
  fs.writeFileSync(path.join(dir,'photo.jpg'),Buffer.from([255,216,255,217]));
  const photo={file:'photo.jpg',sourceURL:'https://example.com/photo',credit:'Synthetic test',license:'CC0',width:800,height:600};
  return builder.compile({version:1,title:'跨浏览器测试旅行',cover:photo,cities:[{name:'京都',countryCode:'JP',photo}],
   days:[{city:'京都',date:'',stops:[{placeId:'a',slot:'afternoon'},{note:'测试安排',slot:'evening'}]}],
   places:[{id:'a',name:'合成测试地点',city:'京都',kind:'sight',address:'合成测试地址',description:'仅用于测试',photo,wanted:true,sources:[{title:'测试来源',url:'https://example.com/place',checkedAt:'2026-11-04'}]}]},dir,tripId);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
// Rollback-capable IDB stand-in. Browser checks separately exercise real IDB.
function database(rows,fault){return {transaction(unused,mode){
 const staged=new Map(structuredClone([...rows]));let jobs=0,closed=false;
 const tx={objectStore:()=>store,abort(){if(!closed){closed=true;setImmediate(()=>tx.onabort?.());}}};
 const finish=()=>setImmediate(()=>{if(!closed&&!jobs){closed=true;if(fault.commit&&mode==='readwrite'){tx.error=Error('commit failed');tx.onabort?.();return;}rows.clear();for(const [k,v] of staged)rows.set(k,v);tx.oncomplete?.();}});
 const store={get(k){const r={};jobs++;setImmediate(()=>{if(!closed){r.result=structuredClone(staged.get(k));r.onsuccess?.({target:r});}jobs--;finish();});return r;},put(v,k){if(fault.fail?.(k))throw Object.assign(Error('storage full'),{name:'QuotaExceededError'});staged.set(k,structuredClone(v));finish();}};
 finish();return tx;
}};}
async function open({rows=new Map(),seed=fixture(),local=new Map(),session=new Map(),fault={},load=async()=>empty(),missing=false}={}){
 const window={TravelPlanCore:Plan,DotImportCore:Imports,TripData:{name:s=>s,key:builder.cityKey},TravelPreview:{scope,load},localStorage:native(local),addEventListener(){},dispatchEvent(){}};
 if(!missing)window.TravelPlanSeed=seed;
 const nodes={'journey-seed':{tripId},'packing-data':{trip_id:tripId,todo_revision:1}};
 const document={readyState:'complete',documentElement:{dataset:{travelInitialContent:'1'}},body:{dataset:{handbookDestination:'test'}},getElementById:id=>({textContent:JSON.stringify(nodes[id])})};
 window.document=document;window.TravelStorage={whenReady(){}};
 const context={window,document,Blob,structuredClone,console,CustomEvent:class{},Event:class{},crypto:require('node:crypto').webcrypto,sessionStorage:native(session),indexedDB:{open(){const r={};setImmediate(()=>{r.result=database(rows,fault);r.onsuccess();});return r;}}};
 for(const id of ['trip-data-core','journey-core','daily-plan-core','guide-backup-feature']) vm.runInNewContext(script(id),context);
 // Backup core is available synchronously; its UI init is irrelevant here.
 vm.runInNewContext(source('travel-initial-content.js'),context);
 vm.runInNewContext(source('local-storage-bridge.js'),context);
 await new Promise(resolve=>window.TravelStorage.whenReady(resolve));
 const config=window.TravelBackupCore.config(nodes['journey-seed'],nodes['packing-data'],'test');
 return {api:window.TravelStorage,rows,window,config,read:slot=>JSON.parse(window.TravelStorage.getItem(config.slots[slot].key))};
}

test('two fresh browser stores get the same complete plan, image bytes, My Pick and linked daily IDs without a click',async()=>{
 const seed=fixture(),a=await open({seed}),b=await open({seed});
 assert.equal(a.api.bootError,null);assert.equal(b.api.bootError,null);
 assert.deepEqual(plain(a.api.state.values),plain(b.api.state.values));
 const plan=a.read('journeyApplied').plan,items=a.read('guideImports').items,entries=a.read('dailyPlan').entries;
 assert.equal(plan.title,seed.journey.plan.title);assert.equal(plan.cover.url,seed.journey.plan.cover.url);assert.equal(plan.cities[0].photo.url,plan.cover.url);
 assert.equal(items[0].choice,'wish');assert.equal(items[0].place.publicPhotos[0].url,plan.cover.url);
 assert.equal(entries[0].place.sourceId,items[0].sourceId);assert.equal(entries.length,2);
 assert.equal(a.api.state.initialContent.status,'applied');assert.equal(a.read('footprints'),null);
 assert.deepEqual(plain(await a.api.recoveryHistory()),[]);
});
test('edits and removal survive reload, a new tab and a changed initial bundle; another browser stays independent',async()=>{
 const seed=fixture(),a=await open({seed}),b=await open({seed});
 const daily=a.read('dailyPlan');daily.entries=[{id:'user-note',dayId:'plan-1',slot:'evening',type:'note',text:'我的修改'}];
 a.api.setItem(a.config.slots.dailyPlan.key,JSON.stringify(daily));
 const picks=a.read('guideImports');picks.items=[];a.api.setItem(a.config.slots.guideImports.key,JSON.stringify(picks));await a.api.flushCache();
 const newer=fixture();newer.id='new-release';newer.journey.plan.title='新版初始内容';
 const reopened=await open({rows:a.rows,seed:newer});
 assert.equal(reopened.read('dailyPlan').entries[0].text,'我的修改');assert.equal(reopened.read('guideImports').items.length,0);
 assert.equal(reopened.read('journeyApplied').plan.title,seed.journey.plan.title);
 assert.equal(b.read('guideImports').items.length,1);assert.equal(b.read('dailyPlan').entries.length,2);
});
test('fully deleted records and an empty restored backup remain empty forever, independent of seed ID',async()=>{
 const a=await open();
 const raw={records:Object.fromEntries(Object.keys(a.config.slots).map(slot=>[slot,null])),media:empty().media};
 await a.api.replaceBackup(raw,a.config,false,a.api.generation);
 const reopened=await open({rows:a.rows});assert.deepEqual(Object.keys(reopened.api.state.values),[]);assert.equal(reopened.api.state.initialContent.status,'applied');
});
test('legacy existing snapshots without an initialization marker, including empty snapshots, are never populated',async()=>{
 for(const values of [{},{['travel-handbook-dot-imports:v1:'+tripId]:'invalid old record'}]){
  const rows=new Map([[namespace+':saved',{...empty(),values}]]),a=await open({rows,seed:{broken:true}});
  assert.equal(a.api.bootError,null);assert.deepEqual(plain(a.api.state.values),values);
 }
});
test('scoped legacy browser records, even a cleared value, are preserved rather than overwritten',async()=>{
 const key='travel-handbook-daily-plan:v1:'+tripId,local=new Map([[scope+':'+key,'null'],['other-app','private data']]);
 const a=await open({local});assert.equal(a.api.getItem(key),'null');assert.equal(a.read('journeyApplied'),null);assert.equal(a.api.getItem('other-app'),null);
 assert.equal(local.get('other-app'),'private data');
});
test('failed first transaction leaves neither records nor completion marker and is safe to retry',async()=>{
 for(const fault of [{fail:key=>key.includes(':draft:')},{commit:true}]){
  const rows=new Map(),local=new Map(),a=await open({rows,local,fault});
  assert.ok(a.api.bootError);assert.equal(a.api.state,null);assert.equal(rows.size,0);
  assert.throws(()=>a.api.setItem('fallback','partial'),/storage full|commit failed/);assert.equal(local.size,0);
  const retry=await open({rows,local});assert.equal(retry.api.bootError,null);assert.equal(retry.read('guideImports').items.length,1);
  const again=await open({rows});assert.equal(again.read('guideImports').items.length,1);assert.equal(again.read('dailyPlan').entries.length,2);
 }
});
test('missing, corrupt, mismatched and nonportable seed content fails closed, then a repaired file retries once',async()=>{
 const invalid=[];const mismatch=fixture();mismatch.tripId='other';invalid.push(mismatch);
 const foreignImage=fixture();foreignImage.journey.plan.cover.url='https://example.com/photo.jpg';invalid.push(foreignImage);
 const brokenLink=fixture();brokenLink.daily.entries[0].place.sourceId='missing';invalid.push(brokenLink);
 const badDay=fixture();badDay.daily.entries[0].dayId='plan-999';invalid.push(badDay);
 const duplicate=fixture();duplicate.daily.entries.push(duplicate.daily.entries[0]);invalid.push(duplicate);
 for(const options of [{missing:true},{seed:false},{seed:''},{seed:[]},...invalid.map(seed=>({seed}))]){
  const rows=new Map(),a=await open({rows,...options});assert.ok(a.api.bootError);assert.equal(rows.size,0);
  const retry=await open({rows});assert.equal(retry.api.bootError,null);assert.equal(retry.read('guideImports').items.length,1);
 }
});
test('a delayed first tab adopts the other tab’s committed edits instead of reinstalling its seed',async()=>{
 const rows=new Map();let release;
 const delayed=open({rows,load:()=>new Promise(resolve=>release=resolve)});
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 const first=await open({rows});first.api.setItem('user-note','already edited');await first.api.flushCache();
 release(empty());const second=await delayed;assert.equal(second.api.bootError,null);assert.equal(second.api.getItem('user-note'),'already edited');
 assert.equal(second.read('guideImports').items.length,1);
});
test('an installation without a generated plan stays empty, and later seed replacement cannot reset it',async()=>{
 const a=await open({seed:null});assert.equal(a.api.state.initialContent.status,'empty');
 const later=await open({rows:a.rows});assert.equal(later.read('journeyApplied'),null);
});
test('initial content retains native backup round-trip and recovery history without reseeding cleared picks',async()=>{
 const a=await open(),B=a.window.TravelBackupCore;
 const raw={type:B.TYPE,version:B.VERSION,tripId,packingTripId:tripId,createdAt:new Date().toISOString(),records:Object.fromEntries(Object.keys(a.config.slots).map(slot=>[slot,a.read(slot)])),media:plain(a.api.state.media)};
 B.validate(raw,a.config);const serialized=JSON.stringify(raw);raw.records.guideImports.items[0].choice=null;
 await a.api.keepRecovery(JSON.parse(serialized));await a.api.replaceBackup(raw,a.config,false,a.api.generation);
 const restored=await open({rows:a.rows});assert.equal(restored.read('guideImports').items[0].choice,null);
 assert.equal(restored.read('journeyApplied').plan.cover.url,JSON.parse(serialized).records.journeyApplied.plan.cover.url);
 assert.equal((await restored.api.recoveryHistory()).length,1);
});
