const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../travel-map-data.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){return{
 trip:{tripId:'trip-1',startDate:'2026-09-25',endDate:'2026-09-28',destinations:[{id:'banna',name:'西双版纳'},{id:'puer',name:'普洱'}],days:[{id:'2026-09-25',date:'2026-09-25',cityId:'banna',locationIds:['banna']},{id:'2026-09-26',date:'2026-09-26',cityId:'banna',locationIds:['banna']},{id:'2026-09-27',date:'2026-09-27',cityId:'puer',locationIds:['puer']},{id:'2026-09-28',date:'2026-09-28',cityId:'puer',locationIds:['banna','puer']}]},
 catalog:[{choice:'wish',city:'西双版纳',photo:'assets/manting.jpg',intro:'散步看园林。这里还有一段。',place:{sourceId:'sight:manting',name:'曼听公园',cityId:'banna',kind:'sight',lat:21.99,lng:100.8,geoSource:'手册参考位置，入口请核对',custom:'keep'}},{choice:'wish',city:'西双版纳',place:{sourceId:'dot:g1',name:'曼听公园',cityId:'banna',kind:'sight'}},{choice:null,city:'西双版纳',place:{sourceId:'sight:temple',name:'总佛寺',cityId:'banna',kind:'sight'}},{choice:'must',city:'普洱',place:{sourceId:'sight:tea',name:'茶马古道',cityId:'puer',kind:'sight'}}],
 state:{version:1,unknown:{saved:true},entries:[{id:'v1',dayId:'2026-09-25',slot:'afternoon',time:'14:00',endTime:'16:00',extra:{keep:true},place:{sourceId:'dot:g1',name:'曼听公园',cityId:'banna',kind:'sight'}},{id:'v2',dayId:'2026-09-25',slot:'evening',time:'',place:{sourceId:'sight:temple',name:'总佛寺',cityId:'banna'}},{id:'foreign',tripId:'trip-other',dayId:'2026-09-25',slot:'morning',place:{sourceId:'sight:manting',name:'曼听公园',cityId:'banna'}},{id:'old',dayId:'2025-09-25',slot:'morning',place:{sourceId:'sight:manting',name:'曼听公园',cityId:'banna'}},{id:'note',type:'note',text:'休息',dayId:'2026-09-25',slot:'evening'}],locations:{unrelated:{lat:10,lng:20}}},fixedByDay:[]};}
const params=(extra={})=>({placeId:'sight:manting',dayId:'2026-09-26',start:'09:30',end:'11:00',tripId:'trip-1',...extra});
const confirmation={cityId:'banna',lat:21.991,lng:100.809,confirmed:true,coordinateSystem:'GCJ02',source:'高德地图',poiId:'B123456789',address:'景洪市测试地址',confirmedAt:'2026-10-24T00:00:00Z'};

