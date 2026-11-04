const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const C=require('../footprint-world-core.js'),M=require('../footprint-memoir-core.js'),P=require('../city-memory-core.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');const script=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];const D=JSON.parse(script('china-footprints-data')),known=new Set(D.cities.map(c=>c.id));const ctx={window:{}};vm.runInNewContext(script('china-footprints-core'),ctx);const F=ctx.window.ChinaFootprintsCore;
const kyoto=D.cities.find(c=>c.name==='京都'),rome=D.cities.find(c=>c.name==='罗马');
test('China and world share stable cities; original Chinese records retain their IDs and coordinates',()=>{assert.equal(known.size,D.cities.length);assert.ok(D.cities.filter(c=>!c.world).length>300);assert.deepEqual(D.cities.find(c=>c.id==='110000').coords,[116.405285,39.904989]);assert.ok(kyoto.world);for(const c of D.cities){const [x,y]=C.project(c.coords);assert.ok(Number.isFinite(x)&&Number.isFinite(y));}});
test('wishes and planned cities never light cities or inflate visited statistics',()=>{const visited={'110000':'2024-01-01'};const before=JSON.stringify(visited);const wishes=[kyoto.id,'532900'];const s=C.summary(D.cities,visited,wishes,[kyoto.id], 'world');assert.deepEqual(s,{visited:1,wishes:2,trip:1,regions:1});assert.equal(JSON.stringify(visited),before);assert.equal(C.summary(D.cities,{},wishes,[kyoto.id],'world').visited,0);});
test('overlapping wish and visit remain independent; China totals exclude overseas visits',()=>{const visited={[rome.id]:'2024-04-10','110000':'2024-01-01'};assert.deepEqual(C.summary(D.cities,visited,[rome.id],[],'china'),{visited:1,wishes:0,trip:0,regions:1});assert.deepEqual(C.summary(D.cities,visited,[rome.id],[],'world'),{visited:2,wishes:1,trip:0,regions:2});});
test('empty wishes stay empty; the strip shows only four unique explicit wishes',()=>{assert.deepEqual(C.wishPage([],D.cities,'world'),{all:[],visible:[],overflow:0});const ids=['110000','310000','532900',kyoto.id,rome.id];const p=C.wishPage([...ids,kyoto.id,'unknown'],D.cities,'world');assert.deepEqual(p.visible,ids.slice(0,4));assert.equal(p.overflow,1);});
test('foreign search supports Chinese, English, country and distinct namesakes',()=>{const regions=new Map(D.provinces.map(p=>[p.id,p]));assert.equal(C.search(D.cities,regions,'京都')[0].id,kyoto.id);assert.equal(C.search(D.cities,regions,'Kyoto')[0].id,kyoto.id);assert.ok(C.search(D.cities,regions,'日本').some(c=>c.id===kyoto.id));assert.ok(C.search(D.cities,regions,'悉尼').length>=2);});
test('Jeju city and wish searches resolve island, city and multilingual aliases to one saved identity',()=>{
 const regions=new Map(D.provinces.map(p=>[p.id,p]));
 const jeju=D.cities.find(c=>c.id==='world-1159135293');assert.ok(jeju);assert.equal(jeju.country,'KOR');assert.deepEqual(jeju.coords,[126.521931,33.510137]);
 for(const q of ['济州岛','济州','济州市','濟州島','Jeju','jeju island','Cheju','제주도']){
  assert.deepEqual(C.search(D.cities,regions,q).map(c=>c.id),[jeju.id],q+' wish search');
  assert.deepEqual(D.cities.filter(c=>F.matches(c,q,regions)).map(c=>c.id),[jeju.id],q+' city picker');
 }
 const wishes=M.clean({version:1,wishes:[jeju.id,jeju.id],visits:[]},known).wishes;
 assert.deepEqual(wishes,[jeju.id]);assert.equal(C.summary(D.cities,{},wishes,[],'world').visited,0);
 assert.equal(F.clean(F.pack({[jeju.id]:'2026-10-27'}),known).skipped,0);
});
test('existing backup format round-trips overseas visits and wishes without changing historical records',()=>{const raw=F.pack({'110000':'2024-01-01',[rome.id]:'2024-04-10'});const result=F.clean(raw,known);assert.equal(result.skipped,0);assert.equal(Object.keys(result.visited).length,2);const data={version:1,wishes:[kyoto.id],visits:[{id:'visit-rome',cityId:rome.id,startDate:'2024-04-10',endDate:'2024-04-15',trip:'Italy',order:1}]};assert.deepEqual(M.clean(JSON.parse(JSON.stringify(data)),known),data);assert.equal(P.catalog(D).get('city:'+rome.id).legacy,false);});
test('country aggregation collapses cities, excludes wishes from visits and ignores unknown IDs',()=>{
 const visited={'110000':'2024-01-01','310000':'2024-02-02',[rome.id]:'2024-04-10',unknown:'2024-01-01'},before=JSON.stringify(visited);
 const groups=C.countries(D.cities,visited,[kyoto.id,kyoto.id,rome.id,'missing'],[kyoto.id]);
 assert.equal(groups.length,3);assert.deepEqual(groups.find(g=>g.id==='CHN').visited,['110000','310000']);assert.equal(groups.find(g=>g.id==='JPN').visited.length,0);assert.deepEqual(groups.find(g=>g.id==='JPN').wishes,[kyoto.id]);assert.equal(groups.filter(g=>g.visited.length).length,2);assert.equal(groups.reduce((n,g)=>n+g.visited.length,0),3);assert.equal(JSON.stringify(visited),before);
 assert.deepEqual(C.countries(D.cities,{},[],[]),[]);
});
test('country fit keeps nearby islands and avoids spanning the globe for remote polygons',()=>{
 assert.deepEqual(C.landExtent('M100,100L130,100L130,130L100,130ZM133,110L136,110L136,114ZM800,400L802,400L802,402Z'),[100,100,136,130]);
 assert.equal(C.landExtent(''),null);
});
test('all six range and mode combinations share scoped totals and map records',()=>{
 const visited={'110000':'2023-01-01','310000':'2024-01-01',[rome.id]:'2024-04-10'},wishes=[kyoto.id,'532900'];
 const stops=[{cityId:'110000',order:1},{cityId:kyoto.id,order:2},{cityId:'110000',order:3}];
 const expected={china:{all:[2,2],trip:[1,1],replay:[1,1]},world:{all:[3,2],trip:[2,2],replay:[2,2]}};
 for(const scope of ['china','world'])for(const mode of ['all','trip','replay']){
  const c=C.browse(D.cities,visited,wishes,{mode,stops,lit:['110000',rome.id]},scope);
  assert.deepEqual([c.summary.cities,c.summary.regions],expected[scope][mode],scope+' '+mode);
  assert.equal(c.wishes.length,mode==='all'?(scope==='china'?1:2):0);
  if(mode==='trip'){assert.equal(c.stops.length,scope==='china'?2:3);assert.ok(!Object.hasOwn(c.marked,kyoto.id));}
  if(mode==='replay')assert.ok(!Object.hasOwn(c.marked,'310000'));
 }
 assert.deepEqual(C.browse(D.cities,{},wishes,{mode:'all'},'world').summary,{cities:0,regions:0});
});
test('current itinerary stop dates preserve return visits and never use historical dates',()=>{
 const days=[{city:'北京',date:'2027-01-01'},{city:'北京',date:'2027-01-02'},{city:'京都',date:'2027-01-03'},{city:'北京',date:'2027-01-05'}];
 assert.deepEqual(M.currentStops({days},D.cities).map(s=>[s.cityId,s.startDate,s.endDate,s.order]),[
  ['110000','2027-01-01','2027-01-02',1],[kyoto.id,'2027-01-03','2027-01-03',2],['110000','2027-01-05','2027-01-05',3]
 ]);
 assert.equal(M.currentStops(null,D.cities,['110000'])[0].startDate,'');
});
