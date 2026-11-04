const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../travel-map-match.js');
const place=(changes={})=>({name:'曼听御花园',cityId:'banna',kind:'sight',...changes});
const poi=(changes={})=>({id:'B123',name:'曼听御花园',lng:100.795,lat:21.991,cityId:'banna',city:'西双版纳傣族自治州',adcode:'532801',provider:'amap',coordinateSystem:'GCJ02',source:'高德地图 / JS API',...changes});

test('unique complete exact identity is accepted without mutating either input',()=>{
 const p=Object.freeze(place()),c=Object.freeze(poi());assert.equal(M.evaluate(p,Object.freeze([c])),c);
});
test('normalization handles spacing and punctuation but keeps branch content',()=>{
 assert.equal(M.normalizeName(' 曼听 · 御花园 '),'曼听御花园');
 assert.equal(M.normalizeName('曼听御花园（东门）'),'曼听御花园东门');
 assert.equal(M.evaluate(place(),[poi({name:'曼听御花园（东门）'})]),null);
});
test('entrances, parking, shops and subareas never match a parent name by containment',()=>{
 for(const suffix of ['东门','停车场','售票处','园内餐厅','服务中心','御象咖啡店','白塔','东区'])assert.equal(M.evaluate(place(),[poi({name:'曼听御花园'+suffix})]),null);
});
test('curated Manting garden/park alias can identify the same Banna POI',()=>{
 const c=poi({name:'曼听公园'});assert.equal(M.evaluate(place(),[c]),c);
});
test('curated total Buddhist temple alias stays within Banna',()=>{
 const c=poi({name:'总佛寺'});assert.equal(M.evaluate(place({name:'西双版纳总佛寺'}),[c]),c);
 assert.equal(M.evaluate(place({name:'西双版纳总佛寺',cityId:'puer'}),[poi({name:'总佛寺',cityId:'puer',adcode:'530802',lat:22.78,lng:100.97})]),null);
});
test('Chinese Academy abbreviation and named botanical garden aliases match',()=>{
 const c=poi({name:'中国科学院西双版纳热带植物园'});assert.equal(M.evaluate(place({name:'中科院西双版纳热带植物园'}),[c]),c);
 assert.equal(M.evaluate(place({name:'中科院西双版纳热带植物园'}),[poi({name:'西双版纳热带植物园'})])?.id,'B123');
});
test('explicit full aliases are supported from canonical source metadata',()=>{
 const c=poi({name:'曼贺纳古寨'});assert.equal(M.evaluate(place({name:'曼贺',_place:{aliases:['曼贺纳古寨']}}),[c]),null);
 assert.equal(M.evaluate(place({name:'西双版纳曼贺纳古寨',_place:{aliases:['曼贺纳古寨']}}),[c]),c);
});
test('generic or underspecified names are never auto-resolved even with one search result',()=>{
 for(const name of ['公园','热带植物园','酒店','西双','佛寺','古寨','夜市','机场'])assert.equal(M.evaluate(place({name}),[poi({name})]),null);
});
test('generic explicit alias cannot bypass a specific name',()=>{
 assert.equal(M.evaluate(place({name:'某个很具体的花园',aliases:['公园']}),[poi({name:'公园'})]),null);
});
test('manual entries and hotels require their complete original name, not aliases',()=>{
 for(const kind of ['manual','hotel','stay','lodging']){
  const p=place({name:'西双版纳花间堂酒店',kind,aliases:['景洪花间堂酒店']});
  const c=poi({name:p.name});assert.equal(M.evaluate(p,[c]),c);
  assert.equal(M.evaluate(p,[poi({name:'景洪花间堂酒店'})]),null);
 }
});
test('two exact name branches with different POI IDs stay unresolved',()=>{
 assert.equal(M.evaluate(place(),[poi(),poi({id:'B456',lng:100.81})]),null);
});
test('an exact name and a curated alias with different IDs are also ambiguous',()=>{
 assert.equal(M.evaluate(place(),[poi(),poi({id:'B456',name:'曼听公园'})]),null);
});
test('repeated identical results with the same POI ID are deduplicated',()=>{
 const c=poi();assert.equal(M.evaluate(place(),[c,{...c}]),c);
});
test('inconsistent copies of the same POI ID are never accepted',()=>{
 for(const changes of [{lng:100.81},{name:'曼听御花园东门'},{adcode:'530802'}])assert.equal(M.evaluate(place(),[poi(),poi(changes)]),null);
});
test('related nonmatching sub-POIs do not prevent a unique exact parent match',()=>{
 const c=poi();assert.equal(M.evaluate(place(),[poi({id:'B456',name:'曼听御花园东门'}),c]),c);
});
test('city administrative code is mandatory even if a city label looks correct',()=>{
 for(const adcode of ['',undefined,'5328','5328011','530802'])assert.equal(M.evaluate(place(),[poi({adcode})]),null);
});
test('candidate city ID and geographic bounds must agree with target city',()=>{
 for(const changes of [{cityId:'kunming'},{lng:121.5},{lat:25.05},{lat:NaN},{lng:'100.795'},{lat:Infinity}])assert.equal(M.evaluate(place(),[poi(changes)]),null);
});
test('only real Amap GCJ02 candidates with identity and source qualify',()=>{
 for(const changes of [{provider:'photon'},{coordinateSystem:'WGS84'},{source:''},{id:''},{id:123}])assert.equal(M.evaluate(place(),[poi(changes)]),null);
});
test('each configured city accepts an exact candidate in its own region',()=>{
 for(const city of [{cityId:'puer',adcode:'530802',lng:100.97,lat:22.78},{cityId:'yuxi',adcode:'530402',lng:102.54,lat:24.35},{cityId:'kunming',adcode:'530102',lng:102.71,lat:25.04}]){
  const c=poi({...city,name:'具体地点名称'});assert.equal(M.evaluate(place({cityId:city.cityId,name:c.name}),[c]),c);
 }
});
test('unknown city, malformed data and empty responses require confirmation',()=>{
 assert.equal(M.evaluate(place({cityId:'newcity'}),[poi({cityId:'newcity'})]),null);
 for(const candidates of [[],null,{},[null,{},'bad']])assert.equal(M.evaluate(place(),candidates),null);
 assert.equal(M.evaluate(null,[poi()]),null);
});

