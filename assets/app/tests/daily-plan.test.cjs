const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context={window:{}};
vm.runInNewContext(html.match(/<script[^>]*id="daily-plan-core"[^>]*>([\s\S]*?)<\/script>/)[1],context);
const P=context.window.DailyPlanCore;
const plain=value=>JSON.parse(JSON.stringify(value));

test('moving a timed place clears a conflicting clock time without losing its source or identity',()=>{
 const source={id:'visit',dayId:'d1',slot:'morning',time:'09:30',place:{name:'测试地点',cityId:'puer',sourceId:'dot:one',dotSources:[{id:'g1',reasons:['观点']}] }};
 const entries=[source];
 const moved=P.move(entries,'visit','d2','evening');
 assert.equal(moved[0].time,'');
 assert.equal(moved[0].id,source.id);
 assert.deepEqual(plain(moved[0].place),source.place);
 assert.equal(entries[0].time,'09:30');
 assert.equal(entries[0].dayId,'d1');
 assert.equal(P.move(entries,'visit','d2','morning')[0].time,'09:30');
});

test('notes use the same time and ordering rules as places',()=>{
 const entries=[{id:'a',type:'note',text:'休息',dayId:'d1',slot:'afternoon',time:'14:00'},{id:'b',dayId:'d2',slot:'evening',place:{name:'测试地点'}}];
 const moved=P.move(entries,'a','d2','evening','b');
 assert.deepEqual(plain(moved.map(e=>e.id)),['a','b']);
 assert.equal(moved[0].time,'');
 assert.equal(moved[0].text,'休息');
 assert.strictEqual(P.move(entries,'missing','d1','morning'),entries);
});

test('city changes keep incompatible entries inactive and retained, including legacy days without locationIds',()=>{
 const entry={id:'a',dayId:'d1',place:{name:'测试地点',cityId:'puer'}};
 const data={days:[{id:'d1',cityId:'banna'}]};
 assert.equal(P.active(entry,data),false);
 assert.equal(P.active({...entry,type:'note',text:'休息'},data),true);
 data.days[0].locationIds=['banna','puer'];
 assert.equal(P.active(entry,data),true);
 const saved=P.clean({version:1,entries:[entry],locations:{}});
 assert.equal(saved.entries.length,1);
 assert.equal(saved.entries[0].place.cityId,'puer');
 assert.equal(P.active(entry,{days:[]}),false);
});

test('a corrected source city requires rescheduling without rewriting the original daily record',()=>{
 const place={sourceId:'dot:one',name:'测试古街',cityId:'banna',address:'旧地址',lat:22,lng:100,openingNote:'原提醒',photo:'saved-photo'};
 const known={sourceId:'dot:one',cityId:'puer',city:'普洱'};
 const corrected=P.reconcilePlace(place,known);
 assert.equal(corrected.cityId,'puer');
 assert.equal(corrected.lat,null);
 assert.equal(corrected.address,'');
 assert.equal(corrected.photo,'saved-photo');
 assert.equal(corrected.openingNote,'原提醒');
 const data={days:[{id:'d1',cityId:'banna'},{id:'d2',cityId:'puer'}]};
 assert.equal(P.active({dayId:'d1',place:corrected},data),false);
 assert.equal(P.active({dayId:'d2',place:corrected},data),true);
 assert.equal(place.cityId,'banna');
 assert.equal(place.address,'旧地址');
 assert.equal(place.lat,22);
 assert.strictEqual(P.reconcilePlace(place,undefined),place);
 assert.strictEqual(P.reconcilePlace(place,{sourceId:'other',cityId:'puer'}),place);
 assert.strictEqual(P.reconcilePlace(place,{...known,cityId:'banna'}),place);
});

test('arrival checks use recorded transport times and flag only clearly earlier visits',()=>{
 const day={id:'d1',date:'2026-09-25',cityId:'banna'};
 const entry=(id,slot,time='')=>({id,dayId:'d1',slot,time,place:{cityId:'banna'}});
 const entries=[entry('morning','morning'),entry('afternoon','afternoon'),entry('evening','evening'),entry('early','evening','18:30'),entry('later','evening','20:00'),{id:'note',type:'note',dayId:'d1',slot:'morning',text:'整理行李'}];
 const rides=[{id:'flight',arrivalDate:day.date,arrivalTime:'18:55',fromCityId:'beijing',toCityId:'banna',toCity:'西双版纳'}];
 const before=JSON.stringify(entries),warnings=P.transportWarnings(entries,day,rides);
 assert.deepEqual(plain(warnings),[{type:'arrival',transportId:'flight',city:'西双版纳',time:'18:55',entryIds:['morning','afternoon','early']}]);
 assert.equal(JSON.stringify(entries),before);
 assert.equal(P.transportWarnings(entries,day,[{...rides[0],arrivalTime:''}]).length,0);
 assert.equal(P.transportWarnings(entries,day,[{...rides[0],arrivalDate:'2026-09-26'}]).length,0);
});

