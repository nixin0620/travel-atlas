/* Place-first guide registry. Existing Pick IDs and daily entries remain unchanged. */
(function(global){
'use strict';
const VERSION=1, MAX_ITEMS=500, MAX_GUIDES=60;
const clone=v=>JSON.parse(JSON.stringify(v));
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,n=2000)=>String(v??'').trim().slice(0,n);
const wanted=v=>v==='wish'||v==='must';
const normalizeName=v=>text(v,180).normalize('NFKC').toLowerCase().replace(/[\s·•・，,。()（）\-—]/g,'').replace(/景区$/,'');
function shareURL(value,token=false){
 let u;try{u=new URL(value);}catch(_){throw Error('链接格式不正确。');}
 if(!['http:','https:'].includes(u.protocol)||u.port||u.username||u.password)throw Error('请使用小红书公开分享链接。');
 if(['xhslink.com','www.xhslink.com'].includes(u.hostname)&&/^\/[A-Za-z0-9/_-]{3,120}$/.test(u.pathname))return 'https://xhslink.com'+u.pathname;
 if(!['xiaohongshu.com','www.xiaohongshu.com'].includes(u.hostname))throw Error('只支持点点与小红书笔记链接。');
 let path,keys=[];
 if(u.pathname==='/s/dot'){
  if(!u.searchParams.get('dot_share_id')||!u.searchParams.get('file_id'))throw Error('点点链接不完整。');
  path=u.pathname;keys=['dot_share_id','file_id','shareThemeType'];
 }else{const m=u.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/i);if(!m)throw Error('没有识别到小红书笔记链接。');path='/explore/'+m[1].toLowerCase();if(token)keys=['xsec_token','xsec_source'];}
 const clean=new URL('https://www.xiaohongshu.com'+path);keys.forEach(k=>{if(u.searchParams.has(k))clean.searchParams.set(k,u.searchParams.get(k));});
 if(clean.href.length>5000)throw Error('分享链接过长。');return clean.href;
}
function links(value){
 const result=[];
 for(let v of String(value).replace(/&amp;/g,'&').match(/https?:\/\/[^\s<>"\u3000，。；、！!？）】」』)\]]+/g)||[]){
  v=v.split(/[，。；、！!？）】」』😆]/)[0].replace(/[.,;:)\]\s]+$/,'');
  try{v=shareURL(v,true);if(!result.some(x=>shareURL(x)===shareURL(v)))result.push(v);}catch(_){}
 }
 return result;
}
// Keep rules aligned with tools/place_text.py; shared fixtures verify both runtimes.
const KIND_RULES={
 "food": {
  "name": "(?:餐厅|餐馆|饭店|饭铺|小食馆|小吃馆|小馆|面馆|咖啡馆|咖啡店|茶室|冰屋|冷饮店|甜品店|米线(?:店|馆)?|早点|早餐|火锅(?:店)?|烧烤|卤烤|铁板烧|糯米饭|香芋包|小吃|凉拌)$",
  "hint": "美食|餐饮|咖啡|冷饮|甜品|米线|火锅|烧烤|小吃|糯米饭|炒冰|饭铺",
  "groups": [
   "美食|餐厅|餐馆|饭铺|小吃|米线|糯米饭|炒冰|火锅|烧烤|菜品|甜品|咖啡|猪油|番茄牛腩|手抓饭|烤鸡|烤鱼|傣味",
   "口味|口感|味道|好吃|爱去吃|下饭|招牌菜|推荐菜|点单|续饭|加饭|奶香|汤底",
   "人均|菜单|用餐|堂食|饭点|排队点餐|免费米饭|米饭自助"
  ]
 },
 "sight": {
  "name": "(?:植物园|公园|花卉园|博物馆|古寨|古城|寺|景区|瀑布|山)$",
  "hint": "植物园|公园|博物馆|景区|古城|古寨|寺庙|瀑布",
  "groups": [
   "游览|观景|风景|景观|植物|古迹|文物|建筑|展览|雨林",
   "门票|入园|景区|景点|景色|观光|栈道|登顶"
  ]
 },
 "shopping": {
  "name": "(?:购物中心|商场|买手店|百货|市集|集市|商店|书店)$",
  "hint": "购物|商场|买手店|百货|市集|集市|商店|书店",
  "groups": [
   "购物|买手|逛店|伴手礼|纪念品|特产|文创商品",
   "购买|选购|商品|零售|砍价|服饰|首饰|买回|茶叶店"
  ]
 },
 "experience": {
  "name": "(?:徒步|漂流|溯溪|手作|制陶|骑行|演出|体验(?:馆|课)?)$",
  "hint": "徒步|漂流|溯溪|手作|制陶|骑行|演出|体验课",
  "groups": [
   "徒步|漂流|溯溪|骑行|演出|制陶|陶艺|手作|手工课程",
   "向导|教练|课程|亲手|教学|预约体验|装备|排练|制作体验"
  ]
 }
};
function classifyKind(name,context='',title='',aliases=[]){
 const names=[...new Set([name,...aliases].filter(Boolean).map(n=>String(n).normalize('NFKC').replace(/（[^）]*）|\([^)]*\)/g,'').trim()))];
 const test=(pattern,value)=>new RegExp(pattern).test(value);
 const strong=Object.keys(KIND_RULES).filter(k=>names.some(n=>test(KIND_RULES[k].name,n)));
 if(strong.length===1)return strong[0];
 const scores=Object.entries(KIND_RULES).map(([kind,r])=>({kind,score:
  (strong.length>1?0:names.some(n=>test(r.hint,n))?4:0)+r.groups.reduce((n,p)=>n+(test(p,context)?2:0),0)+(test(r.hint,title)?1:0)})).sort((a,b)=>b.score-a.score);
 return scores[0].score>=4&&scores[0].score-scores[1].score>=2?scores[0].kind:null;
}
function inferKind(name,context='',title='',aliases=[]){return classifyKind(name,context,title,aliases);}
// Suggestions are presentation-only: a pending place stays pending until confirmed.
function suggestPlaceKind(row,base=[]){
 const p=row.place,valid=['sight','food','experience','shopping'];
 if(valid.includes(p.kind))return {kind:p.kind,reason:''};
 const known=new Set(matches(p,p.cityId,base).filter(r=>r.place.sourceId!==p.sourceId&&valid.includes(r.place.kind)).map(r=>r.place.kind));
 if(known.size===1)return {kind:[...known][0],reason:'参考同城已收录地点的分类'};
 if(known.size>1)return {kind:null,reason:''};
 const sources=p.dotSources||[],context=[p.openingNote,...sources.flatMap(s=>[s.evidence?.classificationContext,...(s.reasons||[]).map(r=>(r.label||'')+' '+r.text)])].filter(Boolean).join('\n');
 const inferred=inferKind(p.name,context,sources.map(s=>s.title).join('\n'),p.aliases||[]);
 if(inferred)return {kind:inferred,reason:'根据地点名称与推荐内容建议'};
 if(/(?:老街|古街|古巷|巷|大院|驿站)$/.test(p.name)&&/古建|古巷|古风|老宅|老楼|砖木|青石板|古树|文物|历史建筑/.test(context))return {kind:'sight',reason:'根据历史街区与游览内容建议'};
 return {kind:null,reason:''};
}
// City evidence is independent of the currently selected destination. A fallback is
// used only when content provides no city; mixed/conflicting evidence stays unresolved.
function resolveCities(result,fallback=null,cities=[]){
 const catalog=new Map();
 for(const c of [...cities,...(fallback?[fallback]:[])]){
  if(!c?.id||!c.name)continue;
  const old=catalog.get(c.id),aliases=[c.name,c.full,...(c.aliases||[]),...(old?.aliases||[])].filter(Boolean);
  catalog.set(c.id,{id:c.id,name:c.name,aliases:[...new Set(aliases)]});
 }
 const tokens=[...catalog.values()].flatMap(c=>c.aliases.filter(a=>a.length>=2).map(alias=>({alias,city:{id:c.id,name:c.name}}))).sort((a,b)=>b.alias.length-a.alias.length);
 function mentions(value){
  const found=new Map();let body=String(value||'').normalize('NFKC').replace(/\s+/g,'');
  // Long names win over their substrings (e.g. 海口 / 海口镇); never count one span twice.
  for(const t of tokens){if(body.includes(t.alias)){found.set(t.city.id,t.city);body=body.split(t.alias).join(' ');}}
  return [...found.values()];
 }
 const source=result.source||{},lines=String(source.text||'').split('\n'),placeNames=new Set(result.places.flatMap(names));
 let first=lines.findIndex(line=>placeNames.has(normalizeName(line.replace(/^\s*\d+[.、．)）]\s*/,''))));
 const intro=lines.slice(0,first<0?5:first).join('\n').slice(0,500);
 const titleCities=mentions(source.title),introCities=mentions(intro),guideCities=titleCities.length?titleCities:introCities;
 const guideCity=guideCities.length===1?guideCities[0]:null;
 const places=result.places.map(p=>{
  if(p.city?.id&&p.city?.name&&(p.city_manual||!p.cityResolution))return {...p,cityResolution:p.city_manual?'manual':'explicit'};
  // Only actual location fields are strong evidence. Recommendations mentioning
  // another city ("比丽江安静", "从昆明出发") must not move the place.
  const locations=[p.address,...(p.reasons||[]).filter(r=>/^(地址|位置|所在地|地点位置)$/.test(r.label||'')).map(r=>r.text)].join('\n');
  const located=mentions(locations),named=mentions([p.name,p.card_name].filter(Boolean).join('\n'));
  let city=null,cityResolution='unresolved';
  if(located.length===1){city=located[0];cityResolution='location';}
  else if(located.length>1)cityResolution='conflict';
  else if(named.length===1&&(!guideCity||named[0].id===guideCity.id)){city=named[0];cityResolution='place-name';}
  else if(named.length>1||named.length===1&&guideCity&&named[0].id!==guideCity.id)cityResolution='conflict';
  else if(guideCity){city=guideCity;cityResolution=titleCities.length?'guide-title':'guide-intro';}
  else if(!guideCities.length&&fallback?.id&&fallback.name){city=fallback;cityResolution='fallback';}
  return {...p,city:city?{id:city.id,name:city.name}:null,cityResolution};
 });
 return {...result,city:fallback,places};
}
function repairCities(state,cities=[]){
 if(!cities.length)return state;
 const resolved=new Map();
 for(const guide of state.guides||[]){
  const items=guidePlaces(state,guide.id),places=items.map(item=>{const source=item.sources.find(s=>guideOf(s)===guide.id);return {...item.place,rank:source.rank,reasons:source.reasons};});
  resolved.set(guide.id,new Map(resolveCities({source:guide,places},null,cities).places.map((p,i)=>[items[i].sourceId,p])));
 }
 let changed=false;
 const items=state.items.map(item=>{
  if(item.linked||item.editedAt||item.cityManual||!item.sources.length)return item;
  const evidence=item.sources.map(s=>resolved.get(guideOf(s))?.get(item.sourceId));
  if(evidence.some(p=>!p?.city)||new Set(evidence.map(p=>p.city.id)).size!==1)return item;
  const city=evidence[0].city;if(city.id===item.place.cityId)return item;
  // Do not silently collapse identities already referenced by separate daily entries.
  if(state.items.some(other=>other.sourceId!==item.sourceId&&other.place.cityId===city.id&&names(other.place).some(n=>names(item.place).includes(n))))return item;
  changed=true;return {...item,city:city.name,place:{...item.place,cityId:city.id},cityRepair:item.cityRepair||{previousCity:item.city,previousCityId:item.place.cityId}};
 });
 return changed?{...state,items}:state;
}
function reclassify(state){
 let changed=false;const legacyContexts=new Map();
 function savedContext(item,source){
  if(source.evidence?.classificationContext)return source.evidence.classificationContext;
  if(source.reasons?.length)return '';
  const guideId=source.guideId||source.id.split(':')[0],guide=(state.guides||[]).find(g=>g.id===guideId);
  if(!guide)return '';
  if(!legacyContexts.has(guideId))legacyContexts.set(guideId,extractText(guide.text,guide.title));
  const entry=legacyContexts.get(guideId).find(p=>names(p).some(n=>names(item.place).includes(n)));
  return entry?[entry.evidence?.classificationContext,...entry.reasons.map(r=>r.text)].filter(Boolean).join('\n'):'';
 }
 const items=state.items.map(item=>{
  // Existing catalogue and manual corrections remain authoritative.
  if(item.linked||item.editedAt||!item.sources.length)return item;
  const context=item.sources.flatMap(s=>[...(s.reasons||[]).map(r=>(r.label||'')+' '+r.text),savedContext(item,s)]).join('\n');
  const kind=inferKind(item.place.name,context,item.sources.map(s=>s.title).join('\n'),item.place.aliases||[])||'manual';
  if(kind===item.place.kind)return item;
  changed=true;return{...item,place:{...item.place,kind}};
 });
 return changed?{...state,items}:state;
}
function extractText(raw,title=''){
 const lines=String(raw).split('\n'),headings=[],result=[],seen=new Set();
 const clean=v=>v.trim().replace(/^[「」【】\[\]\s，,；;。]+|[「」【】\[\]\s，,；;。]+$/g,'');
 const valid=n=>n.length>=2&&n.length<=40&&!/https?:\/\/|#|[，,。！!？?]|建议|注意事项|小贴士|交通方式|住宿推荐|营业时间|人均|必吃推荐|必打卡|攻略|合集|第[一二三四五六七八九十\d]+天|^\d+[月日点:：]/.test(n);
 function add(name,excerpt,evidence,context){name=clean(name);const key=name.replace(/\s+/g,'');if(!valid(name)||seen.has(key))return;seen.add(key);result.push({rank:result.length+1,name,kind:inferKind(name,excerpt||context,title),reasons:excerpt?[{label:'原文摘录',text:excerpt}]:[],recommendation_percentage:null,evidence:{text:evidence,classificationContext:excerpt?'':context},unconfirmed:['具体地图位置待确认']});}
 lines.forEach((line,index)=>{const m=line.match(/^\s*(?:\d{1,2}\s*[.、．)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|📍|(?:店名|地点|店铺)\s*[:：])\s*(.{2,60})$/);if(m){const parts=m[1].split(/[：:｜|—–]/),name=clean(parts.shift());if(valid(name))headings.push({index,name,inline:parts.join('：').trim()});}});
 headings.forEach((h,i)=>add(h.name,[h.inline,...lines.slice(h.index+1,headings[i+1]?.index??lines.length).map(x=>x.split('#')[0])].join('\n').trim(),lines[h.index],''));
 for(const m of String(raw).matchAll(/(?:依次是|分别是|店名(?:清单)?[：:]|店铺(?:清单)?[：:]|推荐(?:的)?(?:店铺|餐厅|景点)[：:])\s*([^。！!？?\n#]+)/g)){
  const parts=m[1].split(/[、，,；;]/);if(parts.length>1)parts.forEach(n=>add(n,'',m[0],String(raw).slice(Math.max(0,m.index-300),m.index).split('#')[0]));
 }
 return result.slice(0,100);
}
function imageForPlace(place,state){
 const candidates=[];
 for(const source of place.dotSources||[]){
  const guide=(state.guides||[]).find(g=>g.id===(source.guideId||source.id.split(':')[0]));if(!guide)continue;
  for(const index of source.imageIndices||[]){const image=guide.images[index];if(!image)continue;
   const width=image.width||image.crop?.width||0,height=image.height||image.crop?.height||0;
   const compact=width>0?width<480||height<260:image.kind==='place_thumbnail';
   candidates.push({src:image.data,guideId:guide.id,index,compact,width,height,score:(compact?0:1e8)+Math.min(width*height,1e7)});
  }
 }
 return candidates.sort((a,b)=>b.score-a.score)[0]||null;
}
// Presentation only. Tiny crops from a guide must not displace an existing
// full-size photograph of the same place; retain them as a fallback.
function choosePlacePhoto(imported,alternatives=[]){
 const compact=p=>Boolean(p.compact||p.width>0&&(p.width<480||p.height>0&&p.height<260));
 const photos=[imported,...alternatives].filter(p=>p?.src).map(p=>({...p,compact:compact(p)}));
 const selected=photos.find(p=>!p.compact)||photos[0];
 if(!selected)return null;
 const fallback=photos.find(p=>p.src!==selected.src);
 return {...selected,fallback:fallback?.src||''};
}
// Presentation only: deduplicate wording, retaining attribution and distinct opinions.
// Original reasons, evidence and percentages in storage are never changed.
function mergePhotos(state,guideId,result){
 if(!obj(result)||!Array.isArray(result.images)||!Array.isArray(result.matches))throw Error('地点图片返回格式不正确。');
 const original=(state.guides||[]).find(g=>g.id===guideId);
 if(!original||!original.images.some(i=>i.kind!=='place_thumbnail'&&i.sha256===result.parentSha256))return state;
 const next=clone(state),guide=next.guides.find(g=>g.id===guideId),map=[];
 result.images.forEach(image=>{
  if(image.kind!=='place_thumbnail'||image.parent_sha256!==result.parentSha256)throw Error('地点图片来源不匹配。');
  let i=guide.images.findIndex(saved=>saved.sha256===image.sha256||image.assetId&&saved.assetId===image.assetId);
  if(i<0&&guide.images.length<24){i=guide.images.length;guide.images.push(clone(image));}map.push(i);
 });
 result.matches.forEach(match=>{
  const item=next.items.find(i=>i.sourceId===match.sourceId),source=item?.sources.find(s=>(s.guideId||s.id.split(':')[0])===guideId);
  if(!source)return;
  if(!Array.isArray(match.imageIndices)||match.imageIndices.some(i=>!Number.isInteger(i)||i<0||i>=map.length))throw Error('地点图片关联不正确。');
  source.imageIndices=[...new Set([...(source.imageIndices||[]),...match.imageIndices.map(i=>map[i]).filter(i=>i>=0)])];
 });
 guide.photoRepairVersion=1;
 return validate(next,state.tripId);
}
function recommendationView(sources=[],fallback=''){
 const atoms=new Map(),cautionPattern=/(注意|避坑|提醒|贴士)/;
 const key=value=>value.normalize('NFKC').toLowerCase().replace(/[\s。！？!?；;，,、：:]+/g,'');
 sources.forEach((source,sourceIndex)=>(source.reasons||[]).forEach((reason,reasonIndex)=>{
  const label=String(reason.label||'').trim();let body=String(reason.text||'').trim();
  if(label&&body.startsWith(label)&&/^\s*[:：]/.test(body.slice(label.length)))body=body.slice(label.length).replace(/^\s*[:：]\s*/,'');
  // Sentence boundaries allow overlap between a short recommendation and a longer one.
  // Do not fuzzy-match: negation, prices, dates and differing opinions must survive.
  for(const part of body.match(/[^。！？!?；;\n]+[。！？!?；;\n]*/g)||[]){
   const value=part.trim(),id=key(value);if(!id)continue;
   const caution=cautionPattern.test(label)||/^(注意(?:事项)?|避坑|提醒|小?贴士)[:：]/.test(value)||/危险|安全隐患|禁止|必须|务必|慎选/.test(value);
   const prior=atoms.get(id);
   if(prior){if(!prior.sourceIndexes.includes(sourceIndex))prior.sourceIndexes.push(sourceIndex);prior.caution ||= caution;continue;}
   atoms.set(id,{text:value,label,caution,sourceIndexes:[sourceIndex],group:sourceIndex+':'+reasonIndex});
  }
 }));
 const points=[];
 for(const atom of atoms.values()){
  const previous=points.at(-1);
  if(previous&&previous.group===atom.group&&previous.caution===atom.caution&&previous.sourceIndexes.join()===atom.sourceIndexes.join()&&previous.text.length+atom.text.length<240)previous.text+=atom.text;
  else points.push({...atom,sourceIndexes:[...atom.sourceIndexes]});
 }
 if(!points.length&&fallback)points.push({text:String(fallback),label:'',caution:false,sourceIndexes:[],group:'fallback'});
 // Single-guide cards are always readable without opening another layer.
 if(sources.length<2||points.length<=6&&points.reduce((n,p)=>n+p.text.length,0)<=700)return{visible:points,more:[]};
 const selected=new Set();if(points.length)selected.add(0);
 points.forEach((point,i)=>{if(point.caution)selected.add(i);});
 // Show at least one distinct viewpoint from every source, even on a long card.
 sources.forEach((_,sourceIndex)=>{
  const i=points.findIndex(p=>p.sourceIndexes.length===1&&p.sourceIndexes[0]===sourceIndex);
  if(i>=0)selected.add(i);
 });
 let length=[...selected].reduce((n,i)=>n+points[i].text.length,0);
 points.forEach((point,i)=>{if(!selected.has(i)&&selected.size<5&&length+point.text.length<=700){selected.add(i);length+=point.text.length;}});
 return{visible:points.filter((_,i)=>selected.has(i)),more:points.filter((_,i)=>!selected.has(i))};
}
function unionReasons(old,next){const result=clone(old||[]);for(const reason of next){const prior=result.find(r=>r.label===reason.label&&r.text===reason.text);if(prior)Object.assign(prior,clone(reason));else result.push(clone(reason));}return result;}
function empty(tripId){return{version:VERSION,tripId,items:[],guides:[]};}
function safeTree(v,depth=0){if(depth>25)throw Error('攻略数据结构不正确。');if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('攻略包含不支持的字段。');safeTree(x,depth+1);}}
function validSource(s){
 if(!obj(s)||!/^([a-f0-9]{64})(:\d+)?$/.test(s.id||s.fingerprint||'')||typeof s.title!=='string'||s.title.length>300||typeof s.url!=='string'||shareURL(s.url)!==s.url)throw Error('攻略来源记录不正确。');
}
function validate(raw,tripId){
 safeTree(raw);
 if(!obj(raw)||raw.version!==VERSION||raw.tripId!==tripId||!Array.isArray(raw.items)||raw.items.length>MAX_ITEMS||!Array.isArray(raw.guides||[])||(raw.guides||[]).length>MAX_GUIDES)throw Error('攻略记录无法读取，原记录未改动。');
 const ids=new Set();
 for(const item of raw.items){
  if(!obj(item)||!/^((dot|sight|food|experience|shopping):[\w-]+)$/.test(item.sourceId)||ids.has(item.sourceId)||!obj(item.place)||item.place.sourceId!==item.sourceId||typeof item.place.name!=='string'||!item.place.name.trim()||item.place.name.length>180||typeof item.city!=='string'||!item.city||typeof item.place.cityId!=='string'||!item.place.cityId||![null,'must','wish','maybe','skip'].includes(item.choice)||typeof item.linked!=='boolean'||!Array.isArray(item.sources)||item.sources.length>100)throw Error('攻略地点记录不正确。');
  ids.add(item.sourceId);
  for(const s of item.sources){validSource(s);if(!Array.isArray(s.reasons)||s.reasons.length>100||s.reasons.some(r=>!obj(r)||typeof r.text!=='string'||r.text.length>100000||typeof r.label!=='string'||r.label.length>80)||(s.recommendationPercentage!==null&&(!Number.isFinite(s.recommendationPercentage)||s.recommendationPercentage<0||s.recommendationPercentage>100)))throw Error('推荐理由格式不正确。');}
 }
 const gids=new Set();
 for(const g of raw.guides||[]){validSource(g);if(gids.has(g.id)||typeof g.text!=='string'||g.text.length>100000||!Array.isArray(g.images)||g.images.length>24||g.images.some(i=>!obj(i)||typeof i.data!=='string'||i.data.length>42000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(i.data)||(i.ocrText!==undefined&&(typeof i.ocrText!=='string'||i.ocrText.length>100000))))throw Error('攻略原文或图片格式不正确。');if(g.previousTexts&&(!Array.isArray(g.previousTexts)||g.previousTexts.length>30||g.previousTexts.some(t=>typeof t!=='string'||t.length>100000)))throw Error('攻略历史原文格式不正确。');gids.add(g.id);}
 for(const item of raw.items)for(const source of item.sources){const guide=(raw.guides||[]).find(g=>g.id===(source.guideId||source.id.split(':')[0]));if(source.imageIndices&&(!Array.isArray(source.imageIndices)||source.imageIndices.some(i=>!Number.isInteger(i)||i<0||!guide||i>=guide.images.length)))throw Error('地点图片关联不正确。');}
 return raw;
}
function names(p){return[p.name,p.card_name,...(p.aliases||[])].map(normalizeName).filter(Boolean);}
function matches(p,cityId,rows){const keys=new Set(names(p));return rows.filter(r=>r.place.cityId===cityId&&names(r.place).some(n=>keys.has(n)));}
function mergeCatalog(base,state){
 const rows=base.map(clone),byId=new Map(rows.map(r=>[r.place.sourceId,r]));
 for(const item of state.items){let row=byId.get(item.sourceId);if(!row){row={place:clone(item.place),city:item.city,choice:item.choice};rows.push(row);byId.set(item.sourceId,row);}else if(item.decisionAt||item.choice==='maybe')row.choice=item.choice;
  if(item.editedAt||item.cityRepair){Object.assign(row.place,{name:item.place.name,cityId:item.place.cityId,kind:item.place.kind});row.city=item.city;}
  // Retain public-source snapshots for selected places even when offline. Fresh
  // reports, when available, take precedence; this adds no new storage envelope.
  if(!row.place.publicEvidence?.length&&item.place.publicEvidence?.length)row.place.publicEvidence=clone(item.place.publicEvidence);
  if(!row.place.publicPhotos?.length&&item.place.publicPhotos?.length)row.place.publicPhotos=clone(item.place.publicPhotos);
  row.place.dotSources=clone(item.sources);row.place.aliases=[...new Set([...(row.place.aliases||[]),...(item.place.aliases||[])])];
 }
 return rows;
}
function validateResult(result){
 if(!obj(result)||!obj(result.source)||!Array.isArray(result.places)||result.places.length>100)throw Error('解析结果格式不正确。');
 validSource({...result.source,id:result.source.fingerprint,url:shareURL(result.source.url)});
 if(!Array.isArray(result.source.images)||result.source.images.length>24)throw Error('攻略图片数量超出上限。');
 const ranks=new Set();for(const p of result.places){if(!obj(p)||!Number.isInteger(p.rank)||p.rank<1||ranks.has(p.rank)||typeof p.name!=='string'||!p.name.trim()||p.name.length>180||!Array.isArray(p.reasons)||p.reasons.length>100)throw Error('地点识别结果需要核对。');if(p.kind&&!['sight','food','experience','shopping'].includes(p.kind))throw Error('地点分类不正确。');if(p.image_indices&&(!Array.isArray(p.image_indices)||p.image_indices.some(i=>!Number.isInteger(i)||i<0||i>=result.source.images.length)))throw Error('地点图片关联不正确。');ranks.add(p.rank);}return result;
}
const guideOf=source=>source.guideId||source.id.split(':')[0];
function guidePlaces(state,id){return state.items.filter(item=>item.sources.some(source=>guideOf(source)===id));}
function removeGuide(state,id){
 validate(state,state.tripId);const guide=(state.guides||[]).find(g=>g.id===id);
 if(!guide)throw Error('这篇攻略已移除。');
 const receipt={tripId:state.tripId,guide:clone(guide),items:clone(guidePlaces(state,id))},next=clone(state);
 next.guides=next.guides.filter(g=>g.id!==id);
 // Keep place identities: choices, manual corrections and planner references belong to the user.
 for(const item of next.items)item.sources=item.sources.filter(source=>guideOf(source)!==id);
 validate(next,state.tripId);return{state:next,receipt};
}
function restoreGuide(state,receipt){
 validate(state,state.tripId);
 if(receipt.tripId!==state.tripId)throw Error('无法恢复其他旅行的攻略。');
 const id=receipt.guide.id;
 if((state.guides||[]).some(g=>g.id===id))throw Error('这篇攻略已经重新导入，保留当前版本。');
 const next=clone(state);next.guides||=[];next.guides.push(clone(receipt.guide));
 for(const old of receipt.items){
  let item=next.items.find(i=>i.sourceId===old.sourceId);
  if(!item){item={...clone(old),sources:[]};next.items.push(item);}
  item.sources.push(...clone(old.sources.filter(s=>guideOf(s)===id)));
 }
 return validate(next,state.tripId);
}
function importGuide(state,result,city,base,now,uid,options={}){
 validate(state,state.tripId);validateResult(result);
 state=repairCities(state,options.cities||[]);
 result=resolveCities(result,city,options.cities||[]);
 if(result.places.some(p=>!p.city?.id||!text(p.city.name,80)))throw Error('部分地点的城市尚未确认，请在“修正地点”中补充。');
 const next=clone(state);next.guides||=[];
 const s=result.source,id=s.fingerprint,counts={added:0,merged:0,unchanged:0};
 const existingGuide=next.guides.find(g=>g.id===id),images=clone(existingGuide?.images||[]),imageMap=[];
 const replacing=Boolean(options.replaceGuideId),touched=new Set(),processed=new Set();
 if(replacing&&(options.replaceGuideId!==id||!existingGuide))throw Error('原攻略已移除，本次重新解析未保存。');
 if(replacing&&(options.expectedRevision!==undefined&&options.expectedRevision!==(existingGuide.revision||0)||options.expectedImportedAt!==undefined&&options.expectedImportedAt!==existingGuide.importedAt))throw Error('这篇攻略已更新，请重新解析，避免覆盖较新的内容。');
 (s.images||[]).forEach(image=>{let index=images.findIndex(x=>image.assetId?x.assetId===image.assetId:image.sha256?x.sha256===image.sha256:x.data===image.data);if(index<0){if(images.length>=24)throw Error('攻略图片数量超出上限。');index=images.length;images.push(clone(image));}else images[index]={...images[index],...clone(image)};imageMap.push(index);});
 const guide={id,title:text(s.title||'导入攻略',300),url:shareURL(s.url),kind:s.kind||'note',method:s.method||'manual',text:text(s.text,100000),images,importedAt:existingGuide?.importedAt||now,revision:(existingGuide?.revision||0)+1,warnings:(result.warnings||[]).map(v=>text(v,300))};
 if(existingGuide){guide.previousTexts=clone(existingGuide.previousTexts||[]);if(existingGuide.text&&existingGuide.text!==guide.text&&!guide.previousTexts.includes(existingGuide.text))guide.previousTexts.push(existingGuide.text);if(!guide.text)guide.text=existingGuide.text;Object.assign(existingGuide,guide);}else next.guides.push(guide);
 for(const p of result.places){
  const corrected=next.items.filter(i=>(i.editedAt||i.cityManual)&&i.sources.some(x=>(x.guideId||x.id.split(':')[0])===id)&&names(i.place).some(n=>names(p).includes(n)));
  const belongs=corrected.length===1?{id:corrected[0].place.cityId,name:corrected[0].city}:p.city?.id&&p.city?.name?p.city:city,rows=mergeCatalog(base,next);
  let found=matches(p,belongs.id,rows);
  // A corrected legacy import can now match a system catalogue entry. Keep its
  // established identity rather than breaking existing daily-plan references.
  const sameGuide=found.filter(row=>next.items.some(i=>i.sourceId===row.place.sourceId&&i.sources.some(s=>guideOf(s)===id)));
  if(sameGuide.length===1)found=sameGuide;
  // A previously imported place may have acquired a matching handbook entry.
  // Reuse its identity for new sources only when all names agree exactly and
  // there is no conflicting POI. Ambiguous aliases/branches still need correction.
  if(found.length>1&&found.every(r=>normalizeName(r.place.name)===normalizeName(p.name))&&new Set(found.map(r=>r.place.poiId).filter(Boolean)).size<=1){
   const owned=found.filter(r=>next.items.some(i=>i.sourceId===r.place.sourceId));
   if(owned.length===1)found=owned;
  }
  if(found.length>1)throw Error('“'+p.name+'”匹配到多个地点，请补全门店名后再导入。');
  const prior=found[0],sourceId=prior?.place.sourceId||'dot:'+uid();
  let item=next.items.find(i=>i.sourceId===sourceId);
  if(!item){const place=prior?clone(prior.place):{sourceId,name:text(p.name,180),kind:p.kind||'manual',cityId:belongs.id,address:text(p.address,300),lat:null,lng:null,openingNote:'',locationPending:true};delete place.dotSources;
   item={sourceId,linked:!!prior&&!sourceId.startsWith('dot:'),choice:['must','wish','maybe','skip'].includes(prior?.choice)?prior.choice:null,city:belongs.name,place,sources:[]};next.items.push(item);}
  item.place.aliases=[...new Set([...(item.place.aliases||[]),p.name,p.card_name,...(p.aliases||[])].filter(Boolean).map(v=>text(v,180)))];
  if(p.city_manual)item.cityManual=true;
  if(!item.linked&&!item.editedAt&&p.classification_manual&&p.kind){item.place.kind=p.kind;item.editedAt=now;}
  const existingSource=item.sources.find(x=>(x.guideId||x.id.split(':')[0])===id),sid=existingSource?.id||id+':'+p.rank;
  touched.add(sourceId);
  const percentage=p.recommendation_percentage;
  const source={id:sid,guideId:id,title:text(s.title||'导入攻略',300),url:shareURL(s.url),rank:p.rank,importedAt:existingSource?.importedAt||now,imageIndices:(p.image_indices||[]).map(i=>imageMap[i]),recommendationPercentage:Number.isFinite(percentage)?percentage:null,percentageDenominator:null,reasons:p.reasons.map(r=>({...clone(r),label:text(r.label,80),text:String(r.text??''),evidenceBoxes:clone(r.evidence_boxes||r.evidenceBoxes||[])})),evidence:clone(p.evidence||{}),extractionMethod:s.method||'manual',unconfirmed:(p.unconfirmed||[]).map(v=>text(v,300))};
  if(existingSource){if(!replacing||processed.has(sourceId)){source.reasons=unionReasons(existingSource.reasons,source.reasons);source.imageIndices=[...new Set([...(existingSource.imageIndices||[]),...source.imageIndices])];if(source.recommendationPercentage===null)source.recommendationPercentage=existingSource.recommendationPercentage;}const unchanged=JSON.stringify(existingSource)===JSON.stringify(source);Object.assign(existingSource,source);counts[unchanged?'unchanged':'merged']++;}
  else{item.sources.push(source);if(prior)counts.merged++;else counts.added++;}
  processed.add(sourceId);
 }
 // A reparse replaces only this guide's extraction, including obsolete place associations.
 if(replacing)for(const item of next.items)if(!touched.has(item.sourceId))item.sources=item.sources.filter(source=>guideOf(source)!==id);
 const classified=reclassify(next);validate(classified,state.tripId);return{state:classified,counts};
}
function decide(state,row,value,now){
 if(![null,'must','wish','maybe','skip'].includes(value))throw Error('选择状态不正确。');
 const next=clone(state);let item=next.items.find(i=>i.sourceId===row.place.sourceId);
 if(!item){const place=clone(row.place);delete place.dotSources;item={sourceId:place.sourceId,linked:!place.sourceId.startsWith('dot:'),place,city:row.city,choice:null,sources:[]};next.items.push(item);}
 item.choice=value==='wish'&&row.choice==='must'?'must':value;item.decisionAt=now;
 validate(next,state.tripId);return next;
}
function addMapPlace(state,place,base,now,uid){
 validate(state,state.tripId);
 if(!place||!text(place.name,180)||!text(place.city,80)||!text(place.cityId,80)||!Number.isFinite(place.lat)||Math.abs(place.lat)>90||!Number.isFinite(place.lng)||Math.abs(place.lng)>180||!['WGS84','GCJ02'].includes(place.coordinateSystem)||!place.poiId||!place.coordinateEvidence?.confirmedAt)throw Error('请先选择并确认地点位置。');
 const rows=mergeCatalog(base,state),found=rows.filter(r=>r.place.cityId===place.cityId&&(r.place.poiId&&r.place.poiId===place.poiId||(!r.place.poiId||r.place.poiId===place.poiId)&&names(r.place).some(n=>names(place).includes(n))));
 if(found.length>1)throw Error('存在多个同名地点，请从已有地点中选择并修改位置。');
 if(found.length){const row=found[0];return {state:decide(state,row,'wish',now),result:{sourceId:row.place.sourceId,existing:true}};}
 const next=clone(state),sourceId='dot:'+uid();
 const saved={...clone(place),sourceId,name:text(place.name,180),kind:['sight','food','experience','shopping'].includes(place.kind)?place.kind:'manual'};
 delete saved.dotSources;
 next.items.push({sourceId,linked:false,choice:'wish',city:text(place.city,80),place:saved,sources:[],decisionAt:now,editedAt:now});
 validate(next,state.tripId);return {state:next,result:{sourceId,existing:false}};
}
function editPlace(state,row,patch,base,now){
 const name=text(patch.name,180),city=text(patch.city,80),cityId=text(patch.cityId,80),kind=patch.kind;
 if(!name||!city||!cityId||!['sight','food','experience','shopping'].includes(kind))throw Error('请补全名称、城市和分类。');
 const catalog=mergeCatalog(base,state),current=catalog.find(r=>r.place.sourceId===row.place.sourceId)||row;
 const identityChanged=cityId!==current.place.cityId||normalizeName(name)!==normalizeName(current.place.name);
 // A legacy import may share its name with a system recommendation. Confirming
 // its category creates no new duplicate and must preserve its planner identity.
 if(identityChanged&&matches({name},cityId,catalog).some(r=>r.place.sourceId!==row.place.sourceId))throw Error('这个城市已有同名地点，请核对门店名称，避免重复。');
 const next=clone(state);let item=next.items.find(i=>i.sourceId===row.place.sourceId);
 if(!item){const place=clone(row.place);delete place.dotSources;item={sourceId:place.sourceId,linked:!place.sourceId.startsWith('dot:'),place,city:row.city,choice:['wish','must','maybe','skip'].includes(row.choice)?row.choice:null,sources:[]};next.items.push(item);}
 item.place.aliases=[...new Set([...(item.place.aliases||[]),item.place.name])];
 Object.assign(item.place,{name,cityId,kind});item.city=city;item.editedAt=now;
 validate(next,state.tripId);return next;
}
const api={VERSION,empty,validate,validateResult,shareURL,links,extractText,inferKind,suggestPlaceKind,reclassify,resolveCities,repairCities,imageForPlace,choosePlacePhoto,mergePhotos,recommendationView,normalizeName,wanted,matches,mergeCatalog,guidePlaces,removeGuide,restoreGuide,importGuide,decide,editPlace,addMapPlace};global.DotImportCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
