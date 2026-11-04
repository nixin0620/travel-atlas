const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../guide-supplements.js');
const C=require('../dot-import-core.js');
const day={id:'d1',date:'2026-09-28',cityId:'puer',locationIds:['puer']};
const row=(id,name='测试茶馆',choice=null)=>({place:{sourceId:id,name,cityId:'puer',kind:'food'},city:'普洱',choice});
const verified=(p,lat=22.8,lng=101,poiId='osm:N:100')=>({...p,lat,lng,poiId,geoSource:'OpenStreetMap / Photon',coordinateSystem:'WGS84',coordinateEvidence:{lat,lng,poiId,confirmedAt:'2026-10-17T00:00:00Z'}});
const source=(id,percent)=>({id:id.repeat(64)+':1',guideId:id.repeat(64),url:'https://www.xiaohongshu.com/explore/'+id.repeat(24),title:'测试攻略'+id,reasons:[{label:'推荐',text:'来源'+id+'的观点'}],recommendationPercentage:percent,imageIndices:[0]});
test('merge is read-only, reuses decided identity and preserves distinct percentages and system sources',()=>{
 const base=row('food:tea'),mine=row('dot:mine','测试茶馆','wish');base.systemSources=[{url:'https://example.org/place',title:'公开资料'}];base.place.dotSources=[source('a',20)];mine.place.dotSources=[source('b',70)];
 const rows=[base,mine],before=structuredClone(rows),state={items:[{sourceId:'dot:mine',decisionAt:'2026-10-17'}]};
 const merged=S.mergeRows(rows,state);
 assert.equal(merged.length,1);assert.equal(merged[0].place.sourceId,'dot:mine');assert.equal(merged[0].choice,'wish');assert.deepEqual(merged[0].place.dotSources.map(s=>s.recommendationPercentage),[70,20]);assert.equal(merged[0].systemSources.length,1);assert.deepEqual(rows,before);assert.deepEqual(merged[0].memberIds,['food:tea','dot:mine']);
});
test('different cities, branches, and conflicting confirmed POIs remain separate',()=>{
 const a=row('food:a','测试茶馆（东店）'),b=row('food:b','测试茶馆（西店）');assert.equal(S.mergeRows([a,b]).length,2);
 const c=structuredClone(a);c.place.sourceId='food:c';c.place.cityId='banna';assert.equal(S.mergeRows([a,c]).length,2);
 b.place.name=a.place.name;a.place.poiId='osm:N:1';b.place.poiId='osm:N:2';assert.equal(S.mergeRows([a,b]).length,2);
});
test('latest decision wins without changing any old stored choice or schedule reference',()=>{
 const a=row('food:a','测试茶馆','wish'),b=row('dot:b','测试茶馆','skip'),state={items:[{sourceId:'food:a',decisionAt:'2026-10-16'},{sourceId:'dot:b',decisionAt:'2026-10-17'}]};
 const assignments=[{place:a.place,active:true}],before=JSON.stringify({state,assignments});
 const merged=S.mergeRows([a,b],state,assignments);assert.equal(merged[0].choice,'skip');assert.equal(merged[0].place.sourceId,'dot:b');assert.equal(JSON.stringify({state,assignments}),before);
});
test('source removal keeps the decided place and other provenance',()=>{
 const a=row('food:a'),b=row('dot:b','测试茶馆','wish');a.systemSources=[{url:'https://example.org/place',title:'资料'}];b.place.dotSources=[];
 const merged=S.mergeRows([a,b],{items:[{sourceId:'dot:b',decisionAt:'2026-10-17'}]});assert.equal(merged[0].place.sourceId,'dot:b');assert.equal(merged[0].choice,'wish');assert.equal(merged[0].systemSources.length,1);
});
test('empty-slot suggestions prefer unscheduled wants in the selected city, at most three',()=>{
 const rows=Array.from({length:5},(_,i)=>row('dot:'+i,'茶馆'+i,'wish'));rows.push({...row('dot:other','另一城','wish'),place:{...row('x').place,sourceId:'dot:other',cityId:'banna'}});
 const result=S.suggest({rows,day});assert.equal(result.items.length,3);assert.equal(result.slot,'morning');assert.ok(result.items.every(i=>i.row.place.cityId==='puer'&&i.reasons[0].includes('上午尚未安排')));assert.ok(result.items.every(i=>i.meters===null));
});
test('notes and fixed transport occupy a slot; hotel edges do not',()=>{
 const rows=[row('dot:a','茶馆','wish')],points=[{type:'note',slot:'morning'},{fixed:true,slot:'afternoon'},{edge:'end',slot:'evening'}];
 const result=S.suggest({rows,day,points});assert.deepEqual(result.emptySlots,['evening']);assert.equal(result.slot,'evening');assert.equal(result.items.length,1);assert.equal(S.suggest({rows,day,points,slot:'morning'}).reason,'occupied');
});
test('skip, already scheduled, and duplicate scheduled identities are excluded',()=>{
 const rows=[row('dot:a','茶馆','wish'),row('dot:b','排除餐馆','skip')];rows[0].memberIds=['food:old','dot:a'];
 assert.equal(S.suggest({rows,day,assignments:[{place:{...rows[0].place,sourceId:'food:old'},active:true}]}).items.length,0);
 assert.equal(S.suggest({rows,day,assignments:[{place:{...rows[0].place,sourceId:'manual:old'},active:true}]}).items.length,0);
});
test('no dates or evidence produces no generic fallback recommendations',()=>{
 assert.equal(S.suggest({rows:[row('x')],day:null}).reason,'no-day');
 assert.equal(S.suggest({rows:[row('x')],day}).items.length,0);
});
test('unverified coordinates, missing CRS and manually changed coordinates cannot qualify as nearby',()=>{
 const p=verified(row('x').place);assert.equal(S.trustedLocation(p),true);
 for(const patch of [{coordinateSystem:undefined},{coordinateSystem:'GCJ-02'},{coordinateEvidence:undefined},{lat:22.801},{locationPending:true},{geoSource:'手册参考位置'}])assert.equal(S.trustedLocation({...p,...patch}),false);
});
test('nearby requires two verified positions and labels straight-line distance, never walking time',()=>{
 const a=row('dot:a'),b=row('food:b','锚点');a.place=verified(a.place,22.801,101,'osm:N:101');a.place.dotSources=[source('a',35)];b.place=verified(b.place);
 const result=S.suggest({rows:[a],day,points:[{place:b.place,slot:'morning'}]});assert.equal(result.items.length,1);assert.match(result.items[0].reasons[0],/直线约 110 米/);assert.doesNotMatch(result.items[0].reasons[0],/步行|分钟|开放|顺路/);
 b.place.coordinateEvidence=null;assert.equal(S.suggest({rows:[a],day,points:[{place:b.place,slot:'morning'}]}).items.length,0);
});
test('nearby excludes more than one kilometre and prioritizes personal sources over handbook',()=>{
 const anchor=verified(row('anchor','锚点').place),own=row('dot:a','个人咖啡'),system=row('food:b','手册咖啡'),far=row('food:c','远处咖啡');
 own.place=verified(own.place,22.802,101,'osm:N:101');own.place.dotSources=[source('a',30)];
 system.place=verified(system.place,22.801,101,'osm:N:102');system.systemSources=[{url:'https://example.org/b',title:'资料'}];
 far.place=verified(far.place,22.9,101,'osm:N:103');far.systemSources=system.systemSources;
 const result=S.suggest({rows:[system,far,own],day,points:[{place:anchor,slot:'morning'}]});assert.deepEqual(result.items.map(i=>i.row.place.sourceId),['dot:a','food:b']);
});
test('maps, search results and image-only credits are not recommendation sources',()=>{
 for(const [url,label] of [['javascript:alert(1)','资料'],['https://www.google.com/maps/search/?query=x','资料'],['https://www.xiaohongshu.com/search_result?keyword=x','游客实拍'],['https://example.org/photo','图片来源']])assert.equal(S.sourceLink(url,label),null);
 assert.ok(S.sourceLink('https://example.org/place','景点资料与图片来源'));
 const clean=S.sourceLink('https://www.xiaohongshu.com/explore/123?appuid=private&xhsshare=x','原笔记');assert.equal(clean.url,'https://www.xiaohongshu.com/explore/123');
});
test('existing sentence merging preserves distinct viewpoints and per-guide percentages',()=>{
 const a=source('a',41),b=source('b',23);a.reasons=[{label:'推荐',text:'适合慢逛。'},{label:'注意',text:'周末人多。'}];b.reasons=[{label:'推荐',text:'适合慢逛。'},{label:'注意',text:'雨天路滑。'}];
 const out=C.recommendationView([a,b]);assert.equal(out.visible.filter(p=>p.text==='适合慢逛。').length,1);assert.ok(out.visible.some(p=>p.text==='周末人多。'));assert.ok(out.visible.some(p=>p.text==='雨天路滑。'));assert.deepEqual([a.recommendationPercentage,b.recommendationPercentage],[41,23]);
});
