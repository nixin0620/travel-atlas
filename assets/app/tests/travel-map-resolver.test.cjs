const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../travel-map-resolver.js');
const place=(id='a',patch={})=>({id,name:'曼听公园',cityId:'banna',address:'景洪市',lat:null,lng:null,coordinateSystem:'',confirmed:false,...patch});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function harness(overrides={}){
 const calls={search:[],save:[],changes:0};
 const options={search:async p=>{calls.search.push(p.id);return[{id:'poi-'+p.id}];},match:(p,rows)=>rows[0]||null,
  confirm:(p,c)=>({...p,confirmed:true,poiId:c.id,lat:21.99,lng:100.8,coordinateSystem:'GCJ02'}),
  save:async(requests,tripId)=>{calls.save.push({requests,tripId});return requests.map(r=>r.placeId);},
  onChange:()=>{calls.changes++;},isActive:()=>true,...overrides};
 return{resolver:R.create(options),calls};
}
test('unchanged repeated calls share one lookup and one persisted match',async()=>{
 const h=harness(),a=place();await Promise.all([h.resolver.resolve([a],'trip'),h.resolver.resolve([a],'trip')]);
 await h.resolver.resolve([structuredClone(a)],'trip');
 assert.deepEqual(h.calls.search,['a']);assert.equal(h.calls.save.length,1);assert.equal(h.resolver.state(a,'trip'),'matched');
});
test('already confirmed places never need automatic lookup',async()=>{
 const h=harness(),a=place('a',{confirmed:true});await h.resolver.resolve([a],'trip');
 assert.equal(h.calls.search.length,0);assert.equal(h.resolver.state(a,'trip'),'matched');
});
test('lookups run at most two at once and each pair saves in one batch',async()=>{
 let inFlight=0,max=0;const gates=[];
 const h=harness({search:p=>{inFlight++;max=Math.max(max,inFlight);const gate=deferred();gates.push(gate);return gate.promise.finally(()=>inFlight--);}});
 const done=h.resolver.resolve(['a','b','c','d','e'].map(id=>place(id)),'trip');await turn();assert.equal(gates.length,2);
 gates[0].resolve([{id:'a'}]);gates[1].resolve([{id:'b'}]);await turn();assert.equal(gates.length,4);
 gates[2].resolve([{id:'c'}]);gates[3].resolve([{id:'d'}]);await turn();assert.equal(gates.length,5);
 gates[4].resolve([{id:'e'}]);await done;
 assert.equal(max,2);assert.deepEqual(h.calls.save.map(c=>c.requests.length),[2,2,1]);
});
test('ambiguous lookup remains pending and never persists or retries by rendering',async()=>{
 const h=harness({match:()=>null}),a=place();await h.resolver.resolve([a],'trip');await h.resolver.resolve([a],'trip');
 assert.equal(h.resolver.state(a,'trip'),'pending');assert.equal(h.calls.search.length,1);assert.equal(h.calls.save.length,0);
});
test('lookup failure can only retry through explicit retry call',async()=>{
 let attempts=0;const h=harness({search:async()=>{if(++attempts===1)throw Error('network');return[{id:'poi'}];}}),a=place();
 await h.resolver.resolve([a],'trip');assert.equal(h.resolver.state(a,'trip'),'failed');
 await h.resolver.resolve([a],'trip');assert.equal(attempts,1);
 await h.resolver.retry([a],'trip');assert.equal(attempts,2);assert.equal(h.resolver.state(a,'trip'),'matched');
});
test('failed save does not claim the place matched',async()=>{
 const h=harness({save:async()=>{throw Error('storage quota');}}),a=place();await h.resolver.resolve([a],'trip');
 assert.equal(h.resolver.state(a,'trip'),'failed');
});
test('trip changed during lookup prevents late persistence',async()=>{
 let trip='old';const gate=deferred(),h=harness({search:()=>gate.promise,isActive:id=>trip===id}),a=place();
 const done=h.resolver.resolve([a],'old');await turn();trip='new';gate.resolve([{id:'poi'}]);await done;
 assert.equal(h.calls.save.length,0);assert.equal(h.resolver.state(a,'old'),'pending');
});
test('trip changed during save never reports late success in current view',async()=>{
 let trip='old';const gate=deferred(),h=harness({save:()=>gate.promise,isActive:id=>trip===id}),a=place();
 const done=h.resolver.resolve([a],'old');await turn();trip='new';gate.resolve(['a']);await done;
 assert.equal(h.resolver.state(a,'old'),'pending');
});
test('edited place has a new lookup identity and older result is discarded',async()=>{
 const gate=deferred();let lookups=0;const h=harness({search:async()=>++lookups===1?gate.promise:[{id:'new'}]}),a=place(),b=place('a',{name:'新的公园'});
 const old=h.resolver.resolve([a],'trip');await turn();const fresh=h.resolver.resolve([b],'trip');gate.resolve([{id:'old'}]);await Promise.all([old,fresh]);
 assert.equal(lookups,2);assert.equal(h.calls.save.length,1);assert.equal(h.calls.save[0].requests[0].expected.name,'新的公园');
});
test('save receives immutable normalized originals for final stale-data guard',async()=>{
 const gate=deferred(),h=harness({search:()=>gate.promise}),a=place('a',{name:' 曼听公园 ',address:undefined,lat:NaN,lng:Infinity});
 const done=h.resolver.resolve([a],'trip');await turn();a.name='changed outside';a.lat=30;gate.resolve([{id:'poi'}]);await done;
 assert.deepEqual(h.calls.save[0].requests[0].expected,{id:'a',name:'曼听公园',cityId:'banna',address:'',lat:null,lng:null,coordinateSystem:'',locationVersion:''});
 assert.equal(h.calls.save[0].tripId,'trip');
});
test('save may skip stale records without marking them successful',async()=>{
 const h=harness({save:async()=>({saved:['b']})}),a=place('a'),b=place('b');await h.resolver.resolve([a,b],'trip');
 assert.equal(h.resolver.state(a,'trip'),'pending');assert.equal(h.resolver.state(b,'trip'),'matched');
});
test('view callbacks may re-resolve the same data without runaway requests',async()=>{
 const a=place();let h;h=harness({onChange:()=>{h.resolver.resolve([a],'trip');}});await h.resolver.resolve([a],'trip');await turn();
 assert.equal(h.calls.search.length,1);assert.equal(h.calls.save.length,1);
});
test('same place on separate trips has separate lookup identity',async()=>{
 const h=harness(),a=place();await h.resolver.resolve([a],'one');await h.resolver.resolve([a],'two');
 assert.equal(h.calls.search.length,2);assert.deepEqual(h.calls.save.map(c=>c.tripId),['one','two']);
});
test('every location identity field invalidates cached unresolved lookups',async()=>{
 for(const patch of [{id:'changed'},{name:'另一地点'},{cityId:'puer'},{address:'新地址'},{lat:22},{lng:101},{coordinateSystem:'GCJ02'}]){
  const h=harness({match:()=>null}),a=place();await h.resolver.resolve([a],'trip');await h.resolver.resolve([{...a,...patch}],'trip');
  assert.equal(h.calls.search.length,2,JSON.stringify(patch));
 }
});
test('whitespace normalization does not consume another search',async()=>{
 const h=harness({match:()=>null}),a=place();await h.resolver.resolve([a],'trip');await h.resolver.resolve([{...a,name:' 曼听公园 ',address:' 景洪市 '}],'trip');
 assert.equal(h.calls.search.length,1);
});
test('different trips queued together are persisted in separate batches',async()=>{
 const h=harness();await Promise.all([h.resolver.resolve([place('a')],'one'),h.resolver.resolve([place('b')],'two')]);
 assert.deepEqual(h.calls.save.map(c=>({trip:c.tripId,ids:c.requests.map(r=>r.placeId)})),[{trip:'one',ids:['a']},{trip:'two',ids:['b']}]);
});
test('inactive trip does not enqueue or access the provider',async()=>{
 const h=harness({isActive:()=>false});await h.resolver.resolve([place()],'trip');
 assert.equal(h.calls.search.length,0);assert.equal(h.calls.save.length,0);
});
test('raw merged location version is carried unchanged to the final save guard',async()=>{
 const version=JSON.stringify({source:'manual',entries:[{id:'alias',address:'景洪市'}]}),h=harness(),a=place('a',{locationVersion:version});
 await h.resolver.resolve([a],'trip');assert.equal(h.calls.save[0].requests[0].expected.locationVersion,version);
});
test('raw location version changes invalidate cached lookup even when displayed fields match',async()=>{
 const h=harness({match:()=>null}),a=place('a',{locationVersion:'{"entry":"before"}'});
 await h.resolver.resolve([a],'trip');await h.resolver.resolve([{...a,locationVersion:'{"entry":"after"}'}],'trip');
 assert.equal(h.calls.search.length,2);
});
test('explicit user position edits are excluded from automatic lookup',async()=>{
 const h=harness(),a=place('a',{autoLocationAllowed:false});await h.resolver.resolve([a],'trip');await h.resolver.retry([a],'trip');
 assert.equal(h.calls.search.length,0);assert.equal(h.calls.save.length,0);assert.equal(h.resolver.state(a,'trip'),'pending');
});
test('explicit position edits during lookup cancel the old automatic result',async()=>{
 const gate=deferred(),h=harness({search:()=>gate.promise}),a=place();
 const done=h.resolver.resolve([a],'trip');await turn();await h.resolver.resolve([{...a,autoLocationAllowed:false}],'trip');
 gate.resolve([{id:'poi'}]);await done;assert.equal(h.calls.save.length,0);
});
test('confirm failure is isolated and does not prevent a neighboring match',async()=>{
 const h=harness({confirm:(p,c)=>{if(p.id==='a')throw Error('not a valid city');return{...p,confirmed:true,poiId:c.id};}}),a=place('a'),b=place('b');
 await h.resolver.resolve([a,b],'trip');assert.equal(h.resolver.state(a,'trip'),'failed');assert.equal(h.resolver.state(b,'trip'),'matched');
 assert.deepEqual(h.calls.save[0].requests.map(r=>r.placeId),['b']);
});
