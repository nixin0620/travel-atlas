const test=require('node:test'),assert=require('node:assert/strict'),C=require('../assets/app/travel-map-core.js');
const p=(id,cityId='lijiang',start='09:00',end='10:00',order=1)=>({id,name:id,city:'丽江',cityId,wish:true,lat:26,lng:100,coordinateSystem:'WGS84',source:'OpenStreetMap / Photon',confirmed:true,visits:[{date:'2026-11-01',start,end,order}]});
test('all dates show distribution only',()=>assert.equal(C.route([p('a'),p('b')],'').segments.length,0));
test('safe same-city adjacent sequence',()=>assert.equal(C.route([p('a'),p('b','lijiang','10:00','11:00',2)],'2026-11-01').segments.length,1));
test('cross-city entry is not skipped',()=>assert.equal(C.route([p('a'),p('b','kunming','11:00','12:00',2),p('c','lijiang','13:00','14:00',3)],'2026-11-01').segments.length,0));
test('missing coordinates break both adjacent edges',()=>{const b=p('b','lijiang','11:00','12:00',2);b.lat=null;assert.equal(C.route([p('a'),b,p('c','lijiang','13:00','14:00',3)],'2026-11-01').segments.length,0);});
test('unconfirmed, unsourced and GCJ02 are never plotted',()=>{for(const patch of [{confirmed:false},{source:''},{coordinateSystem:'GCJ02'},{lat:91}])assert.equal(C.coord({...p('a'),...patch}),false);});
test('conflicts block affected entries including downstream edge',()=>assert.equal(C.route([p('a','lijiang','09:00','12:00',1),p('b','lijiang','11:00','13:00',2),p('c','lijiang','14:00','15:00',3)],'2026-11-01').segments.length,0));
test('missing/invalid time cannot be crossed',()=>assert.equal(C.route([p('a'),p('b','lijiang','','',2),p('c','lijiang','14:00','15:00',3)],'2026-11-01').segments.length,0));
test('existing order stays intact and descending times do not connect',()=>{const rows=[p('a','lijiang','14:00','15:00',1),p('b','lijiang','09:00','10:00',2)];assert.equal(C.route(rows,'2026-11-01').segments.length,0);assert.deepEqual(rows.map(x=>x.id),['a','b']);});
test('all overlapping intervals including non-adjacent are blocked',()=>{const rows=[p('a','lijiang','09:00','16:00',1),p('b','lijiang','10:00','11:00',2),p('c','lijiang','14:00','15:00',3)];assert.equal(C.route(rows,'2026-11-01').segments.length,0);});
test('date and time validation rejects invalid inputs',()=>{for(const s of ['2026-02-30','2026-99-99',''])assert.equal(C.day(s),false);for(const s of ['24:00','9:00','23:60'])assert.equal(C.minute(s),null);assert.equal(C.interval({start:'12:00',end:'12:00'}),null);});
test('candidate requires explicit WGS84 source and same city',()=>{assert.throws(()=>C.confirm(p('a'),{lat:26,lng:100,coordinateSystem:'GCJ02',source:'amap'}));assert.throws(()=>C.confirm(p('a'),{lat:26,lng:100,coordinateSystem:'WGS84',source:'Photon',city:'昆明市'}));assert.equal(C.coord(C.confirm(p('a'),{lat:26,lng:100,coordinateSystem:'WGS84',source:'OpenStreetMap / Photon',city:'丽江市'})),true);});
test('filters intersect instead of changing stored places',()=>{const a=p('a'),b=p('b','kunming');b.wish=false;assert.deepEqual(C.filter([a,b],{city:'lijiang',status:'wish',date:'2026-11-01'}).map(x=>x.id),['a']);assert.equal(C.filter([a,b],{date:'2026-12-01'}).length,0);});

test('ambiguous order does not connect',()=>assert.equal(C.route([p('a'),p('b','lijiang','11:00','12:00',1)],'2026-11-01').segments.length,0));

