/* Derived, read-only comparisons. Source statements stay quotations, never ratings. */
(function(global){
'use strict';
const Core=typeof module==='object'&&module.exports?require('./dot-import-core.js'):global.DotImportCore;
const Supplements=typeof module==='object'&&module.exports?require('./guide-supplements.js'):global.GuideSupplements;
const labels={sight:'景点',food:'美食',experience:'体验',shopping:'购物'};
const dimensions=[['experience','核心体验'],['audience','适合人群'],['time','游玩时间'],['hours','开放时间'],['transport','交通信息'],['budget','费用参考'],['caution','重要顾虑']];
function safeURL(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
function sourcesFor(row){return Supplements.recommendationSources(row).filter(s=>safeURL(s.url));}
function topic(row,kind=row.place.kind){
 // Only explicit names/aliases identify a finer type. Incidental words in a review
 // (e.g. a cafe inside a temple) must not recategorize the place.
 const name=[row.place.name,...(row.place.aliases||[])].join(' ');
 const rules={
  sight:[['园林景观',/植物园|花卉园|御花园/],['村寨与街区',/村|寨|老街|古城|古镇|家巷/],['寺庙',/寺|佛塔/],['博物馆',/博物馆|纪念馆|展览馆/],['自然景观',/森林|雨林|湿地|国家公园|瀑布|湖|野象谷/]],
  food:[['咖啡与茶饮',/咖啡|茶馆|茶室/],['甜品与冷饮',/甜品|冰屋|冷饮|炒冰|糖水/],['米线与小吃',/米线|小吃|早点|糯米饭/]],
  experience:[['村寨与街区',/村|寨|老街|古城|古镇|家巷/],['手作体验',/手作|陶艺|工坊|造纸|傣锦/],['户外体验',/徒步|漂流|骑行|溯溪/]],
  shopping:[['市场与集市',/市场|集市|夜市/]]
 };
 return(rules[kind]||[]).find(([,pattern])=>pattern.test(name))?.[0]||'';
}
function groups(rows,{city='all',kind='all'}={}){
 const buckets=new Map();
 for(const row of rows){
  const p=row.place;
  if(!p.cityId||p.cityId==='unknown'||row.choice==='skip'||!sourcesFor(row).length||city!=='all'&&p.cityId!==city)continue;
  for(const facet of [p.kind].filter(k=>labels[k]&&(kind==='all'||kind===k))){
   const key=p.cityId+':'+facet;
   if(!buckets.has(key))buckets.set(key,{key,cityId:p.cityId,city:row.city,kind:facet,rows:[]});
   if(!buckets.get(key).rows.some(r=>r.place.sourceId===p.sourceId))buckets.get(key).rows.push(row);
  }
 }
 const result=[];
 for(const bucket of buckets.values()){
  bucket.pool=bucket.rows;
  bucket.rows=bucket.rows.filter(row=>sourcesFor(row).some(source=>(source.reasons||[]).some(reason=>String(reason.text||'').trim())));
  if(bucket.rows.length<2)continue;
  const topics=new Map();
  for(const row of bucket.rows){const name=topic(row,bucket.kind);if(name){if(!topics.has(name))topics.set(name,[]);topics.get(name).push(row);}}
  const covered=new Set();
  for(const [name,members] of topics)if(members.length>1){
   result.push({...bucket,key:bucket.key+':'+name,label:name,rows:members});
   members.forEach(row=>covered.add(row.place.sourceId));
  }
  // The fallback only owns leftovers, never all the members of other topics.
  // A lone remainder stays in the place list and manual replacement pool.
  const remaining=bucket.rows.filter(row=>!covered.has(row.place.sourceId));
  if(remaining.length>1)result.push({...bucket,label:(covered.size?'其他':'')+labels[bucket.kind]+'对比',rows:remaining});
 }
 return result;
}
function select(group,previous){
 const available=new Map(group.pool.map(r=>[r.place.sourceId,r]));
 const kept=[...new Set(previous||[])].filter(id=>available.has(id)).slice(0,4);
 if(kept.length>=2)return kept;
 const defaults=group.rows.slice().sort((a,b)=>Number(Core.wanted(b.choice))-Number(Core.wanted(a.choice)));
 // A village comparison should show the imported alternatives and newly sourced
 // options together; adding candidates does not change any saved wishes.
 return[...new Set([...kept,...defaults.map(r=>r.place.sourceId)])].slice(0,group.label==='村寨与街区'?4:3);
}
function topicNavigation(groups,currentKey){
 const current=groups.find(g=>g.key===currentKey);
 const proximity=g=>g.cityId===current?.cityId?(g.kind===current?.kind?0:1):2;
 const alternatives=groups.filter(g=>g.key!==currentKey).sort((a,b)=>proximity(a)-proximity(b));
 // The title names the current topic. Keep just two alternatives beside it;
 // every remaining group stays reachable without flattening the catalogue.
 return {quick:alternatives.slice(0,2),more:alternatives.slice(2)};
}
// One city and one category per comparison surface. With “all” selected,
// use the first eligible context; other cities remain reachable in the city tabs.
function contextGroups(rows,options={},currentKey=''){
 const available=groups(rows,options),previous=available.find(g=>g.key===currentKey);
 const context=previous||available[0];if(!context)return [];
 return available.filter(g=>g.cityId===context.cityId&&g.kind===context.kind)
  .sort((a,b)=>b.rows.length-a.rows.length);
}
function withFacts(model,result){
 const sources=model.sources.slice(),cells=Object.fromEntries(dimensions.map(([key])=>[key,(model.cells[key]||[]).map(p=>({...p}))]));
 if(result?.status!=='verified'||result.cityId!==model.row.place.cityId||result.name!==model.row.place.name)return {...model,sources,cells};
 const incoming=result.sources||[result.source],indexes=new Map();
 for(const fact of result.facts||[]){
  const source=incoming[fact.sourceIndex||0];
  if(!safeURL(source?.url)||!['official','public','platform'].includes(source.type)||!cells[fact.field]||(model.cells[fact.field]||[]).length||typeof fact.text!=='string'||!fact.text.trim())continue;
  if(!indexes.has(source.url)){const existing=sources.findIndex(s=>s.url===source.url);indexes.set(source.url,existing<0?sources.length:existing);if(existing<0)sources.push({...source});}
  cells[fact.field].push({label:fact.label||'',text:fact.text,verified:true,sourceIndexes:[indexes.get(source.url)]});
 }
 return {...model,sources,cells};
}
function presentation(models){
 const visible=[],shared=[],notes=models.map(()=>[]);
 for(const [key,title] of dimensions){
  const populated=models.filter(m=>m.cells[key]?.length);
  if(!populated.length)continue;
  // Identical platform/official facts are useful once, with every source kept.
  if(['hours','budget'].includes(key)&&populated.length===models.length&&models.every(m=>m.cells[key].length===1&&m.cells[key][0].verified&&m.cells[key][0].text===models[0].cells[key][0].text)){
   shared.push({key,title,text:models[0].cells[key][0].text,references:models.flatMap(m=>m.cells[key][0].sourceIndexes.map(i=>m.sources[i]))});continue;
  }
  if(populated.length>1||key==='experience'||key==='caution')visible.push([key,title]);
  else models.forEach((m,i)=>{for(const point of m.cells[key]||[])notes[i].push({...point,dimension:title});});
 }
 return {visible,shared,notes};
}
function mergeCellPoints(points){
 // Display-only consolidation. Keep the source wording and a quote for each
 // citation; do not change saved guides or use fuzzy similarity on warnings.
 const result=[],byKey=new Map();
 const textKey=text=>text.normalize('NFKC').replace(/\s+/g,'').replace(/[。；;.!！?？]+$/,'');
 function handcraftKey(point){
  if(point.caution||point.verified)return '';
  // Only whole, unqualified activity lists are equivalent. Anything about
  // prices, opening times, availability or an extra experience stays intact.
  const text=textKey(point.text);
  const match=text.match(/^(?:还|還)?(?:可以|可)?(?:亲手|親手|动手|動手)?(?:主打|体验|體驗|学习|學習|参与|參與)([傣陶制製艺藝造纸紙扎染编編织織、和与與及]+)(?:等)?(?:DIY|手作|手工|传统手工文化|傳統手工文化|非遗手作|非遺手作)?$/i);
  if(!match)return '';
  const activities=match[1].split(/[、和与與及]/);
  const names=new Map([['傣陶','制陶'],['制陶','制陶'],['製陶','制陶'],['造纸','造纸'],['造紙','造纸'],['扎染','扎染'],['编织','编织'],['編織','编织']]);
  if(activities.some(name=>!names.has(name)))return '';
  return [...new Set(activities.map(name=>names.get(name)))].sort().join('|');
 }
 for(const point of points){
  if(!point.text?.trim())continue;
  const activity=handcraftKey(point),key=activity?'activity:'+activity:'text:'+textKey(point.text);
  let merged=byKey.get(key);
  if(!merged){
   merged={...point,sourceIndexes:[],references:[]};
   result.push(merged);byKey.set(key,merged);
  }
  merged.caution=Boolean(merged.caution||point.caution);
  for(const sourceIndex of point.sourceIndexes||[]){
   if(!merged.sourceIndexes.includes(sourceIndex))merged.sourceIndexes.push(sourceIndex);
   if(!merged.references.some(r=>r.sourceIndex===sourceIndex&&r.text===point.text))merged.references.push({sourceIndex,text:point.text});
  }
 }
 return result;
}
function choiceAdvice(rows){
 return takeaway(rows).map((item,index)=>{
  const points=evidence(rows[index]).cells.experience;
  // Specific source-authored experience labels make a concise choice cue.
  // Conditions/cautions are never reduced to a positive recommendation.
  const point=points.find(p=>p.label&&p.label.length>=2&&p.label.length<=10&&!p.caution&&dimension(p)==='experience'&&!/如果|若|仅|只有|除非|但|不过|雨天|晴天|不适合|不宜|不建议|禁止/.test(p.text)&&!/公开|报道|资料|平台/.test(p.label)&&!/^(体验|推荐|理由|特色|特色体验|亮点|招牌|评价|景色|游玩建议|性价比|高性价比)$/.test(p.label));
  if(point)return {...item,focus:point.label,sourceIndexes:point.sourceIndexes};
  // An extractive cue from a dated report: only phrases actually present in
  // that source, never infer an audience, current availability, price or score.
  const platformIndex=item.sources.findIndex(s=>Supplements.sourceIdentity(s).platform&&s.type==='platform');
  if(platformIndex>=0){const text=(item.sources[platformIndex].reasons||[]).map(r=>r.text).join(' '),features=['傳統村落','傣樓','古榕樹','造紙','製陶','佛寺','文化館','古樹'].filter(word=>text.includes(word)).slice(0,2);if(features.length)return {...item,focus:'',text:features.join('、'),sourceIndexes:[platformIndex]};}
  const sourceIndex=item.sources.findIndex(s=>s.discoveryTopic&&s.publishedAt);
  if(sourceIndex>=0){const source=item.sources[sourceIndex],text=(source.reasons||[]).filter(r=>!/注意/.test(r.label||'')&&!/没有|尚未|不再|计划|拟|将|未来|如果|只有|但是|未开放/.test(r.text)).map(r=>r.text).join(' '),features=['傣式建筑','热带雨林','非遗体验馆','村史馆','慢轮制陶','手工艺品'].filter(word=>text.includes(word)).slice(0,2);if(features.length)return {...item,focus:'',text:features.join('、')+'（'+source.publishedAt.slice(0,4)+'年报道）',sourceIndexes:[sourceIndex]};}
  return {...item,focus:''};
 });
}
function decisionSummary(models){
 // Match travel intentions to explicit source statements, not venue names,
 // percentages or a list of descriptive nouns. The renderer keeps citations.
 const guarded=/如果|除非|只有|仅(?:限|在|晴天)|但|不过|否则|雨天|晴天|不适合|不適合|不宜|不建议|不建議|禁止|没有|沒有|尚未|未开放|未開放|暂停|暫停|取消|关门|關門|闭馆|閉館|停业|停業|无法|無法|不能|不再|怕|全凭|运气/;
 const rules=[
  {id:'hands',priority:16,lead:'想动手做手工，可看',pattern:/(?:主打|体验|體驗|学习|學習|参与|參與|可做|动手).{0,24}(?:手作|手工|造纸|造紙|制陶|製陶|傣陶)|DIY/i,concept:/手作|手工|造纸|造紙|制陶|製陶|傣陶|DIY/i,caution:/不做.*(?:手工|手作)|差价|费用|預約|预约/},
  {id:'short',priority:14,lead:'时间紧、想顺路短停，可看',pattern:/(?:时间紧|時間緊|顺路|順路).{0,15}(?:打卡|逛|停)|(?:适合|適合).{0,12}(?:短停|顺路|順路)/,concept:/顺路|順路|短停|时间紧|時間緊/,caution:/寨子|村子|小|商业|商業|排队/},
  {id:'plants',priority:12,lead:'想重点看热带植物，可看',pattern:/王莲|王蓮|跳舞草|植物种类丰富|植物種類豐富|观赏热带植物|觀賞熱帶植物/,concept:/植物|王莲|王蓮/,caution:/讲解|講解|走马观花|走馬觀花|观光车|觀光車|大|半天/},
  {id:'walk',priority:11,lead:'想走步道、亲近自然，可看',pattern:/(?:可|适合|適合|建议|建議).{0,12}(?:徒步|步道|栈道|棧道)|雨林徒步/,concept:/徒步|步道|栈道|棧道/,caution:/体力|體力|台阶|臺階|路滑|雨|蚊|鞋/},
  {id:'family',priority:10,lead:'带孩子出游，可看',pattern:/亲子友好|親子友好|(?:适合|適合).{0,8}(?:亲子|親子|孩子|儿童|兒童)/,concept:/亲子|親子|孩子|儿童|兒童/,caution:/台阶|臺階|推车|推車|年龄|年齡|预约|預約/},
  {id:'photo',priority:7,lead:'以拍照为主，可看',pattern:/出片|适合拍照|適合拍照|拍照好看|拍照打卡/,concept:/出片|拍照|摄影|攝影/,caution:/商拍|拥堵|擁堵|人多|排队|排隊|不拍照/},
  {id:'coffee',priority:6,lead:'想喝咖啡、慢慢坐坐，可看',pattern:/品尝咖啡|品嚐咖啡|喝咖啡|咖啡.{0,8}(?:好喝|香浓|香濃)|咖啡馆.{0,12}慢/,concept:/咖啡/,caution:/价格|價格|人均|排队|排隊/},
  {id:'tea',priority:6,lead:'想品茶，可看',pattern:/品茶|茶叶品鉴|茶葉品鑑|茶艺体验|茶藝體驗/,concept:/品茶|茶叶|茶葉|茶艺|茶藝/,caution:/消费|消費|价格|價格|预约|預約/}
 ];
 const entries=models.map(model=>{
  const points=Core.recommendationView(model.sources),all=[...points.visible,...points.more];
  const warnings=[...model.cells.caution,...all.filter(p=>guarded.test(p.text))];
  const candidates=[];
  for(const rule of rules){
   const point=all.find(p=>p.sourceIndexes.length&&rule.pattern.test(p.text)&&!p.caution&&!guarded.test(p.text));
   if(!point)continue;
   // Conflicting availability/suitability statements must not become a
   // confident endorsement merely because another source is positive.
   if(all.some(p=>rule.concept.test(p.text)&&/不提供|没有|沒有|未开放|未開放|暂停|暫停|取消|关门|關門|闭馆|閉館|停业|停業|无法|無法|不能|不再|不适合|不適合|不建议|不建議|不宜/.test(p.text)))continue;
   const warningScore=p=>Number(rule.caution.test(p.text))*2+Number(/不做|商业化|商業化|不拍照|走马观花|走馬觀花/.test(p.text));
   const caution=warnings.slice().sort((a,b)=>warningScore(b)-warningScore(a)||a.text.length-b.text.length)[0];
   if(caution&&caution.text.length>100)continue; // Do not truncate a qualification.
   let lead=rule.lead;
   if(rule.id==='hands'){
    const activities=[[/造纸|造紙/,'造纸'],[/制陶|製陶|傣陶/,'制陶']].filter(([p])=>p.test(point.text)).map(([,label])=>label);
    if(activities.length)lead='想动手'+activities.join('、')+'，可看';
   }
   candidates.push({id:rule.id,priority:rule.priority,lead,point,caution});
  }
  return {name:model.row.displayName||model.row.place.name,sources:model.sources,candidates};
 });
 const frequency=new Map(rules.map(rule=>[rule.id,entries.filter(e=>e.candidates.some(c=>c.id===rule.id)).length]));
 const pool=entries.flatMap((entry,index)=>entry.candidates.map(candidate=>({index,...candidate,score:candidate.priority+(frequency.get(candidate.id)===1?4:0)}))).sort((a,b)=>b.score-a.score||a.index-b.index);
 const chosen=new Map(),used=new Set();
 for(const candidate of pool){
  if(chosen.size===2)break;
  if(chosen.has(candidate.index)||used.has(candidate.id))continue;
  chosen.set(candidate.index,candidate);used.add(candidate.id);
 }
 const clauses=entries.flatMap((entry,index)=>chosen.has(index)?[{...entry,...chosen.get(index)}]:[]);
 // A shared feature is not a reason to rank one place above another.
 if(clauses.length===1&&entries.length>1&&frequency.get(clauses[0].id)>1)return {clauses:[],unresolved:entries.map(e=>e.name)};
 return {clauses,unresolved:entries.filter((_,index)=>!chosen.has(index)).map(e=>e.name)};
}
function dimension(point){
 const text=point.text,label=point.label||'';
 if(point.caution||/注意|避坑|提醒|慎|顾虑/.test(label)||/注意|不宜|不建议|不适合|禁止|务必|慎选/.test(text))return 'caution';
 if(/人群|适合谁/.test(label)||/(?:适合|适宜|面向|推荐给).*(?:亲子|家庭|儿童|孩子|老人|长者|情侣|朋友|爱好者|初学者|新手)|亲子友好/.test(text))return 'audience';
 if(/价格|预算|票价|费用|人均|消费/.test(label)||/人均|门票|票价|预算|收费|免费|[￥¥]\s*\d|\d+(?:\.\d+)?\s*元/.test(text))return 'budget';
 if(/车程|驾车|开车|打车|公交|自驾|步行.{0,8}(?:到|抵达)|距.{0,16}(?:分钟|小时|公里)|交通/.test(text+' '+label))return 'transport';
 if(/开放时间|营业时间/.test(label))return 'hours';
 if(/时间|时长|停留|营业/.test(label)||/小时|分钟|半天|一天|全天|上午|下午|晚上|清晨|傍晚|排队|开放|营业|\d{1,2}[:：]\d{2}/.test(text))return 'time';
 return 'experience';
}
function evidenceParts(point){
 // Separate independent, explicitly stated facets, e.g. "手作，亲子友好，
 // 注意问清费用". Conditional/negative/contrast statements stay intact so
 // extracting a phrase cannot turn "仅晴天适合…" into a general endorsement.
 if(point.caution||/注意|避坑|提醒|慎|顾虑/.test(point.label||'')||/如果|若|仅|只有|除非|前提|取决|视情况|时[，,]|但|不过|否则|虽然|尽管|雨天|晴天|不适合|不宜|不建议/.test(point.text))return [point];
 const clauses=point.text.split('，').map(text=>({...point,text}));
 if(new Set(clauses.map(dimension)).size<2)return [point];
 const parts=[];
 for(const clause of clauses){
  const previous=parts.at(-1);
  if(previous&&dimension(previous)===dimension(clause))previous.text+='，'+clause.text;
  else parts.push({...clause});
 }
 return parts.map((part,index)=>index?{...part,label:''}:part);
}
function evidence(row){
 const sources=sourcesFor(row),view=Core.recommendationView(sources);
 const cells=Object.fromEntries(dimensions.map(([key])=>[key,[]]));
 for(const point of [...view.visible,...view.more]){
  if(point.label==='平台介绍'&&point.sourceIndexes.every(i=>sources[i].type==='platform')){cells.experience.push(point);continue;}
  // Re-split merged paragraphs to avoid copying a complete paragraph into several cells.
  for(const text of point.text.match(/[^。！？!?；;\n]+[。！？!?；;\n]*/g)||[]){
   const item={...point,text:text.trim()};if(item.text&&item.sourceIndexes.length)for(const part of evidenceParts(item))cells[dimension(part)].push(part);
  }
 }
 return{sources,cells};
}
function takeaway(rows){
 // An extractive overview, not a generated verdict: quote the first complete
 // source statement for each place. Never cut at a comma (which can discard
 // a condition or warning), infer an audience, or reuse unsourced descriptions.
 return rows.map(row=>{
  const sources=sourcesFor(row),view=Core.recommendationView(sources);
  const point=[...view.visible,...view.more].find(p=>p.text.trim()&&p.sourceIndexes.length);
  const text=point?.text.match(/[^。！？!?；;\n]+[。！？!?；;\n]*/)?.[0]?.trim()||'';
  return {name:row.displayName||row.place.name,text,sources,sourceIndexes:text?point.sourceIndexes:[]};
 });
}
const api={presentation,mergeCellPoints,groups,contextGroups,select,evidence,withFacts,takeaway,choiceAdvice,decisionSummary,topicNavigation,dimensions,labels,safeURL};
if(typeof module==='object'&&module.exports)module.exports=api;else global.GuideComparison=api;
})(typeof window!=='undefined'?window:globalThis);
