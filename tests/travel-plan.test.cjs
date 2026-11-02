'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const root=path.join(__dirname,'../assets/app'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const Plan=require('../assets/app/travel-plan-core.js'),builder=require('../scripts/build-trip.cjs');
function runtime(){
 const window={TravelPlanCore:Plan,TripData:{name:s=>s.replace(/市$/,''),key:builder.cityKey},dispatchEvent(){}},ctx={window,console,CustomEvent:class{},document:{getElementById:()=>({textContent:'{}'})}};
 for(const id of ['trip-data-core','journey-core','daily-plan-core'])vm.runInNewContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1],ctx);
 return window;
}
const fixture=()=>({version:1,title:'贵州回归测试',cities:[{name:'贵阳',countryCode:'CN'},{name:'荔波',countryCode:'CN'},{name:'安顺',countryCode:'CN'}],days:['贵阳','贵阳','荔波','荔波','贵阳','贵阳','贵阳'].map((city,i)=>({city,date:'2027-03-'+String(12+i),alsoCities:i===5?['安顺']:[]})),places:[]});
const state=plan=>({version:2,tripId:'test',initialized:true,transports:[],stays:[],plan});
test('planning without any booking creates native dates, returning-city days and day-trip cities',()=>{
 const w=runtime(),s=w.TravelJourneyCore.clean(state(fixture()),'test'),view=w.TravelJourneyCore.model(s),trip=w.TripData.build(view,s);
 assert.equal(s.stays.length,0);assert.equal(trip.days.length,7);assert.equal(trip.source,'plan');assert.equal(trip.totalNights,6);
 assert.equal(trip.days[4].city,'贵阳');assert.ok(trip.days[5].locationIds.includes(builder.cityKey('安顺')));assert.equal(trip.destinations[0].countryCode,'CN');
 const roundtrip=w.TravelJourneyCore.clean(JSON.parse(JSON.stringify(s)),'test');assert.equal(roundtrip.plan.days.length,7);
});
test('undated plans use stable relative days without inventing dates or visited cities',()=>{
 const p=fixture();p.days.forEach(d=>d.date='');const w=runtime(),s=state(p),trip=w.TripData.build(w.TravelJourneyCore.model(s),s);
 assert.equal(trip.startDate,'');assert.equal(trip.days[0].id,'plan-1');assert.equal(trip.days[6].id,'plan-7');assert.equal(trip.days[0].date,'');
});
test('invalid mixed dates, duplicates and out-of-range spans are rejected',()=>{
 const p=fixture();p.days[1].date='';assert.throws(()=>Plan.clean(p),/连续/);
 const q=fixture();q.cities.push(q.cities[0]);assert.throws(()=>Plan.clean(q),/重复/);
 const w=runtime(),s=state(fixture());s.stays=[{id:'real',city:'贵阳',hotel:'用户订单',checkIn:'2029-01-01',checkOut:'2029-01-03'}];assert.throws(()=>w.TravelJourneyCore.model(s),/366/);
});
test('existing booked dates are unchanged without a plan and take precedence with one',()=>{
 const w=runtime(),s=state(null);s.stays=[{id:'hotel',city:'贵阳',hotel:'用户已订',checkIn:'2027-03-12',checkOut:'2027-03-14'}];
 const before=JSON.stringify(s.stays);let v=w.TravelJourneyCore.model(s);assert.equal(v.days,3);assert.equal(v.planning,undefined);
 s.plan=fixture();v=w.TravelJourneyCore.model(s);assert.equal(v.days,7);assert.equal(JSON.stringify(s.stays),before);
});
test('a researched place gets one linked record across discovery, picks and native daily entries',()=>{
 const p=fixture();p.places=[{id:'jiaxiu',city:'贵阳',kind:'sight',name:'甲秀楼',address:'贵阳南明河畔',description:'回归测试的地点介绍',sources:[{title:'测试来源',url:'https://example.com/jiaxiu',checkedAt:'2026-11-02'}]}];p.days[0].stops=[{placeId:'jiaxiu',slot:'afternoon'}];
 const pack=builder.compile(p,__dirname,'test'),w=runtime(),trip=w.TripData.build(w.TravelJourneyCore.model(pack.journey),pack.journey);
 assert.equal(pack.imports.items[0].choice,'wish');assert.equal(pack.daily.entries[0].place.sourceId,pack.imports.items[0].sourceId);assert.ok(w.DailyPlanCore.active(pack.daily.entries[0],trip));assert.equal(pack.report.warnings.length,3);
 const second=builder.compile(p,__dirname,'test');assert.equal(second.daily.entries[0].id,pack.daily.entries[0].id);
});
test('missing city/address, incompatible day and duplicate place cannot become an incomplete guide',()=>{
 const p=fixture(),entry={id:'dish',city:'',kind:'food',name:'冰浆',description:'美食',sources:[]};p.places=[entry];assert.throws(()=>builder.compile(p,__dirname),/城市/);
 entry.city='贵阳';assert.throws(()=>builder.compile(p,__dirname),/具体地址/);
 entry.address='地址';entry.sources=[{title:'来源',url:'https://example.com',checkedAt:'2026-11-02'}];p.days[2].stops=[{placeId:'dish'}];assert.throws(()=>builder.compile(p,__dirname),/不匹配/);
});
test('photo bytes and credit survive JSON export without a local filesystem dependency',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'travel-photo-test-'));
 try {fs.writeFileSync(path.join(temp,'fixture.jpg'),Buffer.from([255,216,255,217]));const p=fixture();p.cover={file:'fixture.jpg',sourceURL:'https://example.com/license',credit:'Synthetic unit test',license:'CC0',width:800,height:600};
 const pack=builder.compile(p,temp);assert.match(pack.journey.plan.cover.url,/^data:image\/jpeg/);assert.equal(JSON.parse(JSON.stringify(pack)).journey.plan.cover.credit,'Synthetic unit test');}
 finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('map tiles and cover source are not replaced by the publication sanitizer',()=>{
 assert.ok(html.includes("tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png'"));
 assert.ok(!fs.readFileSync(path.join(root,'better-interface.css'),'utf8').includes('content:url("assets/demo-landscape.svg")'));
});
test('returning cities count only their own nights and day-trip transfers leave from the same day city',()=>{
 const w=runtime(),s=state(fixture()),view=w.TravelJourneyCore.model(s),checks=w.TravelJourneyCore.checkRoute(view);
 assert.equal(checks.stops.get('贵阳').nightCount,4);assert.equal(checks.stops.get('荔波').nightCount,2);
 assert.equal(checks.stops.get('安顺').nightCount,0);
 assert.deepEqual(Array.from(checks.stops.get('贵阳').issues,i=>[i.checkIn,i.checkOut]),[['2027-03-12','2027-03-14'],['2027-03-16','2027-03-18']]);
 assert.ok(checks.legs.some(l=>l.from==='贵阳'&&l.to==='安顺'&&l.date==='2027-03-17'));assert.ok(!checks.legs.some(l=>l.from==='荔波'&&l.to==='安顺'));
});
test('city aliases match planner IDs and researched coordinates retain auditable evidence',()=>{
 const p=fixture();p.cities[0].name='贵阳市';p.days.filter(d=>d.city==='贵阳').forEach(d=>d.city='贵阳市');
 p.places=[{id:'test',name:'坐标测试地点',city:'贵阳市',kind:'sight',address:'回归测试地址',description:'测试',sources:[{title:'坐标资料',url:'https://example.com/poi',checkedAt:'2026-11-02'}],location:{lat:26.57,lng:106.71,coordinateSystem:'WGS84',sourceURL:'https://example.com/poi'}}];p.days[0].stops=[{placeId:'test'}];
 const pack=builder.compile(p,__dirname),place=pack.imports.items[0].place;
 assert.equal(place.cityId,builder.cityKey('贵阳'));assert.equal(pack.journey.plan.cities[0].name,'贵阳');assert.equal(place.coordinateEvidence.matchMethod,'researched-reference');assert.equal(place.coordinateEvidence.poiId,place.poiId);assert.equal(place.coordinateEvidence.lat,place.lat);
});
function destinationFixture(cities, dates){
 return {version:1,title:'跨目的地集成测试',cities,days:dates.map((date,i)=>({date,city:cities[i%cities.length].name,stops:[{placeId:'place-'+(i%cities.length),slot:'afternoon'}]})),places:cities.map((c,i)=>({id:'place-'+i,city:c.name,kind:'sight',name:'集成测试地点 '+i,address:c.name+' 测试地址',description:'仅用于数据关联测试，不是旅行推荐。',sources:[{title:'合成测试来源',url:'https://example.com/test-'+i,checkedAt:'2026-11-02'}]}))};
}
function assertDestinationLinks(profile){
 const pack=builder.compile(profile,__dirname,'generic-test'),w=runtime(),s=w.TravelJourneyCore.clean(JSON.parse(JSON.stringify(pack.journey)),'generic-test'),trip=w.TripData.build(w.TravelJourneyCore.model(s),s);
 assert.deepEqual(Array.from(trip.destinations,d=>d.countryCode),profile.cities.map(c=>c.countryCode));
 assert.equal(pack.journey.transports.length,0);assert.equal(pack.journey.stays.length,0);
 for(const e of pack.daily.entries){
  assert.ok(w.DailyPlanCore.active(e,trip),e.place.city+' must belong to its native day');
  assert.ok(trip.destinations.some(d=>d.id===e.place.cityId));
  assert.equal(pack.imports.items.find(i=>i.sourceId===e.place.sourceId).choice,'wish');
 }
 const map=require('../assets/app/travel-map-data.js').snapshot({trip,state:pack.daily,catalog:pack.imports.items.map(i=>({place:i.place,city:i.city,choice:i.choice}))});
 assert.equal(map.places.length,profile.places.length);
 assert.equal(new Set(map.places.map(p=>p.sourceId)).size,profile.places.length);
 return {pack,trip,map};
}
test('another domestic route supports returning cities across the year boundary',()=>{
 const p=destinationFixture([{name:'成都市',countryCode:'CN'},{name:'乐山',countryCode:'CN'}],['2026-12-31','2027-01-01','2027-01-02']);
 const {trip}=assertDestinationLinks(p);
 assert.deepEqual(Array.from(trip.days,d=>d.date),p.days.map(d=>d.date));
 assert.deepEqual(Array.from(trip.days,d=>d.city),['成都','乐山','成都']);
 assert.equal(trip.totalNights,2);
});
test('overseas countries and accented or non-ASCII city names retain native map and daily links',()=>{
 const p=destinationFixture([{name:'京都',countryCode:'JP'},{name:'São Paulo',countryCode:'BR'},{name:'Reykjavík',countryCode:'IS'}],['','','']);
 const {trip}=assertDestinationLinks(p);
 assert.deepEqual(Array.from(trip.days,d=>d.id),['plan-1','plan-2','plan-3']);
 assert.ok(trip.destinations.every(d=>d.timezone!=='Asia/Shanghai'));
});
test('fullwidth names and repeated spaces normalize identically in compiler and native UI',()=>{
 const p=destinationFixture([{name:'Ｎｅｗ　　Ｙｏｒｋ',countryCode:'US'}],['2028-02-28','2028-02-29','2028-03-01']);
 const {trip,pack}=assertDestinationLinks(p);
 assert.equal(trip.destinations[0].name,'New York');
 assert.equal(pack.journey.plan.cities[0].name,'New York');
 assert.equal(trip.destinations[0].id,builder.cityKey('New York'));
});
test('existing regional aliases stay compatible without adding destination-specific renderers',()=>{
 const p=destinationFixture([{name:'西双版纳傣族自治州',countryCode:'CN'}],['']);
 const {trip,pack}=assertDestinationLinks(p);
 assert.equal(trip.destinations[0].id,'banna');
 assert.equal(pack.journey.plan.cities[0].name,'西双版纳');
});
test('a new user cannot install an all-text package as a finished visual trip',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'travel-onboarding-'));
 try {
  const workspace=path.join(temp,'app');fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace,'.travel-atlas-workspace.json'),JSON.stringify({app:'travel-atlas',version:1}));
  fs.copyFileSync(path.join(root,'index.html'),path.join(workspace,'index.html'));
  fs.writeFileSync(path.join(workspace,'travel-plan-seed.js'),'existing content');
  const file=path.join(temp,'trip.json');fs.writeFileSync(file,JSON.stringify(fixture()));
  assert.throws(()=>builder.install(file,workspace),/图文规划尚未完成/);
  assert.equal(fs.readFileSync(path.join(workspace,'travel-plan-seed.js'),'utf8'),'existing content');
  const report=builder.install(file,workspace,{allowIncomplete:true});
  assert.equal(report.visualReady,false);assert.ok(report.missingPhotos.includes('城市：安顺'));
  assert.equal(report.days,7);
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
test('photo readiness checks cover, city and place images independently',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'travel-visual-gate-'));
 try {
  fs.writeFileSync(path.join(temp,'fixture.jpg'),Buffer.from([255,216,255,217]));
  const photo={file:'fixture.jpg',sourceURL:'https://example.com/photo',credit:'Synthetic fixture',license:'CC0',width:800,height:600};
  const p=destinationFixture([{name:'杭州',countryCode:'CN'}],['']);p.cover=photo;p.cities[0].photo=photo;
  let report=builder.compile(p,temp).report;assert.equal(report.visualReady,false);assert.deepEqual(report.missingPhotos,['地点：集成测试地点 0']);
  p.places[0].photo=photo;report=builder.compile(p,temp).report;assert.equal(report.visualReady,true);assert.deepEqual(report.missingPhotos,[]);
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
test('a first trip without dates opens the map and keeps D1 and D2 separate',()=>{
 const p=destinationFixture([{name:'杭州',countryCode:'CN'},{name:'苏州',countryCode:'CN'}],['','']);
 const {map,pack,trip}=assertDestinationLinks(p),MapCore=require('../assets/app/travel-map-core.js'),Data=require('../assets/app/travel-map-data.js');
 assert.deepEqual(Array.from(MapCore.tripDates(map.trip)),['plan-1','plan-2']);
 assert.equal(MapCore.mapPlaces(map.places,{trip:map.trip}).length,2);
 assert.deepEqual(MapCore.dayEntries(map.places,{trip:map.trip,date:'plan-2'}).map(e=>e.place.city),['苏州']);
 assert.equal(MapCore.tripVisits(map.places[0],map.trip)[0].date,'');
 const newPlace={...pack.imports.items[1].place,sourceId:'new-stop',name:'新的测试地点'};
 const input={trip,state:pack.daily,catalog:[...pack.imports.items.map(i=>({place:i.place,choice:i.choice})),{place:newPlace,choice:'wish'}]};
 const saved=Data.schedule(input,{tripId:trip.tripId,placeId:newPlace.sourceId,dayId:'plan-2',slot:'afternoon'},()=> 'new-entry');
 assert.equal(saved.result.dayId,'plan-2');assert.ok(!saved.result.date);
 assert.throws(()=>Data.schedule({...input,state:saved.state},{tripId:trip.tripId,placeId:newPlace.sourceId,dayId:'plan-2'},()=> 'duplicate'),/已经安排/);
 assert.throws(()=>Data.schedule(input,{tripId:trip.tripId,placeId:newPlace.sourceId,dayId:'plan-1'},()=> 'wrong-city'),/城市/);
});
