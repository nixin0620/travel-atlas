const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../guide-comparison.js'),C=require('../dot-import-core.js'),S=require('../guide-supplements.js');
const source=(id='a',reasons=[{label:'体验',text:'测试来源明确给出的体验。'}])=>({id:id+':1',guideId:id,title:'测试攻略 '+id,url:'https://www.xiaohongshu.com/explore/'+id.repeat(24),recommendationPercentage:41,reasons});
const row=(id,name='测试植物园',kind='sight',city='banna')=>({place:{sourceId:id,name,kind,cityId:city,dotSources:[source()]},city,choice:null});
test('automatic groups stay within city and category and exclude unsourced, unknown and rejected places',()=>{
 const rows=[row('a','甲植物园'),row('b','乙花卉园'),row('c','甲米线','food'),row('d','乙小吃','food'),row('e','丙植物园','sight','puer'),row('f','丁植物园','sight','puer'),{...row('g'),choice:'skip'},row('h','unknown','manual'),row('i','未定位植物园','sight','unknown')];
 rows.push({...row('legacy'),place:{...row('legacy').place,dotSources:[]}});
 const before=structuredClone(rows),groups=M.groups(rows);
 assert(groups.length>=3);
 for(const g of groups){assert(g.rows.length>=2);assert.equal(new Set(g.rows.map(r=>r.place.cityId)).size,1);assert.equal(new Set(g.rows.map(r=>r.place.kind)).size,1);assert(!g.rows.some(r=>['g','h','i','legacy'].includes(r.place.sourceId)));}
 assert(M.groups(rows,{city:'banna',kind:'food'}).every(g=>g.cityId==='banna'&&g.kind==='food'));
 assert.deepEqual(rows,before);
});
test('single place or same name in different cities does not create a comparison',()=>{assert.equal(M.groups([row('a')]).length,0);assert.equal(M.groups([row('a'),row('b','测试植物园','sight','puer')]).length,0);});
test('name-only imports do not produce empty automatic comparisons but remain available for manual adjustment',()=>{
 const empty=row('empty');empty.place.dotSources[0].reasons=[];
 assert.equal(M.groups([row('a'),empty]).length,0);
 const group=M.groups([row('a'),row('b'),empty])[0];assert.equal(group.rows.length,2);assert.equal(group.pool.length,3);assert(!M.select(group).includes('empty'));
});
test('fine type uses explicit names, not an incidental comparison in a review',()=>{
 const village=row('v','测试古寨');village.place.dotSources[0].reasons=[{text:'附近还有植物园，可以顺路。'}];
 const groups=M.groups([village,row('a','甲植物园'),row('b','乙花卉园')]);
 assert.deepEqual(groups.find(g=>g.label==='园林景观').rows.map(r=>r.place.sourceId),['a','b']);
});
test('defaults are immediately usable, independent of percentages; manual adjustment remains bounded and valid',()=>{
 const rows=Array.from({length:5},(_,i)=>row(String(i),i+'植物园'));rows[4].choice='wish';rows[0].place.dotSources[0].recommendationPercentage=99;
 const group=M.groups(rows)[0],ids=M.select(group);assert.equal(ids.length,3);assert.equal(ids[0],'4');
 assert.deepEqual(M.select(group,['1','3']),['1','3']);assert.equal(M.select(group,['0','1','2','3','4']).length,4);
 const after={...group,rows:rows.slice(2),pool:rows.slice(2)};assert(M.select(after,['0','1']).every(id=>Number(id)>=2));
});
test('only source quotations enter comparison, missing data stays empty and independent ratios survive',()=>{
 const r=row('x');r.place.hours='伪造营业时间';r.place.description='预设很好玩';
 r.place.dotSources=[source('a',[{label:'体验',text:'可以看热带植物。'},{label:'游玩建议',text:'建议留半天。'},{label:'价格',text:'票价 60 元。'},{label:'注意',text:'雨天路滑，不宜推婴儿车。'}]),{...source('b',[{label:'体验',text:'可以看热带植物。'},{label:'价格',text:'票价 80 元。'}]),recommendationPercentage:70}];
 const before=structuredClone(r),m=M.evidence(r);
 assert.deepEqual(m.sources.map(s=>s.recommendationPercentage),[41,70]);assert.equal(m.cells.experience.length,1);assert.deepEqual(m.cells.experience[0].sourceIndexes,[0,1]);assert.equal(m.cells.budget.length,2);assert.equal(m.cells.caution.length,1);assert.equal(m.cells.time.length,1);
 assert(!JSON.stringify(m).includes('预设很好玩'));assert(!JSON.stringify(m).includes('伪造营业时间'));assert.deepEqual(r,before);
 const empty=row('empty');empty.place.dotSources[0].reasons=[];assert(Object.values(M.evidence(empty).cells).every(cell=>cell.length===0));
});
test('conflicting views, negation and time/budget units stay intact and traceable',()=>{
 const r=row('x');r.place.dotSources=[source('a',[{text:'适合亲子。预计 2 小时；人均 30–40 元。'}]),source('b',[{label:'注意',text:'不适合亲子，台阶很多。'}])];
 const m=M.evidence(r),points=Object.values(m.cells).flat();assert.equal(points.length,4);
 assert(points.some(p=>p.text==='不适合亲子，台阶很多。'));assert(points.every(p=>p.sourceIndexes.length));
 assert(m.cells.budget.some(p=>p.text==='人均 30–40 元。'));assert(m.cells.time.some(p=>p.text==='预计 2 小时；'));
});
test('unsafe or absent links cannot provide comparison evidence',()=>{const r=row('bad');r.place.dotSources[0].url='javascript:alert(1)';assert.equal(M.evidence(r).sources.length,0);assert.equal(M.safeURL('https://user:pass@example.org'), '');assert.equal(M.groups([r,row('good')]).length,0);});
test('topic navigation keeps two alternatives visible, with all other topics accessible in more',()=>{
 const groups=Array.from({length:9},(_,i)=>({key:'topic-'+i}));
 const before=structuredClone(groups),nav=M.topicNavigation(groups,'topic-5');
 assert.equal(nav.quick.length,2);assert.equal(nav.more.length,6);
 assert.deepEqual([...nav.quick,...nav.more].map(g=>g.key),groups.filter(g=>g.key!=='topic-5').map(g=>g.key));
 assert.deepEqual(M.topicNavigation([{key:'only'}],'only'),{quick:[],more:[]});assert.deepEqual(groups,before);
 const related=[{key:'far',cityId:'puer',kind:'food'},{key:'other',cityId:'banna',kind:'food'},{key:'outdoor',cityId:'banna',kind:'experience'},{key:'current',cityId:'banna',kind:'experience'}];
 assert.deepEqual(M.topicNavigation(related,'current').quick.map(g=>g.key),['outdoor','other']);
});
test('takeaway quotes complete source sentences, retaining conditions, cautions and references',()=>{
 const a=row('a','手作甲'),b=row('b','步道乙');
 a.place.dotSources=[source('a',[{label:'手作',text:'可做造纸，适合亲子，但需另付带走费用。后面的营业信息。'}])];
 b.place.dotSources=[source('b',[{label:'徒步',text:'仅晴天适合新手，雨天不建议前往。'}])];
 const before=structuredClone([a,b]),summary=M.takeaway([a,b]);
 assert.equal(summary[0].text,'可做造纸，适合亲子，但需另付带走费用。');assert.equal(summary[1].text,'仅晴天适合新手，雨天不建议前往。');
 for(const p of summary){assert(p.sourceIndexes.length);for(const i of p.sourceIndexes)assert(p.sources[i].reasons.some(r=>r.text.includes(p.text)));}
 assert.deepEqual([a,b],before);
});
test('takeaway never falls back to unsourced descriptions or invents audience, prices and rankings',()=>{
 const a=row('a');a.place.description='最好玩，适合所有人，人均10元';a.place.dotSources[0].reasons=[];
 const b=row('b');b.place.dotSources[0].url='javascript:alert(1)';
 const summary=M.takeaway([a,b]);assert(summary.every(p=>p.text===''&&p.sourceIndexes.length===0));
 const unknown=row('c');unknown.place.dotSources[0].reasons=[{text:'园中可看热带植物。'}];
 assert.equal(M.takeaway([unknown])[0].text,'园中可看热带植物。');assert.equal(M.evidence(unknown).cells.audience.length,0);
});
test('audience dimension requires explicit evidence and does not discard negative or conditional views',()=>{
 const r=row('a');r.place.dotSources=[source('a',[{text:'适合植物爱好者。'},{text:'有儿童活动室。'},{text:'适合留半天慢逛。'}]),source('b',[{text:'雨天不适合亲子，路很滑。'}])];
 const cells=M.evidence(r).cells;
 assert.equal(cells.audience.length,1);assert.equal(cells.audience[0].text,'适合植物爱好者。');
 assert(cells.caution.some(p=>p.text==='雨天不适合亲子，路很滑。'));
 assert(cells.time.some(p=>p.text==='适合留半天慢逛。'));assert(cells.experience.some(p=>p.text==='有儿童活动室。'));
});
test('independent experience, audience and caution clauses stay sourced without duplicating the whole paragraph',()=>{
 const r=row('a');r.place.dotSources=[source('a',[{label:'非遗手作',text:'可体验造纸，亲子友好，注意问清体验与带走差价。'},{label:'出片',text:'可看热带植物，门口免费。'}])];
 const cells=M.evidence(r).cells;
 assert.equal(cells.audience[0].text,'亲子友好');assert.equal(cells.caution[0].text,'注意问清体验与带走差价。');
 assert(cells.experience.some(p=>p.text==='可体验造纸'));assert(cells.experience.some(p=>p.text==='可看热带植物'));assert.equal(cells.budget[0].text,'门口免费。');
 for(const p of Object.values(cells).flat())assert(r.place.dotSources[0].reasons.some(reason=>reason.text.includes(p.text)));
 const guarded=row('b');guarded.place.dotSources=[source('b',[{text:'仅限晴天，适合新手，雨天不建议前往。'}])];
 assert.equal(M.evidence(guarded).cells.caution[0].text,'仅限晴天，适合新手，雨天不建议前往。');
});
test('guide removal/reparse derives new comparisons without altering other sources, choices or assignments',()=>{
 let n=0;const city={id:'banna',name:'西双版纳'},now='2026-10-19T00:00:00Z';
 const result=(id,text)=>({source:{fingerprint:id.repeat(64),url:'https://www.xiaohongshu.com/explore/'+id.repeat(24),title:'测试攻略 '+id,method:'manual',kind:'note',text,images:[{data:'data:image/png;base64,aW1hZ2U=',sha256:'f'.repeat(64)}]},places:['甲植物园','乙植物园'].map((name,i)=>({rank:i+1,name,kind:'sight',classification_manual:true,reasons:[{label:'体验',text}],recommendation_percentage:20+i}))});
 let state=C.importGuide(C.empty('test'),result('a','来源甲的体验。'),city,[],now,()=>String(++n)).state;
 state=C.importGuide(state,result('b','来源乙的体验。'),city,C.mergeCatalog([],state),now,()=>String(++n)).state;
 state=C.decide(state,C.mergeCatalog([],state)[0],'wish',now);const scheduled=[{active:true,place:structuredClone(state.items[0].place),slot:'morning',dayId:'test-day'}],before=structuredClone(scheduled);
 const removed=C.removeGuide(state,'a'.repeat(64)).state,rows=S.mergeRows(C.mergeCatalog([],removed),removed,scheduled);
 assert.equal(M.groups(rows).length,1);assert.equal(rows[0].choice,'wish');assert.deepEqual(scheduled,before);assert.equal(removed.guides[0].images.length,1);
 const m=M.evidence(rows[0]);assert.equal(m.sources.length,1);assert(!JSON.stringify(m).includes('来源甲'));assert(JSON.stringify(m).includes('来源乙'));
 const replaced=C.importGuide(removed,result('b','更新后的体验。'),city,C.mergeCatalog([],removed),now,()=>String(++n),{replaceGuideId:'b'.repeat(64)}).state;
 assert.equal(replaced.items[0].choice,'wish');const updated=M.evidence(C.mergeCatalog([],replaced)[0]);assert(JSON.stringify(updated).includes('更新后的体验'));assert(!JSON.stringify(updated).includes('来源乙的体验'));assert.deepEqual(scheduled,before);
});
test('comparison context shows only one city and category, without an overlapping catch-all topic',()=>{
 const rows=[row('a','甲植物园'),row('b','乙花卉园'),row('c','丙博物馆'),row('d','甲小吃','food'),row('e','乙米线','food'),row('f','甲公园','sight','puer'),row('g','乙公园','sight','puer')];
 const groups=M.contextGroups(rows,{city:'all',kind:'all'});
 assert.equal(groups.length,1);assert(groups.every(g=>g.cityId==='banna'&&g.kind==='sight'));assert.equal(groups[0].key,'banna:sight:园林景观');
 assert(M.contextGroups(rows,{city:'puer',kind:'sight'}).every(g=>g.cityId==='puer'));assert.equal(M.contextGroups(rows,{city:'puer',kind:'food'}).length,0);assert.equal(M.contextGroups(rows,{city:'banna',kind:'food'})[0].kind,'food');
});
test('specific source labels give choice cues while conditions never become endorsements',()=>{
 const a=row('a');a.place.dotSources[0].reasons=[{label:'雨林徒步',text:'可沿林间步道徒步。'}];
 const b=row('b');b.place.dotSources[0].reasons=[{label:'亲子手作',text:'仅晴天适合亲子，雨天不建议前往。'}];
 const advice=M.choiceAdvice([a,b]);assert.equal(advice[0].focus,'雨林徒步');assert.equal(advice[1].focus,'');assert.equal(advice[1].text,'仅晴天适合亲子，雨天不建议前往。');
});
const decisionModels=rows=>rows.map(r=>({row:r,...M.evidence(r)}));
test('comparison consolidates equivalent activity lists with both source quotes, without changing originals',()=>{
 const points=[
  {label:'非遗手作',text:'主打傣陶、造纸等DIY',sourceIndexes:[0]},
  {label:'特色体验',text:'下河捞鱼可现场烤鱼，热带水果便宜实惠。',sourceIndexes:[0]},
  {label:'平台介绍',text:'還可以學習造紙、製陶等傳統手工文化',sourceIndexes:[1]}
 ],before=structuredClone(points),merged=M.mergeCellPoints(points);
 assert.equal(merged.length,2);
 assert.equal(merged[0].text,points[0].text);
 assert.deepEqual(merged[0].sourceIndexes,[0,1]);
 assert.deepEqual(merged[0].references,[{sourceIndex:0,text:points[0].text},{sourceIndex:1,text:points[2].text}]);
 assert.equal(merged[1].text,points[1].text);
 assert.deepEqual(points,before);
});
test('complementary architecture details stay visible rather than being dropped as similar text',()=>{
 const points=[
  {text:'寨内仍是青石板巷与干栏式傣楼。',sourceIndexes:[0]},
  {text:'寨中百余栋傣楼架空而建，楼上住人、楼下乘凉。',sourceIndexes:[1]},
  {text:'寨内仍是青石板巷与干栏式傣楼',sourceIndexes:[2]}
 ];
 const merged=M.mergeCellPoints(points);
 assert.equal(merged.length,2);
 assert.deepEqual(merged.map(p=>p.text),points.slice(0,2).map(p=>p.text));
 assert.deepEqual(merged[0].sourceIndexes,[0,2]);
});
test('consolidation never hides qualifications, availability, different activities, budgets or time ranges',()=>{
 const texts=['主打造纸等DIY','可学习造纸、扎染等手作','只有晴天可体验造纸','不提供造纸体验','可体验造纸，但作品不能带走','可体验造纸，需另付30元','可观看造纸制作','可体验造纸，免费','1–2小时','1–3小时','门票30元','门票50元'];
 const points=texts.map((text,i)=>({text,sourceIndexes:[i]})),before=structuredClone(points);
 assert.deepEqual(M.mergeCellPoints(points).map(p=>p.text),texts);
 assert.deepEqual(points,before);
 const warnings=[{text:'可体验造纸',caution:true,sourceIndexes:[0]},{text:'主打造纸等DIY',sourceIndexes:[1]}];
 assert.equal(M.mergeCellPoints(warnings).length,2);
});
test('decision summary connects distinct intentions to sourced tradeoffs without relying on place names',()=>{
 const a=row('a','甲地'),b=row('b','乙地'),c=row('c','丙地'),d=row('d','丁地');
 a.place.dotSources=[source('a',[{label:'非遗手作',text:'主打傣陶、造纸等DIY，亲子友好，注意问清体验与带走差价。'},{label:'避坑',text:'村子小，不做手工易无聊；交通较远。'}])];
 b.place.dotSources=[source('b',[{label:'体验',text:'吊脚楼与佛寺好出片，可体验豆英娃娃等非遗手作。'},{label:'位置',text:'距告庄十几分钟车程，适合时间紧顺路打卡。'},{label:'避坑',text:'寨子很小半小时可逛完，商业化明显，买小物件记得砍价。'}])];
 for(const r of [c,d])r.place.dotSources[0].reasons=[{label:'平台介绍',text:'村子保留着传统建筑与傣楼。'}];
 const before=structuredClone([a,b,c,d]),result=M.decisionSummary(decisionModels([a,b,c,d]));
 assert.equal(result.clauses.length,2);assert.deepEqual(result.unresolved,['丙地','丁地']);
 const hands=result.clauses.find(c=>c.name==='甲地'),short=result.clauses.find(c=>c.name==='乙地');
 assert.equal(hands.lead,'想动手造纸、制陶，可看');assert.match(hands.caution.text,/不做手工易无聊/);
 assert.equal(short.lead,'时间紧、想顺路短停，可看');assert.match(short.caution.text,/商业化明显/);
 for(const clause of result.clauses)for(const point of [clause.point,clause.caution].filter(Boolean))assert(point.sourceIndexes.some(i=>clause.sources[i].reasons.some(r=>r.text.includes(point.text))));
 assert.deepEqual([a,b,c,d],before);
});
test('shared features and unsourced descriptions do not justify an arbitrary winner',()=>{
 const a=row('a'),b=row('b');for(const r of [a,b])r.place.dotSources[0].reasons=[{text:'这里适合拍照。'}];
 assert.equal(M.decisionSummary(decisionModels([a,b])).clauses.length,0);
 a.place.description='适合亲子，主打造纸体验';a.place.dotSources[0].reasons=[];
 b.place.dotSources[0].reasons=[{text:'保留传统建筑。'}];
 assert.equal(M.decisionSummary(decisionModels([a,b])).clauses.length,0);
});
test('conditional recommendations and conflicting suitability are never promoted into unconditional advice',()=>{
 const a=row('a','甲步道'),b=row('b','乙手作');
 a.place.dotSources[0].reasons=[{text:'仅晴天适合亲子，雨天不建议前往。'}];
 b.place.dotSources=[source('a',[{text:'适合亲子，主打造纸体验。'}]),source('b',[{label:'注意',text:'不适合亲子，手作项目已取消。'}])];
 const result=M.decisionSummary(decisionModels([a,b]));
 assert.equal(result.clauses.length,0);assert.deepEqual(result.unresolved,['甲步道','乙手作']);
});
test('a choice keeps its conditional caveat and its separate source instead of truncating it',()=>{
 const a=row('a','甲地'),b=row('b','乙地');
 a.place.dotSources=[source('a',[{text:'主打造纸手作体验。'}]),source('b',[{label:'注意',text:'如果要带走作品，需另付30元，否则只能现场体验。'}])];
 b.place.dotSources[0].reasons=[{text:'适合时间紧顺路打卡。'}];
 const advice=M.decisionSummary(decisionModels([a,b])).clauses.find(c=>c.name==='甲地');
 assert.equal(advice.caution.text,'如果要带走作品，需另付30元，否则只能现场体验。');
 assert.notEqual(advice.point.sourceIndexes[0],advice.caution.sourceIndexes[0]);
});
test('equal or overlapping platform times and prices are not turned into faster or cheaper rankings',()=>{
 const rows=[row('a','甲地'),row('b','乙地')];
 for(const r of rows)r.place.dotSources[0].reasons=[{text:'村里保留傣楼。'}];
 const models=decisionModels(rows).map((model,i)=>M.withFacts(model,{name:model.row.place.name,cityId:'banna',status:'verified',source:{url:'https://example.org/poi/'+i,type:'platform'},facts:[{field:'time',text:i?'1–3小时':'1–2小时'},{field:'budget',text:'入场免费'}]}));
 assert.equal(M.decisionSummary(models).clauses.length,0);
});
test('verified facts fill gaps without overwriting opinions or stored places',()=>{
 const r=row('a');r.place.dotSources[0].reasons=[{label:'费用',text:'攻略称门票60元。'}];
 const model={row:r,...M.evidence(r)},before=structuredClone(model);
 const result={name:r.place.name,cityId:r.place.cityId,status:'verified',source:{url:'https://example.org/visitor',type:'official',title:'测试官网',checkedAt:'2026-10-19'},facts:[{field:'budget',text:'门票80元'},{field:'time',label:'西区',text:'西区2.5小时'}]};
 const merged=M.withFacts(model,result);assert.equal(merged.cells.budget.length,1);assert.equal(merged.cells.budget[0].text,'攻略称门票60元。');assert.equal(merged.cells.time[0].text,'西区2.5小时');assert(merged.cells.time[0].verified);assert.equal(merged.sources.length,2);assert.deepEqual(model,before);
 for(const patch of [{name:'另一个地方'},{cityId:'puer'},{status:'unconfirmed'},{source:{url:'javascript:alert(1)',type:'official'}}])assert.equal(M.withFacts(model,{...result,...patch}).cells.time.length,0);
});

