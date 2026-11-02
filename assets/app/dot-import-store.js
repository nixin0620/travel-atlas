(function(){
'use strict';
const C=window.DotImportCore,E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tripId=()=>JSON.parse(document.getElementById('journey-seed').textContent).tripId,key=()=> 'travel-handbook-dot-imports:v1:'+tripId();
function readRaw(){const raw=TravelStorage.getItem(key());return raw===null?C.empty(tripId()):C.validate(JSON.parse(raw),tripId());}
let catalogText,catalogStops,catalogRows=[];
function cityCatalog(){
 const T=window.TripData;if(!T)return [];
 const mapText=document.getElementById('china-footprints-data')?.textContent||'{}',stops=T.snapshot?.destinations||[],signature=JSON.stringify(stops.map(c=>c.name));
 if(mapText===catalogText&&signature===catalogStops)return catalogRows;
 let mapCities=[];try{mapCities=JSON.parse(mapText).cities||[];}catch(_){}
 const rows=[...mapCities,...stops];catalogText=mapText;catalogStops=signature;
 catalogRows=rows.map(c=>({id:T.key(c.name),name:T.name(c.name),full:c.full,aliases:[...(c.aliases||[]),...(T.key(c.name)==='puer'?['思茅','思茅区']:T.key(c.name)==='banna'?['版纳','景洪','西双版纳州','西双版纳傣族自治州']:[])]}));return catalogRows;
}
function migrate(raw){return C.reclassify(C.repairCities(raw,cityCatalog()));}
let readCache;
function read(){
 const value=TravelStorage.getItem(key()),cities=cityCatalog(),trip=tripId();
 if(readCache?.value===value&&readCache.cities===cities&&readCache.trip===trip)return JSON.parse(readCache.migrated);
 const next=migrate(readRaw());readCache={value,cities,trip,migrated:JSON.stringify(next)};return next;
}
function prepare(result,city){return C.resolveCities(result,city,cityCatalog());}
function notify(){dispatchEvent(new Event('dotimports:change'));window.GuidePicks?.refresh();}
async function write(state){C.validate(state,tripId());const targetKey=key(),old=TravelStorage.getItem(targetKey);try{TravelStorage.setItem(targetKey,JSON.stringify(state));await TravelStorage.flushCache();}catch(_){if(old===null)TravelStorage.removeItem(targetKey);else TravelStorage.setItem(targetKey,old);throw Error(TravelStorage.cacheError?.message||'保存空间不足或保存失败，本次操作未保存。请先导出备份，检查浏览器存储空间后重试。');}}
// Read and write each mutation in order, so a failed save cannot roll back a
// newer import/decision that was started while the first write was pending.
let mutation=Promise.resolve();
function mutate(fn){const next=mutation.catch(()=>{}).then(fn);mutation=next;return next;}
let publicCandidates=[];
function registerPublicCandidates(rows){publicCandidates=window.GuideSupplements.withDiscoveredRows(publicCandidates,rows);notify();}
function mergeCatalog(base){try{return C.mergeCatalog(window.GuideSupplements?.withDiscoveredRows(base,publicCandidates)||base,read());}catch(_){return base;}}
function enrichPlace(place){try{const item=read().items.find(i=>i.sourceId===place.sourceId);return item?{...place,dotSources:item.sources}:place;}catch(_){return place;}}
function sourceHTML(place){const sources=enrichPlace(place)?.dotSources||[];if(!sources.length)return '';return `<details class="dot-provenance"><summary>${sources.length} 条攻略推荐</summary>${sources.map(s=>`<section><a href="${E(C.shareURL(s.url))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${E(s.title)} ↗</a>${s.reasons.map(r=>`<p>${E(r.text)}</p>`).join('')}</section>`).join('')}</details>`;}
const specs=[['sight','[data-sv-id]','svId','choice','data-sv-pick'],['food','[data-food-id]','foodId','foodChoice','data-food-pick'],['experience','[data-xp-id]','xpId','xpChoice','data-xp-pick'],['shopping','[data-sg-id]','sgId','sgChoice','data-sg-pick']];
function control(id){const[kind,code]=id.split(':'),s=specs.find(x=>x[0]===kind);if(!s)return null;const card=[...document.querySelectorAll(s[1])].find(n=>n.dataset[s[2]]===code);return card?{card,s,get choice(){return card.dataset[s[3]];},click(value){card.querySelector('['+s[4]+'="'+value+'"]')?.click();}}:null;}
let syncing=false;
async function decide(id,value,expectedTrip){if(expectedTrip&&tripId()!==expectedTrip)throw Error('当前旅行已变化，请重新打开地图。');const row=DailyPlanner.catalog({allCities:true}).find(r=>r.place.sourceId===id);if(!row)throw Error('地点未找到，请刷新后重试。');await write(C.decide(read(),row,value,new Date().toISOString()));
 const c=control(id);if(c){syncing=true;const target=value==='maybe'?null:value==='wish'&&c.choice==='must'?'must':value;if(target!==c.choice){if(target)c.click(target);else if(['must','wish','skip'].includes(c.choice))c.click(c.choice);}syncing=false;}notify();}
async function add(result,city,options){const imported=C.importGuide(read(),result,city,DailyPlanner.catalog({allCities:true}),new Date().toISOString(),()=>crypto.randomUUID(),{...options,cities:cityCatalog()});await write(imported.state);notify();return imported.counts;}
async function remove(id){const removed=C.removeGuide(read(),id);await write(removed.state);notify();return removed.receipt;}
async function restore(receipt){await write(C.restoreGuide(read(),receipt));notify();}
async function edit(id,patch){const base=DailyPlanner.catalog({allCities:true}),row=base.find(r=>r.place.sourceId===id);if(!row)throw Error('地点未找到，请刷新后重试。');await write(C.editPlace(read(),row,patch,base,new Date().toISOString()));notify();}
async function addMapPlace(place,expectedTrip){if(tripId()!==expectedTrip)throw Error('当前旅行已变化，请重新打开地图。');const result=C.addMapPlace(read(),place,DailyPlanner.catalog({allCities:true}),new Date().toISOString(),()=>crypto.randomUUID());await write(result.state);notify();return result.result;}
window.DotImports={read,prepare,addMapPlace:(...a)=>mutate(()=>addMapPlace(...a)),add:(...a)=>mutate(()=>add(...a)),remove:(...a)=>mutate(()=>remove(...a)),restore:(...a)=>mutate(()=>restore(...a)),decide:(...a)=>mutate(()=>decide(...a)),edit:(...a)=>mutate(()=>edit(...a)),mergeCatalog,enrichPlace,sourceHTML,control,registerPublicCandidates};
// Persist the same classification used by the catalogue, without touching user choices.
TravelStorage.whenReady(async()=>{try{await mutate(async()=>{const raw=readRaw(),next=migrate(raw);if(next!==raw){await write(next);notify();}});}catch(error){dispatchEvent(new CustomEvent('guideimports:error',{detail:error.message}));}});
// Fill legacy missing thumbnails from the saved original, without rereading the guide.
async function repairPhotos(){
 if(!/^https?:$/.test(location.protocol))return;
 for(const guide of read().guides||[]){
  if(guide.kind!=='dot'||guide.photoRepairVersion===1)continue;
  const originals=guide.images.filter(i=>i.kind!=='place_thumbnail');if(originals.length!==1||!originals[0].width||!originals[0].height)continue;
  const places=read().items.flatMap(item=>{const source=item.sources.find(s=>(s.guideId||s.id.split(':')[0])===guide.id);return source?.evidence?.heading_bbox?[{sourceId:item.sourceId,name:item.place.name,rank:source.rank,evidence:source.evidence,repair:!(source.imageIndices||[]).length}]:[];});
  if(!places.some(p=>p.repair))continue;
  try{
   const response=await fetch('/api/guide-photos',{method:'POST',headers:{'Content-Type':'application/json','X-Travel-Import':'1'},credentials:'omit',body:JSON.stringify({image:originals[0],places}),signal:AbortSignal.timeout(60000)});
   if(!response.ok)continue;
   const result=await response.json();
   await mutate(async()=>{const current=read(),next=C.mergePhotos(current,guide.id,result);if(next!==current){await write(next);notify();}});
  }catch(_){/* Preserve existing cards; retry on a later visit if the local service is busy. */}
 }
}
TravelStorage.whenReady(()=>setTimeout(repairPhotos,0));
// Picks changed through the retained system cards also update the place-first view.
document.addEventListener('click',event=>{if(syncing||!event.target.closest('[data-sv-pick],[data-food-pick],[data-xp-pick],[data-sg-pick]'))return;const card=event.target.closest('[data-sv-id],[data-food-id],[data-xp-id],[data-sg-id]');if(!card)return;requestAnimationFrame(async()=>{try{await mutate(async()=>{const state=read();let changed=false;for(const item of state.items){const c=control(item.sourceId);if(c?.card===card){item.choice=['must','wish','skip'].includes(c.choice)?c.choice:null;item.decisionAt=new Date().toISOString();changed=true;}}if(changed)await write(state);notify();});}catch(error){dispatchEvent(new CustomEvent('guideimports:error',{detail:error.message}));}});});
window.addEventListener('storage',e=>{if(e.key===key()||e.key===null)notify();});
})();
