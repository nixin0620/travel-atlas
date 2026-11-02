/* New entry into the guide; retained catalogue, Picks, editor and storage are reused. */
(function(){
'use strict';
function init(){
 const hub=document.getElementById('destinations'),D=window.DotImports,C=window.DotImportCore,T=window.TripData,S=window.GuideSupplements,Compare=window.GuideComparison;
 if(!hub||!D||!window.DailyPlanner)return;
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=(name)=>{const shapes={link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',pin:'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM12 7v6M9 10h6',heart:'M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z',clock:'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',minus:'M5 12h14',plus:'M12 5v14M5 12h14',chevron:'m6 9 6 6 6-6',book:'M4 3h7l1 2 1-2h7v17h-7l-1 1-1-1H4ZM12 5v16',calendar:'M4 5h16v16H4ZM4 10h16M8 2v6M16 2v6',map:'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'};return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${shapes[name]||shapes.pin}"/></svg>`;};
 const expandedSources=new Set();
 let supplementOpen=false,supplementDay='',supplementSlot='',supplementRows=[];
 let comparisonGroups=[],comparisonKey='',comparisonScope='',revealedId='';
 const comparisonSelections=new Map(),factCache=new Map();
 let comparisonRefresh=null;
 let viewMode='list',category='',filter='all',cityFilter='',query='',busy=false,staged=[],sourceOpen=false,sourceId='',undo=null,reviewEditor='';
 let searchTimer=0,searchMatchCategory=false;
 const listBatchSize=4;let listLimit=listBatchSize,listScope='';
 const root=document.createElement('div');root.id='place-first-guide';root.className='pg-main shell';
 root.innerHTML=`<header class="pg-page-head"><div><h2>目的地指南</h2></div><div class="pg-toolbar-start"><button type="button" class="pg-button pg-primary" data-pg-action="import-toggle" aria-expanded="true" aria-controls="pg-import-inputs">${icon('minus')}收起导入</button><button type="button" class="pg-link" data-pg-action="sources" aria-controls="pg-original">已导入 0 篇</button></div></header>
 <div class="pg-citybar"><nav class="pg-city-tabs" aria-label="选择城市"></nav><div class="pg-utility"><select id="pg-status-filter" aria-label="按地点判断筛选"></select><button type="button" class="pg-search-toggle pg-link" data-pg-action="search-toggle" aria-label="搜索地点" aria-expanded="false" aria-controls="pg-search-field">${icon('search')}</button></div></div>
 <div id="pg-search-field" class="pg-search-field" hidden><label class="pg-search">${icon('search')}<input id="pg-search" type="search" aria-label="输入地点名称" placeholder="查找具体地点名称"></label><button type="button" class="pg-link" data-pg-action="search-toggle" aria-label="关闭搜索">关闭</button></div>
 <div class="pg-navigation" aria-label="目的地指南导航"><nav class="pg-categories" aria-label="地点分类"></nav><nav class="pg-filters" tabindex="-1" aria-label="发现地点或我的想去"></nav></div>
 <section class="pg-import" aria-label="导入攻略"><div id="pg-import-inputs"><form id="pg-import-form"><label class="pg-url">${icon('link')}<textarea id="pg-url" rows="2" spellcheck="false" autocomplete="off" aria-label="点点或小红书分享文字" placeholder="粘贴点点或小红书链接 / 分享文字（可多条）"></textarea></label><button type="submit" class="pg-button pg-primary">${icon('plus')}导入攻略</button></form><div class="pg-import-meta"><button type="button" class="pg-link" data-pg-action="manual-toggle">粘贴正文</button><label>补充城市<input id="pg-import-city" list="pg-cities" maxlength="40" placeholder="自动识别，未识别时填写" aria-label="导入地点所在城市"><datalist id="pg-cities"></datalist></label></div><p id="pg-service" hidden></p><section class="pg-manual" hidden><input id="pg-manual-title" maxlength="120" placeholder="攻略标题（选填）" aria-label="攻略标题"><textarea id="pg-manual-text" rows="5" maxlength="50000" placeholder="粘贴你复制的攻略正文" aria-label="攻略正文"></textarea><button type="button" class="pg-button" data-pg-action="manual">识别地点</button></section></div><div id="pg-import-progress" role="status" aria-live="polite"></div><div id="pg-review" hidden></div></section>
 <div class="pg-message" role="status" aria-live="polite" hidden></div><div id="pg-original" hidden></div><div class="pg-grid"></div>`;
 hub.append(root);const $=s=>root.querySelector(s);
 const contentNav=document.createElement('nav');contentNav.className='pg-content-views';contentNav.setAttribute('aria-label','地点展示方式');
 contentNav.innerHTML='<button type="button" data-pg-view="list" aria-pressed="true" aria-controls="pg-place-list">地点列表</button><button type="button" data-pg-view="compare" aria-pressed="false" aria-controls="pg-comparison">同类对比</button>';
 const comparison=document.createElement('section');comparison.id='pg-comparison';comparison.className='pg-comparison';comparison.hidden=true;comparison.setAttribute('aria-label','同类对比');
 comparison.innerHTML='<div class="pg-comparison-body"></div>';
 $('.pg-grid').id='pg-place-list';$('.pg-grid').before(contentNav,comparison);
 const listMore=document.createElement('div');listMore.className='pg-list-more';listMore.hidden=true;$('.pg-grid').after(listMore);
 const gapRoot=document.createElement('div');gapRoot.id='daily-gap-fill';
 const supplementPanel=document.createElement('section');supplementPanel.id='pg-supplements';supplementPanel.className='pg-supplements';supplementPanel.hidden=true;supplementPanel.setAttribute('aria-label','填补空档');gapRoot.append(supplementPanel);document.getElementById('dp-sheet')?.before(gapRoot);
 const gapButton=document.createElement('button');gapButton.type='button';gapButton.className='dp-button';gapButton.textContent='填补空档';gapButton.setAttribute('aria-expanded','false');gapButton.setAttribute('aria-controls','pg-supplements');/* Daily empty states only offer adding an arrangement. */
 gapButton.addEventListener('click',()=>{supplementOpen=!supplementOpen;supplementDay=DailyPlanner.selectedDayId;supplementSlot='';renderSupplements();});
 const discoveryStatus=document.createElement('p');discoveryStatus.className='pg-discovery-status';discoveryStatus.setAttribute('role','status');discoveryStatus.hidden=true;contentNav.after(discoveryStatus);
 const discoveryCache=new Map();
 function requestDiscovery(rows){
  // Start only for a relevant city/topic, without sending dates or imported text.
  if(filter!=='all'||query||!['all','sight','experience'].includes(category)||cityFilter==='all'||location.protocol==='file:')return;
  if(!rows.some(r=>r.place.cityId===cityFilter&&/村|寨/.test(r.place.name)))return;
  const key=cityFilter+':villages';if(discoveryCache.has(key))return;
  discoveryCache.set(key,{status:'loading'});
  fetch('/api/place-discovery',{method:'POST',headers:{'Content-Type':'application/json','X-Travel-Import':'1'},credentials:'omit',signal:AbortSignal.timeout(25000),body:JSON.stringify({cityId:cityFilter,topic:'villages'})})
   .then(async r=>{if(!r.ok)throw Error();const result=await r.json();discoveryCache.set(key,result);D.registerPublicCandidates(S.discoveryCandidates(result));})
   .catch(()=>discoveryCache.set(key,{status:'unavailable'})).finally(refresh);
 }
 function renderDiscoveryStatus(){
  const status=discoveryCache.get(cityFilter+':villages');
  discoveryStatus.hidden=status?.status!=='loading'||filter!=='all'||Boolean(query);
  discoveryStatus.textContent=discoveryStatus.hidden?'':'正在读取 Trip…';
 }
 function sourceBadge(source){
  const identity=S.sourceIdentity(source),ratio=Number.isFinite(source.recommendationPercentage)?' '+source.recommendationPercentage+'%':'';
  return `<a class="pg-source-badge pg-source-${E(identity.key)}" href="${E(Compare.safeURL(source.url))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${E(source.title+(source.checkedAt?' · 查阅 '+source.checkedAt.slice(0,10):''))}" aria-label="${E(identity.label+ratio+' · '+source.title+'，打开来源')}">${E(identity.label)}${ratio?`<span>${E(ratio)}</span>`:''}<span aria-hidden="true">↗</span></a>`;
 }
 function sourceBadges(sources){
  return sources.slice(0,3).map(sourceBadge).join('')+(sources.length>3?`<details class="pg-extra-sources"><summary>+${sources.length-3}</summary><div>${sources.slice(3).map(sourceBadge).join('')}</div></details>`:'');
 }

 const back=document.createElement('button');back.className='pg-back';back.type='button';back.textContent='← 返回发现地点';back.addEventListener('click',()=>show('all',{history:true}));hub.querySelector('.dg-navigation').before(back);
 function restoreFocus(id,value){const target=[...root.querySelectorAll('[data-pg-decision]')].find(b=>b.dataset.pgDecision===id&&b.dataset.value===value)||root.querySelector('[data-pg-filter="'+(filter==='wish'?'wish':'all')+'"]');target?.focus({preventScroll:true});}
 function message(value,error=false){const box=$('.pg-message');box.hidden=!value;box.classList.toggle('is-error',error);box.innerHTML=E(value)+(undo&&!error?'<button type="button" data-pg-action="undo">撤销</button>':'');}
 function assignedFor(row){return (row.memberIds||[row.place.sourceId]).flatMap(id=>DailyPlanner.getAssignments(id));}
 function catalogue(){
  const base=DailyPlanner.catalog({allCities:true}),state=D.read(),assignments=base.flatMap(r=>DailyPlanner.getAssignments(r.place.sourceId));
  const enriched=base.map(row=>{
   const node=D.control(row.place.sourceId)?.card;
   const checkedAt=node?.textContent.match(/资料(?:查阅|核对|整理)[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1]||'';
   const systemSources=node?[...node.querySelectorAll('a[href]')].map(a=>S.sourceLink(a.href,a.textContent)).filter(Boolean).map(s=>({...s,checkedAt})):[];
   const known=assignments.find(a=>a.place?.sourceId===row.place.sourceId&&S.samePlace(row.place,a.place)&&S.trustedLocation(a.place));
   return S.enrich({...row,place:known?{...row.place,lat:known.place.lat,lng:known.place.lng,poiId:known.place.poiId,geoSource:known.place.geoSource,coordinateSystem:known.place.coordinateSystem,coordinateEvidence:known.place.coordinateEvidence,locationPending:false}:row.place,systemSources});
  });
  return S.mergeRows(enriched,state,assignments);
 }
 function allRows(base=catalogue()){
  const cities=[...new Set([...(T.snapshot?.destinations||[]).map(d=>d.id),...base.filter(r=>r.place.dotSources?.length).map(r=>r.place.cityId)])];
  return S.discoveryRows(base,D.read(),base.flatMap(r=>assignedFor(r)),cities,revealedId);
 }
 const kinds=[['all','全部'],['sight','景点'],['food','美食'],['experience','体验'],['shopping','购物']];
 const originals=images=>images.map((image,index)=>({image,index})).filter(row=>row.image.kind!=='place_thumbnail');
 const kindLabel=value=>kinds.find(k=>k[0]===value)?.[1]||(value==='manual'||!value?'分类待确认':'地点');
 function photo(row,state){
  const imported=C.imageForPlace(row.place,state),platformPhoto=factCache.get(factKey(row))?.photos?.find(p=>/^https:\/\/ak-d\.tripcdn\.com\/images\//.test(p.url)&&p.sourceURL),publicPhoto=(row.place.publicPhotos||[]).slice().sort((a,b)=>(b.width||0)-(a.width||0))[0];
  const alternatives=[platformPhoto,publicPhoto].filter(Boolean).map(p=>({...p,src:p.url,alt:row.place.name,guide:false}));
  for(const id of row.memberIds||[row.place.sourceId]){const img=D.control(id)?.card.querySelector('img:not([src*="avatar"])');if(img)alternatives.push({src:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight,alt:img.alt||row.place.name,guide:false});}
  return C.choosePlacePhoto(imported?{...imported,alt:row.place.name,guide:true}:null,alternatives);
 }
 function mapURL(row){const p=row.place;return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(Number.isFinite(p.lat)&&Number.isFinite(p.lng)?p.lat+','+p.lng:[row.city,row.displayName||p.name,p.address].filter(Boolean).join(' '));}
 function referenceHTML(row){
  if(row.systemEvidence?.length||row.place.dotSources?.length)return '';
  const own=new Set((row.place.dotSources||[]).map(s=>s.url)),sources=(row.systemSources||[]).filter(s=>!own.has(s.url));
  if(!sources.length)return '';
  const links=sources.map(s=>`<a href="${E(s.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${E(s.title)}${s.checkedAt?` <small>· ${E(s.checkedAt)}</small>`:''} ↗</a>`);
  return `<div class="pg-reference-links"><span>手册资料</span>${links.slice(0,2).join('')}${links.length>2?`<details><summary>另 ${links.length-2} 条</summary>${links.slice(2).join('')}</details>`:''}</div>`;
 }
 function renderSupplements(rows=catalogue(),state=D.read()){
  supplementPanel.hidden=!supplementOpen;gapButton.setAttribute('aria-expanded',String(supplementOpen));if(!supplementOpen)return;
  const days=T.snapshot?.days||[];
  const day=days.find(d=>d.id===supplementDay)||days.find(d=>d.id===DailyPlanner.selectedDayId)||days[0];
  if(day?.id!==supplementDay){supplementDay=day?.id||'';supplementSlot='';}
  const points=day?DailyPlan.getDay(day.id):[],assignments=DailyPlanner.catalog({allCities:true}).flatMap(r=>DailyPlanner.getAssignments(r.place.sourceId));
  const model=S.suggest({rows,day,points,assignments,slot:supplementSlot});supplementSlot=model.slot||'';supplementRows=model.items;
  const label=d=>(d.date?d.date.slice(5).replace('-','/'):'第 '+d.day+' 天')+' · '+(d.city||d.cityId);
  supplementPanel.innerHTML=`<header class="pg-supplement-head"><div><h3>填补空档</h3><p>先看看想去但还没安排的地方</p></div><button type="button" class="pg-link" data-pg-action="supplements">收起</button></header>
   ${day?`<div class="pg-supplement-context"><label>日期<select id="pg-supplement-day" aria-label="填补空档日期">${days.map(d=>`<option value="${E(d.id)}" ${d.id===day.id?'selected':''}>${E(label(d))}</option>`).join('')}</select></label><label>时段<select id="pg-supplement-slot" aria-label="填补空档时段">${S.slots.map(slot=>`<option value="${slot}" ${slot===model.slot?'selected':''}>${S.slotNames[slot]} · ${model.emptySlots.includes(slot)?'尚未安排':'已有安排'}</option>`).join('')}</select></label><button type="button" class="pg-link" data-pg-action="supplement-day">查看当天行程 ↗</button></div>`:''}
   <div class="pg-supplement-list">${model.items.map(({row,reasons},i)=>{
    const image=photo(row,state),sources=row.place.dotSources||[],wanted=C.wanted(row.choice);
    return `<article class="pg-supplement-item" aria-label="补充候选：${E(row.place.name)}">${image?`<img src="${E(image.src)}" ${image.fallback?`data-pg-fallback="${E(image.fallback)}"`:""} alt="${E(row.place.name)}" loading="lazy">`:''}<div class="pg-supplement-copy"><h4><a href="${E(mapURL(row))}" target="_blank" rel="noopener noreferrer">${E(row.place.name)} ↗</a></h4>${reasons.map(reason=>`<p>${E(reason)}</p>`).join('')}<div class="pg-source-links">${sources.slice(0,3).map(s=>`<a class="pg-source-link" href="${E(s.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${E(s.title)}${Number.isFinite(s.recommendationPercentage)?` · ${s.recommendationPercentage}%`:''} ↗</a>`).join('')}${sources.length>3?`<button type="button" class="pg-link" data-pg-supplement-view="${i}">全部 ${sources.length} 篇来源</button>`:''}</div>${referenceHTML(row)}</div><div class="pg-supplement-actions"><button type="button" class="pg-button ${wanted?'':'pg-primary'}" ${wanted?`data-pg-supplement-arrange="${i}"`:`data-pg-supplement-want="${i}"`}>${wanted?'安排到'+S.slotNames[model.slot]:'想去'}</button><button type="button" class="pg-link" data-pg-supplement-view="${i}">查看地点</button></div></article>`;
   }).join('')||`<p class="pg-supplement-empty">${model.reason==='no-day'?'补全旅行日期后，再按天挑选补充地点。':model.reason==='occupied'?'这个时段已有安排，先看看当天的行程。':'暂无合适的补充。可以先从攻略中挑选想去的地点。'}</p>`}</div>
   <div class="pg-supplement-footer"><p>${model.items.length?'空档仅表示尚未安排；停留时间和营业情况请在安排时核对。':'只在有明确依据时推荐，不自动填满行程。'}${model.items.some(i=>i.anchor)?' 距离为确认位置的直线估算，不代表步行路程或时间。':''}</p></div>`;
 }
 const factKey=row=>row.place.cityId+'|'+C.normalizeName(row.place.name);
 function requestFacts(models){
  if(viewMode!=='compare'||location.protocol==='file:')return;
  const needed=models.filter(m=>!factCache.has(factKey(m.row))&&Compare.dimensions.some(([key])=>key!=='transport'&&!m.cells[key].length));
  if(!needed.length)return;
  needed.forEach(m=>factCache.set(factKey(m.row),{status:'loading',facts:[]}));
  fetch('/api/place-facts',{method:'POST',headers:{'Content-Type':'application/json','X-Travel-Import':'1'},credentials:'omit',signal:AbortSignal.timeout(40000),body:JSON.stringify({places:needed.map(m=>({name:m.row.place.name,cityId:m.row.place.cityId,missing:Compare.dimensions.filter(([key])=>key!=='transport'&&!m.cells[key].length).map(([key])=>key)}))})})
   .then(async response=>{if(!response.ok)throw Error();const body=await response.json();for(const m of needed){const result=body.results?.find(r=>r.cityId===m.row.place.cityId&&r.name===m.row.place.name);factCache.set(factKey(m.row),result||{status:'unconfirmed',facts:[]});}})
   .catch(()=>needed.forEach(m=>factCache.set(factKey(m.row),{status:'unconfirmed',facts:[]})))
   .finally(()=>{if(viewMode==='compare'&&comparisonRefresh){if(comparison.contains(document.activeElement)&&document.activeElement.closest('details[open]'))comparison.addEventListener('focusout',()=>comparisonRefresh?.(),{once:true});else comparisonRefresh();}});
 }
 function searchOpen(open){$('#pg-search-field').hidden=!open;$('.pg-search-toggle').setAttribute('aria-expanded',String(open));if(!open){clearTimeout(searchTimer);searchMatchCategory=false;query='';$('#pg-search').value='';}}
 function renderComparison(rows,state){
  comparison.hidden=viewMode!=='compare';
  if(comparison.hidden)return;
  comparisonRefresh=()=>renderComparison(rows,D.read());
  const scope=[cityFilter,category,filter,query].join('|');
  if(scope!==comparisonScope){comparisonKey='';comparisonScope=scope;}
  comparisonGroups=Compare.contextGroups(rows,{city:cityFilter,kind:category},comparisonKey);
  const group=comparisonGroups.find(g=>g.key===comparisonKey)||comparisonGroups[0];
  comparison.hidden=viewMode!=='compare';
  if(!group){comparisonKey='';comparison.querySelector('.pg-comparison-body').innerHTML='<div class="pg-empty"><h3>暂时没有可对比的组合</h3><p>当前筛选中，需要至少两个同城、同类且有来源内容的地点。</p><button type="button" class="pg-link" data-pg-view="list">返回地点列表</button></div>';return;}
  comparisonKey=group.key;
  const selected=Compare.select(group,comparisonSelections.get(group.key)),chosen=selected.map(id=>group.pool.find(r=>r.place.sourceId===id));
  const adjustment=comparison.querySelector('.pg-compare-adjust'),adjustOpen=adjustment?.dataset.group===group.key&&adjustment.open;
  const baseModels=chosen.map(row=>({row,...Compare.evidence(row)}));requestFacts(baseModels);
  const models=baseModels.map(model=>Compare.withFacts(model,factCache.get(factKey(model.row))));
  const link=(s,label)=>`<a href="${E(Compare.safeURL(s.url))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${E(s.title+(s.checkedAt?' · 查阅 '+s.checkedAt.slice(0,10):'')+(s.publishedAt?' · 发布 '+s.publishedAt:''))}" aria-label="${E(s.title+'，打开来源')}">${E(label)} ↗</a>`;
  const topics=Compare.topicNavigation(comparisonGroups,group.key),decision=Compare.decisionSummary(models);
  const summaryParts=decision.clauses.map(p=>{
   const source=p.sources[p.point.sourceIndexes[0]],warningSource=p.caution&&p.sources[p.caution.sourceIndexes[0]];
   const warning=p.caution?.text.replace(/[。；;]$/,'');
   return `${E(p.lead)}${link({...source,title:source.title+' · '+p.point.text},p.name)}${warning?`（${warningSource?.url!==source.url?link(warningSource,warning):E(warning)}）`:''}`;
  });
  if(decision.unresolved.length>=2)summaryParts.push(`${E(decision.unresolved.join('、'))}的现有信息还不足以区分优先级`);
  if(!summaryParts.length)summaryParts.push('现有来源还不足以给出明确的取舍建议');
  const quickTopics=comparisonGroups.filter(g=>g.key===group.key||topics.quick.some(t=>t.key===g.key));
  const images=models.map(m=>photo(m.row,state)),compactImages=images.some(image=>!image||image.compact||image.width&&image.width<480);
  const topicButton=g=>`<button type="button" class="pg-link" data-pg-comparison="${E(g.key)}" aria-pressed="${g.key===group.key}" aria-controls="pg-compare-results">${E(g.label)}</button>`;
  const sourceMark=(point,sources)=>sources.length>1?`<sup class="pg-source-mark">${point.sourceIndexes.map(i=>link({...sources[i],title:sources[i].title+' · '+point.references.filter(r=>r.sourceIndex===i).map(r=>r.text).join('；')},S.sourceIdentity(sources[i]).label.replace('攻略','').replace('笔记',''))).join(' · ')}</sup>`:'';
  const cellHTML=(points,sources)=>{
   const merged=Compare.mergeCellPoints(points),runs=[];
   // Adjacent statements from the same sources read as one paragraph, with
   // one citation at its end instead of repeating the publisher after each line.
   for(const point of merged){
    const key=point.sourceIndexes.slice().sort((a,b)=>a-b).join(','),last=runs.at(-1);
    if(last?.key===key){last.points.push(point);last.references.push(...point.references);}
    else runs.push({...point,key,points:[point],references:point.references.slice()});
   }
   return `<p class="pg-cell-copy">${runs.map(run=>`<span>${run.points.map(p=>{
    const text=p.text.trim().replace(/[；;]$/,'。');
    const label=p.label&&!/^(平台参考|平台介绍|公开资料|推荐|体验|特色体验|注意|注意事项|避坑|提醒|顾虑)$/.test(p.label)&&!text.startsWith(p.label)?`<b>${E(p.label)}</b>`:'';
    return `${label}${E(text)}${merged.length>1&&!/[。！？!?]$/.test(text)?'。':''}`;
   }).join('')}${sourceMark(run,sources)}</span>`).join(' ')}</p>`;
  };
  const layout=Compare.presentation(models),visibleDimensions=Compare.dimensions.filter(([key])=>layout.visible.some(([k])=>k===key)||layout.shared.some(item=>item.key===key));
  comparison.querySelector('.pg-comparison-body').innerHTML=`
   <div class="pg-compare-tools"><h3 class="pg-compare-title pg-sr-only">${E(group.city+' · '+group.label)}</h3>
   <nav class="pg-compare-topics" aria-label="对比专题">${quickTopics.map(topicButton).join('')}${topics.more.length?`<details class="pg-compare-more"><summary>更多${icon('chevron')}</summary><div class="pg-compare-topic-menu">${topics.more.map(topicButton).join('')}</div></details>`:''}</nav>
   <details class="pg-compare-adjust" data-group="${E(group.key)}" ${adjustOpen?'open':''}><summary>更换地点${icon('chevron')}</summary><div class="pg-compare-options"><small>选择 2–4 个地点 · 已选 ${selected.length} 个</small>${group.pool.map(r=>`<label><input type="checkbox" data-pg-compare-place="${E(r.place.sourceId)}" ${selected.includes(r.place.sourceId)?'checked':''} ${!selected.includes(r.place.sourceId)&&selected.length===4||selected.includes(r.place.sourceId)&&selected.length===2?'disabled':''}><span>${E(r.displayName||r.place.name)}</span></label>`).join('')}<button type="button" class="pg-link" data-pg-action="comparison-reset">恢复自动组合</button></div></details>
   </div>
   <p class="pg-compare-takeaway" aria-label="选择建议，依据来源中的体验与顾虑">${summaryParts.join('；')}。</p>
   <div id="pg-compare-results" class="pg-compare-scroll" tabindex="0" role="region" aria-label="${E(group.label)}地点对比表，可横向滚动"><table class="pg-compare-table${compactImages?' pg-compare-compact':''}" style="--compare-count:${chosen.length}"><caption class="pg-sr-only">${E(group.city+' · '+group.label)}</caption><thead><tr><th scope="col" rowspan="2">地点</th>${models.map(({row,sources},modelIndex)=>{
    const image=images[modelIndex];
    return `<th scope="col" class="pg-compare-place"><div class="pg-compare-card"><div class="pg-compare-media">${image?`<img class="pg-compare-photo${image.compact||image.width&&image.width<480?' pg-compare-thumbnail':''}" src="${E(image.src)}" ${image.fallback?`data-pg-fallback="${E(image.fallback)}"`:''} alt="${E(row.place.name)}" loading="lazy">`:`<span class="pg-compare-placeholder" aria-label="暂无地点图片">${icon('pin')}</span>`}</div><a class="pg-compare-name" href="${E(mapURL(row))}" target="_blank" rel="noopener noreferrer">${E(row.displayName||row.place.name)} ↗</a><div class="pg-compare-sources">${sourceBadges(sources)}</div></div></th>`;
   }).join('')}</tr><tr class="pg-compare-actions">${models.map(({row})=>`<td><button type="button" class="pg-button" data-pg-decision="${E(row.place.sourceId)}" data-value="wish" aria-pressed="${C.wanted(row.choice)}">${icon('heart')}${C.wanted(row.choice)?'已想去':'加入想去'}</button></td>`).join('')}</tr></thead><tbody>${visibleDimensions.map(([key,title])=>`<tr><th scope="row">${title}</th>${models.map(({cells,sources})=>`<td>${cells[key].length?cellHTML(cells[key],sources):'<span class="pg-compare-missing" aria-label="来源未提供此项">—</span>'}</td>`).join('')}</tr>`).join('')}${layout.notes.some(points=>points.length)?`<tr><th scope="row">其他特点</th>${layout.notes.map((points,i)=>`<td>${points.length?cellHTML(points,models[i].sources):'<span class="pg-compare-missing">—</span>'}</td>`).join('')}</tr>`:''}</tbody></table></div>`;

 }
 function card(row,state,suggestion){
  const p=row.place,id=p.sourceId,name=row.displayName||p.name,sources=S.recommendationSources(row),image=photo(row,state),picked=C.wanted(row.choice)?'wish':row.choice;
  const view=C.recommendationView(sources,'');
  const assigned=assignedFor(row).filter(a=>a.active),assign=assigned[0],date=assign?.day?.date,arrangeId=assign?.place?.sourceId||id;
  const sourceLinks=sourceBadges(sources);
  const attribution=point=>sources.length>1?`<sup class="pg-source-mark">${point.sourceIndexes.map(i=>`<a href="${E(sources[i].url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${E('观点来源：'+sources[i].title)}" title="${E(sources[i].title)}">${E(S.sourceIdentity(sources[i]).label.replace('攻略','').replace('笔记',''))}</a>`).join(' · ')}</sup>`:'';
  const paragraphs=points=>points.map(point=>{
   const generic=/^(推荐|推荐理由|推荐原因|理由|原文摘录|亮点|补充|平台介绍)$/;
   const label=point.caution&&/^(注意|注意事项|避坑|提醒|贴士|小贴士)$/.test(point.label)?'留意':generic.test(point.label)?'':point.label;
   return `<p class="pg-point ${point.caution?'pg-point-caution':''}">${label&&!point.text.startsWith(label)?`<span class="pg-point-label">${E(label)}</span>`:''}${E(point.text)}${attribution(point)}</p>`;
  }).join('');
  const pending=!Number.isFinite(p.lat)||!Number.isFinite(p.lng);
  const proposed=p.kind==='manual'&&suggestion?.kind;
  const placeholder=`<div class="pg-picture-placeholder" role="img" aria-label="暂无地点配图">${icon('pin')}</div>`;
  const photoTag=image?.guide?'button':image?.sourceURL?'a':'div';
  const photoAttrs=image?.guide?`type="button" data-pg-image="${E(image.guideId)}:${image.index}" aria-label="查看${E(name)}的原图"`:image?.sourceURL?`href="${E(Compare.safeURL(image.sourceURL))}" target="_blank" rel="noopener noreferrer" aria-label="查看${E(name)}的配图来源"`:'';
  const picture=image?`<${photoTag} ${photoAttrs} class="pg-picture ${image.compact?'pg-picture-small':''}"><img loading="lazy" src="${E(image.src)}" alt="${E(image.alt)}"></${photoTag}>`:placeholder;
  return `<article class="pg-place" tabindex="-1" data-place="${E(id)}" aria-label="${E(name)}">
   ${image&&!image.compact?picture:''}<div class="pg-place-body">
    <div class="pg-place-heading">${!image||image.compact?picture:''}<div class="pg-heading-text">
     <div class="pg-place-meta"><span class="pg-place-kind">${E(kindLabel(category!=='all'&&S.matchesKind(row,category)?category:p.kind))} · ${E(row.city)}</span></div><div class="pg-title-row"><h3><a class="pg-place-name" href="${E(mapURL(row))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${E(name)}，在地图中查看" title="${pending?'按名称搜索，具体门店请在地图确认':'查看地图位置'}">${E(name)}${icon('map')}</a></h3>${proposed?'':`<button type="button" class="pg-link pg-place-edit" data-pg-edit="${E(id)}" aria-label="修正${E(name)}的信息">修正</button>`}</div>
     ${sources.length?`<div class="pg-source-links" aria-label="攻略来源">${sourceLinks}</div>`:''}
    </div></div>
    <div class="pg-points">${paragraphs(view.visible)}</div>
    ${view.more.length?`<details class="pg-more-points"><summary><span class="pg-more-closed">查看全部 · ${view.more.length} 条补充</span><span class="pg-more-open">收起补充</span>${icon('chevron')}</summary>${paragraphs(view.more)}</details>`:''}
    ${referenceHTML(row)}
    ${proposed?`<div class="pg-category-confirm"><span>建议分类：<b>${E(kindLabel(proposed))}</b></span><button type="button" class="pg-button" data-pg-confirm-kind="${E(id)}" aria-label="确认${E(name)}为${E(kindLabel(proposed))}">确认分类</button><button type="button" class="pg-link" data-pg-edit="${E(id)}" aria-label="修正${E(name)}的信息">修改</button></div>`:''}
    ${assign?`<div class="pg-place-actions"><span class="pg-scheduled">${icon('calendar')}${E(date||'已安排')} · ${E(window.DailyPlanCore.timeLabel(assign)||{morning:'上午',afternoon:'下午',evening:'晚上'}[assign.slot])}</span></div>`:''}
   </div>
   <div class="pg-judgment" role="group" aria-label="对${E(name)}的判断">${[['wish','想去','heart'],['maybe','待定','clock'],['skip','不考虑','minus']].map(([value,label,ico])=>`<button type="button" class="pg-judge" data-pg-decision="${E(id)}" data-value="${value}" aria-pressed="${picked===value}">${icon(ico)}${picked===value?(value==='skip'?'已排除':'已'+label):label}</button>`).join('')}</div>
   ${filter==='wish'?`<div class="pg-arrange-row"><button type="button" class="pg-button ${assign?'':'pg-primary'}" data-pg-arrange="${E(arrangeId)}">${icon('calendar')}${assign?'调整日程':'安排到每日行程'}</button>${assign?`<button type="button" class="pg-link" data-pg-day="${E(arrangeId)}">查看</button>`:''}</div>`:''}
  </article>`;
 }
 const guideType=g=>g.kind==='dot'||g.url.includes('/s/dot')?'点点攻略':'小红书笔记';
 function renderSources(state){
  const node=$('#pg-original'),guides=state.guides||[],toggle=$('[data-pg-action="sources"]');
  toggle.textContent=`已导入 ${guides.length} 篇`;toggle.setAttribute('aria-expanded',String(sourceOpen));
  node.hidden=!sourceOpen;if(!sourceOpen)return;
  node.innerHTML=`<section class="pg-original pg-library" aria-label="已导入攻略"><div class="pg-original-top"><h3>已导入攻略</h3><button type="button" class="pg-link" data-pg-action="sources">收起</button></div>${guides.length?`<ul class="pg-guide-list">${guides.map(g=>{
   const places=C.guidePlaces(state,g.id),open=sourceId===g.id,pictures=originals(g.images);
   return `<li><button type="button" class="pg-guide-row" data-pg-source="${E(g.id)}" aria-expanded="${open}" aria-controls="pg-guide-${E(g.id)}"><span class="pg-guide-title">${E(g.title)}</span><span class="pg-guide-type">${guideType(g)}</span><span class="pg-guide-count">${places.length} 个地点</span>${icon('chevron')}</button>${open?`<div class="pg-guide-detail" id="pg-guide-${E(g.id)}"><div class="pg-guide-tools"><a class="pg-link" href="${E(g.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">打开原始分享 ↗</a><div><button type="button" class="pg-link" data-pg-reparse="${E(g.id)}">重新解析</button><button type="button" class="pg-link pg-remove-guide" data-pg-remove-guide="${E(g.id)}">删除攻略</button></div></div>${pictures.length?`<div class="pg-guide-images" aria-label="攻略原图">${pictures.map(({image,index},order)=>`<button type="button" data-pg-image="${E(g.id)}:${index}" aria-label="放大第 ${order+1} 张攻略原图"><img loading="lazy" src="${E(image.data)}" alt="攻略原图 ${order+1}"><span>${image.height>image.width*3?'长图':'原图'} ${order+1}</span></button>`).join('')}</div>`:''}<div class="pg-guide-places" aria-label="这篇攻略的地点">${places.map(item=>{const recommendation=item.sources.find(s=>(s.guideId||s.id.split(':')[0])===g.id);return `<button type="button" class="pg-link" data-pg-guide-place="${E(item.sourceId)}">${E(item.place.name)}${Number.isFinite(recommendation.recommendationPercentage)?`<small>${recommendation.recommendationPercentage}%</small>`:''} ↗</button>`;}).join('')||'<p>尚未识别到地点。</p>'}</div></div>`:''}</li>`;
  }).join('')}</ul>`:'<p class="pg-library-empty">还没有导入攻略。</p>'}</section>`;
 }
 const rowName=row=>row.displayName||row.place.name;
 function groupCities(rows){
  const groups=new Map();
  for(const row of rows){const id=row.place.cityId;if(!groups.has(id))groups.set(id,{id,name:row.city,rows:[]});groups.get(id).rows.push(row);}
  const order=[...new Set([...(T.snapshot?.destinations||[]).map(d=>d.id),...groups.keys()])];
  return order.filter(id=>groups.has(id)).map(id=>groups.get(id));
 }
 function render(){try{const state=D.read(),base=catalogue(),rows=allRows(base),groups=groupCities(rows),stops=T.snapshot?.destinations||[],cities=new Map(stops.map(d=>[d.id,d.name]));
  for(const g of groups)if(!cities.has(g.id))cities.set(g.id,g.name);
  if(!cityFilter)cityFilter=cities.keys().next().value||'all';
  if(cityFilter!=='all'&&!cities.has(cityFilter))cityFilter='all';
  const stayLabel=id=>id==='all'?`${cities.size} 座城市 · 按行程顺序`:stops.filter(d=>d.id===id).map(d=>T.label(d).replace(d.name+' · ','')).join(' / ')||'未安排日期';
  $('.pg-city-tabs').innerHTML=[...cities,['all','全部城市']].map(([id,name])=>`<button type="button" data-pg-city="${E(id)}" aria-pressed="${cityFilter===id}"><b>${E(name)}</b>${id!=='all'?`<small>${E(stayLabel(id))}</small>`:''}</button>`).join('');
  $('#pg-cities').innerHTML=[...cities.values()].map(name=>`<option value="${E(name)}"></option>`).join('');
  const cityRows=rows.filter(r=>cityFilter==='all'||r.place.cityId===cityFilter),count=v=>cityRows.filter(r=>v==='all'||v==='wish'?v==='all'||C.wanted(r.choice):r.choice===v).length;
  $('.pg-filters').innerHTML=[['all','发现地点'],['wish','我的想去']].map(([v,label])=>`<button type="button" class="pg-filter" data-pg-filter="${v}" aria-pressed="${v==='wish'?filter==='wish':filter!=='wish'}">${label}${v==='wish'&&count(v)?`<span>${count(v)}</span>`:''}</button>`).join('');
  const status=$('#pg-status-filter');status.hidden=filter==='wish'||(filter==='all'&&!count('maybe')&&!count('skip'));status.innerHTML=[['all','全部判断'],['maybe','待定'],['skip','不考虑']].map(([v,label])=>`<option value="${v}" ${filter===v?'selected':''}>${label}${v==='all'?'':' · '+count(v)}</option>`).join('');
  const judged=cityRows.filter(r=>(filter==='all'||(filter==='wish'?C.wanted(r.choice):r.choice===filter))&&(!query||[r.place.name,rowName(r),...(r.place.aliases||[])].join(' ').toLowerCase().includes(query)));
  const filters=judged.some(r=>r.place.kind==='manual')?[...kinds.slice(1),['manual','待确认']]:kinds.slice(1);
  const categoryCounts=new Map(filters.map(([kind])=>[kind,judged.filter(r=>S.matchesKind(r,kind)).length]));
  if(searchMatchCategory&&query&&!categoryCounts.get(category))category=filters.find(([kind])=>categoryCounts.get(kind))?.[0]||category;
  searchMatchCategory=false;
  if(!filters.some(k=>k[0]===category))category=filters.find(([kind])=>categoryCounts.get(kind))?.[0]||'sight';
  const shown=judged.filter(r=>S.matchesKind(r,category));requestDiscovery(cityRows);renderDiscoveryStatus();
  $('.pg-categories').innerHTML=filters.map(([v,label])=>`<button type="button" data-pg-category="${v}" aria-pressed="${category===v}">${label}<span class="pg-category-count">${categoryCounts.get(v)}</span></button>`).join('');
  const scope=JSON.stringify([cityFilter,category,filter,query]);
  if(scope!==listScope){listLimit=listBatchSize;listScope=scope;}
  // Limit only the rendered list; counts, comparison and saved choices use all rows.
  const ordered=groupCities(shown).flatMap(g=>g.rows),shownGroups=groupCities(ordered.slice(0,listLimit)),remaining=Math.max(0,shown.length-listLimit);
  listMore.hidden=viewMode!=='list'||shown.length<=listBatchSize;
  listMore.innerHTML=(remaining?`<button type="button" class="pg-button" data-pg-action="list-more" aria-controls="pg-place-list">再看 ${Math.min(listBatchSize,remaining)} 个<span> · 还有 ${remaining} 个</span>${icon('chevron')}</button>`:'')+(listLimit>listBatchSize?'<button type="button" class="pg-link" data-pg-action="list-less" aria-controls="pg-place-list">收起</button>':'');
  const grid=$('.pg-grid');grid.hidden=viewMode!=='list';grid.classList.toggle('pg-grouped',shown.length>0);
  contentNav.querySelectorAll('[data-pg-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pgView===viewMode)));
  grid.innerHTML=viewMode!=='list'?'':shown.length?shownGroups.map((g,i)=>`<section class="pg-city-group" aria-labelledby="pg-city-heading-${i}"><header class="pg-city-group-head" ${cityFilter!=='all'||shownGroups.length<2?'hidden':''}><div><h3 id="pg-city-heading-${i}">${E(g.name)}</h3><span>${g.rows.length} 个地点</span></div>${cityFilter==='all'&&shownGroups.length>1?`<button type="button" class="pg-link" data-pg-city="${E(g.id)}" aria-label="只看${E(g.name)}">只看这座城 ↗</button>`:''}</header><div class="pg-city-grid">${g.rows.map(r=>card(r,state,r.place.kind==='manual'?C.suggestPlaceKind(r,base):null)).join('')}</div></section>`).join(''):`<div class="pg-empty"><h3>${query?'没有匹配的地点':filter==='wish'?'还没有想去的'+kindLabel(category)+'地点':'暂无'+kindLabel(category)+'地点'}</h3><p>${query?'换个关键词，或关闭搜索查看地点。':filter==='wish'?'在发现地点中标记想去，就能在这里安排日期。':'导入攻略，或换个分类继续看看。'}</p></div>`;
  renderSources(state);renderSupplements(base,state);renderComparison(shown,state);root.dataset.renderState='ready';
 }catch(error){root.dataset.renderState='error';message(error.message,true);}}
 function show(next='all',options={}){if(next==='wish')viewMode='list';filter=['all','wish','maybe','skip'].includes(next)?next:'all';DestinationGuide.showDiscovery(options);if(options.history&&filter==='wish')history.replaceState(null,'','#my-wants');render();if(options.scroll&&filter==='wish')$('.pg-navigation').scrollIntoView({block:'start',behavior:'instant'});if(options.focus)root.querySelector(`[data-pg-filter="${filter==='wish'?'wish':'all'}"]`)?.focus({preventScroll:true});}
 function browse(kind,options={}){viewMode='list';category=kind;query='';$('#pg-search').value='';show('all',options);return true;}
 function revealPlace(id,options={}){const row=catalogue().find(r=>(r.memberIds||[r.place.sourceId]).includes(id));if(!row)return false;viewMode='list';revealedId=id;cityFilter=row.place.cityId;category=row.place.kind;query=row.place.name.toLowerCase();$('#pg-search').value=row.place.name;searchOpen(true);show('all',options);const card=[...root.querySelectorAll('.pg-place')].find(n=>n.dataset.place===row.place.sourceId);card?.focus({preventScroll:true});card?.scrollIntoView({block:'center',behavior:'instant'});return true;}
 const city=()=>{const name=$('#pg-import-city').value.trim();return name?{id:T.key(name),name:T.name(name)}:null;};
 const reviewCity=result=>[...new Set(result.places.map(p=>p.city?.name||'城市待确认'))].join(' · ')||result.city?.name||'城市待确认';
 const progress=value=>{$('#pg-import-progress').textContent=value;};
 function importOpen(open){$('#pg-import-inputs').hidden=!open;const toggle=$('[data-pg-action="import-toggle"]');toggle.innerHTML=icon(open?'minus':'plus')+(open?'收起导入':'导入攻略');toggle.setAttribute('aria-expanded',String(open));}
 function review(){
  const box=$('#pg-review');box.hidden=!staged.length;if(!staged.length)return;importOpen(false);
  box.innerHTML=`${staged.map((result,g)=>`<section class="pg-review-guide"><div class="pg-review-overview"><h4>${E(result.source.title)}</h4><p class="pg-review-summary"><span>${E(reviewCity(result))}</span><span>${result.places.length} 个地点</span><span>${originals(result.source.images).length} 张原图</span></p></div><div class="pg-review-tools"><details class="pg-review-original"><summary>原始分享与图片</summary><a class="pg-link" href="${E(result.source.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">打开原始分享 ↗</a>${result.warnings?.length?`<p class="pg-caveat">${E([...new Set(result.warnings)].join(' '))}</p>`:''}<div class="pg-review-gallery">${originals(result.source.images).map(({image:img,index:n},order)=>`<button type="button" data-pg-staged-image="${g}:${n}" aria-label="放大第 ${order+1} 张原图"><img loading="lazy" src="${E(img.data)}" alt="原图 ${order+1}"></button>`).join('')}</div></details><details class="pg-corrections" ${reviewEditor.startsWith(g+':')?'open':''}><summary>${result.places.length?'识别有误？修正地点':'未找到地点 · 手动补充'}</summary><div class="pg-review-rows">${result.places.map((p,i)=>reviewEditor===g+':'+i?`<div class="pg-review-edit"><label>地点名称<input aria-label="地点名称 ${g+1}-${i+1}" data-pg-name="${g}:${i}" value="${E(p.name)}" maxlength="180"></label><label>城市<input aria-label="地点城市 ${g+1}-${i+1}" data-pg-place-city="${g}:${i}" value="${E(p.city?.name||'')}" list="pg-cities" maxlength="40"></label><label>分类<select aria-label="地点类型 ${g+1}-${i+1}" data-pg-kind="${g}:${i}"><option value="" ${!p.kind?'selected':''}>分类待确认</option>${kinds.slice(1).map(([v,label])=>`<option value="${v}" ${p.kind===v?'selected':''}>${label}</option>`).join('')}</select></label><div class="pg-edit-actions"><button type="button" class="pg-link" data-pg-drop="${g}:${i}">排除误识别</button><button type="button" class="pg-button" data-pg-review-done="${g}:${i}">完成修改</button></div></div>`:`<div class="pg-review-item"><span>${E(p.name)}</span><small>${E(p.city?.name||'城市待确认')} · ${kindLabel(p.kind)}</small><button type="button" class="pg-link" data-pg-review-edit="${g}:${i}" aria-label="修正${E(p.name)}">修改</button></div>`).join('')}</div><button type="button" class="pg-link" data-pg-add="${g}">＋ 补充遗漏地点</button></details></div></section>`).join('')}<div class="pg-review-actions"><button type="button" class="pg-link" data-pg-action="discard">取消</button><button type="button" class="pg-button pg-primary" data-pg-action="keep">完成导入 · 查看地点</button></div>`;
 }
 function syncReview(){root.querySelectorAll('[data-pg-name]').forEach(n=>{const[g,i]=n.dataset.pgName.split(':').map(Number),p=staged[g].places[i];p.name=n.value.trim();const name=root.querySelector(`[data-pg-place-city="${g}:${i}"]`).value.trim();if(name!==(p.city?.name||'')){p.city_manual=Boolean(name);p.cityResolution=name?'manual':'unresolved';}p.city=name?{id:T.key(name),name:T.name(name)}:null;const kind=root.querySelector(`[data-pg-kind="${g}:${i}"]`).value||null;if(kind!==p.kind)p.classification_manual=Boolean(kind);p.kind=kind;});}
 $('#pg-import-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;if(staged.length){progress('先保留或取消下方待确认的攻略，再导入下一批。');return;}let selected;try{selected=city();}catch(e){progress(e.message);return;}
  const urls=C.links($('#pg-url').value);if(!urls.length){progress('没有识别到链接。请直接复制整段小红书分享文字或完整链接。');return;}if(urls.length>5){progress('一次最多导入 5 条，请分批粘贴。');return;}
  busy=true;const button=event.target.querySelector('button[type=submit]');button.disabled=true;button.textContent='读取中…';const failures=[];
  for(let i=0;i<urls.length;i++){progress(`正在读取第 ${i+1} / ${urls.length} 篇${urls[i].includes('/s/dot')?'，长图识别可能需要约一分钟':''}…`);const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),480000);try{const response=await fetch('/api/guide-import',{method:'POST',headers:{'Content-Type':'application/json','X-Travel-Import':'1'},body:JSON.stringify({text:urls[i]}),signal:abort.signal,credentials:'omit'});const result=await response.json();if(!response.ok)throw Error(result.message||'攻略读取失败。');C.validateResult(result);staged.push(D.prepare(result,selected));}catch(error){failures.push(`第 ${i+1} 篇：${error.name==='AbortError'?'读取超时。':error.message==='Failed to fetch'?'请使用本地导入服务打开页面。':error.message}`);}finally{clearTimeout(timer);}}
  busy=false;button.disabled=false;button.innerHTML=icon('plus')+'导入攻略';progress(failures.join('\n'));if(failures.length)$('.pg-manual').hidden=false;review();
 });
 async function manual(){if(busy)return;let selected;try{selected=city();}catch(e){progress(e.message);return;}if(staged.length){progress('先保留或取消待确认的攻略。');return;}const urls=C.links($('#pg-url').value),raw=$('#pg-manual-text').value.trim();if(urls.length!==1||!raw){progress('上方保留一条来源链接，并在这里粘贴正文。');return;}const url=C.shareURL(urls[0]),bytes=new TextEncoder().encode(url),fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');const lines=raw.split('\n'),places=C.extractText(raw,$('#pg-manual-title').value.trim());
  staged=[D.prepare({source:{fingerprint,url,title:$('#pg-manual-title').value.trim()||'我导入的攻略',text:raw,kind:url.includes('/s/dot')?'dot':'note',method:'manual',images:[]},places,warnings:['正文由你提供，未验证与线上原文一致；请核对名称，也可补充未识别的地点。']},selected)];review();progress('');
 }
 const viewer=document.createElement('dialog');viewer.className='pg-image-viewer';viewer.innerHTML='<header><span></span><button type="button" aria-label="关闭原图">关闭</button></header><img alt="攻略原图">';root.append(viewer);let imageTrigger=null;
 viewer.querySelector('button').addEventListener('click',()=>viewer.close());viewer.addEventListener('close',()=>imageTrigger?.focus({preventScroll:true}));
 viewer.querySelector('img').addEventListener('load',e=>{viewer.style.width=Math.min(760,Math.max(320,e.target.naturalWidth+2))+'px';});
 function showImage(data,title,trigger){imageTrigger=trigger;viewer.querySelector('span').textContent=title;viewer.querySelector('img').src=data;viewer.showModal();}
 async function reparse(id,button){if(busy||staged.length){progress('先保存或取消正在核对的攻略。');return;}const saved=D.read().guides.find(g=>g.id===id);if(!saved)return;busy=true;button.disabled=true;button.textContent='正在识别…';try{const response=await fetch('/api/guide-reparse',{method:'POST',headers:{'Content-Type':'application/json','X-Travel-Import':'1'},body:JSON.stringify({source:saved}),credentials:'omit',signal:AbortSignal.timeout(480000)});const result=await response.json();if(!response.ok)throw Error(result.message||'识别失败，请重试。');C.validateResult(result);if(!result.places.length)throw Error('这次未识别到地点，已保留原攻略内容。');const prior=D.read().items.filter(item=>item.sources.some(s=>(s.guideId||s.id.split(':')[0])===id));for(const p of result.places){const match=prior.find(item=>[item.place.name,...(item.place.aliases||[])].some(n=>C.normalizeName(n)===C.normalizeName(p.name)));if(match&&(match.editedAt||match.cityManual||match.linked)){p.city={id:match.place.cityId,name:match.city};p.city_manual=true;}}staged=[{...D.prepare(result,city()),reparseOptions:{replaceGuideId:id,expectedRevision:saved.revision||0,expectedImportedAt:saved.importedAt}}];review();$('#pg-review').scrollIntoView({block:'start',behavior:'instant'});}finally{busy=false;button.disabled=false;button.textContent='重新解析';}}
 const editor=document.createElement('dialog');editor.className='pg-place-editor';editor.innerHTML=`<form><h3>修正地点信息</h3><label>名称<input name="name" aria-label="修正地点名称" required maxlength="180"></label><label>城市<input name="city" aria-label="修正地点城市" list="pg-cities" required maxlength="40"></label><label>分类<select name="kind" aria-label="修正地点分类" required><option value="" disabled>请选择分类</option>${kinds.slice(1).map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select></label><p class="pg-editor-suggestion" hidden></p><p class="pg-editor-error" role="alert"></p><div class="pg-edit-actions"><button type="button" class="pg-link" data-close>取消</button><button type="submit" class="pg-button pg-primary">保存修改</button></div></form>`;root.append(editor);let editId='',editTrigger;
 editor.querySelector('[data-close]').addEventListener('click',()=>editor.close());editor.addEventListener('close',()=>editTrigger?.focus({preventScroll:true}));
 editor.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const button=editor.querySelector('[type="submit"]');button.disabled=true;try{const name=editor.querySelector('[name="name"]').value.trim(),city=editor.querySelector('[name="city"]').value.trim(),kind=editor.querySelector('[name="kind"]').value;await D.edit(editId,{name,city,cityId:T.key(city),kind});editor.close();render();message(name+' · 已保存为'+kindLabel(kind));root.querySelector('[data-pg-category="'+category+'"]')?.focus({preventScroll:true});}catch(error){editor.querySelector('.pg-editor-error').textContent=error.message;}finally{button.disabled=false;}});
 const handleClick=async event=>{const b=event.target.closest('button');if(!b||b.disabled)return;try{
  if(b.dataset.pgAction==='list-more'){const previous=root.querySelectorAll('.pg-grid .pg-place').length;listLimit+=listBatchSize;render();root.querySelectorAll('.pg-grid .pg-place')[previous]?.focus({preventScroll:true});return;}
  if(b.dataset.pgAction==='list-less'){listLimit=listBatchSize;render();const selected=root.querySelector('[data-pg-category="'+category+'"]');selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest',behavior:'instant'});return;}
  if(b.dataset.pgView){const top=window.scrollY;viewMode=b.dataset.pgView==='compare'?'compare':'list';render();contentNav.querySelector('[data-pg-view="'+viewMode+'"]')?.focus({preventScroll:true});window.scrollTo({top,behavior:'instant'});return;}
  if(b.dataset.pgComparison){comparisonKey=b.dataset.pgComparison;render();root.querySelector('.pg-compare-topics [aria-pressed="true"]')?.focus({preventScroll:true});return;}
  if(b.dataset.pgAction==='comparison-reset'){comparisonSelections.delete(comparisonKey);render();root.querySelector('[data-pg-action="comparison-reset"]')?.focus({preventScroll:true});return;}
  if(b.dataset.pgEdit){const base=DailyPlanner.catalog({allCities:true}),row=base.find(r=>r.place.sourceId===b.dataset.pgEdit),pending=row.place.kind==='manual',suggestion=C.suggestPlaceKind(row,base);editId=b.dataset.pgEdit;editTrigger=b;editor.querySelector('h3').textContent=pending?'确认地点信息':'修正地点信息';editor.querySelector('[name="name"]').value=row.place.name;editor.querySelector('[name="city"]').value=row.city;editor.querySelector('[name="kind"]').value=suggestion.kind||'';const hint=editor.querySelector('.pg-editor-suggestion');hint.hidden=!pending||!suggestion.kind;hint.textContent=suggestion.reason+'，可修改后确认。';editor.querySelector('[type="submit"]').textContent=pending?'确认并保存':'保存修改';editor.querySelector('.pg-editor-error').textContent='';editor.showModal();return;}
  if(b.dataset.pgConfirmKind){b.disabled=true;try{const base=DailyPlanner.catalog({allCities:true}),row=base.find(r=>r.place.sourceId===b.dataset.pgConfirmKind);if(!row||row.place.kind!=='manual')return;const suggestion=C.suggestPlaceKind(row,base);if(!suggestion.kind)throw Error('暂时无法建议分类，请点击修改后选择。');await D.edit(row.place.sourceId,{name:row.place.name,city:row.city,cityId:row.place.cityId,kind:suggestion.kind});render();message(row.place.name+' · 已确认为'+kindLabel(suggestion.kind));root.querySelector('[data-pg-category="'+category+'"]')?.focus({preventScroll:true});}finally{b.disabled=false;}return;}
  if(b.dataset.pgReviewEdit){syncReview();reviewEditor=b.dataset.pgReviewEdit;review();return;}
  if(b.dataset.pgReviewDone){syncReview();reviewEditor='';review();return;}
  if(b.dataset.pgCity){const fromGroup=Boolean(b.closest('.pg-city-group'));cityFilter=b.dataset.pgCity;searchOpen(false);render();const selected=$('.pg-city-tabs [aria-pressed="true"]');selected?.focus({preventScroll:true});if(selected){const strip=$('.pg-city-tabs'),item=selected.getBoundingClientRect(),bounds=strip.getBoundingClientRect(),delta=item.left<bounds.left?item.left-bounds.left:item.right>bounds.right?item.right-bounds.right:0;if(delta)strip.scrollTo({left:strip.scrollLeft+delta,behavior:'instant'});}if(fromGroup)$('.pg-citybar').scrollIntoView({block:'start',behavior:'instant'});return;}
  if(b.dataset.pgCategory){clearTimeout(searchTimer);searchMatchCategory=false;category=b.dataset.pgCategory;render();root.querySelector('[data-pg-category="'+category+'"]')?.focus({preventScroll:true});return;}
  if(b.dataset.pgImage){const[id,n]=b.dataset.pgImage.split(':');const guide=D.read().guides.find(g=>g.id===id);showImage(guide.images[Number(n)].data,guide.title,b);return;}
  if(b.dataset.pgStagedImage){const[g,n]=b.dataset.pgStagedImage.split(':').map(Number);showImage(staged[g].source.images[n].data,staged[g].source.title,b);return;}
  if(b.dataset.pgReparse){await reparse(b.dataset.pgReparse,b);return;}
  if(b.dataset.pgFilter){viewMode='list';filter=b.dataset.pgFilter;undo=null;message('');if(location.hash==='#destinations'||location.hash==='#my-wants')history.replaceState(null,'',filter==='wish'?'#my-wants':'#destinations');render();root.querySelector('[data-pg-filter="'+filter+'"]')?.focus({preventScroll:true});return;}
  if(b.dataset.pgDecision){const id=b.dataset.pgDecision,row=allRows().find(r=>r.place.sourceId===id),old=['must','wish','maybe','skip'].includes(row?.choice)?row.choice:null,value=(C.wanted(old)?'wish':old)===b.dataset.value?null:b.dataset.value;await D.decide(id,value);undo={id,old};message(value===null?'已清除判断，可以重新选择。':value==='wish'?'已加入我的想去，可在那里安排日期和时段。':value==='maybe'?'已保留为待定。':'已标记为不考虑，之后仍可修改。');render();restoreFocus(id,b.dataset.value);return;}
  if(b.dataset.pgSupplementArrange!==undefined){const item=supplementRows[Number(b.dataset.pgSupplementArrange)];if(item)DailyPlanner.arrange(item.row.place.sourceId,{dayId:supplementDay,slot:supplementSlot});return;}
  if(b.dataset.pgSupplementWant!==undefined){const item=supplementRows[Number(b.dataset.pgSupplementWant)];if(item){await D.decide(item.row.place.sourceId,'wish');render();message('已加入我的想去，可继续选择日期和时段。');}return;}
  if(b.dataset.pgSupplementView!==undefined){const row=supplementRows[Number(b.dataset.pgSupplementView)]?.row;if(row)revealPlace(row.place.sourceId,{history:true});return;}
  if(b.dataset.pgArrange){if(!DailyPlanner.arrange(b.dataset.pgArrange))message('请先在交通与住宿中补全这个城市的日期。',true);return;}
  if(b.dataset.pgDay){DailyPlanner.view(b.dataset.pgDay);return;}
  if(b.dataset.pgSource){sourceId=sourceId===b.dataset.pgSource?'':b.dataset.pgSource;sourceOpen=true;renderSources(D.read());root.querySelector(`[data-pg-source="${b.dataset.pgSource}"]`)?.focus({preventScroll:true});return;}
  if(b.dataset.pgRemoveGuide){if(busy){message('正在读取攻略，完成后再删除。',true);return;}const id=b.dataset.pgRemoveGuide;const receipt=await D.remove(id);staged=staged.filter(r=>r.reparseOptions?.replaceGuideId!==id);reviewEditor='';review();sourceId='';undo={type:'guide',receipt};render();message('已删除这篇攻略，其他来源、地点判断与日程保留。');$('[data-pg-action="sources"]').focus({preventScroll:true});return;}
  if(b.dataset.pgGuidePlace){const row=allRows().find(r=>(r.memberIds||[r.place.sourceId]).includes(b.dataset.pgGuidePlace));if(!row)return;viewMode='list';filter='all';category=row.place.kind;cityFilter=row.place.cityId;query=row.place.name.toLowerCase();$('#pg-search').value=row.place.name;searchOpen(true);sourceOpen=false;render();const card=[...root.querySelectorAll('.pg-place')].find(c=>c.dataset.place===row.place.sourceId);card?.focus({preventScroll:true});card?.scrollIntoView({block:'center',behavior:'instant'});return;}
  if(b.dataset.pgDrop){syncReview();const[g,i]=b.dataset.pgDrop.split(':').map(Number);staged[g].places.splice(i,1);reviewEditor='';review();return;}
  if(b.dataset.pgAdd!==undefined){syncReview();const g=Number(b.dataset.pgAdd),r=staged[g];r.places.push({rank:Math.max(0,...r.places.map(p=>p.rank))+1,name:'',kind:null,reasons:[],recommendation_percentage:null});reviewEditor=g+':'+(r.places.length-1);review();$('#pg-review').querySelectorAll('[data-pg-name]')[root.querySelectorAll('[data-pg-name]').length-1]?.focus();return;}
  switch(b.dataset.pgAction){case 'search-toggle':{const open=$('#pg-search-field').hidden;searchOpen(open);if(!open)render();(open?$('#pg-search'):$('.pg-search-toggle')).focus({preventScroll:true});break;}case 'import-toggle':importOpen($('#pg-import-inputs').hidden);break;case 'sources':sourceOpen=!sourceOpen;renderSources(D.read());break;case 'supplements':supplementOpen=!supplementOpen;renderSupplements();if(supplementOpen)supplementPanel.scrollIntoView({block:'center',behavior:'instant'});else gapButton.focus({preventScroll:true});break;case 'supplement-day':if(supplementDay)DailyPlan.openDay(supplementDay);break;case 'manual-toggle':$('.pg-manual').hidden=!$('.pg-manual').hidden;break;case 'manual':await manual();break;case 'discard':staged=[];reviewEditor='';review();importOpen(true);progress('');break;case 'undo':if(undo){const pending=undo;if(pending.type==='guide')await D.restore(pending.receipt);else await D.decide(pending.id,pending.old);undo=null;render();message(pending.type==='guide'?'已恢复攻略及其推荐来源。':'已撤销上次选择。');}break;
   case 'keep':syncReview();if(staged.some(r=>r.places.some(p=>!p.name||!p.city?.name))){const g=staged.findIndex(r=>r.places.some(p=>!p.name||!p.city?.name)),i=staged[g].places.findIndex(p=>!p.name||!p.city?.name);reviewEditor=g+':'+i;review();progress('请补充这个地点的城市或名称后完成导入。');break;}b.disabled=true;let total={added:0,merged:0,unchanged:0};const importedKind=staged[0]?.places[0]?.kind||'';while(staged.length){const counts=await D.add(staged[0],staged[0].city,staged[0].reparseOptions);for(const k in total)total[k]+=counts[k];staged.shift();}reviewEditor='';review();viewMode='list';filter='all';category=importedKind;cityFilter='all';query='';$('#pg-search').value='';sourceOpen=false;undo=null;render();importOpen(false);$('#pg-url').value='';$('#pg-manual-text').value='';$('#pg-manual-title').value='';$('#pg-import-city').value='';$('.pg-manual').hidden=true;progress('');message(`已保存 · ${total.added} 个新地点${total.merged?'，'+total.merged+' 条推荐已合并':''}${!total.added&&!total.merged?'，没有重复添加地点':''}`);$('.pg-filters').focus({preventScroll:true});$('.pg-navigation').scrollIntoView({block:'start',behavior:'instant'});break;
  }
 }catch(error){progress(error.message);message(error.message,true);if(b.dataset.pgAction==='keep'){reviewEditor='';review();b.disabled=false;}}};
 root.addEventListener('click',handleClick);gapRoot.addEventListener('click',handleClick);
 root.addEventListener('toggle',event=>{const id=event.target.dataset.pgSourceMore;if(id){if(event.target.open)expandedSources.add(id);else expandedSources.delete(id);}},true);
 const auxiliaryMenus='.pg-place-menu[open],.pg-compare-adjust[open],.pg-compare-more[open]';
 document.addEventListener('click',event=>{root.querySelectorAll(auxiliaryMenus).forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});});
 root.addEventListener('keydown',event=>{if(event.key==='Escape'){if(event.target.closest('#pg-search-field')){searchOpen(false);render();$('.pg-search-toggle').focus();event.preventDefault();return;}const menu=event.target.closest(auxiliaryMenus);if(menu){menu.open=false;menu.querySelector('summary').focus({preventScroll:true});event.preventDefault();}}});
 root.addEventListener('focusout',event=>{const menu=event.target.closest(auxiliaryMenus);if(menu&&event.relatedTarget&&!menu.contains(event.relatedTarget))menu.open=false;});
 const handleChange=event=>{if(event.target.dataset.pgComparePlace){const group=comparisonGroups.find(g=>g.key===comparisonKey);if(group){const ids=Compare.select(group,comparisonSelections.get(group.key)),id=event.target.dataset.pgComparePlace,next=event.target.checked?[...ids,id]:ids.filter(v=>v!==id);if(next.length>=2&&next.length<=4)comparisonSelections.set(group.key,next);render();root.querySelector('[data-pg-compare-place="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});}return;}if(event.target.id==='pg-supplement-day'){supplementDay=event.target.value;supplementSlot='';DailyPlanner.selectDay(supplementDay,{scroll:false});renderSupplements();}if(event.target.id==='pg-supplement-slot'){supplementSlot=event.target.value;renderSupplements();}};
 root.addEventListener('change',handleChange);gapRoot.addEventListener('change',handleChange);
 document.getElementById('dp-navigation')?.addEventListener('click',()=>requestAnimationFrame(()=>{if(supplementOpen){supplementDay=DailyPlanner.selectedDayId;supplementSlot='';renderSupplements();}}));
 $('#pg-status-filter').addEventListener('change',e=>{filter=e.target.value;undo=null;message('');render();});
 function searchInput(event){if(event.isComposing)return;clearTimeout(searchTimer);query=$('#pg-search').value.trim().toLowerCase();searchMatchCategory=true;if(query)viewMode='list';searchTimer=setTimeout(render,160);}
 $('#pg-search').addEventListener('input',searchInput);
 $('#pg-search').addEventListener('compositionend',searchInput);
 root.addEventListener('error',e=>{if(e.target.tagName==='IMG'){const frame=e.target.closest('.pg-picture');if(frame){const heading=frame.closest('.pg-place').querySelector('.pg-place-heading');frame.remove();heading.insertAdjacentHTML('afterbegin',`<div class="pg-picture-placeholder" role="img" aria-label="地点配图暂不可用">${icon('pin')}</div>`);}else if(e.target.matches('.pg-compare-photo')){if(e.target.dataset.pgFallback){e.target.src=e.target.dataset.pgFallback;delete e.target.dataset.pgFallback;return;}e.target.closest('.pg-compare-media').innerHTML=`<span class="pg-compare-placeholder" aria-label="图片暂不可用">${icon('pin')}</span>`;}else e.target.alt='攻略图片暂不可用';}},true);
 root.addEventListener('load',e=>{if(e.target.matches?.('.pg-compare-photo')&&(e.target.naturalWidth<480||e.target.naturalHeight<260)){e.target.classList.add('pg-compare-thumbnail');e.target.closest('table').classList.add('pg-compare-compact');e.target.style.maxWidth=Math.min(e.target.naturalWidth,72)+'px';e.target.style.maxHeight=Math.min(e.target.naturalHeight,72)+'px';}if(e.target.tagName==='IMG'&&e.target.closest('.pg-picture')){const img=e.target,frame=img.closest('.pg-picture');if(frame.classList.contains('pg-picture-small')||img.naturalWidth<480||img.naturalHeight<260){frame.classList.add('pg-picture-small');frame.closest('.pg-place').querySelector('.pg-place-heading').prepend(frame);img.style.maxWidth=Math.min(img.naturalWidth,80)+'px';img.style.maxHeight=Math.min(img.naturalHeight,80)+'px';}}},true);
 let frame=0;function refresh(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});}
 window.addEventListener('dotimports:change',refresh);window.addEventListener('dailyplan:change',refresh);window.addEventListener('guideimports:error',e=>message(e.detail,true));T.subscribe(refresh);
 $('#pg-import-city').value='';
 window.GuideDiscovery={show,refresh,browse,revealPlace};render();if(D.read().guides.length)importOpen(false);const legacyKind={sights:'sight',food:'food',move:'experience',shops:'shopping'}[location.hash.slice(1)];if(legacyKind)browse(legacyKind);else if(location.hash!=='#tips')show(location.hash==='#my-wants'?'wish':'all');else root.hidden=true;
 if(location.protocol==='file:'){$('#pg-service').hidden=false;$('#pg-service').textContent='自动读取需要本地导入服务：运行“启动攻略导入.command”后，用打开的页面导入。';}
 else fetch('/api/guide-health',{credentials:'omit'}).then(r=>{if(!r.ok)throw Error();}).catch(()=>{$('#pg-service').hidden=false;$('#pg-service').textContent='导入服务未连接。请运行项目中的“启动攻略导入.command”，也可粘贴正文。';});
}
window.TravelStorage.whenReady(init);
})();
