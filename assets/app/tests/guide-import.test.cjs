const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../dot-import-core.js');
const dot='https://www.xiaohongshu.com/s/dot?dot_share_id=test-share&file_id=active_search%2Ftest';
const note='https://www.xiaohongshu.com/explore/0123456789abcdef01234567';
const city={id:'banna',name:'西双版纳'},now='2026-10-12T00:00:00Z';let serial=0;const uid=()=> 'test-'+ ++serial;
function result(id='a',name='测试植物园',alias){return{source:{fingerprint:id.repeat(64),url:dot,title:'测试攻略 '+id,method:'ocr',text:'测试原文',images:[]},places:[{rank:1,name,card_name:alias,reasons:[{label:'体验',text:'测试推荐理由'}],recommendation_percentage:41}]};}
const row={place:{sourceId:'sight:garden',name:'测试植物园',cityId:'banna',kind:'sight',address:'',lat:null,lng:null},choice:'must',city:'西双版纳'};
test('whole copied text: tracking removed; request token memory-only; Chinese separators and markdown',()=>{
 const raw=`5 【标题】 😆 code 😆 ${note.replace('/explore/','/discovery/item/')}?appuid=personal&xsec_token=TEST_TOKEN&xsec_source=pc_share；\n[点点](${dot}&appuid=private)`;
 const urls=C.links(raw);assert.equal(urls.length,2);assert.ok(urls[0].includes('TEST_TOKEN'));assert.ok(!urls.join('').includes('personal'));assert.ok(!urls.join('').includes('private'));assert.equal(C.shareURL(urls[0]),note);
 assert.equal(C.links(`${dot}\n${dot}&appuid=abc`).length,1);assert.equal(C.links(`${note}；${dot}`).length,2);
 for(const url of ['https://www.xiaohongshu.com.evil.test/explore/0123456789abcdef01234567','http://localhost:8787/','javascript:alert(1)','https://u:p@www.xiaohongshu.com/explore/0123456789abcdef01234567'])assert.throws(()=>C.shareURL(url));
});
test('import retains source + original without choosing or scheduling',()=>{const x=C.importGuide(C.empty('t'),result(),city,[],now,uid);assert.equal(x.state.items.length,1);assert.equal(x.state.items[0].choice,null);assert.equal(x.state.guides[0].text,'测试原文');assert.equal(x.state.items[0].sources[0].recommendationPercentage,41);assert.equal(x.state.items[0].sources[0].percentageDenominator,null);assert.equal(x.state.entries,undefined);});
test('repeat import is idempotent; distinct guides merge by city+name',()=>{let x=C.importGuide(C.empty('t'),result(),city,[],now,uid).state;x=C.importGuide(x,result(),city,[],now,uid).state;assert.equal(x.items.length,1);assert.equal(x.items[0].sources.length,1);assert.equal(x.guides.length,1);x=C.importGuide(x,result('b'),city,[],now,uid).state;assert.equal(x.items[0].sources.length,2);assert.equal(x.guides.length,2);});
test('all decisions survive new imports and serialisation, including skip',()=>{for(const choice of ['wish','maybe','skip']){let x=C.importGuide(C.empty('t'),result(),city,[],now,uid).state;const r=C.mergeCatalog([],x)[0];x=C.decide(x,r,choice,now);x=C.importGuide(JSON.parse(JSON.stringify(x)),result('b'),city,[],now,uid).state;assert.equal(x.items[0].choice,choice);assert.equal(C.mergeCatalog([],x)[0].choice,choice);}});
test('old Pick IDs, priority, aliases and coordinates are retained',()=>{const base={...row,place:{...row.place,lat:22,lng:101}};const x=C.importGuide(C.empty('t'),result('a','别名','测试植物园景区'),city,[base],now,uid).state;assert.equal(x.items[0].sourceId,'sight:garden');assert.equal(x.items[0].choice,'must');assert.equal(x.items[0].place.lat,22);assert.equal(C.mergeCatalog([base],x).length,1);assert.equal(x.items[0].linked,true);});
test('same name in different cities stays distinct; ambiguous existing matches stop',()=>{const x=C.importGuide(C.empty('t'),result(),{id:'puer',name:'普洱'},[row],now,uid).state;assert.equal(x.items[0].linked,false);assert.equal(C.mergeCatalog([row],x).length,2);assert.throws(()=>C.importGuide(C.empty('t'),result(),city,[row,{...row,place:{...row.place,sourceId:'sight:other'}}],now,uid),/多个地点/);});
test('do not conflate mountain and village or match substrings',()=>{assert.equal(C.matches({name:'基诺山'},'banna',[{...row,place:{...row.place,name:'基诺山寨'}}]).length,0);});
test('new guide reuses a saved identity when an identical handbook place appears later',()=>{
 let state=C.importGuide(C.empty('t'),result(),city,[],now,uid).state;
 state=C.decide(state,C.mergeCatalog([],state)[0],'skip',now);const id=state.items[0].sourceId;
 const next=C.importGuide(state,result('b'),city,[row],now,uid).state;
 assert.equal(next.items.length,1);assert.equal(next.items[0].sourceId,id);assert.equal(next.items[0].choice,'skip');assert.equal(next.items[0].sources.length,2);
 const conflict=structuredClone(state);conflict.items[0].place.poiId='osm:N:1';
 assert.throws(()=>C.importGuide(conflict,result('b'),city,[{...row,place:{...row.place,poiId:'osm:N:2'}}],now,uid),/多个地点/);
});
test('state validation rejects polluted, malformed and unsafe source/image fields',()=>{const x=C.importGuide(C.empty('t'),result(),city,[],now,uid).state;let z=structuredClone(x);z.items[0].sources[0].url='javascript:alert(1)';assert.throws(()=>C.validate(z,'t'));z=JSON.parse(JSON.stringify(x).replace('"place":{','"place":{"__proto__":{},'));assert.throws(()=>C.validate(z,'t'));z=structuredClone(x);z.guides[0].images=[{data:'data:image/svg+xml,<svg/>'}];assert.throws(()=>C.validate(z,'t'));assert.throws(()=>C.validate(x,'another'));});
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const backupScript=html.match(/<script id="guide-backup-feature">([\s\S]*?)<\/script>/)[1];const context={DotImportCore:C,module:{exports:{}},console};vm.createContext(context);vm.runInContext(backupScript,context);const B=context.module.exports;
function backup(){const config=B.config({tripId:'t'},{trip_id:'t',todo_revision:'1'},'test');const raw={type:B.TYPE,version:B.VERSION,tripId:'t',packingTripId:'t',createdAt:now,records:Object.fromEntries(Object.keys(config.slots).map(k=>[k,null])),media:{memories:[],references:[]}};return{config,raw};}
test('old complete backups without new optional registry remain valid',()=>{const{config,raw}=backup();delete raw.records.guideImports;B.validate(raw,config);assert.equal(raw.records.guideImports,null);delete raw.records.dailyPlan;assert.throws(()=>B.validate(raw,config));});
test('new registry survives backup, folder image packing and restore',async()=>{const{config,raw}=backup();const source=result();source.source.images=[{data:'data:image/png;base64,aW1hZ2U=',sha256:'f'.repeat(64)}];raw.records.guideImports=C.importGuide(C.empty('t'),source,city,[],now,uid).state;B.validate(raw,config);const io={storage:new Map(),readMedia:async()=>({memories:[],references:[]}),writeMedia:async()=>{}};io.storage.getItem=io.storage.get.bind(io.storage);io.storage.setItem=io.storage.set.bind(io.storage);io.storage.removeItem=io.storage.delete.bind(io.storage);await B.restore(raw,config,io);const saved=JSON.parse(io.storage.get(config.slots.guideImports.key));assert.equal(saved.guides[0].text,'测试原文');const L=require('../local-files-core.js');const packed=await L.pack(raw,{},1);const un=await L.unpack(packed.document,async p=>packed.assets.get(p),v=>B.validate(v,config));assert.equal(un.backup.records.guideImports.items.length,1);assert.equal(packed.assets.size,1);assert.equal(un.backup.records.guideImports.guides[0].images[0].data,source.source.images[0].data);});
test('new wanted counts do not double count linked old Picks',()=>{const{raw}=backup();raw.records.sightPicks={version:1,choices:{garden:'wish'}};raw.records.guideImports=C.importGuide(C.empty('t'),result(),city,[row],now,uid).state;assert.equal(B.counts(raw).picks,1);});
test('old unconnected registry shape without guides still reads',()=>{const x=C.empty('t');delete x.guides;assert.equal(C.validate(x,'t'),x);});