test('default topics partition a category without repeating a place, while replacements stay reachable',()=>{
 const rows=[row('a','甲村'),row('b','乙寨'),row('c','甲植物园'),row('d','乙花卉园'),row('e','中心公园'),row('f','城市广场'),row('g','独立博物馆')];
 const groups=M.groups(rows,{city:'banna',kind:'sight'}),ids=groups.flatMap(g=>g.rows.map(r=>r.place.sourceId));
 assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,7);
 assert.equal(groups.find(g=>g.label==='其他景点对比').rows.length,3);
 assert(groups.every(g=>g.pool.length===rows.length));
 const facets=rows.map(r=>({...r,kinds:['sight','experience','shopping']}));
 assert.equal(M.groups(facets,{kind:'experience'}).length,0);
});
test('platform references fill only absent fields, with separate sources and no fabricated ratings',()=>{
 const r=row('a'),model={row:r,...M.evidence(r)},snapshot=structuredClone(model);
 const source={url:'https://sg.trip.com/moments/poi-test/',type:'platform',title:'Trip.com'};
 const result={name:r.place.name,cityId:'banna',status:'verified',sources:[source,{...source,url:'https://example.org/official',type:'official'}],facts:[{field:'time',text:'2–3 小时',sourceIndex:0},{field:'budget',text:'入场免费',sourceIndex:1},{field:'experience',text:'不能覆盖已有观点',sourceIndex:0},{field:'hours',text:'全天开放',sourceIndex:99}]};
 const m=M.withFacts(model,result);assert.equal(m.cells.time[0].sourceIndexes[0],1);assert.equal(m.cells.budget[0].sourceIndexes[0],2);
 assert.equal(m.sources[1].type,'platform');assert.equal(m.cells.hours.length,0);assert.deepEqual(m.cells.experience,model.cells.experience);assert.deepEqual(model,snapshot);
});
test('sparse facts stay attached to their place; identical facts appear once with every citation',()=>{
 const rows=[row('a'),row('b'),row('c')],models=rows.map(r=>({row:r,...M.evidence(r)}));
 models[0].cells.audience.push({text:'亲子友好',sourceIndexes:[0]});
 for(const model of models){model.cells.budget.push({text:'村寨入场免费',verified:true,sourceIndexes:[0]});model.cells.time.push({text:'1–2小时',sourceIndexes:[0]});}
 const before=structuredClone(models),layout=M.presentation(models);
 assert(!layout.visible.some(([k])=>['budget','audience','hours'].includes(k)));assert(layout.visible.some(([k])=>k==='time'));
 assert.equal(layout.notes[0][0].text,'亲子友好');assert.equal(layout.notes[1].length,0);assert.equal(layout.shared[0].references.length,3);assert.deepEqual(models,before);
 models[2].cells.budget[0].text='门票20元';assert(M.presentation(models).visible.some(([k])=>k==='budget'));
});