test('new cities require an exact city and unique full POI identity',()=>{
 const p=place({name:'甲秀楼',cityId:'city-guiyang',city:'贵阳'});
 const c=poi({name:'甲秀楼',cityId:p.cityId,city:'贵阳市',adcode:'520102',lat:26.575,lng:106.716});
 assert.equal(M.evaluate(p,[c]),c);
 for(const changed of [{city:'安顺市'},{city:''},{adcode:''},{name:'甲秀楼停车场'},{provider:'photon'},{coordinateSystem:'WGS84'}]){
  assert.equal(M.evaluate(p,[{...c,...changed}]),null);
 }
 assert.equal(M.evaluate(p,[c,{...c,id:'another-branch'}]),null);
});

test('specific three-character village names can match exactly within their city',()=>{
 const c=poi({name:'曼掌村'});assert.equal(M.match(place({name:'曼掌村'}),[c]),c);
});

test('Manhena guide name resolves to the verified village POI, not nearby businesses',()=>{
 const c=poi({id:'B0FFJ2ZH2Y',name:'曼贺纳自然村寨',lng:100.824924,lat:21.972472});
 const nearby=['曼贺纳古寨美食城','曼贺纳景区','曼贺纳古寨伴山听雨','凤灵谷非遗度假美宿(曼贺纳古寨店)'].map((name,i)=>poi({id:'nearby-'+i,name}));
 for(const name of ['曼贺纳古寨','曼贺纳自然村寨','曼贺纳村'])assert.equal(M.match(place({name}),[...nearby,c]),c);
 assert.equal(M.match(place({name:'曼贺纳古寨'}),nearby),null);
 assert.equal(M.match(place({name:'曼贺纳古寨'}),[c,{...c,id:'another-village'}]),null);
 assert.equal(M.match(place({name:'曼贺纳古寨',kind:'hotel'}),[c]),null);
 assert.equal(M.match(place({name:'曼贺纳古寨',cityId:'puer'}),[{...c,cityId:'puer',adcode:'530802',lng:100.97,lat:22.78}]),null);
});

test('Mandiu cannot be replaced by Mansha, its parking lot or a shop in the village',()=>{
 const rows=['曼沙古寨','曼丢傣家古寨停车场','曼丢小院','傣泐丢丢家'].map((name,i)=>poi({id:'candidate-'+i,name}));
 assert.equal(M.match(place({name:'曼丢古寨'}),rows),null);
});