test('legacy neutral DOM state maps to null on import',()=>{const x=C.importGuide(C.empty('t'),result(),city,[{...row,choice:'none'}],now,uid);assert.equal(x.state.items[0].choice,null);});

test('manual reasons stop before the next place instead of leaking into each other',()=>{const ps=C.extractText('1. 测试园林\n第一段推荐\n2. 测试咖啡馆\n第二段推荐');assert.equal(ps.length,2);assert.ok(!ps[0].reasons[0].text.includes('咖啡馆'));assert.equal(ps[1].reasons[0].text,'第二段推荐');});

test('clearing a judgment preserves sources and is persisted',()=>{let x=C.importGuide(C.empty('t'),result(),city,[],now,uid).state;let r=C.mergeCatalog([],x)[0];x=C.decide(x,r,'wish',now);x=C.decide(x,C.mergeCatalog([],x)[0],null,now);assert.equal(x.items[0].choice,null);assert.equal(x.items[0].sources.length,1);});

test('synthetic enumerated body lists 13 food venues: enumeration, opaque shop names and topic exclusion',()=>{
 const f=require('./fixtures/food-list.json'),places=C.extractText(f.text,f.title);
 assert.deepEqual(places.map(p=>p.name),f.names);assert.ok(places.every(p=>p.kind==='food'));assert.ok(places.every(p=>p.reasons.length===0));
 assert.deepEqual(C.extractText('推荐菜：米线、火锅、凉拌菜\n#餐馆[话题]#\n1. 注意事项\n2. 人均60元'),[]);
 assert.deepEqual(C.extractText('1. 测试植物园\n2. 测试咖啡馆\n3. 制陶体验\n4. 测试商场').map(p=>p.kind),['sight','food','experience','shopping']);
});
test('re-reading saved guide fills missing venues/photos while keeping IDs, decisions and image associations',()=>{
 const r=result();r.source.kind='note';r.places[0].kind='food';r.source.images=[{sha256:'1'.repeat(64),data:'data:image/jpeg;base64,YQ=='}];r.places[0].image_indices=[0];
 let x=C.importGuide(C.empty('t'),r,city,[],now,uid).state;x=C.decide(x,C.mergeCatalog([],x)[0],'skip',now);
 const sourceId=x.items[0].sourceId;
 const retry=structuredClone(r);retry.source.images=[{sha256:'2'.repeat(64),data:'data:image/jpeg;base64,Yg=='},...r.source.images];retry.places[0].image_indices=[1];retry.places[0].rank=2;retry.places.unshift({rank:1,name:'新增测试店',kind:'food',reasons:[],image_indices:[0]});
 x=C.importGuide(x,retry,city,[],now,uid).state;
 assert.equal(x.guides.length,1);assert.equal(x.items.length,2);assert.equal(x.items[0].sourceId,sourceId);assert.equal(x.items[0].choice,'skip');assert.equal(x.items[0].sources.length,1);
 assert.equal(C.imageForPlace(C.mergeCatalog([],x)[0].place,x).src,r.source.images[0].data);
 assert.equal(C.imageForPlace(C.mergeCatalog([],x)[1].place,x).src,retry.source.images[0].data);
 const again=C.importGuide(x,retry,city,[],now,uid).state;assert.equal(again.items.length,2);assert.equal(again.items[0].sources.length,1);
});
test('bad image references and invalid categories are rejected',()=>{const r=result();r.places[0].image_indices=[99];assert.throws(()=>C.validateResult(r));delete r.places[0].image_indices;r.places[0].kind='made-up';assert.throws(()=>C.validateResult(r));});

