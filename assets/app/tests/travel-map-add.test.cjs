const test=require('node:test'),assert=require('node:assert/strict'),C=require('../dot-import-core.js'),D=require('../travel-map-data.js');
const location={name:'地图新地点',city:'西双版纳',cityId:'banna',lat:22,lng:100.8,coordinateSystem:'GCJ02',poiId:'B0001',geoSource:'高德地图 / JS API',locationPending:false,coordinateEvidence:{confirmedAt:'2026-10-26T00:00:00Z',poiId:'B0001',lat:22,lng:100.8}};
test('map addition uses the existing My Pick registry and survives serialization',()=>{
 const original=C.empty('trip'),added=C.addMapPlace(original,location,[],'now',()=> 'manual-1');assert.equal(original.items.length,0);assert.equal(added.result.existing,false);
 const saved=C.validate(JSON.parse(JSON.stringify(added.state)),'trip'),rows=C.mergeCatalog([],saved);assert.equal(rows.length,1);assert.equal(rows[0].choice,'wish');assert.equal(rows[0].place.poiId,'B0001');assert.deepEqual(rows[0].place.coordinateEvidence,location.coordinateEvidence);
});
test('same POI under another name reuses the favorite, photo and schedule identity',()=>{
 const base=[{place:{...location,sourceId:'sight:existing',publicPhotos:[{url:'photo.jpg'}]},city:'西双版纳',choice:'must'}],added=C.addMapPlace(C.empty('trip'),{...location,name:'别名'},base,'now',()=> 'new');
 assert.deepEqual(added.result,{sourceId:'sight:existing',existing:true});const rows=C.mergeCatalog(base,added.state);assert.equal(rows.length,1);assert.equal(rows[0].choice,'must');assert.equal(rows[0].place.publicPhotos[0].url,'photo.jpg');
});
test('repeat adds reuse one source id, while same-name distinct confirmed POIs remain distinct',()=>{
 const first=C.addMapPlace(C.empty('trip'),location,[],'now',()=> 'one');const second=C.addMapPlace(first.state,location,[],'now',()=> 'two');assert.equal(second.result.sourceId,'dot:one');assert.equal(second.state.items.length,1);
 const branch=C.addMapPlace(second.state,{...location,poiId:'B0002'},[],'now',()=> 'branch');assert.equal(branch.state.items.length,2);
});
test('unconfirmed positions and out-of-range coordinates cannot create places',()=>{
 for(const patch of [{coordinateEvidence:null},{lat:100},{lng:300},{cityId:''},{poiId:''}])assert.throws(()=>C.addMapPlace(C.empty('trip'),{...location,...patch},[],'now',()=> 'new'),/确认/);
});
test('new manual point schedules through DailyPlan and retains position evidence',()=>{
 const added=C.addMapPlace(C.empty('trip'),{...location,poiId:'manual:100.8,22'},[],'now',()=> 'new');const context={trip:{tripId:'trip',startDate:'2026-11-01',endDate:'2026-11-01',destinations:[{id:'banna',name:'西双版纳'}],days:[{id:'d1',date:'2026-11-01',cityId:'banna'}]},state:{entries:[],locations:{}},catalog:C.mergeCatalog([],added.state)};
 const request={tripId:'trip',placeId:'dot:new',dayId:'d1',start:'09:00',end:'10:00'},scheduled=D.schedule(context,request,()=> 'visit');assert.equal(scheduled.state.entries[0].place.sourceId,'dot:new');assert.equal(scheduled.state.entries[0].place.poiId,'manual:100.8,22');assert.throws(()=>D.schedule({...context,state:scheduled.state},request,()=> 'dup'),/已经安排/);
});
test('queued map additions roll back on failed persistence and reject a changed trip',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),cache=new Map();let trip='trip',fail=false;
 const env={DotImportCore:C,crypto:{randomUUID:()=> 'test-id'},document:{getElementById:()=>({textContent:JSON.stringify({tripId:trip})}),addEventListener(){}},Event:class{},dispatchEvent(){},addEventListener(){},DailyPlanner:{catalog:()=>[]},TravelStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k),whenReady(){},flushCache:async()=>{if(fail)throw Error('quota');}}};env.window=env;vm.createContext(env);vm.runInContext(fs.readFileSync(require.resolve('../dot-import-store.js'),'utf8'),env);
 fail=true;await assert.rejects(env.DotImports.addMapPlace(location,'trip'),/保存/);assert.equal(cache.size,0);fail=false;await env.DotImports.addMapPlace(location,'trip');assert.equal(env.DotImports.read().items.length,1);
 const next=env.DotImports.addMapPlace({...location,poiId:'other'},'trip');trip='changed';await assert.rejects(next,/旅行已变化/);assert.equal(cache.has('travel-handbook-dot-imports:v1:changed'),false);
});
