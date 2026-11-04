const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dot-import-core.js');
const M=require('../travel-map-data.js');

test('a tiny guide crop cannot displace an existing clear photograph',()=>{
 const imported={src:'guide-crop.jpg',width:125,height:125,compact:true,guide:true};
 const references=[{src:'matched-place.jpg',width:900,height:600}];
 const before=JSON.stringify([imported,references]);
 const result=C.choosePlacePhoto(imported,references);
 assert.equal(result.src,'matched-place.jpg');assert.equal(result.compact,false);
 assert.equal(result.fallback,'guide-crop.jpg');assert.equal(JSON.stringify([imported,references]),before);
});
test('clear imported photos keep priority and portrait proportions are retained',()=>{
 const result=C.choosePlacePhoto({src:'portrait.jpg',width:900,height:1400},[{src:'public.jpg',width:1200,height:800}]);
 assert.equal(result.src,'portrait.jpg');assert.equal(result.height,1400);assert.equal(result.compact,false);
});
test('small or absent images are represented honestly',()=>{
 assert.equal(C.choosePlacePhoto(null,[]),null);
 assert.equal(C.choosePlacePhoto(null,[{src:'tiny.jpg',width:160,height:100}]).compact,true);
 assert.equal(C.choosePlacePhoto({src:'crop.jpg',compact:true},[{src:'empty',width:120,height:120}]).compact,true);
});
test('merging the same place upgrades its photo without changing visits or stored data',()=>{
 const place={sourceId:'sight:manting',name:'曼听御花园',cityId:'banna'};
 const input={trip:{tripId:'trip-1',days:[],destinations:[]},state:{entries:[],locations:{}},catalog:[
  {place,photo:'crop.jpg',photoCompact:true},
  {place:{...place,sourceId:'dot:manting'},photo:'full.jpg',photoCompact:false,photoFallback:'crop.jpg'}
 ]};
 const before=JSON.stringify(input),result=M.snapshot(input);
 assert.equal(result.places.length,1);assert.equal(result.places[0].photo,'full.jpg');
 assert.equal(result.places[0].photoFallback,'crop.jpg');assert.equal(result.places[0].photoCompact,false);
 assert.deepEqual(result.places[0].visits,[]);assert.equal(JSON.stringify(input),before);
});