test('real My Pick rows and same-place sources share one pin with active visits only',()=>{
 const input=fixture(),before=clone(input),data=M.snapshot(input),p=data.places.find(p=>p.id==='sight:manting');
 assert.equal(data.places.length,3);assert.equal(p.wish,true);assert.deepEqual(p.memberIds,['sight:manting','dot:g1']);assert.deepEqual(p.visits.map(v=>v.id),['v1']);assert.equal(p.visits[0].date,'2026-09-25');assert.equal(p.photo,'assets/manting.jpg');assert.equal(p.intro,'散步看园林。');assert.deepEqual(input,before);
 assert.equal(data.places.find(p=>p.id==='sight:temple').wish,false);assert.equal(data.places.find(p=>p.id==='sight:temple').visits.length,1);
});
test('unverified reference coordinates remain retained but pending',()=>{const p=M.snapshot(fixture()).places[0];assert.equal(p.lat,21.99);assert.equal(p.confirmed,false);assert.equal(p.locationPending,true);});
test('notes, foreign trip records and former dates do not create map visits',()=>{const data=M.snapshot(fixture());assert.equal(data.places.some(p=>p.name==='休息'),false);assert.deepEqual(data.places.flatMap(p=>p.visits.map(v=>v.id)),['v1','v2']);});
test('source city changes hide stale assignments without changing stored records',()=>{const input=fixture();input.catalog[1].place.cityId='puer';const before=clone(input.state);assert.equal(M.snapshot(input).places.flatMap(p=>p.visits).some(v=>v.id==='v1'),false);assert.deepEqual(input.state,before);});
test('new schedule uses existing daily IDs and preserves unrelated fields and source metadata',()=>{const input=fixture(),before=clone(input),out=M.schedule(input,params(),()=> 'new');assert.equal(out.result.id,'new');assert.equal(out.result.dayId,'2026-09-26');assert.equal(out.result.time,'09:30');assert.equal(out.result.endTime,'11:00');assert.equal(out.result.slot,'morning');assert.equal(out.result.place.custom,'keep');assert.deepEqual(out.state.unknown,input.state.unknown);assert.deepEqual(out.state.entries.slice(0,-1),input.state.entries);assert.deepEqual(input,before);});
test('duplicate source aliases on the same day are rejected',()=>{assert.throws(()=>M.schedule(fixture(),params({dayId:'2026-09-25'}),()=> 'new'),/已经安排/);});
test('same place can be scheduled on another day, without turning other places into picks',()=>{const input=fixture(),out=M.schedule(input,params({placeId:'sight:temple'}),()=> 'new');const data=M.snapshot({...input,state:out.state});assert.equal(data.places.find(p=>p.id==='sight:temple').wish,false);assert.equal(data.places.find(p=>p.id==='sight:temple').visits.length,2);});
test('wrong trip, non-trip date and wrong city cannot be saved',()=>{for(const override of [{tripId:'other'},{dayId:'2030-01-01'},{dayId:'2026-09-27'}])assert.throws(()=>M.schedule(fixture(),params(override),()=> 'new'));});
test('transfer days accept a place from either recorded city',()=>{assert.equal(M.schedule(fixture(),params({dayId:'2026-09-28'}),()=> 'new').result.dayId,'2026-09-28');});
test('time ranges validate both clocks and preserve requested period when empty',()=>{for(const pair of [['09:00',''],['','10:00'],['11:00','09:00'],['24:00','25:00']])assert.throws(()=>M.schedule(fixture(),params({start:pair[0],end:pair[1]}),()=> 'new'));assert.equal(M.schedule(fixture(),params({start:'',end:'',slot:'evening'}),()=> 'new').result.slot,'evening');});
test('manual scheduled points are available in day mode without artificial My Pick',()=>{const input=fixture();input.state.entries.push({id:'manual',dayId:'2026-09-26',slot:'morning',place:{name:'用户地点',cityId:'banna',address:'用户地址'}});const p=M.snapshot(input).places.find(p=>p.id==='entry:manual');assert.equal(p.wish,false);assert.equal(p.confirmed,false);assert.equal(p.visits[0].dayId,'2026-09-26');});
test('fixed endpoints share their existing location key and are read-only schedules',()=>{const input=fixture(),fixed={id:'fixed:end:h1',fixed:true,locationKey:'stay:h1|酒店',place:{name:'酒店',cityId:'banna',kind:'hotel'},slot:'evening',edge:'end'};input.fixedByDay=[{dayId:'2026-09-25',entries:[fixed]},{dayId:'2026-09-26',entries:[{...fixed,id:'fixed:start:h1',edge:'start'}]}];const p=M.snapshot(input).places.find(p=>p.kind==='hotel');assert.equal(p.fixed,true);assert.equal(p.visits.length,2);assert.deepEqual(p._locationKeys,['stay:h1|酒店']);assert.throws(()=>M.schedule(input,params({placeId:p.id}),()=> 'new'),/订单/);});
test('confirmed Amap coordinates persist in existing location slots and same-source visits',()=>{
 const input=fixture(),before=clone(input),out=M.confirmLocation(input,'sight:manting',confirmation,'trip-1');
 for(const id of ['sight:manting','dot:g1']){const p=out.state.locations['source:'+id];assert.equal(p.coordinateSystem,'GCJ02');assert.equal(p.coordinateEvidence.poiId,confirmation.poiId);}
 assert.equal(out.state.entries[0].place.lat,confirmation.lat);assert.deepEqual(out.state.entries[0].extra,{keep:true});assert.deepEqual(out.state.entries[2],input.state.entries[2]);assert.deepEqual(out.state.entries[3],input.state.entries[3]);assert.deepEqual(out.state.locations.unrelated,input.state.locations.unrelated);assert.deepEqual(input,before);
 const reloaded=M.snapshot({...input,state:clone(out.state)}).places[0];assert.equal(reloaded.confirmed,true);assert.equal(reloaded.coordinateSystem,'GCJ02');assert.equal(reloaded.lat,confirmation.lat);assert.equal(reloaded.wish,true);
});
test('a confirmed slot is ignored after its source city or name changes',()=>{const input=fixture(),out=M.confirmLocation(input,'sight:manting',confirmation,'trip-1');input.state=out.state;input.catalog[0].place.name='另一地点';input.catalog[0].place.cityId='puer';const p=M.snapshot(input).places.find(p=>p.id==='sight:manting');assert.equal(p.confirmed,false);});
test('confirmation requires explicit matched location and current trip',()=>{for(const bad of [{...confirmation,confirmed:false},{...confirmation,lat:NaN},{...confirmation,cityId:'puer'},{...confirmation,coordinateSystem:'BD09'}])assert.throws(()=>M.confirmLocation(fixture(),'sight:manting',bad,'trip-1'));assert.throws(()=>M.confirmLocation(fixture(),'sight:manting',confirmation,'other'));});
test('confirmed fixed location uses the existing order location key',()=>{const input=fixture();input.fixedByDay=[{dayId:'2026-09-25',entries:[{id:'fixed:end:h',locationKey:'stay:h',place:{name:'酒店',cityId:'banna',kind:'hotel'},slot:'evening'}]}];const out=M.confirmLocation(input,'location:stay:h',confirmation,'trip-1');assert.equal(out.state.locations['stay:h'].lat,confirmation.lat);assert.equal(out.state.entries.length,input.state.entries.length);});
test('an already located place can be corrected and retains the search name/address across reload',()=>{
 const input=fixture();input.state=M.confirmLocation(input,'sight:manting',confirmation,'trip-1').state;
 const expected=M.snapshot(input).places.find(p=>p.id==='sight:manting'),before=clone(input);
 const updated={...confirmation,poiId:'B-CORRECTED',lat:21.997,lng:100.805,address:'景洪市曼听路35号',locationQuery:'曼听路35号 曼听御花园',locationName:'曼听御花园景区'};
 const out=M.confirmLocation(input,expected.id,updated,'trip-1',expected),reloaded=M.snapshot({...input,state:clone(out.state)}).places.find(p=>p.id===expected.id);
 assert.equal(reloaded.poiId,'B-CORRECTED');assert.equal(reloaded.address,updated.address);assert.equal(reloaded._place.locationQuery,updated.locationQuery);
 assert.equal(reloaded._place.locationName,updated.locationName);
 assert.equal(reloaded.wish,true);assert.deepEqual(reloaded.visits,expected.visits);assert.equal(out.state.entries[0].place.poiId,'B-CORRECTED');
 assert.equal(out.state.locations['source:dot:g1'].poiId,'B-CORRECTED');assert.deepEqual(out.state.entries.slice(1),before.state.entries.slice(1));assert.deepEqual(input,before);
});
test('manual location corrections reject stale identity or newer location changes',()=>{
 const input=fixture(),expected=M.snapshot(input).places.find(p=>p.id==='sight:manting');
 input.state=M.confirmLocation(input,expected.id,confirmation,'trip-1').state;
 const before=clone(input);assert.throws(()=>M.confirmLocation(input,expected.id,{...confirmation,poiId:'STALE'},'trip-1',expected),/重新搜索/);assert.deepEqual(input,before);
});
test('legacy daily cleaner retains unknown saved fields when new map updates occur',()=>{const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),context={window:{}};vm.runInNewContext(html.match(/<script[^>]*id="daily-plan-core"[^>]*>([\s\S]*?)<\/script>/)[1],context);const saved=clone(context.window.DailyPlanCore.clean(fixture().state));assert.deepEqual(saved.unknown,{saved:true});assert.deepEqual(saved.entries[0].extra,{keep:true});assert.equal(saved.entries[2].tripId,'trip-other');});
test('map numbers follow the official daily sequence with notes and fixed endpoints',()=>{const input=fixture();input.state.entries[0].slot='afternoon';input.state.entries[1].slot='morning';input.fixedByDay=[{dayId:'2026-09-25',entries:[{id:'fixed:start:h',locationKey:'stay:h',place:{name:'酒店',cityId:'banna',kind:'hotel'},slot:'morning',edge:'start'},{id:'fixed:depart:f',locationKey:'depart:f',place:{name:'机场',cityId:'banna',kind:'flight'},slot:'afternoon',time:'13:00'}]}];input.orderByDay=[{dayId:'2026-09-25',ids:['fixed:start:h','v2','fixed:depart:f','v1','note']}];const visits=M.snapshot(input).places.flatMap(p=>p.visits).sort((a,b)=>a.order-b.order);assert.deepEqual(visits.map(v=>v.id),['fixed:start:h','v2','fixed:depart:f','v1']);assert.deepEqual(visits.map(v=>v.order),[0,1,2,3]);});
test('unknown coordinate systems and mismatched coordinate evidence stay pending',()=>{for(const extra of [{coordinateSystem:'BD09'},{coordinateSystem:'WGS84',coordinateEvidence:{poiId:'osm:N:123',lat:1,lng:1,confirmedAt:'now'}}]){const input=fixture();Object.assign(input.catalog[0].place,{poiId:'osm:N:123',geoSource:'OpenStreetMap / Photon'},extra);assert.equal(M.snapshot(input).places[0].confirmed,false);}});
test('explicit edits in the existing daily editor release obsolete shared location overrides',()=>{const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),source=html.match(/ function releaseSourceLocation\(previous,next\)\{([\s\S]*?)\n \}/)[0],prior={sourceId:'sight:manting',name:'曼听公园',aliases:['曼听御花园'],cityId:'banna',address:'旧地址',lat:21.9,lng:100.8,coordinateSystem:'GCJ02',coordinateEvidence:{confirmedAt:'now'}};const sandbox={state:{locations:{'source:sight:manting':{...prior},'source:dot:other':{...prior,name:'曼听御花园'},'source:sight:tea':{name:'茶马古道',cityId:'puer'}}}};vm.runInNewContext(source,sandbox);sandbox.releaseSourceLocation(prior,clone(prior));assert.equal(Object.keys(sandbox.state.locations).length,3);sandbox.releaseSourceLocation(prior,{...prior,lat:22.1,coordinateSystem:undefined,coordinateEvidence:undefined});assert.deepEqual(Object.keys(sandbox.state.locations),['source:sight:tea']);});

