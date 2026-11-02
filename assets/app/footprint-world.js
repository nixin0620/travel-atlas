/* A second SVG view of the existing atlas, not a second footprint store. */
(function(){'use strict';
function init(){
 const root=document.getElementById('china-footprints'),A=window.FootprintAtlas,M=window.FootprintMemoir,C=window.FootprintWorldCore;
 if(!root||!A||!M||!C)return;
 const D=JSON.parse(document.getElementById('china-footprints-data').textContent),cities=new Map(D.cities.map(c=>[c.id,c])),regions=new Map(D.provinces.map(p=>[p.id,p]));
 const $=s=>root.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let view='china',lastSelected=A.snapshot().selected,lastChina=lastSelected,countryId='',countryCity=false,fromWorld=false,lastMode=M.view().mode,lastReplayKey='',panelKey='',queued=false,dialogMode='search',opener=null,busy=false,worldBox={x:0,y:0,w:1000,h:460};
 root.classList.add('fp-world-ready');root.dataset.atlasView=view;
 $('#fp-map-title').textContent='我的旅行足迹';$('.fp-eyebrow').textContent='MY TRAVEL ATLAS';
 const switcher=document.createElement('div');switcher.className='fw-view-switch';switcher.setAttribute('role','group');switcher.setAttribute('aria-label','地图范围');switcher.innerHTML='<button type="button" data-fw-view="china" aria-pressed="true">中国</button><button type="button" data-fw-view="world" aria-pressed="false">世界</button>';$('.fp-header').append(switcher);
 const stats=document.createElement('div');stats.className='fw-statistics';stats.setAttribute('aria-label','当前地图统计');$('.mm-navigation').append(stats);
 // Wishes participate in the same bounded workspace as the map and inspector.
 $('.mm-workspace').append($('.mm-wishes'));
 $('.mm-wish-intro').innerHTML='<h3>下一站，想……</h3>';
 const allWishes=document.createElement('button');allWishes.type='button';allWishes.className='fw-view-all';allWishes.dataset.fwAll='';allWishes.hidden=true;$('.mm-wishes').append(allWishes);
 const stage=document.createElement('div');stage.className='fw-stage';stage.hidden=true;stage.innerHTML='<svg data-fw-svg viewBox="0 0 1000 460" role="group" aria-label="世界旅行足迹地图"><g data-fw-land></g><g data-fw-dots></g></svg><div class="fw-map-controls"><button type="button" data-fw-zoom="in" aria-label="放大世界地图">＋</button><button type="button" data-fw-zoom="out" aria-label="缩小世界地图">−</button><button type="button" data-fw-reset aria-label="返回世界全图">⌖</button></div><a class="fw-attribution" href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>';
 $('.fp-map-column').append(stage);const svg=$('[data-fw-svg]');
 const land=new Map();for(const p of window.FootprintWorldLand||[]){const previous=land.get(p.id);land.set(p.id,previous?{...previous,path:previous.path+p.path}:p);}
 const countryName=id=>id==='CHN'?'中国':regions.get('country-'+id)?.name||land.get(id)?.name||id;
 const overview=document.createElement('section');overview.className='fw-overview';overview.hidden=true;overview.setAttribute('aria-label','旅行国家与城市');$('.fp-panel').prepend(overview);
 const cityBack=document.createElement('button');cityBack.type='button';cityBack.className='fw-city-back';cityBack.dataset.fwCountryList='';cityBack.hidden=true;$('.fp-panel').prepend(cityBack);
 const back=document.createElement('button');back.type='button';back.className='fw-back-world';back.dataset.fwBackWorld='';back.textContent='‹ 返回世界地图';back.hidden=true;$('.fp-map-column').append(back);
 const photoURLs=new Map();function photo(id){const p=window.ChinaCityMemories?.snapshot().get('city:'+id)?.photos?.[0];if(!p?.blob)return '';const old=photoURLs.get(id);if(old?.blob===p.blob)return old.url;if(old)URL.revokeObjectURL(old.url);const url=URL.createObjectURL(p.blob);photoURLs.set(id,{blob:p.blob,url});return url;}
 function thumb(ids){for(const id of ids){const url=photo(id);if(url)return `<img src="${esc(url)}" alt="" loading="lazy">`;}return '<span class="fw-row-placeholder" aria-hidden="true">⌖</span>';}
 function context(scope=view){return C.browse(D.cities,A.snapshot().visited,M.snapshot().wishes,M.view(),scope);}
 function groups(){return context('world').groups;}
 function group(id){return groups().find(g=>g.id===id)||{id,visited:[],wishes:[],trip:[]};}
 function formatDates(v){return v?.startDate?v.startDate.replaceAll('-','.')+(v.endDate&&v.endDate!==v.startDate?' — '+v.endDate.replaceAll('-','.'):''):'日期未记录';}
 function visitDate(id){const m=M.view();if(m.mode==='replay'){const v=m.replay.current;if(v?.cityId===id)return v.kind==='time'?formatDates(v):'地区漫游';return formatDates(M.snapshot().visits.filter(v=>v.cityId===id&&v.startDate).sort((a,b)=>a.startDate.localeCompare(b.startDate)).at(-1));}return formatDates(window.FootprintMemoirCore.currentVisit(M.snapshot(),id));}
 function cityRows(ids,status){return ids.map(id=>`<button type="button" class="fw-summary-row" data-fw-city="${id}">${thumb([id])}<span><b>${esc(cities.get(id).name)}</b><small>${esc(status==='wish'?'想去':visitDate(id))}</small></span><i aria-hidden="true">›</i></button>`).join('');}
 function tripRows(stops){return stops.map(v=>`<button type="button" class="fw-summary-row fw-itinerary-row" data-fw-stop="${esc(v.id)}" data-fw-city="${v.cityId}"><em>${v.order}</em>${thumb([v.cityId])}<span><b>${esc(cities.get(v.cityId).name)}</b><small>${esc(formatDates(v))}</small></span><i aria-hidden="true">›</i></button>`).join('');}
 function countryRows(list){return list.map(g=>`<button type="button" class="fw-summary-row" data-fw-country="${g.id}">${thumb(g.visited)}<span><b>${esc(countryName(g.id))}</b><small>${g.visited.length} 座城市</small></span><i aria-hidden="true">›</i></button>`).join('');}
 function paintPanel(){
  const ctx=context(),m=M.view(),show=!countryCity,level=countryCity?'city':countryId?'country':m.mode==='trip'?'trip':m.mode==='replay'?'replay':'overview';
  root.dataset.worldLevel=view==='world'?level:'china';root.dataset.panel=level;
  $('.fp-panel').setAttribute('aria-label',countryCity?'城市照片与回忆':m.mode==='trip'?'本次旅行信息':m.mode==='replay'?'足迹回放概览':countryId?countryName(countryId)+'的旅行城市':view==='china'?'中国足迹概览':'全球足迹概览');
  overview.hidden=!show;$('.mm-memory-scroll').hidden=show;cityBack.hidden=!countryCity;
  cityBack.textContent='‹ '+(m.mode==='replay'?'足迹回放':countryId?countryName(countryId):m.mode==='trip'?'本次旅行':m.mode==='replay'?'足迹回放':view==='china'?'中国足迹概览':'全球足迹概览');
  back.hidden=!(view==='world'&&countryId||view==='china'&&fromWorld);
  const nextKey=[view,m.mode,level,countryId,countryCity?A.snapshot().selected:''].join(':');if(nextKey!==panelKey){overview.scrollTop=0;$('.fp-panel').scrollTop=0;panelKey=nextKey;}
  if(!show){if(m.mode==='trip'){const entries=m.stops.filter(v=>v.cityId===A.snapshot().selected);$('.mm-city-dates').innerHTML=entries.map(v=>`<div class="fw-trip-date">第 ${v.order} 站 · ${esc(formatDates(v))}</div>`).join('')||'<div class="fw-trip-date">本次旅行未安排</div>'; }else if(m.mode==='replay'){$('.mm-city-dates').textContent=visitDate(A.snapshot().selected);}return;}
  const title=countryId&&m.mode!=='replay'?countryName(countryId):m.mode==='trip'?(m.tripName||'本次旅行'):m.mode==='replay'?'足迹回放':view==='china'?'中国足迹概览':'全球足迹概览';
  let body='';
  if(m.mode==='trip'){
   const stops=ctx.stops.filter(v=>!countryId||C.country(cities.get(v.cityId))===countryId);
   body=tripRows(stops)||'<p class="fw-empty">当前范围暂无行程城市</p>';
  }else if(countryId&&m.mode!=='replay'){const g=group(countryId);body=cityRows(g.visited,'visited')+(g.wishes.length?'<h4>想去的城市</h4>'+cityRows(g.wishes.filter(id=>!g.visited.includes(id)),'wish'):'');if(!body)body='<p class="fw-empty">当前范围暂无到访记录</p>';
  }else if(m.mode==='replay'){
   const r=m.replay;
   if(r.finished){body=`<div class="mm-replay-finish"><span aria-hidden="true">✓</span><h4>回放完成</h4><p>已回顾 ${r.ids.length} 座城市</p><button type="button" data-mm-start-replay>↻ 重新播放</button><button type="button" data-mm-mode="all">返回全部足迹</button></div>`;}
   else if(!r.stops.length){body='<p class="fw-empty">还没有已去过的城市</p>';}
   else{body=`<div class="mm-replay-intro"><p>重温 ${r.ids.length} 座城市的照片与回忆</p><fieldset><legend class="sr-only">回放顺序</legend>${r.datedCount?`<label><input type="radio" name="fp-replay-order" data-mm-order-mode value="time" ${r.order==='time'?'checked':''}><span><b>按时间回放</b><small>${r.unknown.length?'含未记录时间的城市漫游':'按实际到访日期'}</small></span></label>`:''}<label><input type="radio" name="fp-replay-order" data-mm-order-mode value="region" ${r.order==='region'?'checked':''}><span><b>按地区漫游</b><small>按省份 / 国家分组</small></span></label></fieldset><button type="button" data-mm-start-replay>${r.playing?'Ⅱ 暂停':r.step?'▶ 继续回放':'▶ 开始回放'}</button></div>`;}

  }else if(view==='world'){
   body=countryRows(ctx.groups.filter(g=>g.visited.length))||'<p class="fw-empty">还没有到访记录</p>';
  }else{
   const provinces=new Map();for(const id of ctx.ids){const p=cities.get(id).province;if(!provinces.has(p))provinces.set(p,[]);provinces.get(p).push(id);}
   body=[...provinces].sort((a,b)=>b[1].length-a[1].length).map(([id,ids])=>`<h4>${esc(regions.get(id)?.name)} · ${ids.length} 座城市</h4>${cityRows(ids,'visited')}`).join('')||'<p class="fw-empty">还没有国内到访记录</p>';
  }
  overview.innerHTML=`<h3>${esc(title)}</h3><div class="fw-summary-list">${body}</div>`;
 }
 
 $('[data-fw-land]').innerHTML=(window.FootprintWorldLand||[]).map(p=>`<path d="${p.path}" data-fw-country="${p.id}" role="button" tabindex="0" aria-label="查看${esc(p.name)}的城市"><title>${esc(p.name)}</title></path>`).join('');
 const dialog=document.createElement('dialog');dialog.className='fw-wish-dialog';dialog.setAttribute('aria-labelledby','fw-wish-title');dialog.innerHTML='<div class="fw-dialog-head"><h3 id="fw-wish-title">添加心愿城市</h3><button type="button" data-fw-close aria-label="关闭心愿城市">×</button></div><label class="fw-search"><span aria-hidden="true">⌕</span><input type="search" data-fw-search placeholder="搜索城市或国家" aria-label="搜索心愿城市" autocomplete="off"></label><div class="fw-results" data-fw-results></div><footer><span data-fw-feedback role="status" aria-live="polite"></span><button type="button" data-fw-done>完成</button></footer>';root.append(dialog);
 function openWishes(mode='search',trigger){dialogMode=mode;opener=trigger||$('[data-mm-find-wish]');$('#fw-wish-title').textContent=mode==='all'?'全部心愿城市':'添加心愿城市';$('[data-fw-search]').value='';$('[data-fw-feedback]').textContent='';renderResults();dialog.showModal();$('[data-fw-search]').focus({preventScroll:true});}
 function renderResults(){const wishes=M.snapshot().wishes,q=$('[data-fw-search]').value;let rows=q.trim()?C.search(D.cities,regions,q):dialogMode==='all'?wishes.map(id=>cities.get(id)).filter(Boolean):[];
 const content=rows.slice(0,80).map(c=>`<div class="fw-result"><button type="button" data-fw-locate="${c.id}"><b>${esc(c.name)}</b><small>${esc(regions.get(c.province)?.name)}</small></button><button type="button" class="fw-wish-action" data-fw-wish="${c.id}" aria-pressed="${wishes.includes(c.id)}" aria-label="${wishes.includes(c.id)?'取消':'添加'}${esc(c.name)}心愿">${wishes.includes(c.id)?'✓ 已添加':'＋ 想去'}</button></div>`).join('');
 $('[data-fw-results]').innerHTML=content||`<p class="fw-empty">${q.trim()?'没有找到这座城市，试试英文名称或所属国家。':dialogMode==='all'?'还没有心愿城市':'搜索想去的城市'}</p>`;
 if(rows.length>80)$('[data-fw-results]').insertAdjacentHTML('beforeend','<p class="fw-empty">请输入更完整的城市名称</p>');
 }
 function paintWishes(){const wish=C.wishPage(M.snapshot().wishes,D.cities),strip=$('[data-mm-wishes]');
 $('.mm-wishes').dataset.wishCount=wish.all.length;strip.hidden=!wish.visible.length;
 $('[data-mm-find-wish]').hidden=!!wish.overflow;allWishes.hidden=!wish.overflow;allWishes.innerHTML=`查看全部 <small>${wish.all.length} 个 ›</small>`;
 strip.innerHTML=wish.visible.map(id=>{const c=cities.get(id);return `<div class="fw-wish-card"><button type="button" data-fw-city="${id}"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 22S4 14 4 9a8 8 0 1 1 16 0c0 5-8 13-8 13Z"/><circle cx="12" cy="9" r="3"/></svg></span><span><b>${esc(c.name)}</b><small>${esc(regions.get(c.province)?.name)}</small></span></button><button type="button" class="fw-remove" data-fw-remove="${id}" aria-label="取消${esc(c.name)}心愿">×</button></div>`;}).join('');}
 function applyBox(){svg.style.touchAction=worldBox.w<(countryId?1000:900)?'none':'pan-y';svg.setAttribute('viewBox',`${worldBox.x} ${worldBox.y} ${worldBox.w} ${worldBox.h}`);$('[data-fw-zoom="in"]').disabled=worldBox.w<=45;$('[data-fw-zoom="out"]').disabled=worldBox.w>=(countryId?1000:900);const rect=svg.getBoundingClientRect();svg.style.setProperty('--fw-dot-scale',Math.max(worldBox.w/(rect.width||1000),worldBox.h/(rect.height||460)));$('[data-fw-reset]').setAttribute('aria-label',countryId?'定位当前国家':'返回世界全图');}
 function setBox(cx,cy,w){const r=svg.getBoundingClientRect(),ratio=countryId&&r.width?r.height/r.width:.46;w=Math.max(45,Math.min(countryId?1000:900,w));const h=Math.min(460,w*ratio);worldBox={x:Math.max(0,Math.min(1000-w,cx-w/2)),y:Math.max(0,Math.min(460-h,cy-h/2)),w,h};applyBox();}
 function fitCountry(){if(!countryId){setBox(500,200,900);return;}const g=group(countryId),points=[...new Set([...g.visited,...g.wishes,...g.trip])].map(id=>C.project(cities.get(id).coords)),bounds=C.landExtent(land.get(countryId)?.path);if(bounds)points.push([bounds[0],bounds[1]],[bounds[2],bounds[3]]);if(!points.length){const c=D.cities.find(c=>C.country(c)===countryId);points.push(c?C.project(c.coords):[500,230]);}const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),r=svg.getBoundingClientRect(),ratio=r.height/r.width||.7,x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);setBox((x0+x1)/2,(y0+y1)/2,Math.max(60,(x1-x0)*1.25,(y1-y0)*1.25/ratio));}
 window.FootprintWorldAtlas={async focusReplay(id,signal){
  const c=cities.get(id);if(!c||view!=='world')return false;countryId=C.country(c);countryCity=M.view().replay.step>0;back.hidden=false;
  const [x,y]=C.project(c.coords),r=svg.getBoundingClientRect(),w=200,h=Math.min(460,w*(r.height/r.width||.46)),to={x:Math.max(0,Math.min(1000-w,x-w/2)),y:Math.max(0,Math.min(460-h,y-h/2)),w,h};
  paintWorld();return M.animateCamera({...worldBox},to,box=>{worldBox=box;applyBox();},signal);
 }};
 root.addEventListener('fp:replay-reset',()=>{countryCity=false;countryId='';fromWorld=false;queue();if(view==='world')M.animateCamera({...worldBox},{x:50,y:0,w:900,h:414},box=>{worldBox=box;applyBox();});});
 function changeView(next){if(view==='china'&&!cities.get(A.snapshot().selected)?.world)lastChina=A.snapshot().selected;view=next;countryId='';countryCity=false;fromWorld=false;root.dataset.atlasView=view;root.dispatchEvent(new CustomEvent('fp:scope-change'));stage.hidden=view!=='world';lastSelected=A.snapshot().selected;if(view==='world')setBox(500,200,900);queue();}
 function openCountry(id){if(!id)return;const mapFocused=svg.contains(document.activeElement);if(id==='CHN'){changeView('china');fromWorld=true;back.hidden=false;if(mapFocused)back.focus({preventScroll:true});A.reset();queue();return;}if(view==='china')lastChina=A.snapshot().selected;view='world';root.dataset.atlasView=view;root.dispatchEvent(new CustomEvent('fp:scope-change'));stage.hidden=false;countryId=id;countryCity=false;back.hidden=false;if(mapFocused)back.focus({preventScroll:true});fitCountry();queue();}
 function syncMode(){const mode=M.view().mode;if(mode===lastMode)return;lastMode=mode;countryId='';countryCity=false;fromWorld=false;if(view==='world')setBox(500,200,900);}
 function locate(id){syncMode();if(!cities.has(id))return;const c=cities.get(id);if(!c.world){if(view==='world')openCountry('CHN');lastChina=id;}else{if(view!=='world'||countryId!==C.country(c))openCountry(C.country(c));countryCity=true;const p=C.project(c.coords);setBox(p[0],p[1],worldBox.w);}countryCity=true;lastSelected=id;A.select(id,{reveal:false});queue();}
 function paintWorld(){const snap=A.snapshot(),ctx=context('world'),wishes=ctx.wishes,lit=new Set(Object.keys(ctx.marked)),trip=new Set(ctx.route),all=ctx.groups,visitedCountries=new Set(all.filter(g=>g.visited.length).map(g=>g.id)),plannedCountries=new Set(all.filter(g=>g.trip.length).map(g=>g.id));
 $('[data-fw-land]').querySelectorAll('path').forEach(p=>{p.classList.toggle('is-visited',ctx.mode!=='trip'&&visitedCountries.has(p.dataset.fwCountry));p.classList.toggle('is-planned',ctx.mode==='trip'&&plannedCountries.has(p.dataset.fwCountry));p.classList.toggle('is-country-selected',p.dataset.fwCountry===countryId);p.setAttribute('aria-pressed',String(p.dataset.fwCountry===countryId));});
 const dots=$('[data-fw-dots]'),focused=dots.contains(document.activeElement)?document.activeElement?.closest('[data-fw-city],[data-fw-country]'):null,focusId=focused?.dataset.fwCity,focusCountry=focused?.dataset.fwCountry;
 if(!countryId){const rect=svg.getBoundingClientRect(),scale=Math.max(worldBox.w/(rect.width||1000),worldBox.h/(rect.height||460)),occupied=[];dots.innerHTML=all.filter(g=>g.visited.length||g.wishes.length||g.trip.length).map(g=>{
  const extent=C.landExtent(land.get(g.id)?.path),center=g.id==='CHN'&&extent?[(extent[0]+extent[2])/2,(extent[1]+extent[3])/2]:regions.get('country-'+g.id)?.center||C.project(cities.get([...g.visited,...g.wishes,...g.trip][0]).coords),count=ctx.mode==='trip'?new Set(g.trip).size:g.visited.length,label=countryName(g.id)+' · '+(count?count+' 城':g.wishes.length?'想去':'行程');
  if(!count)return `<g class="fw-country-interest" transform="translate(${center[0]} ${center[1]})" data-fw-country="${g.id}" role="button" tabindex="0" aria-label="${esc(label)}"><title>${esc(label)}</title><g class="fw-point"><circle class="fw-hit" r="11"/><circle class="fw-dot" r="4"/><text x="9" y="-9">${esc(label)}</text></g></g>`;
  const width=label.length*10+20;let x=Math.min(worldBox.x+worldBox.w-width*scale-4*scale,Math.max(worldBox.x+12*scale,center[0])),y=center[1];for(let tries=0;tries<all.length;tries++){if(!occupied.some(b=>x-10*scale<b[2]&&x+(width-10)*scale>b[0]&&y-13*scale<b[3]&&y+13*scale>b[1]))break;y+=29*scale;}occupied.push([x-10*scale,y-13*scale,x+(width-10)*scale,y+13*scale]);
  return `<g class="fw-country-badge ${ctx.mode==='trip'?'is-planned':'is-visited'}" data-fw-country="${g.id}" role="button" tabindex="0" aria-label="${esc(label)}"><line class="fw-badge-leader" x1="${center[0]}" y1="${center[1]}" x2="${x}" y2="${y}"/><circle class="fw-country-anchor" cx="${center[0]}" cy="${center[1]}" r="${3*scale}"/><g transform="translate(${x} ${y})"><g class="fw-point"><rect x="-10" y="-13" rx="5" width="${width}" height="26"/><circle class="fw-dot" r="4"/><text x="10" y="4">${esc(label)}</text></g></g></g>`;
 }).join('');
 }else{const g=group(countryId),ids=new Set([...(ctx.mode==='replay'?D.cities.filter(c=>C.country(c)===countryId&&snap.visited[c.id]).map(c=>c.id):ctx.mode==='trip'?g.trip:[...g.visited,...g.wishes]),...(countryCity?[snap.selected]:[])]);dots.innerHTML=[...ids].filter(id=>cities.has(id)&&C.country(cities.get(id))===countryId).sort((a,b)=>Number(a===snap.selected)-Number(b===snap.selected)).map(id=>{const c=cities.get(id),[x,y]=C.project(c.coords),on=lit.has(id),wish=wishes.includes(id),selected=countryCity&&id===snap.selected;return `<g class="fw-city ${on?'is-visited':''} ${wish?'is-wish':''} ${trip.has(id)?'is-trip':''} ${selected?'is-selected':''}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" data-fw-city="${id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="查看${esc(c.name)}${on?'，已去过':wish?'，想去':''}"><title>${esc(c.name)}</title><g class="fw-point"><circle class="fw-halo" r="12"/><circle class="fw-trip" r="8"/><circle class="fw-dot" r="4"/><circle class="fw-hit" r="10"/><text x="10" y="-9">${esc(c.name)}</text></g></g>`;}).join('');}
 if(focusId)dots.querySelector(`[data-fw-city="${focusId}"]`)?.focus({preventScroll:true});else if(focusCountry)dots.querySelector(`[data-fw-country="${focusCountry}"]`)?.focus({preventScroll:true});
 }
 function render(){const snap=A.snapshot(),city=cities.get(snap.selected),m=M.view();
 syncMode();const replayKey=m.mode==='replay'?m.replay.step+':'+m.replay.finished:'';if(replayKey!==lastReplayKey){lastReplayKey=replayKey;countryCity=m.mode==='replay'&&m.replay.step>0&&!m.replay.finished;if(m.replay?.finished)countryId='';}
 lastSelected=snap.selected;
 root.querySelectorAll('[data-fw-view]').forEach(b=>b.setAttribute('aria-pressed',String(view===b.dataset.fwView)));
 const n=context().summary,prefix=m.mode==='trip'?'本次旅行':m.mode==='replay'&&m.replay.step?'已回顾':'已去过';
 stats.setAttribute('aria-label',(view==='china'?'中国':'全球')+' · '+prefix+'统计');
 stats.innerHTML=`<span class="fw-stat-label">${prefix}</span>`+(view==='world'?`<span><b>${n.regions}</b> 个国家 / 地区</span><span><b>${n.cities}</b> 座城市</span>`:`<span><b>${n.cities}</b> 座国内城市</span><span><b>${n.regions}</b> 个省级地区</span>`);
 // In trip mode, only stops within the chosen map range belong in the city navigation.
 root.querySelectorAll('[data-mm-stop]').forEach(b=>{b.hidden=m.mode!=='trip'||!C.inView(cities.get(b.dataset.mmStop),view);});if(m.mode==='trip'){$('[data-mm-trip-note]').hidden=context().stops.length>0;$('[data-mm-trip-note]').textContent='当前范围暂无行程城市';}
 paintWishes();if(view==='world')applyBox();paintWorld();paintPanel();if(dialog.open)renderResults();}
 function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}
 async function wish(id,on,button){if(busy)return;busy=true;button.disabled=true;try{await M.setWish(id,on);if(dialog.open)$('[data-fw-feedback]').textContent=(on?'已添加 ':'已取消 ')+cities.get(id).name;queue();}catch(error){$('[data-fw-feedback]').textContent=error.message;}finally{busy=false;if(button.isConnected)button.disabled=false;}}
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&view==='world'&&!root.querySelector('dialog[open]')){changeView('world');}});
 root.addEventListener('fp:open-wishes',()=>openWishes());
 root.addEventListener('fp:city-selected',e=>{syncMode();const id=e.detail.id,c=cities.get(id);if(!c)return;if(M.view().mode==='replay'){countryCity=true;lastSelected=id;queue();return;}if(c.world){if(view!=='world'||countryId!==C.country(c))openCountry(C.country(c));}else{if(view==='world')openCountry('CHN');lastChina=id;}countryCity=true;lastSelected=id;queue();});
 root.addEventListener('fp:atlas-change',queue);root.addEventListener('fp:memoir-change',queue);root.addEventListener('fp:memories-change',queue);
 root.addEventListener('click',e=>{const b=e.target.closest('button,[data-fw-city],[data-fw-country]');if(!b)return;
 if(b.dataset.fwView)changeView(b.dataset.fwView);
 else if(b.dataset.fwCity){if(b.closest('.fw-wish-card')&&M.view().mode!=='all')$('[data-mm-mode=all]').click();if(b.dataset.fwStop){const stop=[...root.querySelectorAll('[data-mm-stop]')].find(n=>n.dataset.mmVisitId===b.dataset.fwStop);if(stop)stop.click();else locate(b.dataset.fwCity);}else locate(b.dataset.fwCity);}
 else if(b.hasAttribute('data-fw-all'))openWishes('all',b);
 else if(b.dataset.fwRemove)wish(b.dataset.fwRemove,false,b);
 else if(b.dataset.fwWish)wish(b.dataset.fwWish,!M.snapshot().wishes.includes(b.dataset.fwWish),b);
 else if(b.dataset.fwLocate){dialog.close();locate(b.dataset.fwLocate);}
 else if(b.hasAttribute('data-fw-close')||b.hasAttribute('data-fw-done'))dialog.close();
 else if(b.hasAttribute('data-fw-back-world'))changeView('world');
 else if(b.hasAttribute('data-fw-country-list')){countryCity=false;if(view==='world')fitCountry();queue();}
 else if(b.hasAttribute('data-fw-find-country')){$('[data-fp-open-picker]').click();$('[data-fp-filter="all"]').click();const input=$('[data-fp-search]');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));const select=$('[data-fp-province]');select.value='country-'+countryId;select.dispatchEvent(new Event('change',{bubbles:true}));}
 else if(b.hasAttribute('data-fw-reset')){fitCountry();paintWorld();}
 else if(b.dataset.fwZoom){setBox(worldBox.x+worldBox.w/2,worldBox.y+worldBox.h/2,worldBox.w*(b.dataset.fwZoom==='in'?.7:1.43));paintWorld();}
 else if(b.dataset.fwCountry)openCountry(b.dataset.fwCountry);
 });
 $('[data-fw-search]').addEventListener('input',renderResults);dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();}});dialog.addEventListener('close',()=>{(opener?.isConnected&&!opener.hidden?opener:allWishes.hidden?$('[data-mm-find-wish]'):allWishes)?.focus({preventScroll:true});});
 svg.addEventListener('keydown',e=>{const nation=e.target.closest('[data-fw-country]');if(nation&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openCountry(nation.dataset.fwCountry);return;}const dot=e.target.closest('[data-fw-city]');if(!dot)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();locate(dot.dataset.fwCity);}else if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const nodes=[...svg.querySelectorAll('[data-fw-city]')],i=nodes.indexOf(dot),next=nodes[(i+(e.key==='ArrowRight'?1:-1)+nodes.length)%nodes.length];locate(next.dataset.fwCity);queueMicrotask(()=>svg.querySelector(`[data-fw-city="${next.dataset.fwCity}"]`)?.focus({preventScroll:true}));}});
 let drag=null,suppress=false;svg.addEventListener('pointerdown',e=>{if(e.button!==0||worldBox.w>=(countryId?1000:900))return;drag={x:e.clientX,y:e.clientY,box:{...worldBox},id:e.pointerId,moved:false};});svg.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)<5&&!drag.moved)return;drag.moved=true;svg.setPointerCapture(e.pointerId);const scale=drag.box.w/svg.getBoundingClientRect().width;setBox(drag.box.x+drag.box.w/2-dx*scale,drag.box.y+drag.box.h/2-dy*scale,drag.box.w);});
 function end(e){if(!drag)return;suppress=drag.moved;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);drag=null;if(suppress){setTimeout(()=>{suppress=false;},100);paintWorld();}}svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('click',e=>{if(suppress){e.stopPropagation();e.preventDefault();}},true);
 new ResizeObserver(()=>{if(view==='world'){const m=M.view(),current=m.mode==='replay'&&!m.replay.finished&&m.replay.current;if(current&&!m.replay.moving){const p=C.project(cities.get(current.cityId).coords);setBox(p[0],p[1],200);}else if(countryId&&m.mode!=='replay')fitCountry();else applyBox();paintWorld();}}).observe(stage);
 applyBox();render();
}
window.TravelStorage.whenReady(init);
})();