const trip={id:'demo-yunnan-2026',startDate:'2026-11-01',endDate:'2026-11-07'};
const visit=(date,extra={})=>({date,start:'09:00',end:'10:00',order:1,...extra});
test('trip dates include every valid day and reject malformed, reversed or excessive ranges',()=>{
 assert.deepEqual(C.tripDates(trip),['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07']);
 assert.equal(C.tripDates({id:'leap',startDate:'2024-01-01',endDate:'2024-12-31'}).length,366);
 for(const bad of [null,{...trip,id:''},{...trip,startDate:'2026-02-30'},{...trip,endDate:'2026-10-31'},{...trip,endDate:'2027-11-02'}])assert.throws(()=>C.tripDates(bad));
});
test('current trip scope excludes explicitly foreign visits even on the same day and legacy visits outside the trip',()=>{
 const place=p('a');
 place.visits=[visit('2026-11-01'),visit('2026-11-02',{tripId:trip.id}),visit('2026-11-01',{tripId:'other'}),visit('2026-12-01'),visit('2026-12-01',{tripId:trip.id})];
 assert.deepEqual(C.tripVisits(place,trip),place.visits.slice(0,2));
 assert.equal(place.visits.length,5);
});
test('all places mode includes only My Pick, independently of scheduling and date',()=>{
 const scheduled=p('scheduled'),unscheduled={...p('unscheduled'),visits:[]},notPicked={...p('notPicked'),wish:false};
 assert.deepEqual(C.mapPlaces([scheduled,unscheduled,notPicked],{trip,mode:'all',date:'2026-12-01'}).map(x=>x.id),['scheduled','unscheduled']);
});
test('day mode intersects current-trip date and city without requiring My Pick',()=>{
 const picked=p('picked'),notPicked={...p('notPicked'),wish:false},elsewhere=p('elsewhere','kunming'),foreign={...p('foreign'),visits:[visit('2026-11-01',{tripId:'other'})]};
 assert.deepEqual(C.mapPlaces([picked,notPicked,elsewhere,foreign],{trip,city:'lijiang',mode:'day',date:'2026-11-01'}).map(x=>x.id),['picked','notPicked']);
 assert.deepEqual(C.mapPlaces([picked],{trip,mode:'day',date:'2026-12-01'}),[]);
});
test('day entries retain city and current-trip order, without leaking foreign-trip dates',()=>{
 const a=p('a','lijiang','09:00','10:00',3),b=p('b','kunming','11:00','12:00',1);
 a.visits.push(visit('2026-11-01',{tripId:'other',order:0}));
 assert.deepEqual(C.dayEntries([a,b],{trip,date:'2026-11-01'}).map(x=>x.place.id),['b','a']);
 assert.deepEqual(C.dayEntries([a,b],{trip,date:'2026-11-01',city:'lijiang'}).map(x=>x.place.id),['a']);
 assert.deepEqual(C.dayEntries([a,b],{trip,date:'2026-12-01'}),[]);
});
test('creating an arrangement appends after the current-trip day across all cities without changing My Pick',()=>{
 const a={...p('a'),wish:false,visits:[]},b=p('b','kunming','09:00','10:00',4),c=p('c');
 c.visits=[visit('2026-11-01',{tripId:'other',order:99})];
 const before=structuredClone([a,b,c]),next=C.saveVisit([a,b,c],{placeId:'a',trip,date:'2026-11-01',start:'13:15',end:'14:45'});
 assert.deepEqual(next[0].visits,[visit('2026-11-01',{tripId:trip.id,start:'13:15',end:'14:45',order:5})]);
 assert.equal(next[0].wish,false);
 assert.deepEqual([a,b,c],before);
});
test('both empty times are allowed, partially filled and non-increasing times are rejected without mutation',()=>{
 const rows=[{...p('a'),visits:[]}],before=structuredClone(rows);
 assert.equal(C.saveVisit(rows,{placeId:'a',trip,date:'2026-11-01'} )[0].visits[0].start,'');
 for(const [start,end] of [['09:00',''],['','10:00'],['24:00','25:00'],['12:00','12:00'],['13:00','12:00'],[null,null]])assert.throws(()=>C.saveVisit(rows,{placeId:'a',trip,date:'2026-11-01',start,end}));
 assert.deepEqual(rows,before);
});
test('same place cannot be created twice on the same day, including a legacy arrangement',()=>{
 for(const tagged of [false,true]){
  const place=p('a');if(tagged)place.visits[0].tripId=trip.id;
  assert.throws(()=>C.saveVisit([place],{placeId:'a',trip,date:'2026-11-01',start:'15:00',end:'16:00'}),/已经安排/);
  assert.equal(place.visits.length,1);
 }
});
test('a foreign-trip arrangement on the target day neither blocks creation nor gets overwritten',()=>{
 const foreign=visit('2026-11-01',{tripId:'other',id:'foreign',note:'keep'}),place={...p('a'),visits:[foreign]};
 const next=C.saveVisit([place],{placeId:'a',trip,date:'2026-11-01'});
 assert.equal(next[0].visits.length,2);
 assert.deepEqual(next[0].visits[0],foreign);
 assert.equal(next[0].visits[1].tripId,trip.id);
 assert.equal(next[0].visits[1].order,1);
});
test('editing time preserves record metadata, existing day order and other-trip records',()=>{
 const original=visit('2026-11-01',{id:'record-1',order:8,note:'keep',extra:{a:1}}),foreign=visit('2026-11-01',{tripId:'other'}),place={...p('a'),visits:[original,foreign]};
 const next=C.saveVisit([place],{placeId:'a',trip,date:'2026-11-01',originalDate:'2026-11-01',start:'14:00',end:'15:00'});
 assert.deepEqual(next[0].visits[0],{...original,tripId:trip.id,start:'14:00',end:'15:00'});
 assert.deepEqual(next[0].visits[1],foreign);
 assert.equal(place.visits[0].start,'09:00');
});
test('moving an arrangement keeps its identity and appends after the destination day',()=>{
 const a={...p('a'),visits:[visit('2026-11-01',{id:'original',order:5})]},b={...p('b','kunming'),visits:[visit('2026-11-02',{order:7})]};
 const next=C.saveVisit([a,b],{placeId:'a',trip,date:'2026-11-02',originalDate:'2026-11-01',start:'11:00',end:'12:00'});
 assert.equal(next[0].visits.length,1);
 assert.equal(next[0].visits[0].id,'original');
 assert.equal(next[0].visits[0].order,8);
 assert.equal(next[0].visits[0].date,'2026-11-02');
});
test('moving onto an already arranged day is rejected and neither visit changes',()=>{
 const place={...p('a'),visits:[visit('2026-11-01'),visit('2026-11-02')]},before=structuredClone(place);
 assert.throws(()=>C.saveVisit([place],{placeId:'a',trip,date:'2026-11-02',originalDate:'2026-11-01'}),/已经安排/);
 assert.deepEqual(place,before);
});
test('stale edits, ambiguous legacy duplicates and dates outside the trip are rejected',()=>{
 const place=p('a');
 assert.throws(()=>C.saveVisit([place],{placeId:'a',trip,date:'2026-11-01',originalDate:'2026-11-02'}),/原安排/);
 assert.throws(()=>C.saveVisit([{...place,visits:[...place.visits,...place.visits]}],{placeId:'a',trip,date:'2026-11-01',originalDate:'2026-11-01'}),/重复/);
 for(const date of ['2026-12-01','2026-02-30',''])assert.throws(()=>C.saveVisit([place],{placeId:'a',trip,date}));
 assert.throws(()=>C.saveVisit([place],{placeId:'missing',trip,date:'2026-11-01'}));
});
test('removal only affects the requested current-trip day and preserves all foreign and other-day data',()=>{
 const place={...p('a'),visits:[visit('2026-11-01'),visit('2026-11-01',{tripId:trip.id}),visit('2026-11-01',{tripId:'other',id:'foreign'}),visit('2026-11-02'),visit('2026-12-01')]};
 const before=structuredClone(place),next=C.removeVisit([place],{placeId:'a',trip,date:'2026-11-01'});
 assert.deepEqual(next[0].visits,place.visits.slice(2));
 assert.deepEqual(place,before);
 assert.throws(()=>C.removeVisit([place],{placeId:'a',trip,date:'2026-12-01'}));
});
