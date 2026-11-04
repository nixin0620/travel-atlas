const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../guide-supplements.js'),C=require('../dot-import-core.js'),M=require('../guide-comparison.js');
const row=(id,name,kind='sight',cityId='banna',choice=null)=>({place:{sourceId:id,name,kind,cityId},city:cityId==='banna'?'西双版纳':'普洱',choice});
const craft=()=>row('experience:manzhang-crafts','曼掌村 · 傣锦与慢轮傣陶','experience');
const craftShop=()=>row('shopping:place-manzhang','勐养曼掌村 · 手作工坊','shopping');
const coffee=()=>row('experience:puer-coffee','小凹子 · 产地咖啡','experience','puer');
const shop=()=>row('shopping:place-pubo','普博文创居','shopping','puer');
const source=(id,percentage,text='来源中的游玩体验。')=>({id:id+':1',guideId:id,title:'测试攻略 '+id,url:'https://www.xiaohongshu.com/explore/'+id.repeat(24),recommendationPercentage:percentage,reasons:[{label:'体验',text}],imageIndices:[0]});
const merged=(rows,state={items:[]},assignments=[])=>S.mergeRows(rows.map(S.enrich),state,assignments);

test('reviewed supplements reuse original IDs and contain traceable reasons, publication and review dates',()=>{
 for(const base of [craft(),craftShop(),coffee(),shop(),row('experience:mengyuan-rainforest','勐远仙境 · 向导带领的雨林徒步','experience'),row('shopping:place-puer-oldstreet','思茅老街 · 茶咖与文创','shopping','puer'),row('shopping:place-lazy','三曼村 · lazy lazy 不忙集合店','shopping')]){
  const before=structuredClone(base),next=S.enrich(base),[e]=S.recommendationSources(next);
  assert.equal(next.place.sourceId,base.place.sourceId);assert.equal(e.type,'system');assert(e.reasons.every(r=>r.text));assert(S.sourceLink(e.url,e.title));assert.match(e.publishedAt,/^\d{4}-\d{2}-\d{2}$/);assert.equal(e.checkedAt,'2026-10-19');assert.equal(e.recommendationPercentage,undefined);assert.deepEqual(base,before);
 }
});
test('legacy rankings, unrelated cities and generic source links do not become supplemental recommendations',()=>{
 const popular=row('sight:popular','热门植物园');popular.systemSources=[{url:'https://example.org/reference',title:'资料'}];
 const rows=merged([popular,craft(),coffee()]);
 assert.deepEqual(S.discoveryRows(rows,{items:[]},[],['puer']).map(r=>r.place.sourceId),[]);
 assert.equal(S.discoveryRows(rows,{items:[]},[],[]).length,0);
});
test('moving or renaming an old place cannot attach unrelated reviewed evidence',()=>{
 const moved={...craft(),place:{...craft().place,cityId:'puer'}};
 const renamed={...craft(),place:{...craft().place,name:'另一个村'}};
 assert.equal(S.enrich(moved).systemEvidence,undefined);assert.equal(S.enrich(renamed).systemEvidence,undefined);
});
test('one place with imported, experience and shopping sources produces one card and independent source ratios',()=>{
 const imported=row('dot:manzhang','曼掌村');imported.place.dotSources=[source('a',14),source('b',31,'另一篇攻略的不同观点。')];
 const rows=[craft(),craftShop(),imported],before=structuredClone(rows),[r]=merged(rows);
 assert.equal(merged(rows).length,1);assert.equal(r.place.sourceId,'dot:manzhang');assert.equal(r.displayName,'曼掌村');assert.equal(r.systemEvidence.length,1);assert.equal(S.recommendationSources(r).length,3);
 assert.deepEqual(r.place.dotSources.map(s=>s.recommendationPercentage),[14,31]);
 for(const kind of ['all','sight'])assert(S.matchesKind(r,kind));
 for(const kind of ['experience','shopping'])assert(!S.matchesKind(r,kind));
 assert(!S.matchesKind(r,'food'));assert.deepEqual(rows,before);
});
test('same names in other cities, branches and confirmed different POIs never collapse',()=>{
 const other=row('dot:other','曼掌村','sight','puer'),branch=row('dot:branch','曼掌村手作坊（东店）');
 assert.equal(merged([craft(),other,branch]).length,3);
 const a=craft(),b=row('dot:b','曼掌村');a.place.poiId='osm:N:1';b.place.poiId='osm:N:2';assert.equal(merged([a,b]).length,2);
});
test('personal guides stay first, supplements do not default to wish, historic decisions and schedules survive',()=>{
 const own=row('dot:own','导入餐馆','food');own.place.dotSources=[source('a',38)];
 const old=row('sight:legacy','历史地点','sight','other','maybe'),scheduled=row('sight:scheduled','旧日程地点','sight','other');
 const assignments=[{active:true,place:scheduled.place,dayId:'old-day',slot:'evening'}],before=structuredClone(assignments);
 const platformCraft=craft();platformCraft.place.publicEvidence=[{type:'platform',url:'https://tw.trip.com/moments/poi-manzhang-village-24592314/',title:'Trip · 曼掌村',checkedAt:'2026-10-19',kinds:['experience'],reasons:[{text:'平台中的手工体验。'}]}];
 const rows=S.discoveryRows(merged([platformCraft,old,scheduled,own]),{items:[]},assignments,['banna']);
 assert.equal(rows[0].place.sourceId,'dot:own');assert.equal(rows.find(r=>r.place.sourceId===craft().place.sourceId).choice,null);
 assert(rows.some(r=>r.place.sourceId==='sight:legacy'));assert(rows.some(r=>r.place.sourceId==='sight:scheduled'));assert.deepEqual(assignments,before);
});
test('latest decisions, including clearing a wish, win across aliases without editing stored rows',()=>{
 const a=craft();a.choice='wish';const b=row('dot:mine','曼掌村','sight','banna','skip');
 const state={items:[{sourceId:a.place.sourceId,decisionAt:'2026-10-18'},{sourceId:b.place.sourceId,decisionAt:'2026-10-19'}]},before=structuredClone(state);
 assert.equal(merged([a,b],state)[0].choice,'skip');b.choice=null;assert.equal(merged([a,b],state)[0].choice,null);assert.deepEqual(state,before);
});
test('combined views deduplicate identical statements and retain differences, cautions and citations',()=>{
 const r=S.enrich(craft()),fact=r.systemEvidence[0].reasons[0].text;
 r.place.dotSources=[source('a',21,fact),source('b',9,'可以做手工，但交通需要另行安排。')];
 r.place.dotSources[1].reasons.push({label:'注意',text:'不建议在下雨时前往。'});
 const sources=S.recommendationSources(r),view=C.recommendationView(sources),points=[...view.visible,...view.more];
 assert.equal(points.filter(p=>p.text===fact).length,1);assert.deepEqual(points.find(p=>p.text===fact).sourceIndexes,[0,2]);assert(points.some(p=>p.caution));assert(points.some(p=>p.text.includes('交通需要')));
});
test('a same-city comparison can mix source types and derived facets without borrowing unsourced price or time',()=>{
 const personal=row('dot:craft','另一手作工坊','experience');personal.place.dotSources=[source('a',41,'体验做陶器。')];
 const mergedCraft=merged([craft(),row('sight:manzhang','曼掌村')])[0];mergedCraft.place.price='99元';mergedCraft.place.hours='1小时';
 const groups=M.groups([personal,mergedCraft],{city:'banna',kind:'experience'});assert(groups.length);assert(groups[0].rows.includes(mergedCraft));
 const e=M.evidence(mergedCraft);assert(e.cells.experience.length);assert.equal(e.cells.time.length,0);assert.equal(e.cells.budget.length,0);assert.equal(e.sources[0].type,'system');assert(!JSON.stringify(e).includes('99元'));
});
test('source URLs alone, missing review evidence or unsafe links do not populate comparisons',()=>{
 const r=shop();r.systemSources=[{url:'https://example.org/article',title:'旧资料',reasons:[{text:'未核实价格 20 元'}]}];assert.equal(M.evidence(r).sources.length,0);
 for(const patch of [{checkedAt:''},{url:'javascript:alert(1)'},{reasons:[]}]){
  const enriched=S.enrich(r);Object.assign(enriched.systemEvidence[0],patch);assert.equal(M.evidence(enriched).sources.length,0);
 }
});
test('system-only candidates use the existing wish/store path, round-trip with the same ID and stay schedulable',()=>{
 const base=coffee(),r=merged([base])[0],state=C.decide(C.empty('test-trip'),r,'wish','2026-10-19T01:00:00Z');
 const reopened=C.validate(JSON.parse(JSON.stringify(state)),'test-trip'),catalog=C.mergeCatalog([base],reopened),presented=merged(catalog,reopened);
 assert.equal(presented[0].choice,'wish');assert.equal(presented[0].place.sourceId,base.place.sourceId);assert.equal(reopened.items[0].linked,true);
 const assignment={active:true,place:structuredClone(presented[0].place),dayId:'test-day',slot:'afternoon'},before=structuredClone(assignment);
 assert.equal(S.suggest({rows:presented,day:{cityId:'puer'},assignments:[assignment]}).items.length,0);assert.deepEqual(assignment,before);
});
test('remove/reparse imports preserves other source facts, original images, decisions and daily identity',()=>{
 let n=0;const city={id:'banna',name:'西双版纳'},now='2026-10-19T01:00:00Z',base=[craft(),craftShop()];
 const result=(id,text)=>({source:{fingerprint:id.repeat(64),url:'https://www.xiaohongshu.com/explore/'+id.repeat(24),title:'测试攻略 '+id,method:'manual',kind:'note',text,images:[{data:'data:image/png;base64,aW1hZ2U=',sha256:'f'.repeat(64)}]},places:[{rank:1,name:'曼掌村',kind:'sight',classification_manual:true,reasons:[{text}],recommendation_percentage:23}]});
 let state=C.importGuide(C.empty('test-trip'),result('a','来源甲的体验。'),city,base,now,()=>String(++n)).state;
 state=C.importGuide(state,result('b','来源乙的体验。'),city,C.mergeCatalog(base,state),now,()=>String(++n)).state;
 let rows=merged(C.mergeCatalog(base,state),state);assert.equal(rows.length,1);
 state=C.decide(state,rows[0],'wish',now);const id=rows[0].place.sourceId,assignment={active:true,place:structuredClone(rows[0].place),dayId:'d1',slot:'morning'},before=structuredClone(assignment);
 state=C.removeGuide(state,'a'.repeat(64)).state;rows=merged(C.mergeCatalog(base,state),state,[assignment]);
 assert.equal(rows.length,1);assert.equal(rows[0].choice,'wish');assert.equal(rows[0].place.sourceId,id);assert.equal(S.recommendationSources(rows[0]).length,2);assert(!JSON.stringify(S.recommendationSources(rows[0])).includes('来源甲'));assert.equal(state.guides[0].images.length,1);
 state=C.importGuide(state,result('b','重新解析的体验。'),city,C.mergeCatalog(base,state),now,()=>String(++n),{replaceGuideId:'b'.repeat(64)}).state;
 rows=merged(C.mergeCatalog(base,state),state,[assignment]);assert.equal(rows[0].choice,'wish');assert(JSON.stringify(S.recommendationSources(rows[0])).includes('重新解析'));assert.equal(rows[0].systemEvidence.length,1);assert.deepEqual(assignment,before);
});

