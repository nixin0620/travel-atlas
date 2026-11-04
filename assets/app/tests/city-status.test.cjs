const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=process.env.CITY_DETAIL_ROOT||(path.basename(__dirname)==='tests'?path.dirname(__dirname):__dirname);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const source=script('china-footprints-controller');
const changes=source.slice(source.indexOf('async function changeVisited('),source.indexOf("root.addEventListener('click'",source.indexOf('async function changeVisited(')));
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(options={}){
 const writes=[],messages=[],renders=[],media={photos:['synthetic-photo'],note:'keep this memory'},dates={visits:[{cityId:'a',startDate:'2020-01-01'}]};
 const control={syncFail:false,flush:async()=>{},...options};
 const box={window:{TravelStorage:{setItem:(key,value)=>{if(control.syncFail)throw Error('quota');writes.push([key,value]);},flushCache:()=>control.flush()}},render:()=>renders.push(plain(box.state().visited)),syncUndo:()=>{},paintStorage:()=>{},announce:message=>messages.push(message)};
 vm.runInNewContext(script('china-footprints-core'),box);
 vm.runInNewContext(`const C=window.ChinaFootprintsCore,key='travel-footprints:china:v1',known=new Set(['a','b']),cities=new Map([['a',{name:'甲城',province:'one'}],['b',{name:'乙城',province:'two'}]]);let visited={a:'2020-01-01T00:00:00.000Z',b:'2021-01-01T00:00:00.000Z'},undo=null,savingVisit=false,persistent=true,visitSaveEpoch=0;${changes};this.toggle=toggle;this.undoVisit=undoVisit;this.state=()=>({visited,undo,savingVisit,counts:C.stats(visited,[...cities].map(([id,c])=>({id,...c})))});`,box);
 return {box,control,writes,messages,renders,media,dates};
}
test('cancel and undo preserve exact mark date and restore city/province counts; only visited store is written',async()=>{
 const t=setup(),before=plain(t.box.state().visited),media=JSON.stringify(t.media),dates=JSON.stringify(t.dates);
 await t.box.toggle('a');assert.equal(t.box.state().counts.cityCount,1);assert.equal(t.box.state().counts.provinceIds.length,1);assert.equal(t.box.state().visited.a,undefined);
 await t.box.undoVisit();assert.deepEqual(plain(t.box.state().visited),before);assert.equal(t.box.state().counts.cityCount,2);assert.equal(t.box.state().counts.provinceIds.length,2);assert.equal(t.box.state().undo,null);
 assert.equal(JSON.stringify(t.media),media);assert.equal(JSON.stringify(t.dates),dates);assert.ok(t.writes.every(([key])=>key==='travel-footprints:china:v1'));assert.deepEqual(t.writes.map(([,v])=>JSON.parse(v).cities.length),[1,2]);
});
test('pending save prevents repeated click and premature undo',async()=>{
 let release;const t=setup({flush:()=>new Promise(resolve=>release=resolve)}),pending=t.box.toggle('a');
 assert.equal(t.box.state().savingVisit,true);await t.box.toggle('b');await t.box.undoVisit();assert.equal(t.writes.length,1);assert.ok(t.box.state().visited.b);release();await pending;assert.equal(t.box.state().savingVisit,false);
});
test('sync write failure keeps original state and does not offer a false undo',async()=>{
 const t=setup({syncFail:true});await t.box.toggle('a');assert.equal(t.box.state().counts.cityCount,2);assert.equal(t.box.state().undo,null);assert.equal(t.box.state().savingVisit,false);assert.match(t.messages.at(-1),/未能保存/);assert.equal(t.writes.length,0);
});
test('async persistence failure is visible and retained change can be undone after recovery',async()=>{
 const t=setup({flush:async()=>{throw Error('synthetic conflict')}});await t.box.toggle('a');assert.match(t.messages.at(-1),/同步未完成/);assert.ok(t.box.state().undo.a);assert.equal(t.box.state().savingVisit,false);
 t.control.flush=async()=>{};await t.box.undoVisit();assert.equal(t.box.state().visited.a,'2020-01-01T00:00:00.000Z');assert.match(t.messages.at(-1),/已撤销/);
});
test('relighting uses the same city record without duplicates',async()=>{const t=setup();await t.box.toggle('a');await t.box.toggle('a');assert.equal(t.box.state().counts.cityCount,2);assert.equal(JSON.parse(t.writes.at(-1)[1]).cities.filter(c=>c.id==='a').length,1);});
test('unknown city does not alter state',async()=>{const t=setup();await t.box.toggle('missing');assert.equal(t.writes.length,0);assert.equal(t.box.state().counts.cityCount,2);});