function automaticRequest(input,placeId='sight:manting',extra={}){
 return {placeId,expected:clone(M.snapshot(input).places.find(p=>p.id===placeId)),place:{...confirmation,...extra}};
}
test('automatic POI batches persist both locations and provenance across reload',()=>{
 const input=fixture(),requests=[automaticRequest(input),automaticRequest(input,'sight:temple',{poiId:'B987654321',lat:21.989,lng:100.807})];
 const out=M.confirmMatchedLocations(input,requests,'trip-1');
 assert.deepEqual(out.result.saved,['sight:manting','sight:temple']);
 const reloaded=M.snapshot({...input,state:clone(out.state)});
 for(const request of requests){
  const place=reloaded.places.find(p=>p.id===request.placeId);
  assert.equal(place.confirmed,true);assert.equal(place.locationPending,false);assert.equal(place.poiId,request.place.poiId);
  assert.equal(place.coordinateEvidence.matchMethod,'automatic');assert.equal(place.coordinateEvidence.provider,'amap');
  assert.equal(place.coordinateEvidence.confirmedAt,confirmation.confirmedAt);
 }
 assert.equal(out.state.locations['source:dot:g1'].coordinateEvidence.matchMethod,'automatic');
 assert.equal(out.state.entries.find(e=>e.id==='v1').place.poiId,confirmation.poiId);
 assert.equal(out.state.entries.find(e=>e.id==='v2').place.poiId,'B987654321');
});
test('stale automatic search results cannot replace a changed place identity or coordinate',()=>{
 for(const [field,value] of Object.entries({id:'other',name:'另一景点',cityId:'puer',address:'用户改过的地址',coordinateSystem:'GCJ02',lat:22.5,lng:101.5})){
  const input=fixture(),request=automaticRequest(input),before=clone(input);request.expected[field]=value;
  const out=M.confirmMatchedLocations(input,[request],'trip-1');
  assert.deepEqual(out.result.saved,[],field);assert.deepEqual(out.state,before.state,field);assert.deepEqual(input,before,field);
 }
 const input=fixture(),request=automaticRequest(input);delete request.expected;
 assert.deepEqual(M.confirmMatchedLocations(input,[request,{...request,placeId:'deleted'}],'trip-1').result.saved,[]);
});
test('a manual confirmation made while automatic search is running takes precedence',()=>{
 const input=fixture(),queued=automaticRequest(input),manual={...confirmation,poiId:'BMANUAL001',lat:22.02,lng:100.82};
 input.state=M.confirmLocation(input,'sight:manting',manual,'trip-1').state;
 const before=clone(input),out=M.confirmMatchedLocations(input,[queued],'trip-1');
 assert.deepEqual(out.result.saved,[]);assert.deepEqual(out.state,before.state);assert.deepEqual(input,before);
 const saved=M.snapshot({...input,state:out.state}).places.find(p=>p.id==='sight:manting');
 assert.equal(saved.poiId,manual.poiId);assert.equal(saved.coordinateEvidence.matchMethod,'user-confirmed');
});
test('automatic batches reject another trip without partially changing existing data',()=>{
 const input=fixture(),before=clone(input);
 assert.throws(()=>M.confirmMatchedLocations(input,[automaticRequest(input)],'trip-other'),/当前旅行已变化/);
 assert.deepEqual(input,before);
});
test('automatic location saves retain unrelated records, schedule timing and custom fields',()=>{
 const input=fixture(),before=clone(input),out=M.confirmMatchedLocations(input,[automaticRequest(input)],'trip-1');
 assert.deepEqual(input,before);assert.deepEqual(out.state.unknown,before.state.unknown);assert.deepEqual(out.state.locations.unrelated,before.state.locations.unrelated);
 assert.deepEqual(out.state.entries.slice(1),before.state.entries.slice(1));
 const updated=out.state.entries[0],original=before.state.entries[0];
 for(const key of Object.keys(original).filter(key=>key!=='place'))assert.deepEqual(updated[key],original[key],key);
 assert.equal(updated.place.sourceId,original.place.sourceId);assert.equal(updated.place.name,original.place.name);assert.equal(updated.place.kind,original.place.kind);
 assert.deepEqual(input.catalog,before.catalog);
});
test('choosing a Photon library result supplies reusable user-confirmed position evidence',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),branch=html.split('\n').find(line=>line.includes('if(d.dpOnlinePlace!==undefined)'));
 assert.ok(branch,'daily library selection branch exists');
 const candidate={name:'用户选择的地点',cityId:'banna',lat:21.995,lng:100.81,poiId:'osm:W:123',geoSource:'OpenStreetMap / Photon',coordinateSystem:'WGS84',kind:'manual'},calls=[];
 const sandbox={d:{dpOnlinePlace:'0'},librarySearchRows:[clone(candidate)],close:id=>calls.push(['close',id]),openEditor:(entry,place)=>calls.push(['edit',entry,clone(place)])};
 vm.runInNewContext('(function(){'+branch+'})()',sandbox);
 assert.deepEqual(calls[0],['close','dp-library']);assert.equal(calls[1][1],null);
 const selected=calls[1][2];assert.equal(selected.coordinateEvidence.matchMethod,'user-confirmed');assert.equal(selected.coordinateEvidence.poiId,candidate.poiId);assert.ok(selected.coordinateEvidence.confirmedAt);
 const input=fixture();input.state.entries.push({id:'from-library',dayId:'2026-09-25',slot:'morning',place:selected});
 const mapped=M.snapshot(input).places.find(p=>p.name===candidate.name);assert.equal(mapped.confirmed,true);assert.equal(mapped.coordinateSystem,'WGS84');assert.equal(mapped.lat,candidate.lat);
 assert.deepEqual(sandbox.librarySearchRows[0],candidate);
});