test('full reasons, cautions and OCR evidence survive repeated imports and changed originals',()=>{
 const r=result(),full='完整推荐理由'.repeat(800);r.places[0].reasons=[{label:'推荐理由',text:full,evidence_boxes:[[1,2,3,4]]},{label:'注意事项',text:'须提前预约'}];
 assert.equal(C.extractText('1. 测试植物园\n'+full)[0].reasons[0].text,full);
 let x=C.importGuide(C.empty('t'),r,city,[],now,uid).state;
 x=C.decide(x,C.mergeCatalog([],x)[0],'maybe',now);
 const retry=structuredClone(r);retry.source.text='更新后的原文';retry.places[0].reasons=[{label:'补充',text:'补充开放信息'}];retry.places[0].recommendation_percentage=null;
 x=C.importGuide(x,retry,city,[],now,uid).state;
 assert.equal(x.items[0].choice,'maybe');assert.equal(x.items[0].sources[0].reasons[0].text,full);
 assert.deepEqual(x.items[0].sources[0].reasons[0].evidenceBoxes,[[1,2,3,4]]);
 assert.equal(x.items[0].sources[0].reasons.length,3);assert.equal(x.items[0].sources[0].recommendationPercentage,41);
 assert.deepEqual(x.guides[0].previousTexts,['测试原文']);assert.equal(x.guides[0].text,'更新后的原文');
 x=C.importGuide(x,retry,city,[],now,uid).state;assert.equal(x.items[0].sources[0].reasons.length,3);assert.equal(x.guides[0].previousTexts.length,1);
});
test('on-demand corrections keep stable planner IDs, judgments and aliases across reimport',()=>{
 let x=C.importGuide(C.empty('t'),result(),city,[row],now,uid).state;
 x=C.editPlace(x,C.mergeCatalog([row],x)[0],{name:'修正植物园',city:'普洱',cityId:'puer',kind:'experience'},[row],now);
 x=C.importGuide(x,result(),city,[row],now,uid).state;
 const merged=C.mergeCatalog([row],x);
 assert.equal(x.items.length,1);assert.equal(merged.length,1);assert.equal(merged[0].place.sourceId,row.place.sourceId);
 assert.equal(merged[0].place.name,'修正植物园');assert.equal(merged[0].place.cityId,'puer');assert.equal(merged[0].city,'普洱');
 assert.equal(merged[0].place.kind,'experience');assert.equal(merged[0].choice,'must');assert.ok(merged[0].place.aliases.includes('测试植物园'));
 const other={...row,place:{...row.place,sourceId:'sight:another',name:'另一地点'}};
 assert.throws(()=>C.editPlace(x,merged[0],{name:'另一地点',city:'西双版纳',cityId:'banna',kind:'sight'},[row,other],now),/同名地点/);
});
test('cards choose a clear matched photo from any source and flag small originals',()=>{
 const r=result();r.source.images=[{data:'data:image/jpeg;base64,YQ==',kind:'place_thumbnail',crop:{width:110,height:110}}];r.places[0].image_indices=[0];
 let x=C.importGuide(C.empty('t'),r,city,[],now,uid).state;
 assert.equal(C.imageForPlace(C.mergeCatalog([],x)[0].place,x).compact,true);
 const second=result('b');second.source.images=[{data:'data:image/jpeg;base64,Yg==',kind:'original',width:1200,height:800}];second.places[0].image_indices=[0];
 x=C.importGuide(x,second,city,[],now,uid).state;
 const photo=C.imageForPlace(C.mergeCatalog([],x)[0].place,x);assert.equal(photo.src,second.source.images[0].data);assert.equal(photo.compact,false);
 const tiny=result('c');tiny.source.images=[{data:'data:image/png;base64,Yw==',kind:'original',width:180,height:120}];tiny.places[0].image_indices=[0];
 const small=C.importGuide(C.empty('s'),tiny,city,[],now,uid).state;assert.equal(C.imageForPlace(C.mergeCatalog([],small)[0].place,small).compact,true);
});

test('single-source cards show useful reasons, advice and cautions without a detail layer',()=>{
 const sources=[{title:'雨林攻略',reasons:[{label:'推荐理由',text:'推荐理由：雨林植物丰富，适合慢慢逛。'},{label:'夜游',text:'闭园后可预约夜游。'},{label:'注意事项',text:'注意事项：东区很大，建议坐车。'},{label:'重复摘要',text:'雨林植物丰富，适合慢慢逛。'}]}];
 const before=JSON.stringify(sources),view=C.recommendationView(sources);
 assert.deepEqual(view.visible.map(r=>r.text),['雨林植物丰富，适合慢慢逛。','闭园后可预约夜游。','东区很大，建议坐车。']);
 assert.equal(view.visible[2].caution,true);assert.deepEqual(view.more,[]);assert.equal(JSON.stringify(sources),before);
});
test('overlapping sentences merge attribution; negation and different numbers stay distinct',()=>{
 const sources=[{title:'亲子推荐',recommendationPercentage:41,reasons:[{label:'推荐',text:'平缓步道适合慢逛。东区适合推车。票价80元。'}]},
 {title:'徒步反馈',recommendationPercentage:22,reasons:[{label:'理由',text:'平缓步道适合慢逛！'},{label:'不同看法',text:'东区不适合推车。票价90元。'}]}];
 const before=JSON.stringify(sources),view=C.recommendationView(sources),all=view.visible.concat(view.more);
 assert.equal(all.filter(p=>p.text.includes('平缓步道')).length,1);assert.deepEqual(all[0].sourceIndexes,[0,1]);
 const words=all.map(p=>p.text).join('');for(const t of ['东区适合推车','东区不适合推车','票价80元','票价90元'])assert.ok(words.includes(t));
 assert.equal(JSON.stringify(sources),before);
});
test('punctuation and whitespace differences do not create duplicate opinions',()=>{
 const view=C.recommendationView([{reasons:[{label:'推荐',text:'  建议 提前预约。'},{label:'游玩建议',text:'建议提前预约！'}]},{reasons:[{label:'提醒',text:'建议提前预约；'}]}]);
 assert.equal(view.visible.length,1);assert.deepEqual(view.visible[0].sourceIndexes,[0,1]);assert.equal(view.visible[0].caution,true);
});
test('cautions embedded in a copied paragraph remain visible on long multi-guide cards',()=>{
 const sources=[{reasons:[{label:'原文摘录',text:'清晨适合慢逛。注意事项：周一闭馆。'}]},
 {reasons:Array.from({length:10},(_,i)=>({label:'玩法',text:`第${i+1}项额外游玩建议。`}))}];
 const view=C.recommendationView(sources);
 assert.ok(view.visible.some(p=>p.text==='注意事项：周一闭馆。'&&p.caution));
});
test('single-source long content stays visible and complete',()=>{
 const sentences=Array.from({length:12},(_,i)=>`第${i+1}条有明确来源的游玩建议，描述独立的路线与时间。`),original=sentences.join('');
 const view=C.recommendationView([{reasons:[{label:'玩法',text:original}]}]);
 assert.equal(view.visible.map(p=>p.text).join(''),original);assert.deepEqual(view.more,[]);
});
test('long multi-guide cards keep differences and warnings visible with non-repeating continuation',()=>{
 const sources=Array.from({length:3},(_,i)=>({title:`攻略${i+1}`,reasons:Array.from({length:4},(_,j)=>({label:j===3?'注意事项':'游玩建议',text:`来源${i+1}的第${j+1}个独立观点，${j===3?'雨季路滑，务必穿防滑鞋':'可选择不同的路线与时段'}。`}))}));
 const before=JSON.stringify(sources),view=C.recommendationView(sources);
 assert.ok(view.more.length>0);assert.ok(view.visible.some(p=>p.sourceIndexes.includes(0)));assert.ok(view.visible.some(p=>p.sourceIndexes.includes(1)));assert.ok(view.visible.some(p=>p.sourceIndexes.includes(2)));
 assert.ok(view.more.every(p=>!p.caution));
 const all=view.visible.concat(view.more).map(p=>p.text);assert.equal(all.length,12);assert.equal(new Set(all).size,12);
 for(const source of sources)for(const r of source.reasons)assert.ok(all.includes(r.text));
 assert.equal(JSON.stringify(sources),before);
});
test('source-only cards do not invent recommendations; existing system notes remain readable',()=>{
 assert.deepEqual(C.recommendationView([{title:'名单',reasons:[]}]),{visible:[],more:[]});
 const view=C.recommendationView([],'已有开放时间说明');assert.equal(view.visible[0].text,'已有开放时间说明');assert.deepEqual(view.visible[0].sourceIndexes,[]);
});

