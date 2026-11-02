(function(){'use strict';
function init(){
const root=document.getElementById('china-footprints'),C=window.FootprintMemoirCore,A=window.FootprintAtlas;if(!root||!C||!A||root.classList.contains('fp-memoir'))return;
const D=JSON.parse(document.getElementById('china-footprints-data').textContent),cities=new Map(D.cities.map(c=>[c.id,c])),known=new Set(cities.keys()),$=s=>root.querySelector(s),key='travel-footprints:memoir:v1';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
let dataError='',data=C.empty(),mode='all',replayOrder='auto',step=0,finished=false,replayStarted=false,motion=null,moving=false,pendingStep=null,cancelCamera=()=>{},trip='',playing=false,timer=0,queued=false,editorCity='',editorVisit='',activeVisit='',visitDrafts=new Map(),loading=true;
try{const raw=window.TravelStorage.getItem(key);if(raw)data=C.clean(JSON.parse(raw),known);}catch(e){dataError='旅行日期记录暂时无法读取，请先导出备份保留原始数据。';console.warn('Memoir data retained for recovery:',e.message);}
root.classList.add('fp-memoir');
if(window.TravelPreview?.scope?.startsWith('footprints-memoir')){const qa=new URLSearchParams(location.search).get('qa')==='memoir';const notice=document.createElement('p');notice.className='mm-preview-note';notice.innerHTML=qa?'交互测试预览 · 样片与日期仅用于自测，不是你的个人足迹。 <a href="./#china-footprints">打开空白预览 ↗</a>':'独立预览 · 尚未载入你的私人足迹。 <a href="?qa=memoir#china-footprints">查看测试数据演示 ↗</a>';$('.fp-header').before(notice);}

const nav=document.createElement('div');nav.className='mm-navigation';nav.innerHTML='<div class="mm-modes" role="group" aria-label="足迹视图"><button type="button" data-mm-mode="all" aria-pressed="true">全部足迹</button><button type="button" data-mm-mode="trip" aria-pressed="false">本次旅行</button><button type="button" data-mm-mode="replay" aria-pressed="false">足迹回放</button></div><p class="mm-map-key"><span><i class="mm-key-lit"></i>已去过</span><span><i class="mm-key-wish"></i>想去</span><span><i class="mm-key-dim"></i>未去过</span></p>';
$('.fp-header').after(nav);
const controls=document.createElement('div');controls.className='mm-controls';controls.hidden=true;controls.innerHTML='<div data-mm-trip hidden><label class="mm-trip-choice"><span>选择旅行</span><select data-mm-trip-select aria-label="选择某次旅行"></select></label><p data-mm-trip-note></p><div class="mm-stops" data-mm-stops aria-label="旅行中的城市顺序"></div></div>';
const replayTools=document.createElement('div');replayTools.className='mm-replay-player';replayTools.hidden=true;replayTools.innerHTML='<div class="mm-replay-caption" data-mm-caption></div><div class="mm-replay-tools"><button type="button" data-mm-prev aria-label="上一站">‹</button><button type="button" data-mm-play aria-label="播放足迹回放">▶ 播放</button><button type="button" data-mm-next aria-label="下一站">›</button><input type="range" data-mm-progress aria-label="回放进度" min="0" value="0"><span data-mm-step></span></div>';
$('.fp-map-column').append(replayTools);
nav.after(controls);
// The atlas owns a viewport-sized workspace; memories scroll inside its inspector.
const workspace=document.createElement('div');workspace.className='mm-workspace';
$('.fp-header').before(workspace);workspace.append($('.fp-header'),nav,controls,$('.fp-atlas'));
const memoryScroll=document.createElement('div');memoryScroll.className='mm-memory-scroll';
memoryScroll.setAttribute('tabindex','0');memoryScroll.setAttribute('aria-label','城市回忆详情');
$('.fp-panel').prepend(memoryScroll);memoryScroll.append($('.fp-city-context'));
// Keep status feedback and undo beside the detail being edited.
$('.fp-panel-actions').before($('.fp-map-bottom'));
let inspectorCity=root.dataset.fpMemoryCity;
root.addEventListener('fp:atlas-change',()=>{if(inspectorCity!==root.dataset.fpMemoryCity){inspectorCity=root.dataset.fpMemoryCity;memoryScroll.scrollTop=0;}});
$('.fp-legend').hidden=true;
$('[data-fp-open-picker]').textContent='查找 / 点亮城市';
$('[data-fp-search]').placeholder='搜索城市，如北京';
const dateBlock=document.createElement('div');dateBlock.className='mm-city-dates';dateBlock.setAttribute('data-mm-city-dates','');$('[data-fp-selected]').after(dateBlock);
const wishAction=document.createElement('button');wishAction.type='button';wishAction.className='mm-city-wish';wishAction.dataset.mmWishToggle='';$('.fp-city-context').append(wishAction);
const wishes=document.createElement('div');wishes.className='mm-wishes';wishes.innerHTML='<div class="mm-wish-intro"><span>NEXT CHAPTER</span><h3>下一站，想……</h3><p>为下一段故事，留一个位置。</p></div><div data-mm-wishes class="mm-wish-cities"></div><button type="button" class="mm-add-wish" data-mm-find-wish>＋ 添加心愿城市</button>';
$('.fp-wish').before(wishes);
// Keep the original freeform wish available without taking a second large card.
$('.fp-wish-kicker').hidden=true;$('#fp-wish-title').hidden=true;
const editor=document.createElement('section');editor.className='mm-editor';editor.dataset.mmEditor='';editor.innerHTML='<div class="mm-editor-head"><strong>这次到访</strong><select data-mm-visit aria-label="选择到访记录"></select></div><div class="mm-date-fields"><label>开始日期 <input type="date" data-mm-start></label><label>结束日期 <input type="date" data-mm-end></label></div><p class="mm-help">只填写实际到访日期；记不清可以留空。</p><div class="mm-trip-fields"><label>所属旅行 <input type="text" data-mm-trip-name maxlength="60" list="mm-trip-names" placeholder="例如：秋日云南"></label><label>第几站 <input type="number" data-mm-order min="1" max="999" value="1"></label></div><datalist id="mm-trip-names"></datalist><label class="mm-remove-visit" data-mm-remove-label hidden><input type="checkbox" data-mm-remove> 删除这次到访记录（保留城市照片与故事）</label>';
$('.fpm-body').prepend(editor);
// Metadata uses the same local workspace and backup pipeline as footprints and photos.
function persist(next){if(dataError)throw Error(dataError);const checked=C.clean(next,known);window.TravelStorage.setItem(key,JSON.stringify(checked));data=checked;queue();}

function prepared(next){
 if(dataError)throw Error(dataError);const checked=C.clean(next,known),value=JSON.stringify(checked);
 const accept=()=>{data=checked;queue();};
 return{key,value,accept,async commit(){const before=window.TravelStorage.getItem(key);try{window.TravelStorage.setItem(key,value);await window.TravelStorage.flushCache?.();accept();}catch(error){if(before===null)window.TravelStorage.removeItem(key);else window.TravelStorage.setItem(key,before);throw error;}}};
}
function setEditorVisit(id){editorVisit=id;const v=data.visits.find(v=>v.id===id&&v.cityId===editorCity);$('[data-mm-start]').value=v?.startDate||'';$('[data-mm-end]').value=v?.endDate||'';$('[data-mm-trip-name]').value=v?.trip||(mode==='trip'&&trip!==''?trip:'');$('[data-mm-order]').value=v?.order||Math.min(999,Math.max(0,...data.visits.filter(v=>v.trip===$('[data-mm-trip-name]').value).map(v=>v.order))+1);$('[data-mm-remove]').checked=false;const draft=visitDrafts.get(id);if(draft){$('[data-mm-start]').value=draft.start;$('[data-mm-end]').value=draft.end;$('[data-mm-trip-name]').value=draft.trip;$('[data-mm-order]').value=draft.order;$('[data-mm-remove]').checked=draft.remove;}$('[data-mm-remove-label]').hidden=!v;}
window.FootprintMemoir={
 async setWish(id,on){if(!known.has(id))throw Error('未收录这座城市');await prepared({...data,wishes:on?[...new Set([...data.wishes,id])]:data.wishes.filter(x=>x!==id)}).commit();},
 view(){const replay=history(),stops=route();return {mode,lit:mode==='replay'?replay.lit:Object.keys(A.snapshot().visited),route:stops.map(v=>v.cityId),stops,tripName:trip,replay:{...replay,playing,moving}};},
 animateCamera:(...args)=>animateCamera(...args),
 snapshot(){if(dataError)throw Error(dataError);return JSON.parse(JSON.stringify(data));},
 prepareImport(raw){return prepared(C.merge(data,C.clean(raw,known)));},
 async import(raw){await this.prepareImport(raw).commit();},
 allowPin(id){const cityId=id.startsWith('city:')?id.slice(5):'';if(!A.snapshot().visited[cityId])return false;if(mode==='replay')return history().lit.includes(cityId);if(mode==='trip')return route().some(v=>v.cityId===cityId);return true;},
 openEditor(id){visitDrafts.clear();editorCity=id.startsWith('city:')?id.slice(5):'';editor.hidden=!known.has(editorCity);if(editor.hidden)return;const visits=data.visits.filter(v=>v.cityId===editorCity);$('[data-mm-visit]').innerHTML=visits.map(v=>`<option value="${esc(v.id)}">${esc(v.startDate||'时间未记录')}${v.trip?' · '+esc(v.trip):''}</option>`).join('')+'<option value="">＋ 新增一次到访</option>';$('[data-mm-visit]').value=C.currentVisit(data,editorCity,activeVisit,mode==='trip'?trip:'')?.id||'';$('#mm-trip-names').innerHTML=C.trips(data).map(n=>`<option value="${esc(n)}"></option>`).join('');$('[data-mm-start]').max=localToday();$('[data-mm-end]').max=localToday();setEditorVisit($('[data-mm-visit]').value);},
 prepareSave(id){
  if(dataError)throw Error(dataError);if(editor.hidden||id!=='city:'+editorCity)return;
  const changes=new Map(visitDrafts);changes.set(editorVisit,{start:$('[data-mm-start]').value,end:$('[data-mm-end]').value,trip:$('[data-mm-trip-name]').value.trim(),order:$('[data-mm-order]').value,remove:$('[data-mm-remove]').checked});
  let visits=[...data.visits];
  for(const [visitId,draft] of changes){const startDate=draft.start,endDate=draft.end,name=draft.trip.trim(),order=Number(draft.order);
   if((startDate&&startDate>localToday())||(endDate&&endDate>localToday()))throw Error('旅行回忆只记录已经发生的到访，未来计划请留在行程中。');
   visits=visits.filter(v=>v.id!==visitId);
   if(!draft.remove&&(startDate||endDate||name)){const visit={id:visitId||'visit-'+crypto.randomUUID(),cityId:editorCity,startDate,endDate,trip:name,order};visits.push(visit);if(visitId===editorVisit)activeVisit=visit.id;}
  }
  return prepared({...data,visits});
 }
};
function replayVisited(){const visited=A.snapshot().visited;return root.dataset.atlasView==='world'?visited:Object.fromEntries(Object.entries(visited).filter(([id])=>!cities.get(id)?.world));}
function route(){return trip===''?C.currentStops(window.TripData?.snapshot,D.cities,A.snapshot().trip):C.route(data,trip);}
function plan(){return C.journey(data,replayVisited(),D.cities,replayOrder,localToday());}
function history(){return C.journeyFrame(plan(),step,finished);}
function stop(){playing=false;clearTimeout(timer);timer=0;motion?.abort();cancelCamera();motion=null;moving=false;pendingStep=null;}
// Animate only the existing SVG camera; markers and memories update once per stop.
function animateCamera(from,to,apply,signal){cancelCamera();return new Promise(resolve=>{
 if(signal?.aborted)return resolve(false);
 if(matchMedia('(prefers-reduced-motion:reduce)').matches){apply(to);return resolve(true);}
 let frame=0,start=null,done=false;
 const finish=ok=>{if(done)return;done=true;cancelAnimationFrame(frame);signal?.removeEventListener('abort',cancel);resolve(ok);};
 const cancel=()=>finish(false);cancelCamera=cancel;signal?.addEventListener('abort',cancel,{once:true});
 const advance=now=>{if(start===null)start=now;const t=Math.min(1,(now-start)/1000),ease=t*t*(3-2*t),box={};for(const k of ['x','y','w','h'])box[k]=from[k]+(to[k]-from[k])*ease;apply(box);if(t<1)frame=requestAnimationFrame(advance);else finish(true);};
 frame=requestAnimationFrame(advance);
});}
async function goStep(n){
 replayStarted=true;motion?.abort();const task=new AbortController();motion=task;const list=plan().stops;n=Math.max(0,Math.min(n,list.length));finished=false;
 if(!n){step=0;moving=false;queue();root.dispatchEvent(new CustomEvent('fp:replay-reset'));return;}
 const v=list[n-1];pendingStep=n;moving=true;queue();
 const focus=root.dataset.atlasView==='world'?window.FootprintWorldAtlas?.focusReplay:A.focusReplay;
 const arrived=await focus?.(v.cityId,task.signal);
 if(task.signal.aborted||arrived===false)return;
 moving=false;pendingStep=null;motion=null;step=n;activeVisit=v.kind==='time'?v.id:v.visitId||'';
 A.select(v.cityId,{reveal:false});queue();
 if(playing)timer=setTimeout(tick,3000);
}
function complete(){finished=true;playing=false;timer=0;queue();root.dispatchEvent(new CustomEvent('fp:replay-reset'));}
function tick(){if(!playing)return;if(step>=plan().stops.length){complete();return;}goStep(step+1);}
function togglePlayback(){if(playing){stop();queue();return;}if(!plan().stops.length)return;if(finished||step>=plan().stops.length){step=0;finished=false;}playing=true;if(!step)goStep(1);else timer=setTimeout(tick,3000);queue();}

function select(id,visitId,scroll=true){activeVisit=visitId||'';A.select(id,{reveal:scroll});queue();}
function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}
function render(){
 const snap=A.snapshot(),replay=history();step=replay.step;
 root.dataset.mmMode=mode;root.dataset.replayStarted=String(replayStarted);root.dataset.replayState=mode!=='replay'?'off':finished?'complete':moving?'moving':playing?'playing':step?'paused':'ready';
 nav.querySelectorAll('[data-mm-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mmMode===mode)));
 controls.hidden=mode!=='trip';$('[data-mm-trip]').hidden=mode!=='trip';replayTools.hidden=mode!=='replay'||!replayStarted;
 const play=$('[data-mm-play]');play.disabled=!replay.stops.length;play.textContent=playing?'Ⅱ 暂停':finished?'↻ 重播':'▶ 播放';play.setAttribute('aria-label',playing?'暂停足迹回放':'播放足迹回放');
 $('[data-mm-prev]').disabled=step<=1&&!moving;$('[data-mm-next]').disabled=step>=replay.stops.length&&!moving;
 const range=$('[data-mm-progress]');range.max=replay.stops.length;range.value=pendingStep??step;range.disabled=!replay.stops.length;range.setAttribute('aria-valuetext',`${step} / ${replay.stops.length} 站${replay.current?'，'+cities.get(replay.current.cityId).name:''}`);
 $('[data-mm-step]').textContent=`${pendingStep??step} / ${replay.stops.length}`;
 $('[data-mm-caption]').textContent=finished?'回放完成':replay.current?`${replay.current.kind==='time'?'时间回放':'地区漫游'} · ${cities.get(replay.current.cityId).name}`:replay.stops.length?(replay.order==='time'?'按时间回放':'按地区漫游'):'还没有已去过的城市';
 const names=C.trips(data);if(trip!==''&&!names.includes(trip))trip='';$('[data-mm-trip-select]').innerHTML='<option value="">本次行程 · 计划路线</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');$('[data-mm-trip-select]').value=trip;$('.mm-trip-choice').hidden=names.length===0;
 const stops=route();$('[data-mm-trip-note]').hidden=stops.length>0;$('[data-mm-trip-note]').textContent='暂无行程城市';
 $('[data-mm-stops]').innerHTML=stops.map((v,i)=>`<button type="button" data-mm-stop="${esc(v.cityId)}" data-mm-visit-id="${esc(v.id)}" aria-pressed="${snap.selected===v.cityId&&(!activeVisit||activeVisit===v.id)}"><small>${i+1}</small>${esc(cities.get(v.cityId)?.name)}${snap.visited[v.cityId]?'<span aria-label="已去过">✦</span>':''}</button>`).join('');
 const lit=new Set(mode==='replay'?replay.lit:mode==='trip'?stops.map(v=>v.cityId).filter(id=>snap.visited[id]):Object.keys(snap.visited)),routeCities=new Set(stops.map(v=>v.cityId)),litProvinces=new Set([...lit].map(id=>cities.get(id)?.province));
 root.querySelectorAll('[data-fp-dot]').forEach(n=>{const id=n.dataset.fpDot;n.classList.toggle('mm-time-hidden',mode==='replay'&&!lit.has(id));n.classList.toggle('mm-replay-current',mode==='replay'&&!finished&&replay.current?.cityId===id);n.classList.toggle('mm-wished',mode==='all'&&data.wishes.includes(id)&&!snap.visited[id]);n.classList.toggle('mm-route-city',mode==='trip'&&routeCities.has(id));n.classList.toggle('mm-outside-trip',mode==='trip'&&!routeCities.has(id));n.setAttribute('aria-label','查看'+cities.get(id).name+(snap.visited[id]?'，已去过':data.wishes.includes(id)?'，想去':'，未去过'));});
 root.querySelectorAll('[data-fp-area]').forEach(n=>n.classList.toggle('has-visits',litProvinces.has(n.dataset.fpArea)));
 paintRoute(stops);paintCity(snap);
 const wishIds=data.wishes;$('[data-mm-wishes]').innerHTML=wishIds.length?wishIds.slice(0,4).map(id=>`<button type="button" data-mm-wish-city="${id}"><i aria-hidden="true">◇</i>${esc(cities.get(id).name)}<span aria-hidden="true">↗</span></button>`).join(''):'<p>地图上的空心标记，是还没出发的期待。</p>';
 window.ChinaCityMemories?.refreshPins();
 if(loading){loading=false;}
 root.dispatchEvent(new CustomEvent('fp:memoir-change'));
}
function paintRoute(allStops){const stops=allStops.filter(v=>!cities.get(v.cityId)?.world);let g=$('[data-mm-route]');if(!g){g=document.createElementNS('http://www.w3.org/2000/svg','g');g.dataset.mmRoute='';g.setAttribute('aria-hidden','true');$('[data-fp-dots]').before(g);}g.innerHTML='';if(mode!=='trip')return;const points=stops.map(v=>cities.get(v.cityId)?.point).filter(Boolean);const badges=new Map();stops.forEach((v,i)=>{if(!badges.has(v.cityId))badges.set(v.cityId,[]);badges.get(v.cityId).push(v.order||i+1);});g.innerHTML=(points.length>1?`<polyline class="mm-route-line" points="${points.map(p=>p.join(',')).join(' ')}"/>`:'')+[...badges].map(([id,numbers])=>{const [x,y]=cities.get(id).point;return `<g transform="translate(${x-12} ${y-12})"><circle class="mm-route-number" r="${numbers.length>1?12:8}"/><text class="mm-route-label" y="3">${numbers.join('·')}</text></g>`;}).join('');}
function paintCity(snap){const id=root.dataset.fpMemoryCity,city=cities.get(id);dateBlock.hidden=!city;wishAction.hidden=!city;if(!city)return;const visits=data.visits.filter(v=>v.cityId===id),inTrip=mode==='trip'&&trip!==''?visits.filter(v=>v.trip===trip):visits;const kicker=$('.fp-selected-kicker');if(kicker)kicker.textContent=(D.provinces.find(p=>p.id===city.province)?.full||'')+(mode==='trip'&&route().some(v=>v.cityId===id)?trip===''?' · 当前计划':' · 旅行回忆':'');const current=C.currentVisit(data,id,activeVisit,mode==='trip'?trip:'');const date=current?.startDate?current.startDate.replaceAll('-','.')+(current.endDate&&current.endDate!==current.startDate?' — '+current.endDate.replaceAll('-','.'): ''):'时间未记录';dateBlock.innerHTML=`<div class="mm-date-line"><span>${mode==='trip'&&trip===''&&current?.startDate?'历史到访 · ':''}${date}</span><button type="button" data-fpm-open="city:${id}" aria-label="${current?'编辑':'补充'}${esc(city.name)}的到访日期">${current?'编辑日期':'补充日期'}</button></div>${current?.trip?`<p class="mm-trip-tag">${esc(current.trip)} · 第 ${current.order} 站</p>`:''}${visits.length>1?`<label class="mm-city-visit">其他到访 <select data-mm-city-visit aria-label="查看${esc(city.name)}的其他到访">${visits.map(v=>`<option value="${esc(v.id)}" ${v.id===current?.id?'selected':''}>${esc(v.startDate||'时间未记录')}${v.trip?' · '+esc(v.trip):''}</option>`).join('')}</select></label>`:''}`;
 if(visits.length>1)dateBlock.insertAdjacentHTML('beforeend','<p class="mm-trip-tag">城市照片与故事 · 汇集历次到访</p>');
 const record=window.ChinaCityMemories?.snapshot().get('city:'+id);dateBlock.querySelector('button').hidden=!!(record?.note||record?.photos?.length)||!current;
 const wished=data.wishes.includes(id);wishAction.hidden=!!snap.visited[id];wishAction.textContent=wished?'◇ 已在下一站心愿 · 移除':'◇ 加入下一站心愿';wishAction.setAttribute('aria-pressed',String(wished));
}
root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.mmMode){stop();mode=b.dataset.mmMode;step=0;finished=false;replayStarted=false;activeVisit='';queue();if(mode==='replay')root.dispatchEvent(new CustomEvent('fp:replay-reset'));}
 else if(b.hasAttribute('data-mm-play')||b.hasAttribute('data-mm-start-replay'))togglePlayback();
 else if(b.hasAttribute('data-mm-prev')||b.hasAttribute('data-mm-next')){stop();goStep(step+(b.hasAttribute('data-mm-prev')?-1:1));}
 else if(b.hasAttribute('data-mm-stop'))select(b.dataset.mmStop,b.dataset.mmVisitId);
 else if(b.hasAttribute('data-mm-wish-city')){stop();mode='all';select(b.dataset.mmWishCity);}
 else if(b.hasAttribute('data-mm-find-wish'))root.dispatchEvent(new CustomEvent('fp:open-wishes'));
 else if(b.hasAttribute('data-mm-wish-toggle')){const id=root.dataset.fpMemoryCity;if(!known.has(id)||A.snapshot().visited[id])return;window.FootprintMemoir.setWish(id,!data.wishes.includes(id)).catch(error=>{$('[data-fp-status]').textContent=error.message;});}
 else if(b.hasAttribute('data-fp-open-picker'))$('#fp-city-picker-title').textContent='查找与点亮城市';
});
// User inspection pauses playback without changing any footprint record.
root.addEventListener('pointerdown',e=>{if(mode==='replay'&&e.target.closest('.fp-stage,.fw-stage,.fw-back-world')){stop();queue();}},true);
root.addEventListener('click',e=>{if(mode==='replay'&&(playing||moving)&&!e.target.closest('[data-mm-start-replay],[data-mm-order-mode]')&&e.target.closest('.fp-panel')){stop();queue();}},true);
root.addEventListener('keydown',e=>{if(mode==='replay'&&e.target.closest('.fp-stage,.fw-stage')){stop();queue();}},true);
root.addEventListener('change',e=>{if(e.target.matches('[data-mm-order-mode]')){stop();replayOrder=e.target.value;step=0;finished=false;queue();root.dispatchEvent(new CustomEvent('fp:replay-reset'));}});
// Choosing a city in the picker should reveal its memories immediately.
root.addEventListener('click',e=>{if(e.target.closest('[data-fp-select]'))$('[data-fp-city-picker]').close();});
$('[data-mm-progress]').addEventListener('input',e=>{stop();goStep(Number(e.target.value));});
$('[data-mm-progress]').addEventListener('keydown',e=>{if(!['Home','End','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const current=pendingStep??step,n=e.key==='Home'?0:e.key==='End'?plan().stops.length:current+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1);stop();goStep(n);});
$('[data-mm-trip-select]').addEventListener('change',e=>{trip=e.target.value;activeVisit='';const v=route()[0];if(v)select(v.cityId,v.id,false);queue();});
$('[data-mm-visit]').addEventListener('change',e=>{visitDrafts.set(editorVisit,{start:$('[data-mm-start]').value,end:$('[data-mm-end]').value,trip:$('[data-mm-trip-name]').value,order:$('[data-mm-order]').value,remove:$('[data-mm-remove]').checked});setEditorVisit(e.target.value);});
root.addEventListener('change',e=>{if(e.target.matches('[data-mm-city-visit]')){activeVisit=e.target.value;queue();}});
$('[data-mm-trip-name]').addEventListener('change',()=>{if(!editorVisit)$('[data-mm-order]').value=Math.min(999,Math.max(0,...data.visits.filter(v=>v.trip===$('[data-mm-trip-name]').value.trim()).map(v=>v.order))+1);});
root.addEventListener('fp:scope-change',()=>{stop();step=0;finished=false;replayStarted=false;activeVisit='';queue();});
root.addEventListener('fp:atlas-change',queue);root.addEventListener('fp:memories-change',queue);
window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();queue();}});
window.addEventListener('storage',e=>{if(e.key===key||e.key===null){try{data=C.clean(JSON.parse(window.TravelStorage.getItem(key)||JSON.stringify(C.empty())),known);stop();queue();}catch(_){}}});
render();if(dataError)$('[data-fp-status]').textContent=dataError;
}
window.TravelStorage.whenReady(init);
})();
