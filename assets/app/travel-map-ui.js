/* My Travel Map shares the official catalogue and DailyPlan persistence. */
(function () {
  'use strict';
  const C = window.TravelMapCore;
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shortDate = value => `${Number(value.slice(5,7))}/${Number(value.slice(8,10))}`;
  const slotNames = {morning:'上午',afternoon:'下午',evening:'晚上'};
  const kinds = {sight:'景点',food:'美食',experience:'体验',shopping:'购物',manual:'地点',transport:'交通',flight:'飞机',train:'火车',car:'驾车',bus:'大巴',other:'交通',stay:'住宿',hotel:'住宿'};
  let dialog, scheduleDialog, adapter, adapterPromise, observer, snapshot, resolver;
  let city='', mode='all', date='', selected='', opener, bodyOverflow, editing=null;
  let poiOpen=false, searching=false, candidates=[], query='', message='', epoch=0;
  let resizeTimer;
  let pendingRender=false, fitAfterResolution=false, feedback='',feedbackTimer;
  let adding=false,pickMode=false,chosen=-1,draftCity='',draftName='',saveAction='wish',saving=false,editExpected=null;
  const $ = id => document.getElementById('tm-'+id);
  const visits = p => C.tripVisits(p,snapshot.trip).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order);
  const located = p => adapter ? adapter.isLocated(p) : p.confirmed && ['WGS84','GCJ02'].includes(p.coordinateSystem);
  const locationState = p => located(p)?'matched':resolver?resolver.state(p,snapshot.trip.id):!adapter?'matching':'failed';
  const locationLabel = p => ({matching:'正在定位…',failed:'暂未定位',pending:'位置待确认'})[locationState(p)]||'位置待确认';
  const rows = () => C.mapPlaces(snapshot.places,{city,mode,date,trip:snapshot.trip}).sort((a,b)=> mode==='day' ? visits(a).find(v=>v.date===date).order-visits(b).find(v=>v.date===date).order : 0);
  const timeLabel = v => v.start && v.end ? `${v.start}—${v.end}` : v.start || (v.fixed&&v.label) || slotNames[v.slot] || '时间待定';
  function photoURL(value) {
    if(typeof value!=='string'||!value)return '';
    try {const url=new URL(value,location.href);return ['http:','https:','blob:'].includes(url.protocol)||/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value)?value:'';}catch(_){return '';}
  }
  function clearSearch(){poiOpen=false;adding=false;pickMode=false;chosen=-1;draftName='';searching=false;candidates=[];query='';message='';epoch++;adapter?.setPicking?.(false);adapter?.clearPreview?.();dialog?.classList.remove('tm-picking');}
  function notify(value){clearTimeout(feedbackTimer);feedback=value;if(value)feedbackTimer=setTimeout(()=>notify(''),5000);const el=$('feedback');if(el){el.textContent=value;el.hidden=!value;}}
  function refreshData(){
    const previous=snapshot,oldPlace=previous?.places.find(p=>p.id===selected);
    snapshot=window.TravelMapData.snapshot();
    if(!snapshot?.trip||!snapshot.days?.length)throw Error('请先在每日行程中设置旅行日期。');
    const nextPlace=snapshot.places.find(p=>p.id===selected),tripChanged=previous&&previous.trip.id!==snapshot.trip.id;
    if(tripChanged||(oldPlace&&(!nextPlace||oldPlace.name!==nextPlace.name||oldPlace.cityId!==nextPlace.cityId))){clearSearch();if(scheduleDialog?.open)scheduleDialog.close();}
    if(tripChanged)feedback='旅行已更新，地图已同步到当前行程。';
    if(!snapshot.days.some(d=>d.date===date))date=snapshot.days[0].date;
    if(city&&!snapshot.cities.some(c=>c.id===city))city='';
    adapter?.setCities?.(snapshot.cities);
  }
  function createUI(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='travel-map-dialog';dialog.className='tm-app';dialog.setAttribute('aria-labelledby','tm-title');
    dialog.innerHTML=`<header class="tm-header"><div><h2 id="tm-title">我的旅行地图</h2><p class="tm-subtitle">把想去的地方，慢慢走成自己的旅行。</p></div><button type="button" class="tm-close" data-tm-close aria-label="关闭旅行地图">×</button></header>
    <div class="tm-body"><p id="tm-feedback" class="tm-feedback" role="status" hidden></p><div class="tm-toolbar"><nav id="tm-cities" aria-label="地图城市"></nav><div class="tm-view-controls"><nav id="tm-modes" aria-label="地图查看模式"><button type="button" data-tm-mode="all" aria-pressed="true">⌖ 全部地点</button><button type="button" data-tm-mode="day" aria-pressed="false">某日行程</button></nav><div id="tm-date-field" hidden><span id="tm-date-label">行程日期</span><details id="tm-date-picker"><summary aria-labelledby="tm-date-label tm-date-value" aria-haspopup="listbox" aria-controls="tm-date"><span id="tm-date-value"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div id="tm-date" role="listbox" aria-labelledby="tm-date-label"></div></details></div></div><button type="button" id="tm-add" class="tm-add" data-tm-add>＋ 添加地点</button></div><div class="tm-map-heading"><p id="tm-count" role="status"></p></div><p id="tm-route-status" class="tm-route-status" hidden></p>
    <div class="tm-atlas"><section class="tm-map-column" aria-label="地点分布"><div class="tm-map-frame"><div id="tm-map" aria-label="我的旅行地点地图"></div><p id="tm-map-network" class="tm-map-network" role="status"></p></div><button type="button" id="tm-pick-cancel" data-tm-pick-cancel hidden>完成选点</button></section><aside id="tm-sidebar" class="tm-sidebar" aria-label="地点与安排"><button type="button" class="tm-sheet-handle" data-tm-sheet aria-label="展开地点详情" aria-expanded="false"><span></span></button><div class="tm-side-scroll"><div id="tm-detail" class="tm-detail" tabindex="-1" aria-label="地点详情"></div><section id="tm-place-list"><h3 id="tm-list-title">我的地点</h3><div id="tm-places" aria-label="地图地点列表"></div></section></div></aside></div></div>`;
    scheduleDialog=document.createElement('dialog');scheduleDialog.id='travel-map-schedule';scheduleDialog.className='tm-app tm-schedule';scheduleDialog.setAttribute('aria-labelledby','tm-schedule-title');
    scheduleDialog.innerHTML=`<header class="tm-header"><h2 id="tm-schedule-title">安排到日程</h2><button type="button" class="tm-close" data-tm-schedule-close aria-label="关闭安排窗口">×</button></header><form id="tm-schedule-form"><div class="tm-fields"><label class="tm-field-wide">日期<select id="tm-edit-day" required></select></label><label class="tm-field-wide">时段<select id="tm-edit-slot"><option value="morning">上午</option><option value="afternoon">下午</option><option value="evening">晚上</option></select></label><label>开始时间 <span>选填</span><input id="tm-edit-start" type="time"></label><label>结束时间 <span>选填</span><input id="tm-edit-end" type="time"></label><p id="tm-form-status" class="tm-form-status tm-field-wide" role="status"></p></div><div class="tm-form-actions"><button type="button" data-tm-schedule-close>取消</button><button type="submit" class="tm-primary" id="tm-save">保存安排</button></div></form>`;
    document.body.append(dialog,scheduleDialog);
    dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();if(poiOpen){e.preventDefault();clearSearch();render(true);}}});
    scheduleDialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
    dialog.addEventListener('close',()=>{
      clearSearch();if(scheduleDialog.open)scheduleDialog.close();document.body.style.overflow=bodyOverflow||'';
      const focus=opener?.isConnected?opener:document.getElementById('dp-route-map');focus?.focus({preventScroll:true});
    });
    scheduleDialog.addEventListener('close',()=>{editing=null;});
    dialog.addEventListener('click',onClick);
    let sheetStart;const handle=dialog.querySelector('[data-tm-sheet]');handle.addEventListener('pointerdown',e=>{sheetStart=e.clientY;handle.setPointerCapture?.(e.pointerId);});handle.addEventListener('pointerup',e=>{if(sheetStart!==undefined&&Math.abs(e.clientY-sheetStart)>30){setSheet(e.clientY<sheetStart);handle.dataset.dragged='true';setTimeout(()=>delete handle.dataset.dragged,0);e.preventDefault();}sheetStart=undefined;});
    dialog.addEventListener('submit',onSearch);
    dialog.addEventListener('input',e=>{
      if(e.target.id==='tm-new-name'){draftName=e.target.value;return;}
      if(e.target.id!=='tm-poi-query')return;query=e.target.value;epoch++;searching=false;candidates=[];chosen=-1;message='';adapter?.clearPreview?.();renderCandidates();const submit=$('poi-form')?.querySelector('[type=submit]');if(submit){submit.disabled=false;submit.textContent='搜索';}
    });
    dialog.addEventListener('change',e=>{if(e.target.id==='tm-new-city'){draftCity=e.target.value;epoch++;candidates=[];chosen=-1;message='';adapter?.clearPreview?.();adapter?.render([],null,{fit:true,city:draftCity});renderDetail();}if(e.target.id==='tm-save-action')saveAction=e.target.value;});
    dialog.addEventListener('error',e=>{if(e.target.tagName==='IMG'&&!e.target.closest('.tm-photo'))e.target.hidden=true;},true);
    dialog.addEventListener('click',e=>{if(!e.target.closest('#tm-date-picker'))$('date-picker').open=false;});
    $('date-picker').addEventListener('keydown',onDateKey);
    $('date-picker').addEventListener('toggle',()=>{if($('date-picker').open)revealDateOption($('date').contains(document.activeElement)?document.activeElement:$('date').querySelector('[aria-selected=true]'));});
    $('date-picker').addEventListener('focusout',e=>{if(e.relatedTarget&&!$('date-picker').contains(e.relatedTarget))$('date-picker').open=false;});
    $('date').addEventListener('click',e=>{const option=e.target.closest('[data-tm-date]');if(!option)return;date=option.dataset.tmDate;if(city&&!snapshot.days.find(d=>d.date===date)?.cityIds.includes(city))city=snapshot.days.find(d=>d.date===date)?.cityId||'';$('date-picker').open=false;clearSearch();render(true);$('date-picker').querySelector('summary').focus({preventScroll:true});});
    scheduleDialog.querySelectorAll('[data-tm-schedule-close]').forEach(b=>b.addEventListener('click',()=>scheduleDialog.close()));
    $('schedule-form').addEventListener('submit',saveSchedule);
    observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!dialog.open||!adapter)return;adapter.resize();if(!poiOpen)adapter.render(rows(),selected,{fit:true,city,labels:pinLabels()}).catch(()=>{});else if(chosen>=0)adapter.preview?.(candidates[chosen]);},180);});observer.observe($('map'));
  }
  function revealDateOption(option){
    if(!option)return;const list=$('date');
    if(option.offsetTop<list.scrollTop)list.scrollTop=option.offsetTop;
    else if(option.offsetTop+option.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=option.offsetTop+option.offsetHeight-list.clientHeight;
  }
  function onDateKey(e){
    const picker=$('date-picker'),options=[...$('date').querySelectorAll('[data-tm-date]')];
    if(e.key==='Escape'&&picker.open){e.preventDefault();e.stopPropagation();picker.open=false;picker.querySelector('summary').focus({preventScroll:true});return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||!options.length)return;
    e.preventDefault();const wasOpen=picker.open;picker.open=true;
    let index=options.indexOf(document.activeElement);
    if(e.key==='Home')index=0;else if(e.key==='End')index=options.length-1;
    else if(index<0||!wasOpen)index=Math.max(0,options.findIndex(b=>b.dataset.tmDate===date));
    else index=Math.max(0,Math.min(options.length-1,index+(e.key==='ArrowDown'?1:-1)));
    options.forEach((b,i)=>b.tabIndex=i===index?0:-1);options[index].focus({preventScroll:true});revealDateOption(options[index]);
  }
  function renderControls(list){
    $('cities').innerHTML=[{id:'',name:'全部城市'},...snapshot.cities].map(c=>`<button type="button" data-tm-city="${E(c.id)}" aria-pressed="${city===c.id}">${E(c.name)}</button>`).join('');
    dialog.querySelectorAll('[data-tm-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tmMode===mode)));
    $('date-field').hidden=mode!=='day';
    if(mode!=='day')$('date-picker').open=false;
    const focusedDate=document.activeElement?.dataset.tmDate;
    const dateCount=value=>C.dayEntries(snapshot.places,{trip:snapshot.trip,date:value,city}).length;
    $('date-value').innerHTML=`<span>${shortDate(date)} · D${snapshot.days.findIndex(d=>d.date===date)+1}</span><small>${dateCount(date)} 处地点</small>`;
    $('date').innerHTML=snapshot.days.map(d=>`<button type="button" role="option" data-tm-date="${E(d.date)}" aria-label="${E(d.date)} · ${dateCount(d.date)} 处地点" aria-selected="${d.date===date}" tabindex="${d.date===date?0:-1}"><span>${E(d.date)}</span><small>${dateCount(d.date)} 处地点</small><span class="tm-date-check" aria-hidden="true">${d.date===date?'✓':''}</span></button>`).join('');
    if(focusedDate&&$('date-picker').open){const option=[...$('date').children].find(b=>b.dataset.tmDate===focusedDate);if(option){[...$('date').children].forEach(b=>b.tabIndex=b===option?0:-1);option.focus({preventScroll:true});revealDateOption(option);}}
    const known=list.filter(located).length,matching=list.filter(p=>locationState(p)==='matching').length,failed=list.filter(p=>locationState(p)==='failed').length,pending=list.length-known-matching-failed;
    $('count').textContent=[`${list.length} 个${mode==='all'?' My Pick 地点':'当天地点'}`,`${known} 处已定位`,matching?`${matching} 处正在定位`:null,pending?`${pending} 处待确认`:null,failed?`${failed} 处暂未定位`:null].filter(Boolean).join(' · ');
    const issues=C.route(list.map(p=>({...p,visits:C.tripVisits(p,snapshot.trip)})),date).issues;
    const warning=issues.some(i=>/时间冲突|时间不一致/.test(i.reason))?'当天有时间冲突，请在日程中检查。':'';
    $('route-status').textContent=warning;$('route-status').hidden=mode!=='day'||!warning;
  }
  function dayEntries(){return C.dayEntries(snapshot.places,{trip:snapshot.trip,date,city});}
  function pinLabels(){const labels={};if(mode==='day')dayEntries().forEach((entry,i)=>{labels[entry.place.id]=labels[entry.place.id]?labels[entry.place.id]+'·'+(i+1):String(i+1);});return labels;}
  function renderPlaces(list){
    $('place-list').hidden=poiOpen;
    $('list-title').textContent=mode==='day'?'当日行程 · '+shortDate(date):'我的地点 · '+list.length;
    const entries=mode==='day'?dayEntries():list.map(place=>({place}));
    $('places').innerHTML=entries.map(({place:p,visit},i)=>{const photo=photoURL(p.photo);return `<button type="button" class="tm-place-chip" data-tm-place="${E(p.id)}" aria-pressed="${selected===p.id}">${mode==='day'?`<span class="tm-order">${i+1}</span>`:''}${photo?`<img src="${E(photo)}" alt="" loading="lazy">`:''}<span><b>${E(p.name)}</b><small>${visit?E(timeLabel(visit)):!located(p)?locationLabel(p):visits(p).length?'已安排':'未安排'}</small></span></button>`;}).join('')||`<p class="tm-empty">${mode==='day'?'这一天还没有地点安排。':'还没有想去的地点，试试添加一个。'}</p>`;
  }
  function fitDetailPhoto(p){
    const img=$('detail').querySelector('.tm-photo img');if(!img)return;
    const frame=img.parentElement;
    const fit=()=>{
      if(!img.naturalWidth)return;
      const compact=img.naturalWidth<480||img.naturalHeight<260;
      frame.classList.toggle('tm-photo-compact',compact);
      // Use intrinsic proportions and never enlarge a small guide crop.
      img.style.maxWidth=img.naturalWidth+'px';
    };
    img.addEventListener('load',fit);if(img.complete)fit();
    img.addEventListener('error',()=>{
      const fallback=photoURL(p.photoFallback);
      if(fallback&&img.getAttribute('src')!==fallback){img.src=fallback;return;}
      frame.className='tm-photo tm-photo-unavailable';frame.textContent='照片暂不可用';
    });
  }
  function setSheet(expanded){dialog.classList.toggle('tm-sheet-expanded',expanded);const handle=dialog.querySelector('[data-tm-sheet]');handle.setAttribute('aria-expanded',String(expanded));handle.setAttribute('aria-label',expanded?'收起地点详情':'展开地点详情');}
  function searchPlace(){if(!adding)return editExpected;const c=snapshot.cities.find(c=>c.id===draftCity);return c?{name:draftName||query,cityId:c.id,city:c.name}:null;}
  function renderCandidates(){
    if(!$('poi-results'))return;
    $('poi-message').textContent=message;
    $('poi-results').innerHTML=candidates.map((c,i)=>`<button type="button" class="tm-candidate" data-tm-preview="${i}" aria-pressed="${i===chosen}"><span class="tm-candidate-dot" aria-hidden="true">${i===chosen?'●':'⌖'}</span><span><b>${E(c.name)}</b><small>${E(c.address||c.city)}</small></span></button>`).join('');
    $('confirm-location').disabled=chosen<0||saving;
    $('new-name-field').hidden=!adding||!candidates[chosen]?.manual;
  }
  function renderDetail(){
    $('place-list').hidden=poiOpen;
    $('pick-cancel').hidden=!pickMode;
    if(poiOpen){
      const active=document.activeElement?.id,caret=document.activeElement?.selectionStart;
      $('detail').innerHTML=`<section class="tm-search-panel"><header class="tm-panel-heading"><h3>${adding?'添加地点':'修改位置'}</h3><button type="button" data-tm-search-cancel aria-label="取消位置编辑">×</button></header>${!adding?`<p class="tm-editing-name">${E(editExpected?.name)}</p>`:''}${adding&&!city?`<label class="tm-search-city">城市<select id="tm-new-city">${snapshot.cities.map(c=>`<option value="${E(c.id)}" ${c.id===draftCity?'selected':''}>${E(c.name)}</option>`).join('')}</select></label>`:''}<form id="tm-poi-form"><div class="tm-search-fields"><input id="tm-poi-query" type="search" aria-label="搜索地点名称或地址" value="${E(query)}" placeholder="搜索地点名称或地址" maxlength="120" required><button type="submit" ${searching?'disabled':''}>${searching?'搜索中…':'搜索'}</button></div></form><button type="button" class="tm-pick-button" data-tm-pick ${adapter?.pick?'':'disabled'} aria-pressed="${pickMode}">⌖ ${pickMode?'正在地图上选点':'在地图上选点'}</button><p id="tm-poi-message" role="status">${E(message)}</p><div id="tm-poi-results"></div><label id="tm-new-name-field" class="tm-new-name" hidden>地点名称<input id="tm-new-name" value="${E(draftName)}" maxlength="180" placeholder="给这个位置起个名字"></label><div class="tm-confirm-footer">${adding?`<label class="tm-add-action">添加后<select id="tm-save-action"><option value="wish" ${saveAction==='wish'?'selected':''}>加入 My Pick</option><option value="schedule" ${saveAction==='schedule'?'selected':''}>加入并安排日程</option></select></label>`:''}<button type="button" class="tm-primary" id="tm-confirm-location" data-tm-confirm>${saving?'正在保存…':adding?'确认添加地点':'确认修改位置'}</button></div></section>`;
      renderCandidates();if(active&&$(active.replace(/^tm-/,''))){const field=document.getElementById(active);field.focus({preventScroll:true});if(typeof caret==='number'&&field.type!=='search')try{field.setSelectionRange(caret,caret);}catch(_){}}
      return;
    }
    const p=rows().find(p=>p.id===selected);
    if(!p){$('detail').innerHTML=`<div class="tm-empty-detail"><h3>${mode==='day'?'留一点空白给旅行':'添加一个想去的地方'}</h3><p>${mode==='day'?'切换日期，或为这一天添加安排。':'搜索地点或直接在地图上选点。'}</p><button type="button" data-tm-add>＋ 添加地点</button></div>`;return;}
    const all=visits(p),relevant=mode==='day'?all.filter(v=>v.date===date):all,v=relevant[0],photo=photoURL(p.photo);
    $('detail').innerHTML=`<article class="tm-detail-content"><div class="tm-place-overview">${photo?`<div class="tm-photo"><img src="${E(photo)}" alt="${E(p.name)}" decoding="async"></div>`:''}<div><p class="tm-detail-meta">${E(kinds[p.kind]||'地点')} · ${E(p.city)}</p><h3>${E(p.name)}</h3><p class="tm-intro">${E(p.intro||'把这个地方留在旅行里，慢慢发现。')}</p></div></div><p class="tm-arrangement">${v?`已安排 · ${shortDate(v.date)} · ${E(timeLabel(v))}${relevant.length>1?` 等 ${relevant.length} 次安排`:''}`:'本次旅行尚未安排'}</p><div class="tm-detail-actions"><button type="button" class="tm-primary tm-main-action" ${v?'data-tm-view-day':'data-tm-arrange'}>${v?'查看日程':'安排到日程'} <span aria-hidden="true">→</span></button><button type="button" class="tm-edit-location" data-tm-search-open ${adapter?'':'disabled'}>${located(p)?'修改位置':'确认位置'}</button></div></article>`;
    fitDetailPhoto(p);
  }
  function render(fit=false){
    if(!dialog?.open)return;
    try {refreshData();const list=rows();resolver?.resolve(list,snapshot.trip.id);if(!list.some(p=>p.id===selected))selected=list[0]?.id||'';renderControls(list);renderPlaces(list);renderDetail();notify(feedback);
      adapter?.render(list,selected,{fit:fit&&!poiOpen,city,labels:pinLabels()}).catch(()=>{$('map-network').textContent='地图暂未更新，地点列表仍可使用。';});
    }catch(error){notify(error.message||'暂时无法读取行程，请关闭地图后重试。');}
  }
  function select(id,fromMap=false){
    if(!rows().some(p=>p.id===id))return;selected=id;clearSearch();render();if(!fromMap)adapter?.focus(id);
    const chip=[...$('places').querySelectorAll('[data-tm-place]')].find(b=>b.dataset.tmPlace===id);
    $('sidebar').querySelector('.tm-side-scroll').scrollTop=0;if(fromMap)setSheet(false);
  }
  function openSchedule(p){
    refreshData();const available=snapshot.days.filter(d=>!p.cityId||(d.cityIds||[d.cityId,...(d.locationIds||[])]).includes(p.cityId));
    if(!available.length){notify('当前行程还没有这个城市的日期，请先在交通与住宿中调整行程。');return;}
    editing={placeId:p.id,tripId:snapshot.trip.id};
    $('schedule-title').textContent='安排到日程 · '+p.name;
    $('edit-day').innerHTML=available.map(d=>`<option value="${E(d.id)}">${E(d.date)}${d.cityName||d.city?' · '+E(d.cityName||d.city):''}</option>`).join('');
    $('edit-day').value=available.find(d=>d.date===date)?.id||available[0].id;
    $('edit-start').value='';$('edit-end').value='';$('edit-slot').value='afternoon';$('form-status').textContent='';$('save').disabled=false;scheduleDialog.showModal();
  }
  async function saveSchedule(e){
    e.preventDefault();if(!editing)return;const request={...editing,dayId:$('edit-day').value,start:$('edit-start').value,end:$('edit-end').value,slot:$('edit-slot').value};
    $('save').disabled=true;
    try{await window.TravelMapData.schedule(request);refreshData();date=snapshot.days.find(d=>d.id===request.dayId)?.date||date;mode='day';selected=request.placeId;city=snapshot.places.find(p=>p.id===selected)?.cityId||'';scheduleDialog.close();clearSearch();notify('已加入每日行程。');render(true);}
    catch(error){$('form-status').textContent=error.message||'保存失败，请重试。';}finally{$('save').disabled=false;}
  }
  function openSearch(isNew){
    clearSearch();poiOpen=true;adding=isNew;saveAction='wish';saving=false;editExpected=snapshot.places.find(p=>p.id===selected);draftCity=city||editExpected?.cityId||snapshot.cities[0]?.id||'';query=isNew?'':editExpected?._place?.locationQuery||editExpected?.name||'';setSheet(true);renderDetail();$('sidebar').querySelector('.tm-side-scroll').scrollTop=0;$('poi-query')?.focus({preventScroll:true});
  }
  async function onPick(pos){
    if(!poiOpen||!pickMode||saving)return;const p=searchPlace();if(!p)return;const current=++epoch;message='正在读取选点地址…';renderDetail();
    try{const candidate=await adapter.pick(p,pos);if(current!==epoch)return;candidates=[candidate];chosen=0;message='';adapter.preview(candidate);if(adding)draftName=draftName||query;pickMode=false;adapter.setPicking(false);dialog.classList.remove('tm-picking');setSheet(true);renderDetail();}
    catch(error){if(current===epoch){message=error.message;setSheet(true);renderDetail();}}
  }
  async function onClick(e){
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-tm-close')){dialog.close();return;}
    if(b.hasAttribute('data-tm-sheet')){if(b.dataset.dragged)return;setSheet(!dialog.classList.contains('tm-sheet-expanded'));return;}
    if(b.hasAttribute('data-tm-city')){city=b.dataset.tmCity;clearSearch();if(mode==='day'&&!snapshot.days.find(d=>d.date===date)?.cityIds.includes(city)&&city)date=snapshot.days.find(d=>d.cityIds.includes(city))?.date||date;setSheet(false);render(true);return;}
    if(b.hasAttribute('data-tm-mode')){mode=b.dataset.tmMode;clearSearch();setSheet(false);render(true);return;}
    if(b.hasAttribute('data-tm-place')){select(b.dataset.tmPlace);return;}
    if(b.hasAttribute('data-tm-add')){openSearch(true);return;}
    if(b.hasAttribute('data-tm-search-cancel')){clearSearch();render(true);return;}
    if(b.hasAttribute('data-tm-pick-cancel')){pickMode=false;adapter?.setPicking(false);dialog.classList.remove('tm-picking');setSheet(true);renderDetail();return;}
    if(b.hasAttribute('data-tm-pick')){pickMode=!pickMode;adapter?.setPicking(pickMode);dialog.classList.toggle('tm-picking',pickMode);setSheet(!pickMode);message=pickMode?'点击地图选择位置':'';renderDetail();return;}
    if(b.hasAttribute('data-tm-preview')){chosen=Number(b.dataset.tmPreview);pickMode=false;adapter?.setPicking(false);dialog.classList.remove('tm-picking');message='';adapter?.preview?.(candidates[chosen]);renderCandidates();return;}
    if(b.hasAttribute('data-tm-confirm')){
      if(saving||chosen<0)return;const p=searchPlace(),candidate=candidates[chosen];if(!p||!candidate)return;
      if(adding&&candidate.manual&&!draftName.trim()){message='请给这个位置填写名称。';renderDetail();$('new-name').focus();return;}
      saving=true;const current=epoch,tripId=snapshot.trip.id,isNew=adding,action=saveAction;renderCandidates();
      try{const confirmed={...adapter.confirm(p,candidate),name:isNew?(candidate.manual?draftName.trim():candidate.name):p.name,cityId:p.cityId,city:p.city,locationQuery:query,locationName:candidate.manual?draftName||p.name:candidate.name};
        const result=isNew?await window.TravelMapData.addPlace(confirmed,tripId):await window.TravelMapData.confirmLocation(p.id,confirmed,tripId,p);
        if(current!==epoch)return;clearSearch();refreshData();if(isNew){selected=result.sourceId;city=p.cityId;mode='all';}notify(isNew?(result.existing?'已使用已有地点，收藏和日程已保留。':'地点已加入 My Pick。'):'位置已更新。');render(true);$('sidebar').querySelector('.tm-side-scroll').scrollTop=0;adapter?.focus(selected);setSheet(false);if(isNew&&action==='schedule'){const added=snapshot.places.find(p=>p.id===selected);if(added)openSchedule(added);}
      }catch(error){if(current===epoch){message=error.message||'保存失败，请重试。';saving=false;renderDetail();}}finally{saving=false;}
      return;
    }
    const p=rows().find(p=>p.id===selected);if(!p)return;
    if(b.hasAttribute('data-tm-arrange')){openSchedule(p);return;}
    if(b.hasAttribute('data-tm-view-day')){const v=visits(p).find(v=>mode!=='day'||v.date===date);if(v){dialog.close();window.TravelMapData.openDay(v.dayId);}return;}
    if(b.hasAttribute('data-tm-search-open')){openSearch(false);return;}
  }
  async function onSearch(e){
    if(e.target.id!=='tm-poi-form')return;e.preventDefault();if(!adding){refreshData();editExpected=snapshot.places.find(p=>p.id===selected);}const p=searchPlace();if(!p||!adapter||searching||saving)return;
    query=$('poi-query').value.trim();if(!query)return;const current=++epoch;searching=true;chosen=-1;candidates=[];adapter.clearPreview?.();message='';renderDetail();
    try{const found=await adapter.search(p,query);if(current!==epoch)return;candidates=found;message=found.length?'':'没有找到匹配地点，可以换个名称或在地图上选点。';}
    catch(error){if(current===epoch)message=error.message||'搜索暂不可用，请稍后重试。';}
    finally{if(current===epoch){searching=false;renderDetail();}}
  }
  async function open(context={}){
    createUI();opener=document.activeElement;feedback='';city=context.cityId||'';date=context.date||'';mode='all';selected='';clearSearch();setSheet(false);
    if(!dialog.open){bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();}dialog.scrollTop=0;render(true);
    if(!adapterPromise){$('map-network').textContent='正在加载地图…';adapterPromise=window.TravelMapProvider.create({element:'tm-map',onSelect:id=>{if(!poiOpen)select(id,true);},onPick,onStatus:text=>{$('map-network').textContent=text;}}).then(value=>{
      adapter=value;
      if(value.provider==='amap'&&window.TravelMapResolver&&window.TravelMapMatch)resolver=window.TravelMapResolver.create({
        search:p=>value.search(p,p.name),match:window.TravelMapMatch.match,confirm:(p,c)=>value.confirm(p,c),
        save:(requests,tripId)=>window.TravelMapData.confirmMatchedLocations(requests,tripId),
        isActive:tripId=>{try{return window.TravelMapData.snapshot().trip.id===tripId;}catch(_){return false;}},
        onChange:()=>{fitAfterResolution=true;onDataChange();}
      });
      return value;
    }).catch(()=>{$('map-network').textContent='地图暂未加载，地点列表仍可使用。';adapterPromise=null;});}
    await adapterPromise;if(dialog.open){adapter?.resize();render(true);}
  }
  function onDataChange(){if(!dialog?.open||pendingRender)return;pendingRender=true;queueMicrotask(()=>{pendingRender=false;const fit=fitAfterResolution;fitAfterResolution=false;render(fit);});}
  ['dailyplan:change','dotimports:change','tripdata:change','tripdata:orders'].forEach(event=>window.addEventListener(event,onDataChange));
  window.addEventListener('storage',onDataChange);
  window.TravelMap={open,close:()=>dialog?.close()};
})();