const classCases=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/place-classification.json'),'utf8'));
test('category boundaries: screenshot restaurants, primary venue type, conflicting and missing evidence',()=>{
 for(const c of classCases)assert.equal(C.inferKind(c.name,c.context,c.title||'',c.aliases||[]),c.expected,c.name+' / '+c.context);
});
test('old classifications update without modifying IDs, choices, originals, images or planner references',()=>{
 for(const choice of [null,'wish','maybe','skip']){
  const guide=result('a','傣果冰屋');guide.places[0].kind='sight';guide.places[0].reasons=[{label:'招牌',text:classCases[0].context}];
  const state=C.importGuide(C.empty('t'),guide,city,[],now,uid).state;state.items[0].place.kind='sight';state.items[0].choice=choice;
  const original=structuredClone(state),next=C.reclassify(state),id=state.items[0].sourceId;
  assert.equal(next.items[0].place.kind,'food');assert.equal(next.items[0].sourceId,id);assert.equal(next.items[0].choice,choice);
  const expected=structuredClone(original);expected.items[0].place.kind='food';assert.deepEqual(next,expected);assert.deepEqual(state,original);
  assert.strictEqual(C.reclassify(next),next); // idempotent, no new migration on every load
  assert.equal(C.mergeCatalog([],next).find(r=>r.place.sourceId===id).place.kind,'food');
 }
});
test('explicit corrections and linked catalogue categories take priority over inference',()=>{
 const state=C.importGuide(C.empty('t'),result('a','傣果冰屋'),city,[],now,uid).state;
 state.items[0].place.kind='experience';state.items[0].editedAt=now;assert.strictEqual(C.reclassify(state),state);
 delete state.items[0].editedAt;state.items[0].linked=true;assert.strictEqual(C.reclassify(state),state);
});
test('unknowns stay unclassified in compatible planner kind and survive backup restore',()=>{
 const source=result('a','不确定的地点');source.places[0].reasons=[];const state=C.importGuide(C.empty('t'),source,city,[],now,uid).state;
 assert.equal(state.items[0].place.kind,'manual');assert.equal(state.items[0].choice,null);
 const{raw,config}=backup();raw.records.guideImports=state;B.validate(raw,config);assert.deepEqual(C.validate(JSON.parse(JSON.stringify(state)),'t'),state);
});
test('merged evidence reclassifies an opaque name while preserving the previous judgment and both viewpoints',()=>{
 const first=result('a','南风');first.places[0].reasons=[];let state=C.importGuide(C.empty('t'),first,city,[],now,uid).state;
 state=C.decide(state,C.mergeCatalog([],state)[0],'skip',now);const id=state.items[0].sourceId;
 const second=result('b','南风');second.places[0].reasons=[{label:'招牌',text:'炒冰口感绵密，人均30元。'}];state=C.importGuide(state,second,city,[],now,uid).state;
 assert.equal(state.items.length,1);assert.equal(state.items[0].place.kind,'food');assert.equal(state.items[0].sourceId,id);assert.equal(state.items[0].choice,'skip');assert.equal(state.items[0].sources.length,2);
});
test('a category manually selected during import remains authoritative across repeated imports',()=>{
 const source=result('a','傣果冰屋');source.places[0].kind='experience';source.places[0].classification_manual=true;
 let state=C.importGuide(C.empty('t'),source,city,[],now,uid).state;assert.equal(state.items[0].place.kind,'experience');assert.equal(state.items[0].editedAt,now);
 state=C.importGuide(state,result('b','傣果冰屋'),city,[],now,uid).state;assert.equal(state.items[0].place.kind,'experience');
});
test('text extraction classifies each heading from its own paragraph without neighbouring food leakage',()=>{
 const p=C.extractText('1. 南风\n炒冰口感绵密，人均30元。\n2. 北风\n位于市区，交通方便。','美食攻略');
 assert.deepEqual(p.map(x=>x.kind),['food',null]);
});
test('stored registry migration writes once and preserves original state if durable save fails',async()=>{
 const old=C.importGuide(C.empty('t'),result('a','傣果冰屋'),city,[],now,uid).state;old.items[0].place.kind='sight';old.items[0].choice='wish';
 const script=fs.readFileSync(require('node:path').join(__dirname,'../dot-import-store.js'),'utf8');
 for(const fail of [false,true]){
  const cache=new Map([['travel-handbook-dot-imports:v1:t',JSON.stringify(old)]]);let ready,writes=0;
  const sandbox={DotImportCore:C,document:{getElementById:()=>({textContent:'{"tripId":"t"}'}),addEventListener:()=>{}},Event:class{},CustomEvent:class{},dispatchEvent:()=>{},addEventListener:()=>{},TravelStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>{writes++;cache.set(k,v);},removeItem:k=>cache.delete(k),whenReady:fn=>{if(!ready)ready=fn;},flushCache:async()=>{if(fail)throw Error('quota');}}};sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(script,sandbox);await ready();
  const persisted=JSON.parse([...cache.values()][0]);assert.equal(persisted.items[0].place.kind,fail?'sight':'food');assert.equal(persisted.items[0].choice,'wish');
  if(!fail){await ready();assert.equal(writes,1);}else assert.deepEqual(persisted,old);
 }
});
test('legacy note-list imports recover group context from saved originals without inventing per-place reasons',()=>{
 const f=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/food-list.json'),'utf8'));
 const guide=result('a','傣十二');guide.source.title=f.title;guide.source.text=f.text;guide.places[0].reasons=[];
 const state=C.importGuide(C.empty('t'),guide,city,[],now,uid).state;state.items[0].place.kind='sight';
 const next=C.reclassify(state);assert.equal(next.items[0].place.kind,'food');assert.deepEqual(next.items[0].sources[0].reasons,[]);assert.deepEqual(next.guides,state.guides);
});
test('legacy photo repair only appends matched images, keeping current judgments and corrected names',()=>{
 const input=result('a','毛哥饭铺');const original={kind:'original',sha256:'f'.repeat(64),data:'data:image/png;base64,b3JpZ2luYWw=',width:1320,height:15000};input.source.images=[original];
 let state=C.importGuide(C.empty('t'),input,city,[],now,uid).state;state=C.decide(state,C.mergeCatalog([],state)[0],'skip',now);state.items[0].editedAt=now;state.items[0].place.name='毛哥饭铺（手动）';
 const id=state.items[0].sourceId,before=structuredClone(state),patch={parentSha256:original.sha256,images:[{kind:'place_thumbnail',parent_sha256:original.sha256,sha256:'e'.repeat(64),assetId:'photo',width:375,height:375,data:'data:image/png;base64,cGhvdG8='}],matches:[{sourceId:id,imageIndices:[0]}]};
 const next=C.mergePhotos(state,'a'.repeat(64),patch);
 assert.deepEqual(state,before);assert.equal(next.items[0].choice,'skip');assert.equal(next.items[0].place.name,'毛哥饭铺（手动）');assert.equal(next.items[0].sourceId,id);
 assert.deepEqual(next.guides[0].images[0],original);assert.equal(next.guides[0].text,before.guides[0].text);assert.deepEqual(next.items[0].sources[0].reasons,before.items[0].sources[0].reasons);
 assert.deepEqual(next.items[0].sources[0].imageIndices,[1]);assert.equal(C.mergePhotos(next,'a'.repeat(64),patch).guides[0].images.length,2);
 assert.strictEqual(C.mergePhotos(state,'a'.repeat(64),{...patch,parentSha256:'unrelated'}),state);
 assert.throws(()=>C.mergePhotos(state,'a'.repeat(64),{...patch,matches:[{sourceId:id,imageIndices:[9]}]}));
});
test('photo size, not derived-image label, decides large image vs thumbnail',()=>{
 const place={dotSources:[{id:'a'.repeat(64)+':1',imageIndices:[0]}]},state={guides:[{id:'a'.repeat(64),images:[{kind:'place_thumbnail',width:575,height:545,data:'photo'}]}]};
 assert.equal(C.imageForPlace(place,state).compact,false);state.guides[0].images[0].width=375;assert.equal(C.imageForPlace(place,state).compact,true);
});

