/* The travel map is a view over the existing handbook data, never a second store. */
(function(root,factory){
 'use strict';
 const core=factory();
 if(typeof module==='object'&&module.exports)module.exports=core;
 if(!root.document)return;
 function context(){
  if(!root.DailyPlan?.mapContext)throw Error('每日行程正在载入，请稍后重试。');
  return root.DailyPlan.mapContext();
 }
 function presentation(row,saved){
  const place=row.place,ids=row.memberIds||[place.sourceId];let imported=null,intro='';
  try{imported=root.DotImportCore?.imageForPlace(place,saved);}catch(_){}
  const alternatives=(place.publicPhotos||[]).slice().sort((a,b)=>(b.width||0)-(a.width||0)).map(p=>({...p,src:p.url}));
  const reason=[...(place.dotSources||[]),...(row.systemEvidence||[]),...(place.publicEvidence||[])].flatMap(s=>s.reasons||[]).find(r=>r.text);
  if(reason)intro=reason.text;
  for(const id of ids){const card=root.DotImports?.control(id)?.card;if(!card)continue;
   const img=card.querySelector('img:not([src*="avatar"])');
   if(img)alternatives.push({src:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight});
   if(!intro)intro=card.querySelector('[data-sv-summary],.sv-summary,.sv-reason,.fp-reason,.xp-description,.xp-subtitle,.sg-description')?.textContent?.trim()||'';
  }
  const image=root.DotImportCore?.choosePlacePhoto(imported,alternatives)||imported||alternatives[0];
  return{photo:image?.src||'',photoCompact:Boolean(image?.compact),photoFallback:image?.fallback||'',intro:core.sentence(intro||place.description||place.openingNote||'')};
 }
 function live(){const input=context();let saved;try{saved=root.DotImports?.read();}catch(_){}return {...input,catalog:input.catalog.map(row=>({...row,...presentation(row,saved)}))};}
 root.TravelMapData={
  snapshot(){return core.snapshot(live());},
  async addPlace(confirmed,tripId){
   const input=live();if(input.trip.tripId!==tripId)throw Error('当前旅行已变化，请重新打开地图。');
   if(!root.DotImports?.addMapPlace)throw Error('地点收藏正在载入，请稍后重试。');
   // Match against the overlaid coordinates too, so an edited POI keeps its identity.
   const view=core.snapshot(input),candidate={...confirmed,id:confirmed.poiId,name:confirmed.name.replace(/景区$/,''),provider:'amap',adcode:confirmed.locationAdcode};
   const matches=view.places.filter(p=>core.samePlace(p._place,confirmed)||(!p.poiId||p.coordinateSystem!==confirmed.coordinateSystem)&&root.TravelMapMatch?.match(p,[candidate]));
   if(matches.length>1)throw Error('存在多个相似地点，请从已有地点中选择并修改位置。');
   const existing=matches[0];
   if(existing?.sourceId&&input.catalog.some(r=>(r.memberIds||[r.place.sourceId]).includes(existing.sourceId))){await root.DotImports.decide(existing.sourceId,'wish',tripId);return {sourceId:existing.sourceId,existing:true};}
   const temp={...confirmed,sourceId:'dot:new-map-place'},patch=core.confirmLocation({trip:input.trip,state:{entries:[],locations:{}},catalog:[{place:temp,city:confirmed.city}]},temp.sourceId,confirmed,tripId).result._place;
   return root.DotImports.addMapPlace(patch,tripId);
  },
  schedule(input){return root.DailyPlan.commitMap(input.tripId,ctx=>core.schedule(ctx,input,()=> 'dp-'+root.crypto.randomUUID()),'地图安排已保存');},
  confirmLocation(placeId,place,tripId,expected){return root.DailyPlan.commitMap(tripId,ctx=>core.confirmLocation(ctx,placeId,place,tripId,expected),'地点位置已确认');},
  confirmMatchedLocations(requests,tripId){return root.DailyPlan.commitMap(tripId,ctx=>core.confirmMatchedLocations(ctx,requests,tripId),'地点位置已匹配');},
  openDay(dayId){return root.DailyPlan.openDay(dayId);},
  subscribe(listener){const changed=()=>listener();for(const name of ['dailyplan:change','dotimports:change','tripdata:change','tripdata:orders'])root.addEventListener(name,changed);return()=>{for(const name of ['dailyplan:change','dotimports:change','tripdata:change','tripdata:orders'])root.removeEventListener(name,changed);};}
 };
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const normal=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s·•・，,。()（）\-—]/g,'');
 const slots=['morning','afternoon','evening'];
 const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
 const coord=p=>Boolean(p&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&typeof p.lng==='number'&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180);
 const positionIdentity=p=>['sourceId','name','cityId','address','lat','lng','coordinateSystem','poiId','geoSource','locationAutoMatchBlocked'].map(k=>p?.[k]??null);
 function sentence(value){const text=String(value||'').replace(/\s+/g,' ').trim(),match=text.match(/^.*?[。！？!?]/);return (match?match[0].trim():text).slice(0,140);}
 function samePlace(a,b){
  if(!a||!b)return false;
  if(a.sourceId&&b.sourceId&&a.sourceId===b.sourceId)return !a.cityId||!b.cityId||a.cityId===b.cityId;
  if(!a.cityId||a.cityId!==b.cityId)return false;
  if(a.poiId&&b.poiId)return a.poiId===b.poiId;
  const names=new Set([a.name,...(a.aliases||[])].map(normal).filter(Boolean));
  return [b.name,...(b.aliases||[])].some(name=>names.has(normal(name)));
 }
 function active(entry,trip){
  if(entry.tripId&&entry.tripId!==trip.tripId)return false;
  const day=(trip.days||[]).find(d=>d.id===entry.dayId);
  return Boolean(day&&entry.type!=='note'&&entry.place&&(!entry.place.cityId||day.cityId===entry.place.cityId||(day.locationIds||[]).includes(entry.place.cityId)));
 }
 function overlay(place,locations){
  if(!place?.sourceId)return place;
  const match=locations?.['source:'+place.sourceId];
  if(!match||match.cityId&&match.cityId!==place.cityId||match.name&&normal(match.name)!==normal(place.name))return place;
  return {...place,...match,sourceId:place.sourceId,name:place.name,kind:place.kind,cityId:place.cityId};
 }
 function location(place){
  const evidence=place.coordinateEvidence;
  const verified=coord(place)&&!place.locationPending&&Boolean(place.geoSource||place.source)&&
   Boolean(['WGS84','GCJ02'].includes(place.coordinateSystem)&&evidence?.confirmedAt&&evidence.poiId===place.poiId&&evidence.lat===place.lat&&evidence.lng===place.lng);
  return {lat:coord(place)?place.lat:null,lng:coord(place)?place.lng:null,confirmed:verified,
   source:verified?String(place.geoSource||place.source):'',coordinateSystem:place.coordinateSystem||'WGS84',
   coordinateEvidence:place.coordinateEvidence,poiId:place.poiId||'',address:place.address||'',locationPending:!verified};
 }
 function snapshot(input){
  const trip=input.trip||{},state=input.state||{entries:[],locations:{}},cities=new Map((trip.destinations||[]).map(c=>[c.id,{id:c.id,name:c.name}]));
  const days=(trip.days||[]).map(d=>({...clone(d),cityIds:[...new Set([d.cityId,...(d.locationIds||[])].filter(Boolean))]}));
  const records=[],orders=new Map((input.orderByDay||[]).map(day=>[day.dayId,new Map(day.ids.map((id,index)=>[id,index]))]));
  const visitOrder=(dayId,id,slot,index,edge)=>orders.get(dayId)?.get(id)??(edge==='start'?-1:edge==='end'?900000:Math.max(0,slots.indexOf(slot))*100000+index);
  const add=(source,row={})=>{
   const place=overlay(source,state.locations),members=row.memberIds||[place.sourceId].filter(Boolean);
   let record=records.find(r=>members.some(id=>r.memberIds.includes(id))||samePlace(r._place,place));
   if(record){if(row.photo&&(!record.photo||record.photoCompact&&!row.photoCompact))Object.assign(record,{photo:row.photo,photoCompact:Boolean(row.photoCompact),photoFallback:row.photoFallback||''});if(!record.intro&&row.intro)record.intro=sentence(row.intro);record.memberIds=[...new Set([...record.memberIds,...members])];record.wish=record.wish||['wish','must'].includes(row.choice);if(!record.confirmed&&location(place).confirmed){Object.assign(record,location(place));record._place=clone(place);}return record;}
   const city=place.city||row.city||cities.get(place.cityId)?.name||'';
   record={id:place.sourceId||row.id,sourceId:place.sourceId||'',memberIds:members,name:row.displayName||place.name,cityId:place.cityId||'',city,kind:place.kind||'manual',wish:['wish','must'].includes(row.choice),photo:row.photo||place.photo||'',intro:sentence(row.intro||place.description||place.openingNote||''),...location(place),visits:[],_place:clone(place),_locationKeys:[],_entryIds:[]};
   Object.assign(record,{photoCompact:Boolean(row.photoCompact),photoFallback:row.photoFallback||''});
   records.push(record);return record;
  };
  for(const row of input.catalog||[])if(row.place?.name)add(row.place,row);
  for(const [index,entry] of (state.entries||[]).entries()){
   if(!active(entry,trip))continue;
   const known=(input.catalog||[]).find(row=>(row.memberIds||[row.place?.sourceId]).includes(entry.place.sourceId));
   // A source whose city has changed is retained in daily storage but is not mapped to the old visit.
   if(known?.place.cityId&&known.place.cityId!==entry.place.cityId)continue;
   const record=add(entry.place,{id:'entry:'+entry.id}),day=days.find(d=>d.id===entry.dayId);
   record._entryIds.push(entry.id);
   record.visits.push({id:entry.id,dayId:day.id,date:day.date||'',tripId:trip.tripId,start:entry.time||'',end:entry.endTime||'',slot:entry.slot||'morning',order:visitOrder(day.id,entry.id,entry.slot,index),fixed:false});
  }
  for(const group of input.fixedByDay||[]){const day=days.find(d=>d.id===group.dayId);if(!day)continue;
   for(const [index,entry] of (group.entries||[]).entries()){
    if(!entry.place?.name)continue;
    const record=add(entry.place,{id:'location:'+entry.locationKey});
    if(entry.locationKey&&!record._locationKeys.includes(entry.locationKey))record._locationKeys.push(entry.locationKey);
    if(!record.visits.some(v=>v.dayId===day.id&&v.fixed&&v.start===(entry.time||'')))record.visits.push({id:entry.id,dayId:day.id,date:day.date||'',tripId:trip.tripId,start:entry.time||'',end:'',slot:entry.slot||'morning',order:visitOrder(day.id,entry.id,entry.slot,index,entry.edge),fixed:true,label:entry.label||''});
   }
  }
  for(const record of records){
   const rawEntries=(state.entries||[]).filter(e=>record._entryIds.includes(e.id)).sort((a,b)=>a.id.localeCompare(b.id));
   const rawLocations=record._locationKeys.slice().sort().map(k=>[k,state.locations?.[k]]);
   record.locationVersion=JSON.stringify([rawEntries.map(e=>[e.id,positionIdentity(e.place)]),rawLocations.map(([k,p])=>[k,positionIdentity(p)])]);
   record.autoLocationAllowed=![record._place,...rawEntries.map(e=>e.place),...rawLocations.map(([,p])=>p)].some(p=>p?.locationAutoMatchBlocked);
   record.visits.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order);record.fixed=record.visits.length>0&&record.visits.every(v=>v.fixed);if(record.cityId&&(record.wish||record.visits.length)&&!cities.has(record.cityId))cities.set(record.cityId,{id:record.cityId,name:record.city||record.cityId});
  }
  return {trip:{id:trip.tripId||'',startDate:trip.startDate||'',endDate:trip.endDate||''},days,cities:[...cities.values()],places:records};
 }
 function current(input,expectedTrip){if(!input.trip?.tripId||expectedTrip&&expectedTrip!==input.trip.tripId)throw Error('当前旅行已变化，请重新打开地图。');}
 function schedule(input,request,idFactory){
  current(input,request.tripId);
  const view=snapshot(input),place=view.places.find(p=>p.id===request.placeId),day=view.days.find(d=>d.id===request.dayId);
  if(!place)throw Error('地点已变化，请重新选择。');
  if(!day||!day.date)throw Error('请选择本次旅行中已确定日期的一天。');
  if(place.cityId&&!day.cityIds.includes(place.cityId))throw Error('这个地点不在所选日期的城市，请选择对应城市的一天。');
  if(place.fixed)throw Error('这项交通或住宿已经随订单同步，请在订单中调整。');
  const start=request.start||'',end=request.end||'';
  if(start||end){if(!validTime(start)||!validTime(end))throw Error('请同时填写有效的开始时间和结束时间，或都留空。');if(end<=start)throw Error('结束时间需晚于开始时间；跨天安排请分到两天。');}
  const duplicate=(input.state.entries||[]).find(e=>active(e,input.trip)&&e.dayId===day.id&&(place.memberIds.includes(e.place.sourceId)||samePlace(place._place,e.place)));
  if(duplicate)throw Error('这个地点当天已经安排，请查看或编辑已有安排。');
  const slot=start?(start<'12:00'?'morning':start<'18:00'?'afternoon':'evening'):(slots.includes(request.slot)?request.slot:'morning');
  const entry={id:idFactory(),tripId:input.trip.tripId,dayId:day.id,slot,time:start,endTime:end,place:clone(place._place)};
  const state=clone(input.state);state.entries.push(entry);
  return{state,result:clone(entry),selectedDayId:day.id};
 }
 function confirmLocation(input,placeId,confirmed,tripId,expected){
  current(input,tripId);
  const place=snapshot(input).places.find(p=>p.id===placeId);
  if(!place)throw Error('地点已变化，请重新选择。');
  if(expected&&['name','cityId','locationVersion','poiId','lat','lng','address'].some(key=>JSON.stringify(place[key]??null)!==JSON.stringify(expected[key]??null)))throw Error('地点位置已在其他操作中更新，请重新搜索后保存。');
  if(!coord(confirmed)||confirmed.confirmed!==true||!confirmed.source||!['WGS84','GCJ02'].includes(confirmed.coordinateSystem)||!confirmed.poiId)throw Error('请先核对地图候选地点，再确认位置。');
  if(confirmed.cityId&&place.cityId!==confirmed.cityId)throw Error('地点所属城市已变化，请重新搜索。');
  const timestamp=confirmed.confirmedAt||new Date().toISOString(),patch={address:String(confirmed.address||place.address||'').slice(0,600),lat:confirmed.lat,lng:confirmed.lng,poiId:String(confirmed.poiId),geoSource:String(confirmed.source),coordinateSystem:confirmed.coordinateSystem,coordinateEvidence:{provider:confirmed.coordinateSystem==='GCJ02'?'amap':'photon',poiId:String(confirmed.poiId),lat:confirmed.lat,lng:confirmed.lng,confirmedAt:timestamp,source:String(confirmed.source),coordinateSystem:confirmed.coordinateSystem,matchMethod:confirmed.matchMethod==='automatic'?'automatic':'user-confirmed'},locationPending:false,locationAutoMatchBlocked:false};
  if(confirmed.matchMethod!=='automatic'){
   if(typeof confirmed.locationQuery==='string')patch.locationQuery=confirmed.locationQuery.trim().slice(0,120);
   if(typeof confirmed.locationName==='string')patch.locationName=confirmed.locationName.trim().slice(0,180);
  }
  const state=clone(input.state);state.locations=state.locations||{};
  for(const id of place.memberIds){const original=(input.catalog||[]).find(row=>(row.memberIds||[row.place.sourceId]).includes(id))?.place||place._place;state.locations['source:'+id]={...state.locations['source:'+id],...patch,sourceId:id,name:original.name,cityId:original.cityId};}
  for(const key of place._locationKeys)state.locations[key]={...state.locations[key],...patch};
  state.entries=state.entries.map(e=>e.type!=='note'&&active(e,input.trip)&&(place.memberIds.includes(e.place?.sourceId)||place._entryIds.includes(e.id)||samePlace(e.place,place._place))?{...e,place:{...e.place,...patch}}:e);
  return{state,result:{...clone(place),...location({...place._place,...patch}),_place:{...place._place,...patch}}};
 }
 function confirmMatchedLocations(input,requests,tripId){
  current(input,tripId);let state=input.state;const saved=[];
  for(const request of requests||[]){
   const live=snapshot({...input,state}).places.find(p=>p.id===request.placeId),expected=request.expected;
   if(!live||live.confirmed||!expected||live.autoLocationAllowed===false||live.locationVersion!==expected.locationVersion)continue;
   const textFields=['id','name','cityId','address','coordinateSystem'];
   if(textFields.some(k=>String(live[k]||'').trim()!==String(expected[k]||'').trim()))continue;
   if(['lat','lng'].some(k=>(Number.isFinite(live[k])?live[k]:null)!==(Number.isFinite(expected[k])?expected[k]:null)))continue;
   const out=confirmLocation({...input,state},request.placeId,{...request.place,matchMethod:'automatic'},tripId);
   state=out.state;saved.push(request.placeId);
  }
  return{state,result:{saved}};
 }
 return{snapshot,schedule,confirmLocation,confirmMatchedLocations,overlay,active,samePlace,sentence};
});
