const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../guide-supplements.js'),C=require('../dot-import-core.js'),M=require('../guide-comparison.js');
const source={id:'public:one',type:'system',title:'测试公开报道',url:'https://mz.yn.gov.cn/article',publishedAt:'2024-05-11',checkedAt:'2026-10-19',discoveryTopic:'villages',kinds:['sight','experience'],reasons:[{label:'公开报道',text:'村落保留着傣式建筑。'}]};
const payload=(name='测试古寨',cityId='banna')=>({status:'ready',cityId,topic:'villages',places:[{name,city:'西双版纳',cityId,sourceId:'sight:public-'+ 'a'.repeat(20),kind:'sight',evidence:source,photos:[{url:'https://mz.yn.gov.cn/photo.jpg',sourceURL:source.url,width:800,height:500}]}]});
const present=rows=>S.mergeRows(rows.map(S.enrich));

test('new public places are discoverable without automatically choosing or scheduling',()=>{
 const data=payload();data.places[0].evidence={...source,type:'platform',url:'https://tw.trip.com/moments/poi-test-123/'};data.places[0].photos=[];
 const rows=S.discoveryCandidates(data),before=structuredClone(rows),merged=present(rows);
 assert.equal(S.discoveryRows(merged,C.empty('t'),[],['banna']).length,1);
 assert.equal(rows[0].choice,null);assert.equal(S.suggest({rows:merged,day:{cityId:'banna'}}).items.length,0);assert.deepEqual(rows,before);
 assert.equal(S.discoveryCandidates({...payload(),status:'unavailable'}).length,0);
});
test('same-city/name sources merge and keep existing ID, judgement, images and independent ratio',()=>{
 const mine={place:{sourceId:'dot:mine',cityId:'banna',kind:'sight',name:'测试古寨',dotSources:[{...source,id:'guide:a',guideId:'guide',type:'dot',recommendationPercentage:14}]},choice:'skip',city:'西双版纳'};
 const before=structuredClone(mine),merged=S.withDiscoveredRows([mine],S.discoveryCandidates(payload()));
 assert.equal(merged.length,1);assert.equal(merged[0].place.sourceId,'dot:mine');assert.equal(merged[0].choice,'skip');assert.equal(merged[0].place.publicPhotos.length,1);
 assert.equal(S.recommendationSources(present(merged)[0]).length,2);assert.equal(merged[0].place.dotSources[0].recommendationPercentage,14);assert.deepEqual(mine,before);
 assert.equal(S.withDiscoveredRows(merged,S.discoveryCandidates(payload())).length,1);
 assert.equal(S.withDiscoveredRows([mine],S.discoveryCandidates(payload('测试古寨','puer'))).length,2);
});
test('selected public candidate and its sources survive offline reload and share the daily identity',()=>{
 const [row]=S.discoveryCandidates(payload());
 let state=C.decide(C.empty('t'),row,'wish','2026-10-19');state=C.validate(JSON.parse(JSON.stringify(state)),'t');
 const offline=C.mergeCatalog([],state),model=present(offline)[0];
 assert.equal(model.choice,'wish');assert.deepEqual(model.place.publicPhotos,row.place.publicPhotos);assert.equal(S.recommendationSources(model)[0].url,source.url);
 const day={cityId:'banna'},assignment={active:true,place:structuredClone(model.place),slot:'morning',dayId:'d1'};
 assert.equal(S.suggest({rows:[model],day,assignments:[]}).items.length,1);
 assert.equal(S.suggest({rows:[model],day,assignments:[assignment]}).items.length,0);
 assert.equal(assignment.place.sourceId,state.items[0].sourceId);
 const existing=C.mergeCatalog([{...row,place:{...row.place,publicEvidence:[],publicPhotos:[]}}],state)[0];assert.equal(existing.place.publicEvidence.length,1);
});
test('later imported guide merges into public place; guide removal retains public sources and wish',()=>{
 const [row]=S.discoveryCandidates(payload());let state=C.decide(C.empty('t'),row,'wish','2026-10-19');
 const result={source:{fingerprint:'b'.repeat(64),url:'https://www.xiaohongshu.com/explore/'+'b'.repeat(24),title:'测试攻略',method:'manual',kind:'note',text:'测试',images:[]},places:[{rank:1,name:row.place.name,kind:'sight',classification_manual:true,reasons:[{text:'攻略中的体验观点。'}],recommendation_percentage:19}]};
 state=C.importGuide(state,result,{id:'banna',name:'西双版纳'},C.mergeCatalog([],state),'2026-10-19',()=> 'testid').state;
 assert.equal(state.items.length,1);assert.equal(state.items[0].choice,'wish');assert.equal(state.items[0].sourceId,row.place.sourceId);
 state=C.removeGuide(state,'b'.repeat(64)).state;const [reopened]=present(C.mergeCatalog([],state));
 assert.equal(reopened.choice,'wish');assert.equal(S.recommendationSources(reopened)[0].url,source.url);assert.equal(reopened.place.publicPhotos.length,1);
});
test('drive time stays separate from visit duration; source captions are not choice criteria',()=>{
 const [row]=S.discoveryCandidates(payload());row.place.publicEvidence[0].reasons=[{label:'位置',text:'距告庄十几分钟车程，适合时间紧顺路打卡。'},{label:'停留',text:'参观大约需要两小时。'}];
 const enriched=S.enrich(row),e=M.evidence(enriched);assert.equal(e.cells.transport.length,1);assert.equal(e.cells.time.length,1);assert(!e.cells.time[0].text.includes('车程'));
 const fresh=present(S.discoveryCandidates(payload()))[0];assert.equal(M.choiceAdvice([fresh])[0].focus,'');
 fresh.systemEvidence[0].reasons=[{label:'公开报道',text:'村里保留傣式建筑，周围是热带雨林。'}];
 assert.equal(M.choiceAdvice([fresh])[0].text,'傣式建筑、热带雨林（2024年报道）');
 fresh.systemEvidence[0].reasons=[{label:'公开报道',text:'尚未开放非遗体验馆。'}];assert.equal(M.choiceAdvice([fresh])[0].text,'尚未开放非遗体验馆。');
});
test('village comparison defaults to four when available and preserves optional manual selection',()=>{
 const rows=Array.from({length:5},(_,i)=>{const r=S.discoveryCandidates(payload('测试'+i+'古寨'))[0];r.place.sourceId+='-'+i;return S.enrich(r);});
 const group=M.groups(rows,{city:'banna',kind:'sight'}).find(g=>g.label==='村寨与街区');assert.equal(M.select(group).length,4);assert.deepEqual(M.select(group,[rows[3].place.sourceId,rows[4].place.sourceId]),[rows[3].place.sourceId,rows[4].place.sourceId]);
});
test('public sources and daily references survive the existing complete backup and restore format',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ctx={DotImportCore:C,module:{exports:{}},console,window:{DotImportCore:C}};vm.createContext(ctx);
 vm.runInContext(html.match(/<script id="guide-backup-feature">([\s\S]*?)<\/script>/)[1],ctx);const B=ctx.module.exports;
 vm.runInContext(html.match(/<script id="daily-plan-core">([\s\S]*?)<\/script>/)[1],ctx);
 const [row]=S.discoveryCandidates(payload()),config=B.config({tripId:'t'},{trip_id:'t',todo_revision:'1'},'test');
 const raw={type:B.TYPE,version:B.VERSION,tripId:'t',packingTripId:'t',createdAt:'2026-10-19T00:00:00Z',records:Object.fromEntries(Object.keys(config.slots).map(k=>[k,null])),media:{memories:[],references:[]}};
 raw.records.guideImports=C.decide(C.empty('t'),row,'wish','2026-10-19');
 raw.records.dailyPlan=ctx.window.DailyPlanCore.clean({version:1,entries:[{id:'e1',dayId:'d1',slot:'morning',place:row.place}]});
 B.validate(raw,config);
 const io={storage:new Map(),readMedia:async()=>({memories:[],references:[]}),writeMedia:async()=>{}};io.storage.getItem=io.storage.get.bind(io.storage);io.storage.setItem=io.storage.set.bind(io.storage);io.storage.removeItem=io.storage.delete.bind(io.storage);
 await B.restore(raw,config,io);
 const saved=JSON.parse(io.storage.get(config.slots.guideImports.key)),daily=JSON.parse(io.storage.get(config.slots.dailyPlan.key));
 assert.equal(saved.items[0].choice,'wish');assert.equal(daily.entries[0].place.sourceId,saved.items[0].sourceId);assert.equal(daily.entries[0].place.publicPhotos[0].url,row.place.publicPhotos[0].url);
 assert.equal(S.recommendationSources(present(C.mergeCatalog([],saved))[0])[0].url,source.url);
});