test('multiple guides and aliases produce one place with independent ratios and complementary opinions',()=>{
 let state=C.empty('t');
 for(const [id,name,alias,ratio,extra] of [['a','测试植物园',null,41,'东区适合徒步。'],['b','植物园别称','测试植物园景区',23,'雨季路滑。'],['c','测试植物园',null,null,'建议清晨入园。'],['d','测试植物园',null,62,'票价80元。']]){
  const r=result(id,name,alias);r.places[0].recommendation_percentage=ratio;r.places[0].reasons=[{label:'推荐',text:'雨林植物丰富。'+extra}];state=C.importGuide(state,r,city,[],now,uid).state;
 }
 assert.equal(C.mergeCatalog([],state).length,1);assert.deepEqual(state.items[0].sources.map(s=>s.recommendationPercentage),[41,23,null,62]);
 const view=C.recommendationView(state.items[0].sources),points=view.visible.concat(view.more);
 assert.equal(points.filter(p=>p.text==='雨林植物丰富。').length,1);assert.deepEqual(points.find(p=>p.text==='雨林植物丰富。').sourceIndexes,[0,1,2,3]);
 for(const text of ['东区适合徒步。','雨季路滑。','建议清晨入园。','票价80元。'])assert.ok(points.some(p=>p.text.includes(text)));
 for(const g of state.guides)assert.equal(C.guidePlaces(state,g.id).length,1);
});
test('removing one guide preserves all other source content, place choices and scheduled identities',()=>{
 for(const choice of [null,'wish','must','maybe','skip']){
  const a=result('a');a.source.images=[{data:'data:image/png;base64,YQ=='}];a.places[0].image_indices=[0];
  let before=C.importGuide(C.empty('t'),a,city,[],now,uid).state;before=C.importGuide(before,result('b'),city,[],now,uid).state;
  before.items[0].choice=choice;before.items[0].editedAt=now;before.items[0].place.name='手动名称';
  const snapshot=structuredClone(before),other=structuredClone(before.items[0].sources[1]),scheduled={day:'2026-09-25',slot:'morning',sourceId:before.items[0].sourceId};
  const removed=C.removeGuide(before,'a'.repeat(64));assert.deepEqual(before,snapshot);
  assert.deepEqual(removed.state.guides,[before.guides[1]]);assert.deepEqual(removed.state.items[0].sources,[other]);
  assert.equal(removed.state.items[0].choice,choice);assert.deepEqual(removed.state.items[0].place,before.items[0].place);
  assert.ok(C.mergeCatalog([],removed.state).some(row=>row.place.sourceId===scheduled.sourceId));
  const last=C.removeGuide(removed.state,'b'.repeat(64)).state;assert.equal(last.items[0].sources.length,0);assert.equal(last.items[0].sourceId,scheduled.sourceId);assert.equal(last.items[0].choice,choice);
  const imported=C.importGuide(last,a,city,[],now,uid).state;assert.equal(imported.items.length,1);assert.equal(imported.items[0].sourceId,scheduled.sourceId);assert.equal(imported.items[0].choice,choice);
 }
});
test('delete undo restores only that source, keeping changes made after deletion',()=>{
 let state=C.importGuide(C.empty('t'),result('a'),city,[],now,uid).state;
 const removed=C.removeGuide(state,'a'.repeat(64));state=C.importGuide(removed.state,result('b'),city,[],now,uid).state;
 state=C.decide(state,C.mergeCatalog([],state)[0],'skip',now);state=C.editPlace(state,C.mergeCatalog([],state)[0],{name:'我的地点名',city:'普洱',cityId:'puer',kind:'experience'},[],now);
 const current=structuredClone(state),restored=C.restoreGuide(state,removed.receipt);
 assert.deepEqual(state,current);assert.equal(restored.items.length,1);assert.equal(restored.items[0].sources.length,2);
 assert.equal(restored.items[0].choice,'skip');assert.deepEqual(restored.items[0].place,current.items[0].place);assert.deepEqual(restored.guides[0],current.guides[0]);
 assert.throws(()=>C.restoreGuide(restored,removed.receipt),/重新导入/);assert.throws(()=>C.restoreGuide(C.empty('different'),removed.receipt),/其他旅行/);
 const {raw,config}=backup();raw.records.guideImports=restored;B.validate(raw,config);
});
test('reparse replaces only its own extraction, keeps originals and all decisions, and removes obsolete associations',()=>{
 const a=result('a');a.source.images=[{data:'data:image/png;base64,YQ==',sha256:'1'.repeat(64)}];a.places[0].image_indices=[0];a.places.push({rank:2,name:'旧识别地点',reasons:[{label:'推荐',text:'旧观点'}]});
 let state=C.importGuide(C.empty('t'),a,city,[],now,uid).state;state=C.importGuide(state,result('b'),city,[],now,uid).state;
 state.items[0].choice='wish';state.items[1].choice='skip';const old=structuredClone(state),id=state.items[0].sourceId,retired=state.items[1].sourceId;
 const revised=result('a');revised.source.text='新的识别正文';revised.places[0].rank=3;revised.places[0].recommendation_percentage=null;revised.places[0].reasons=[{label:'注意',text:'新观点，周一不开放。'}];revised.places.push({rank:1,name:'新识别地点',reasons:[]});
 const next=C.importGuide(state,revised,city,[],now,uid,{replaceGuideId:'a'.repeat(64),expectedRevision:state.guides[0].revision}).state;
 assert.deepEqual(state,old);assert.deepEqual(next.guides[1],old.guides[1]);assert.deepEqual(next.items[0].sources[1],old.items[0].sources[1]);
 assert.equal(next.items[0].sourceId,id);assert.equal(next.items[0].choice,'wish');assert.equal(next.items[1].sourceId,retired);assert.equal(next.items[1].choice,'skip');assert.deepEqual(next.items[1].sources,[]);
 assert.deepEqual(next.items[0].sources[0].reasons.map(r=>r.text),['新观点，周一不开放。']);assert.equal(next.items[0].sources[0].recommendationPercentage,null);
 assert.deepEqual(next.items[0].sources[0].imageIndices,[]);assert.deepEqual(next.guides[0].images,a.source.images);assert.deepEqual(next.guides[0].previousTexts,['测试原文']);assert.equal(next.guides[0].text,'新的识别正文');
 assert.equal(C.guidePlaces(next,'a'.repeat(64)).length,2);
});
test('reparse is rejected when the source was removed or changed while parsing',()=>{
 const state=C.importGuide(C.empty('t'),result('a'),city,[],now,uid).state,options={replaceGuideId:'a'.repeat(64),expectedRevision:state.guides[0].revision};
 const removed=C.removeGuide(state,options.replaceGuideId).state;
 assert.throws(()=>C.importGuide(removed,result('a'),city,[],now,uid,options),/已移除/);
 const changed=C.importGuide(state,result('a'),city,[],now,uid).state;
 assert.throws(()=>C.importGuide(changed,result('a'),city,[],now,uid,options),/已更新/);
 assert.throws(()=>C.importGuide(state,result('b'),city,[],now,uid,options),/已移除/);
});
test('reparse retains manually corrected names, cities and categories even when ranks change',()=>{
 let state=C.importGuide(C.empty('t'),result(),city,[],now,uid).state;
 state=C.editPlace(state,C.mergeCatalog([],state)[0],{name:'自己的植物园名称',city:'普洱',cityId:'puer',kind:'experience'},[],now);
 const revised=result();revised.places[0].rank=9;
 const next=C.importGuide(state,revised,city,[],now,uid,{replaceGuideId:'a'.repeat(64)}).state;
 assert.equal(next.items.length,1);assert.deepEqual(next.items[0].place,state.items[0].place);assert.equal(next.items[0].sourceId,state.items[0].sourceId);assert.equal(next.items[0].sources[0].rank,9);
});
test('reparse cannot overwrite a newly reimported copy after deletion even if revision numbers match',()=>{
 const original=C.importGuide(C.empty('t'),result(),city,[],now,uid).state;
 const removed=C.removeGuide(original,'a'.repeat(64)).state;
 const reimported=C.importGuide(removed,result(),city,[],'2026-10-14T00:00:00Z',uid).state;
 assert.equal(reimported.guides[0].revision,original.guides[0].revision);
 assert.throws(()=>C.importGuide(reimported,result(),city,[],now,uid,{replaceGuideId:'a'.repeat(64),expectedRevision:original.guides[0].revision,expectedImportedAt:original.guides[0].importedAt}),/已更新/);
});