test('category is exclusive and manual correction wins independently of the newest decision',()=>{
 const a=craft(),b=row('dot:mine','曼掌村','food');b.place.dotSources=[source('a',12)];a.choice='wish';
 const state={items:[{sourceId:a.place.sourceId,decisionAt:'2026-10-19',choice:'wish'},{sourceId:b.place.sourceId,editedAt:'2026-10-18'}]},before=structuredClone(state);
 const [r]=merged([a,b],state);assert.equal(r.choice,'wish');assert.equal(r.place.kind,'food');
 assert.deepEqual(['sight','food','experience','shopping'].filter(k=>S.matchesKind(r,k)),['food']);assert.deepEqual(state,before);
});


test('publisher badges use URL identity, never the system mechanism or spoofed platform title',()=>{
 const identity=url=>S.sourceIdentity({url,title:'系统推荐 Trip.com',type:'system'});
 for(const [url,label] of [['https://tw.trip.com/moments/poi-1/','Trip'],['https://www.dianping.com/shop/abc','大众点评'],['https://www.xiaohongshu.com/s/dot?dot_share_id=test','点点攻略'],['https://www.xiaohongshu.com/explore/abc','小红书笔记']])assert.equal(identity(url).label,label);
 for(const url of ['https://trip.com.evil.example/poi','https://eviltrip.com/poi','https://mz.yn.gov.cn/article'])assert.equal(identity(url).platform,false);
 assert.equal(identity('https://society.yunnan.cn/article').label,'云南网');
});
test('matched platform evidence supersedes legacy news in presentation without mutating history or guide ratios',()=>{
 const r=S.enrich(craft());r.place.dotSources=[source('a',14),source('b',31)];
 const legacy=structuredClone(r.systemEvidence),platform={type:'platform',title:'Trip · 曼掌村',url:'https://tw.trip.com/moments/poi-manzhang-village-24592314/',checkedAt:'2026-10-19',reasons:[{text:'平台实读内容。'}]};
 r.systemEvidence.push(platform);const shown=S.recommendationSources(r);
 assert.deepEqual(shown.map(s=>S.sourceIdentity(s).label),['小红书笔记','小红书笔记','Trip']);assert.deepEqual(shown.slice(0,2).map(s=>s.recommendationPercentage),[14,31]);assert.deepEqual(r.systemEvidence[0],legacy[0]);
 const model={row:r,...M.evidence(r)},result={name:r.place.name,cityId:r.place.cityId,status:'verified',sources:[platform],facts:[{field:'hours',text:'测试开放时段',sourceIndex:0}]};
 const filled=M.withFacts(model,result);assert.equal(filled.sources.length,3);assert.deepEqual(filled.cells.hours[0].sourceIndexes,[2]);
});