test('raw merged daily-place edits invalidate queued POI results even while catalog display stays the same',()=>{
 for(const patch of [{lat:22.12,lng:101.2},{address:'用户更改过的地址'},{name:'用户重新命名的地方'},{coordinateSystem:'GCJ02'},{poiId:'user-picked'}]){
  const input=fixture(),request=automaticRequest(input);Object.assign(input.state.entries[0].place,patch);
  const before=clone(input.state),out=M.confirmMatchedLocations(input,[request],'trip-1');
  assert.deepEqual(out.result.saved,[],JSON.stringify(patch));assert.deepEqual(out.state,before);
 }
});
test('explicit location edits remain protected from later automatic searches and refresh',()=>{
 const input=fixture();input.state.entries[0].place.locationAutoMatchBlocked=true;
 const request=automaticRequest(input),before=clone(input.state);
 assert.equal(request.expected.autoLocationAllowed,false);
 const out=M.confirmMatchedLocations(input,[request],'trip-1');assert.deepEqual(out.result.saved,[]);assert.deepEqual(out.state,before);
 input.state=M.confirmLocation(input,'sight:manting',confirmation,'trip-1').state;
 assert.equal(M.snapshot(input).places[0].confirmed,true);assert.equal(input.state.entries[0].place.locationAutoMatchBlocked,false);
});
test('editing schedule time without editing its location does not invalidate a location lookup',()=>{
 const input=fixture(),request=automaticRequest(input);input.state.entries[0].time='15:00';input.state.entries[0].endTime='17:00';
 const out=M.confirmMatchedLocations(input,[request],'trip-1');assert.deepEqual(out.result.saved,['sight:manting']);assert.equal(out.state.entries[0].time,'15:00');
});