const cityOptions={cities:[city,{id:'puer',name:'普洱',aliases:['普洱市','思茅','思茅区']},{id:'kunming',name:'昆明',aliases:['昆明市']} ]};
const realPuer=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/puer-city-extraction.json'),'utf8'));
test('actual Puer share overrides a Banna fallback for all eight extracted places',()=>{
 const resolved=C.resolveCities(realPuer,city,cityOptions.cities);
 assert.equal(realPuer.source.title,'普洱景点推荐');assert.equal(resolved.places.length,8);
 assert.deepEqual(resolved.places.map(p=>p.city.id),Array(8).fill('puer'));
 const state=C.importGuide(C.empty('t'),realPuer,city,[],now,uid,cityOptions).state;
 assert.equal(state.items.length,8);assert.ok(state.items.every(i=>i.city==='普洱'&&i.place.cityId==='puer'&&i.choice===null));
 assert.deepEqual(state.items.flatMap(i=>i.sources.map(s=>s.recommendationPercentage)),[30,29,25,23,15,15,14,13]);
 assert.equal(state.guides[0].text,realPuer.source.text);
});
test('batch city detection is per guide; one explicit fallback never overrides either title',()=>{
 const banna=result('b');banna.source.title='西双版纳美食推荐';
 const puer=C.resolveCities(realPuer,city,cityOptions.cities),other=C.resolveCities(banna,{id:'puer',name:'普洱'},cityOptions.cities);
 assert.ok(puer.places.every(p=>p.city.id==='puer'));assert.equal(other.places[0].city.id,'banna');
});
test('city intro and historical aliases work without treating a travel comparison as a location',()=>{
 const r=result();r.source.title='我的周末攻略';r.source.text='去云南普洱游玩\n1. 测试植物园\n比昆明安静，从西双版纳出发。';
 r.places[0].reasons=[{label:'建议',text:'比昆明安静，从西双版纳出发。'}];
 assert.equal(C.resolveCities(r,city,cityOptions.cities).places[0].city.id,'puer');
 r.source.title='思茅区景点';assert.equal(C.resolveCities(r,null,cityOptions.cities).places[0].city.id,'puer');
});
test('mixed-city guides use individual locations; unresolved and conflicting records do not inherit first city',()=>{
 const r=result();r.source.title='西双版纳与普洱周末游';r.source.text='两城串游';
 r.places=[{...r.places[0],name:'公园甲',address:'普洱市思茅区'},{...r.places[0],rank:2,name:'公园乙',address:'西双版纳'},{...r.places[0],rank:3,name:'小巷'}];
 const resolved=C.resolveCities(r,city,cityOptions.cities);
 assert.deepEqual(resolved.places.map(p=>p.city?.id||null),['puer','banna',null]);
 assert.throws(()=>C.importGuide(C.empty('t'),r,city,[],now,uid,cityOptions),/城市尚未确认/);
 r.source.title='普洱景点';r.places=[{...r.places[0],address:'',name:'昆明植物园'}];
 assert.equal(C.resolveCities(r,city,cityOptions.cities).places[0].cityResolution,'conflict');
});
test('unknown guides need a supplied fallback, while per-place manual corrections take precedence',()=>{
 const r=result();assert.equal(C.resolveCities(r,null,cityOptions.cities).places[0].city,null);
 assert.throws(()=>C.importGuide(C.empty('t'),r,null,[],now,uid,cityOptions),/城市尚未确认/);
 assert.equal(C.resolveCities(r,city,cityOptions.cities).places[0].city.id,'banna');
 const p=structuredClone(realPuer);p.places=p.places.slice(0,1);p.places[0].city=city;p.places[0].city_manual=true;
 let state=C.importGuide(C.empty('t'),p,null,[],now,uid,cityOptions).state;
 state=C.importGuide(state,{...realPuer,places:realPuer.places.slice(0,1)},null,[],now,uid,cityOptions).state;
 assert.equal(state.items.length,1);assert.equal(state.items[0].place.cityId,'banna');assert.equal(state.items[0].cityManual,true);
 assert.strictEqual(C.repairCities(state,cityOptions.cities),state);
});
function wrongPuer(){return C.importGuide(C.empty('t'),realPuer,city,[],now,uid).state;}
test('legacy city repair preserves IDs, choices, schedules, full sources and images; repeat import creates nothing',()=>{
 let state=wrongPuer();state.items[0].choice='wish';state.items[1].choice='maybe';state.items[2].choice='skip';
 const original=structuredClone(state),entries=state.items.map(i=>({sourceId:i.sourceId,date:'2026-09-29',slot:'morning'}));
 const repaired=C.repairCities(state,cityOptions.cities);
 assert.deepEqual(state,original);assert.ok(repaired.items.every(i=>i.city==='普洱'));
 repaired.items.forEach((item,i)=>{assert.equal(item.sourceId,original.items[i].sourceId);assert.equal(item.choice,original.items[i].choice);assert.deepEqual(item.sources,original.items[i].sources);assert.equal(entries[i].sourceId,item.sourceId);});
 assert.deepEqual(repaired.guides,original.guides);assert.strictEqual(C.repairCities(repaired,cityOptions.cities),repaired);
 const staleBase=C.mergeCatalog([],original);assert.ok(C.mergeCatalog(staleBase,repaired).every(r=>r.place.cityId==='puer'));
 const again=C.importGuide(repaired,realPuer,city,staleBase,now,uid,cityOptions).state;
 assert.equal(again.items.length,8);assert.deepEqual(again.items.map(i=>i.sourceId),original.items.map(i=>i.sourceId));
});
test('legacy migration leaves manual/linked places, multi-source city disagreements and existing identities alone',()=>{
 const state=wrongPuer();state.items[0].editedAt=now;state.items[1].linked=true;state.items[2].cityManual=true;
 const contradictory=structuredClone(state.guides[0]);contradictory.id='c'.repeat(64);contradictory.title='西双版纳景点推荐';contradictory.text='';state.guides.push(contradictory);
 state.items[3].sources.push({...structuredClone(state.items[3].sources[0]),id:contradictory.id+':1',guideId:contradictory.id,title:contradictory.title});
 const repaired=C.repairCities(state,cityOptions.cities);
 assert.deepEqual(repaired.items.slice(0,4),state.items.slice(0,4));assert.ok(repaired.items.slice(4).every(i=>i.city==='普洱'));
 const collision=wrongPuer(),duplicate=structuredClone(collision.items[0]);duplicate.sourceId='dot:existing-puer';duplicate.place.sourceId=duplicate.sourceId;duplicate.place.cityId='puer';duplicate.city='普洱';collision.items.push(duplicate);
 assert.equal(C.repairCities(collision,cityOptions.cities).items[0].city,'西双版纳');
});
test('reparse repairs a wrong city while preserving a chosen stable ID even with a matching system entry',()=>{
 const state=wrongPuer();state.items[0].choice='wish';const id=state.items[0].sourceId;
 const base=[{place:{...state.items[0].place,sourceId:'sight:system-jingmai',cityId:'puer'},city:'普洱',choice:null}];
 const next=C.importGuide(state,realPuer,city,base,now,uid,{...cityOptions,replaceGuideId:realPuer.source.fingerprint}).state;
 assert.equal(next.items[0].sourceId,id);assert.equal(next.items[0].choice,'wish');assert.equal(next.items.length,8);assert.equal(next.items[0].city,'普洱');
});
test('city migration persists once through the real store adapter and leaves other storage slots untouched',async()=>{
 const key='travel-handbook-dot-imports:v1:t',original=wrongPuer();original.items[0].choice='wish';
 const cache=new Map([[key,JSON.stringify(original)],['daily-plan','unchanged itinerary'],['original-project','untouched']]);let writes=0,ready;
 const sandbox={DotImportCore:C,TripData:{key:n=>n==='普洱'?'puer':'banna',name:n=>n,snapshot:{destinations:[city,{id:'puer',name:'普洱'}]}},document:{getElementById:id=>({textContent:id==='journey-seed'?'{"tripId":"t"}':'{"cities":[]}'}),addEventListener:()=>{}},Event:class{},CustomEvent:class{},dispatchEvent:()=>{},addEventListener:()=>{},TravelStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>{writes++;cache.set(k,v);},removeItem:k=>cache.delete(k),whenReady:fn=>{if(!ready)ready=fn;},flushCache:async()=>{}}};
 sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dot-import-store.js'),'utf8'),sandbox);
 await ready();assert.equal(writes,1);await ready();assert.equal(writes,1);
 const state=JSON.parse(cache.get(key));assert.equal(state.items[0].city,'普洱');assert.equal(state.items[0].choice,'wish');assert.equal(state.items[0].sourceId,original.items[0].sourceId);assert.equal(cache.get('daily-plan'),'unchanged itinerary');assert.equal(cache.get('original-project'),'untouched');
});