test('departure checks skip unknown dates, other cities and ambiguous return trips',()=>{
 const day={id:'d1',date:'2026-09-25'};
 const entry={id:'visit',dayId:'d1',slot:'evening',place:{cityId:'banna'}};
 const departure={id:'train',departDate:day.date,departTime:'17:30',fromCityId:'banna',fromCity:'西双版纳',toCityId:'puer'};
 assert.equal(P.transportWarnings([entry],day,[departure])[0].type,'departure');
 assert.equal(P.transportWarnings([entry],{...day,date:''},[departure]).length,0);
 assert.equal(P.transportWarnings([{...entry,place:{cityId:'puer'}}],day,[departure]).length,0);
 const arrival={id:'return',arrivalDate:day.date,arrivalTime:'20:00',toCityId:'banna',fromCityId:'puer'};
 assert.equal(P.transportWarnings([entry],day,[departure,arrival]).length,0);
});

test('time ranges survive reload for notes and places without inventing legacy end times',()=>{
 const entries=[{id:'note',type:'note',text:'午休',dayId:'d1',slot:'afternoon',time:'13:15',endTime:'14:10'},
  {id:'place',dayId:'d1',slot:'morning',time:'09:30',endTime:'11:45',place:{name:'公园',sourceId:'source:1'}},
  {id:'legacy',dayId:'d1',slot:'evening',time:'19:00',place:{name:'晚餐'}}];
 const restored=P.clean(JSON.parse(JSON.stringify({version:1,entries,locations:{}})));
 assert.equal(restored.entries[0].endTime,'14:10');
 assert.equal(restored.entries[1].endTime,'11:45');
 assert.equal(P.timeLabel(restored.entries[1]),'09:30–11:45');
 assert.equal(restored.entries[1].place.sourceId,'source:1');
 assert.equal(restored.entries[2].time,'19:00');
 assert.equal(restored.entries[2].endTime,'');
 assert.equal(P.timeLabel(restored.entries[2]),'19:00');
 assert.equal(P.timeLabel({time:''}), '');
});

test('ranges require both clocks and positive same-day duration, preserving untouched legacy clocks',()=>{
 assert.equal(P.rangeError('09:30','11:45'),'');
 assert.equal(P.rangeError('11:30','13:00'),'');
 assert.equal(P.rangeError('',''),'');
 for(const [a,b] of [['09:30',''],['','11:45'],['09:30','09:30'],['23:30','01:00'],['24:00','25:00'],['09:99','11:00']])assert.notEqual(P.rangeError(a,b),'');
 assert.equal(P.rangeError('19:00','',{time:'19:00'}),'');
 assert.notEqual(P.rangeError('19:30','',{time:'19:00'}),'');
 assert.notEqual(P.rangeError('19:00','',{time:'19:00',endTime:'20:00'}),'');
});

test('moving between days keeps a full range; changing to another period clears both clocks',()=>{
 for(const type of ['note','place']){
  const entry={id:'a',dayId:'d1',slot:'morning',time:'11:30',endTime:'13:00',...(type==='note'?{type:'note',text:'休息'}:{place:{name:'公园'}})};
  const same=P.move([entry],'a','d2','morning')[0];
  assert.equal(same.time,'11:30');assert.equal(same.endTime,'13:00');
  const different=P.move([entry],'a','d2','afternoon')[0];
  assert.equal(different.time,'');assert.equal(different.endTime,'');
  assert.equal(entry.endTime,'13:00');
 }
});

test('departure checks include a visit that begins earlier but finishes after departure',()=>{
 const day={id:'d1',date:'2026-09-25'};
 const ride={id:'train',departDate:day.date,departTime:'17:30',fromCityId:'banna',fromCity:'西双版纳',toCityId:'puer'};
 const visit={id:'visit',dayId:'d1',slot:'afternoon',time:'16:00',endTime:'18:00',place:{cityId:'banna'}};
 assert.deepEqual(plain(P.transportWarnings([visit],day,[ride])[0].entryIds),['visit']);
 assert.equal(P.transportWarnings([{...visit,endTime:'17:30'}],day,[ride]).length,0);
});

test('saved-place arrangement labels expose the same full range as the daily view',()=>{
 vm.runInNewContext(html.match(/<script[^>]*id="guide-picks-core"[^>]*>([\s\S]*?)<\/script>/)[1],context);
 assert.equal(context.window.GuideWantsCore.arrangementLabel([{active:true,time:'09:30',endTime:'11:45',day:{date:'2026-09-26'},slot:'morning'}]),'09/26 09:30–11:45');
});
