/* Read-only presentation and small, evidence-based rules. Never rewrites saved IDs. */
(function(global){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
const normal=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s·•・，,。()（）\-—]/g,'').replace(/景区$/,'');
const wanted=value=>value==='wish'||value==='must';
const slots=['morning','afternoon','evening'];
const slotNames={morning:'上午',afternoon:'下午',evening:'晚上'};
const keys=p=>[p.name,...(p.aliases||[])].map(normal).filter(Boolean);
// A small evidence layer over existing catalogue IDs, not a new ranking database.
// Each statement was checked against the linked article on checkedAt. Reports do
// not establish today's opening hours, stock, prices or availability of a course.
const reviewed=[
 {ids:['experience:manzhang-crafts','shopping:place-manzhang'],city:'banna',name:'曼掌村',aliases:['曼掌村 · 傣锦与慢轮傣陶','勐养曼掌村 · 手作工坊'],kinds:['experience','shopping'],
  title:'人民日报 · 曼掌村手工艺',url:'https://society.yunnan.cn/system/2025/05/20/033485319.shtml',publishedAt:'2025-05-20',
  reasons:[{label:'手工艺探访',text:'村中保留傣族吊脚楼，可看傣锦制作，了解竹藤器具、象脚鼓等民族手工艺。'}]},
 {ids:['experience:puer-coffee'],city:'puer',name:'小凹子咖啡庄园',aliases:['小凹子 · 产地咖啡'],kinds:['experience'],
  title:'云南网 · 小凹子咖啡体验',url:'https://m.yunnan.cn/system/2025/10/22/033695391.shtml',publishedAt:'2025-10-22',
  reasons:[{label:'产地咖啡',text:'在种植园了解咖啡生长与加工，在咖啡师指导下体验烘焙和手冲。'},{label:'位置',text:'位于思茅区南屏镇南岛河村。'}]},
 {ids:['experience:mengyuan-rainforest'],city:'banna',name:'勐远仙境',aliases:['勐远仙境 · 向导带领的雨林徒步'],kinds:['experience'],
  title:'云南省林草局 · 雨林研学',url:'https://lcj.yn.gov.cn/html/2026/mainnews_0303/76207.html',publishedAt:'2026-03-03',
  reasons:[{label:'雨林研学',text:'以雨林穿越、溶洞探险和傣语课堂等体验组织自然研学，侧重雨林生态与当地文化。'}]},
 {ids:['shopping:place-pubo'],city:'puer',name:'普博文创居',aliases:[],kinds:['shopping'],
  title:'普洱日报 · 普博文创居',url:'https://www.puerw.cn/content/202603/04/c477776.html',publishedAt:'2026-03-04',
  reasons:[{label:'文创与盖章',text:'天民街的文创店，集合本地茶咖、手工织物和“普洱印记”系列，可盖印留念。'},{label:'注意',text:'报道中的部分非遗体验仍在逐步引入，具体项目需向门店确认。'}]},
 {ids:['shopping:place-puer-oldstreet'],city:'puer',name:'思茅老街',aliases:['思茅老街 · 茶咖与文创'],kinds:['shopping','experience'],
  title:'普洱日报 · 老街茶咖图书角',url:'https://www.puerw.cn/content/202606/03/c493796.html',publishedAt:'2026-06-03',
  reasons:[{label:'茶咖与阅读',text:'老街多家茶咖店设有一米茶咖图书角，可边品茶咖边了解当地文化；图书角也陈列城市主题文创。'}]},
 {ids:['shopping:place-lazy'],city:'banna',name:'lazy lazy 不忙集合店',aliases:['三曼村 · lazy lazy 不忙集合店','不忙集合店'],kinds:['shopping'],
  title:'中国网报道 · 不忙集合店',url:'https://news.sina.cn/znl/2026-07-27/detail-inikfsve9829529.d.html',publishedAt:'2026-07-27',
  reasons:[{label:'本地手作',text:'位于勐罕镇三曼村，售卖与本土手艺人合作的傣锦饰品、日常用品和傣纸包装咖啡礼盒。'},{label:'注意',text:'报道时以文创零售和非遗展示为主，织造、造纸、铜锻课程属于后续计划，不能视为已开放体验。'}]}
];
function enrich(row){
 if(row.place.publicEvidence?.length)row={...row,systemEvidence:uniqueSources([...(row.systemEvidence||[]),...row.place.publicEvidence])};
 const entry=reviewed.find(e=>e.ids.includes(row.place.sourceId)&&e.city===row.place.cityId&&[e.name,...e.aliases].map(normal).includes(normal(row.place.name)));
 if(!entry)return row;
 const source={id:'system:'+entry.ids[0],type:'system',title:entry.title,url:entry.url,publishedAt:entry.publishedAt,checkedAt:'2026-10-19',kinds:entry.kinds,reasons:entry.reasons};
 return{...row,place:{...row.place,aliases:[...new Set([...(row.place.aliases||[]),entry.name,...entry.aliases])]},systemEvidence:uniqueSources([...(row.systemEvidence||[]),source]),displayName:entry.name};
}
// Public candidates use the existing place snapshot; choices and planner IDs remain
// owned by the user. No storage writes happen merely because a report was fetched.
function withDiscoveredRows(base,candidates){
 const rows=clone(base);
 for(const candidate of candidates){
  if(!candidate?.place?.name||!candidate.place.publicEvidence?.some(s=>s.checkedAt&&sourceLink(s.url,s.title)&&s.reasons?.length))continue;
  const matches=rows.filter(r=>samePlace(r.place,candidate.place));
  if(matches.length===1){const p=matches[0].place;p.publicEvidence=uniqueSources([...(p.publicEvidence||[]),...candidate.place.publicEvidence]);p.publicPhotos=[...(p.publicPhotos||[]),...(candidate.place.publicPhotos||[])].filter((p,i,a)=>a.findIndex(x=>x.url===p.url)===i);}
  else if(!rows.some(r=>r.place.sourceId===candidate.place.sourceId))rows.push(clone(candidate));
 }
 return rows;
}
function discoveryCandidates(result){
 if(!['ready','partial'].includes(result?.status)||!Array.isArray(result.places))return [];
 return result.places.filter(p=>p.cityId===result.cityId&&/^sight:public-[a-f0-9]{20}$/.test(p.sourceId)&&typeof p.name==='string'&&p.name.length<=60&&p.evidence?.discoveryTopic===result.topic&&p.evidence?.checkedAt&&sourceLink(p.evidence.url,p.evidence.title)).map(p=>({city:p.city,choice:null,place:{sourceId:p.sourceId,name:p.name,cityId:p.cityId,kind:p.kind,locationPending:true,publicEvidence:[clone(p.evidence)],publicPhotos:(p.photos||[]).filter(photo=>/^https:\/\//.test(photo.url)&&photo.sourceURL===p.evidence.url)}}));
}
// Presentation follows the actual publisher URL, never the acquisition method.
function sourceIdentity(source){
 let u;try{u=new URL(source.url);}catch(_){return{key:'reference',label:'原始资料',platform:false};}
 const host=u.hostname.toLowerCase(),is=domain=>host===domain||host.endsWith('.'+domain);
 if(is('xiaohongshu.com')||is('xhslink.com'))return u.pathname==='/s/dot'?{key:'dot',label:'点点攻略',platform:true}:{key:'xhs',label:'小红书笔记',platform:true};
 if(is('trip.com'))return{key:'trip',label:'Trip',platform:true};
 if(is('dianping.com'))return{key:'dianping',label:'大众点评',platform:true};
 if(is('ctrip.com'))return{key:'ctrip',label:'携程',platform:true};
 const publisher=is('yunnan.cn')?'云南网':is('thepaper.cn')?'澎湃':is('puerw.cn')?'普洱日报':source.type==='official'?'官网':String(source.title||'原始资料').split(/[·｜|]/)[0].trim();
 return{key:'reference',label:publisher==='系统补充'||publisher==='系统推荐'?'原始资料':publisher,platform:false};
}
function recommendationSources(row){
 const imported=row.place.dotSources||[],evidence=(row.systemEvidence||[]).filter(s=>['system','platform'].includes(s.type)&&s.checkedAt&&sourceLink(s.url,s.title)&&s.reasons?.length);
 const platforms=evidence.filter(s=>sourceIdentity(s).platform);
 // Keep historical evidence in the snapshot. Once platform content is available,
 // use it for the recommendation instead of repeating old news about the place.
 return uniqueSources([...imported,...(platforms.length?platforms:evidence)]);
}
function matchesKind(row,kind){return kind==='all'||row.place.kind===kind;}
function discoveryRows(rows,state={items:[]},assignments=[],cities=[],revealedId=''){
 const saved=new Set((state.items||[]).filter(i=>i.sources?.length||i.choice||i.editedAt).map(i=>i.sourceId));
 const assigned=new Set(assignments.filter(a=>a.active!==false).map(a=>a.place?.sourceId));
 return rows.filter(row=>{
  const ids=row.memberIds||[row.place.sourceId];
  const personal=ids.some(id=>saved.has(id)||assigned.has(id)||id===revealedId)||Boolean(row.place.dotSources?.length)||['wish','must','maybe','skip'].includes(row.choice);
  const supplement=cities.includes(row.place.cityId)&&recommendationSources(row).some(s=>sourceIdentity(s).platform&&s.kinds?.some(k=>k==='sight'||k==='experience'||k==='shopping'));
  return personal||supplement;
 }).sort((a,b)=>Number(Boolean(b.place.dotSources?.length))-Number(Boolean(a.place.dotSources?.length)));
}
function samePlace(a,b){
 if(!a.cityId||a.cityId!==b.cityId)return false;
 if(a.poiId&&b.poiId)return a.poiId===b.poiId;
 return keys(a).some(key=>keys(b).includes(key));
}
function uniqueSources(sources){
 const result=[];
 for(const source of sources){
  const existing=result.find(s=>(s.guideId||s.id||s.url)===(source.guideId||source.id||source.url));
  if(!existing){result.push(clone(source));continue;}
  for(const reason of source.reasons||[])if(!(existing.reasons||[]).some(r=>r.label===reason.label&&r.text===reason.text))(existing.reasons||=[]).push(clone(reason));
  existing.imageIndices=[...new Set([...(existing.imageIndices||[]),...(source.imageIndices||[])])];
 }
 return result;
}
function mergeRows(rows,state={items:[]},assignments=[]){
 const saved=new Map((state.items||[]).map(i=>[i.sourceId,i]));
 const assigned=new Set(assignments.filter(a=>a.active!==false).map(a=>a.place?.sourceId));
 const groups=[];
 for(const row of rows){
  // Require pairwise agreement, so a broad alias cannot join two different branches.
  const matches=groups.filter(g=>g.every(r=>samePlace(row.place,r.place)));
  if(matches.length===1)matches[0].push(row);else groups.push([row]);
 }
 return groups.map(group=>{
  const ranked=group.slice().sort((a,b)=>{
   const sa=saved.get(a.place.sourceId),sb=saved.get(b.place.sourceId);
   return String(sb?.decisionAt||'').localeCompare(String(sa?.decisionAt||''))||
    Number(Boolean(sb?.editedAt))-Number(Boolean(sa?.editedAt))||
    Number(wanted(b.choice)||b.choice==='skip')-Number(wanted(a.choice)||a.choice==='skip')||
    Number(assigned.has(b.place.sourceId))-Number(assigned.has(a.place.sourceId))||
    Number(Boolean(b.place.dotSources?.length))-Number(Boolean(a.place.dotSources?.length));
  });
  const row=clone(ranked[0]);row.memberIds=group.map(r=>r.place.sourceId);
  row.place.dotSources=uniqueSources(ranked.flatMap(r=>r.place.dotSources||[]));
  row.systemSources=uniqueSources(group.flatMap(r=>r.systemSources||[]));
  row.systemEvidence=uniqueSources(group.flatMap(r=>r.systemEvidence||[]));
  row.place.publicPhotos=group.flatMap(r=>r.place.publicPhotos||[]).filter((p,i,a)=>a.findIndex(x=>x.url===p.url)===i);
  // Browsing has one primary category. Evidence can describe other activities
  // without putting the same place in several category tabs.
  const explicit=ranked.find(r=>saved.get(r.place.sourceId)?.editedAt)||ranked.find(r=>r.place.dotSources?.length);
  if(explicit)row.place.kind=explicit.place.kind;
  row.kinds=[row.place.kind];
  row.displayName=row.place.dotSources.length||saved.get(row.place.sourceId)?.editedAt?row.place.name:(ranked.find(r=>r.displayName)?.displayName||row.place.name);
  row.place.aliases=[...new Set(group.flatMap(r=>[r.place.name,...(r.place.aliases||[])]))];
  return row;
 });
}
function trustedLocation(place){
 const e=place?.coordinateEvidence;
 return Boolean(place&&Number.isFinite(place.lat)&&Number.isFinite(place.lng)&&Math.abs(place.lat)<=90&&Math.abs(place.lng)<=180&&
  place.coordinateSystem==='WGS84'&&place.geoSource==='OpenStreetMap / Photon'&&/^osm:[NWRnwr]:\d+$/.test(place.poiId||'')&&
  e?.confirmedAt&&e.poiId===place.poiId&&e.lat===place.lat&&e.lng===place.lng&&!place.locationPending);
}
function distance(a,b){
 const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
}
function suggest({rows,day,points=[],assignments=[],slot}){
 if(!day)return{items:[],emptySlots:[],slot:null,reason:'no-day'};
 const occupied=new Set(points.filter(p=>!p.edge).map(p=>p.slot));
 const emptySlots=slots.filter(s=>!occupied.has(s));
 const chosen=slots.includes(slot)?slot:emptySlots[0]||slots[0];
 if(occupied.has(chosen))return{items:[],emptySlots,slot:chosen,reason:'occupied'};
 const cities=new Set([day.cityId,...(day.locationIds||[])].filter(Boolean));
 const assigned=assignments.filter(a=>a.active!==false);
 const anchors=points.filter(p=>p.type!=='note'&&trustedLocation(p.place)&&cities.has(p.place.cityId));
 const items=[];
 for(const row of rows){
  const ids=row.memberIds||[row.place.sourceId];
  if(!cities.has(row.place.cityId)||row.choice==='skip'||assigned.some(a=>ids.includes(a.place?.sourceId)||a.place&&samePlace(row.place,a.place)))continue;
  const ownSources=row.place.dotSources||[];
  if(!wanted(row.choice)&&!ownSources.length&&!row.systemSources?.length)continue;
  const nearest=trustedLocation(row.place)?anchors.filter(a=>!samePlace(row.place,a.place)).map(a=>({anchor:a.place,meters:distance(row.place,a.place)})).filter(a=>a.meters<=1000).sort((a,b)=>a.meters-b.meters)[0]:null;
  if(!wanted(row.choice)&&!nearest)continue;
  const reasons=[];
  if(wanted(row.choice))reasons.push('你想去的地点，尚未安排；'+slotNames[chosen]+'尚未安排');
  if(nearest)reasons.push('距当天的「'+nearest.anchor.name+'」直线约 '+Math.max(10,Math.round(nearest.meters/10)*10)+' 米');
  items.push({row,reasons,meters:nearest?.meters??null,anchor:nearest?.anchor||null,priority:wanted(row.choice)?0:ownSources.length?1:2});
 }
 items.sort((a,b)=>a.priority-b.priority||(a.meters??Infinity)-(b.meters??Infinity));
 return{items:items.slice(0,3),emptySlots,slot:chosen,reason:items.length?'ready':'no-evidence'};
}
// Search/navigation links and image credits are not evidence for a recommendation.
function sourceLink(url,label){
 try{const u=new URL(url);if(!/^https?:$/.test(u.protocol)||u.username||u.password||!label||/地图|导航|搜实拍|补看|^图片来源|口碑/.test(label)||/google\.|amap\.com$|apple\.com$/.test(u.hostname)||/search|Special:FilePath/.test(u.pathname))return null;
  if(u.hostname.endsWith('xiaohongshu.com')){for(const k of [...u.searchParams.keys()])if(!['dot_share_id','file_id','xsec_token','xsec_source'].includes(k))u.searchParams.delete(k);}
  return{url:u.href,title:String(label).replace(/↗/g,'').trim(),type:'handbook'};
 }catch(_){return null;}
}
 const api={sourceIdentity,enrich,recommendationSources,matchesKind,discoveryRows,mergeRows,samePlace,trustedLocation,suggest,sourceLink,slots,slotNames,withDiscoveredRows,discoveryCandidates};
global.GuideSupplements=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