test('confirming a legacy pending place is not blocked by its same-city system recommendation',()=>{
 const repaired=C.repairCities(wrongPuer(),cityOptions.cities),item=repaired.items.find(i=>i.place.name==='思茅老街');
 item.choice='wish';assert.equal(item.place.kind,'manual');
 const base=[{place:{...item.place,sourceId:'sight:system-oldstreet',kind:'sight'},city:'普洱',choice:null}],original=structuredClone(repaired);
 const current=C.mergeCatalog(base,repaired).find(r=>r.place.sourceId===item.sourceId),patch={name:current.place.name,city:'普洱',cityId:'puer',kind:'sight'};
 const next=C.editPlace(repaired,current,patch,base,now),saved=next.items.find(i=>i.sourceId===item.sourceId);
 assert.equal(saved.place.kind,'sight');assert.equal(saved.choice,'wish');assert.equal(saved.sourceId,item.sourceId);
 assert.deepEqual(saved.sources,item.sources);assert.deepEqual(next.guides,repaired.guides);assert.deepEqual(repaired,original);
 const reload=C.reclassify(JSON.parse(JSON.stringify(next)));assert.equal(reload.items.find(i=>i.sourceId===item.sourceId).place.kind,'sight');
 const reimport=C.importGuide(reload,realPuer,null,base,now,uid,cityOptions).state;
 assert.equal(reimport.items.find(i=>i.sourceId===item.sourceId).place.kind,'sight');assert.equal(reimport.items.find(i=>i.sourceId===item.sourceId).choice,'wish');assert.equal(reimport.items.length,next.items.length);
});
test('category-only edits allow existing collisions, but renaming or moving into another place still stops',()=>{
 const state=C.repairCities(wrongPuer(),cityOptions.cities),item=state.items.find(i=>i.place.name==='思茅老街'),current=C.mergeCatalog([],state).find(r=>r.place.sourceId===item.sourceId);
 const duplicate={place:{...item.place,sourceId:'sight:system',kind:'sight'},city:'普洱',choice:null},other={place:{...item.place,sourceId:'sight:other',name:'另一老街',aliases:['另一街区'],kind:'sight'},city:'普洱',choice:null};
 assert.doesNotThrow(()=>C.editPlace(state,current,{name:item.place.name,city:'普洱',cityId:'puer',kind:'experience'},[duplicate],now));
 assert.throws(()=>C.editPlace(state,current,{name:'另一街区',city:'普洱',cityId:'puer',kind:'sight'},[other],now),/同名地点/);
 const elsewhere={...duplicate,place:{...duplicate.place,cityId:'banna'},city:'西双版纳'};
 assert.throws(()=>C.editPlace(state,current,{name:item.place.name,city:'西双版纳',cityId:'banna',kind:'sight'},[elsewhere],now),/同名地点/);
});
test('pending category suggestions use same-city catalogue evidence without saving or choosing the place',()=>{
 const state=C.repairCities(wrongPuer(),cityOptions.cities),original=structuredClone(state),rows=C.mergeCatalog([],state);
 const pending=rows.filter(r=>r.place.kind==='manual');assert.equal(pending.length,4);
 const base=pending.map((r,i)=>({...r,place:{...r.place,sourceId:'sight:system-'+i,kind:'sight'}}));
 for(const r of pending){assert.equal(C.suggestPlaceKind(r,base).kind,'sight');assert.match(C.suggestPlaceKind(r,base).reason,/同城/);assert.equal(r.choice,null);assert.equal(r.place.kind,'manual');}
 assert.deepEqual(state,original);
 const manual={...pending[0],place:{...pending[0].place,kind:'experience'}};assert.equal(C.suggestPlaceKind(manual,base).kind,'experience');
});
test('suggestions leave unsupported or conflicting categories blank and keep uncertain inference out of stored data',()=>{
 const unknown={city:'普洱',place:{sourceId:'dot:unknown',cityId:'puer',name:'南风',kind:'manual',dotSources:[{title:'景点推荐',reasons:[{label:'位置',text:'位于市区，交通方便。'}]}]}};
 const elsewhere={...unknown,place:{...unknown.place,sourceId:'food:elsewhere',cityId:'banna',kind:'food'}};
 assert.equal(C.suggestPlaceKind(unknown,[elsewhere]).kind,null);
 const known={...elsewhere,place:{...elsewhere.place,cityId:'puer'}};assert.equal(C.suggestPlaceKind(unknown,[known]).kind,'food');
 const conflict={...known,place:{...known.place,sourceId:'shopping:another',kind:'shopping'}};
 assert.equal(C.suggestPlaceKind(unknown,[known,conflict]).kind,null);
 const street={...unknown,place:{...unknown.place,name:'测试古巷',dotSources:[{title:'旅行攻略',reasons:[{label:'古建',text:'青石板路和砖木老宅适合散步。'}]}]}};
 assert.equal(C.suggestPlaceKind(street).kind,'sight');assert.equal(C.inferKind(street.place.name,'青石板路和砖木老宅适合散步。','旅行攻略'),null);assert.equal(street.place.kind,'manual');
});
test('confirmation persists through the real store adapter, preserves choices and planner storage, and rolls back failures',async()=>{
 const state=C.repairCities(wrongPuer(),cityOptions.cities),item=state.items.find(i=>i.place.name==='思茅老街');item.choice='maybe';
 const key='travel-handbook-dot-imports:v1:t',cache=new Map([[key,JSON.stringify(state)],['daily-plan',JSON.stringify({entries:[{sourceId:item.sourceId,date:'2026-09-29',slot:'morning'}]})]]),plan=cache.get('daily-plan');let fail=false;
 const base=[{place:{...item.place,sourceId:'sight:system-oldstreet',kind:'sight'},city:'普洱',choice:null}];
 const sandbox={DotImportCore:C,TripData:{key:n=>n==='普洱'?'puer':'banna',name:n=>n,snapshot:{destinations:cityOptions.cities}},document:{getElementById:id=>({textContent:id==='journey-seed'?'{"tripId":"t"}':'{"cities":[]}'}),addEventListener:()=>{}},Event:class{},dispatchEvent:()=>{},addEventListener:()=>{},TravelStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k),whenReady:()=>{},flushCache:async()=>{if(fail)throw Error('test storage failure');}}};
 sandbox.window=sandbox;sandbox.DailyPlanner={catalog:()=>C.mergeCatalog(base,sandbox.DotImports.read())};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dot-import-store.js'),'utf8'),sandbox);
 await sandbox.DotImports.edit(item.sourceId,{name:item.place.name,city:'普洱',cityId:'puer',kind:'sight'});
 const saved=sandbox.DotImports.read().items.find(i=>i.sourceId===item.sourceId);assert.equal(saved.place.kind,'sight');assert.equal(saved.choice,'maybe');assert.equal(cache.get('daily-plan'),plan);assert.deepEqual(JSON.parse(JSON.stringify(saved.sources)),item.sources);
 const persisted=cache.get(key);fail=true;await assert.rejects(sandbox.DotImports.edit(item.sourceId,{name:item.place.name,city:'普洱',cityId:'puer',kind:'experience'}),/保存失败/);
 assert.equal(cache.get(key),persisted);assert.equal(sandbox.DotImports.read().items.find(i=>i.sourceId===item.sourceId).place.kind,'sight');assert.equal(cache.get('daily-plan'),plan);
});
test('a failed queued edit cannot overwrite a newer edit started while it was saving',async()=>{
 const state=C.repairCities(wrongPuer(),cityOptions.cities),item=state.items.find(i=>i.place.name==='思茅老街');
 item.choice='wish';
 const key='travel-handbook-dot-imports:v1:t',cache=new Map([[key,JSON.stringify(state)]]);
 let rejectFirst,started;
 const waiting=new Promise(resolve=>started=resolve);
 let writes=0;
 const sandbox={DotImportCore:C,TripData:{key:n=>n==='普洱'?'puer':'banna',name:n=>n,snapshot:{destinations:cityOptions.cities}},document:{getElementById:id=>({textContent:id==='journey-seed'?'{"tripId":"t"}':'{"cities":[]}'}),addEventListener:()=>{}},Event:class{},dispatchEvent:()=>{},addEventListener:()=>{},TravelStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k),whenReady:()=>{},flushCache:()=>++writes===1?new Promise((resolve,reject)=>{rejectFirst=reject;started();}):Promise.resolve()}};
 sandbox.window=sandbox;sandbox.DailyPlanner={catalog:()=>C.mergeCatalog([],sandbox.DotImports.read())};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dot-import-store.js'),'utf8'),sandbox);
 const first=sandbox.DotImports.edit(item.sourceId,{name:item.place.name,city:'普洱',cityId:'puer',kind:'food'});
 const rejected=assert.rejects(first,/保存失败/);
 await waiting;
 const second=sandbox.DotImports.edit(item.sourceId,{name:item.place.name,city:'普洱',cityId:'puer',kind:'sight'});
 rejectFirst(Error('test storage failure'));
 await rejected;await second;
 const saved=sandbox.DotImports.read().items.find(i=>i.sourceId===item.sourceId);
 assert.equal(saved.place.kind,'sight');
 assert.equal(saved.choice,'wish');
 assert.deepEqual(JSON.parse(JSON.stringify(saved.sources)),JSON.parse(JSON.stringify(item.sources)));
});
