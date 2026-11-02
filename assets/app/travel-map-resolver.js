(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TravelMapResolver=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const text=value=>typeof value==='string'?value.trim():'';
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
function expected(place){return{id:text(place.id),name:text(place.name),cityId:text(place.cityId),address:text(place.address),lat:number(place.lat),lng:number(place.lng),coordinateSystem:text(place.coordinateSystem),locationVersion:typeof place.locationVersion==='string'?place.locationVersion:''};}
function identity(place,tripId){return JSON.stringify([text(tripId),expected(place)]);}
function create({search,match,confirm,save,onChange=()=>{},isActive=()=>true}={}){
 for(const [name,fn] of Object.entries({search,match,confirm,save}))if(typeof fn!=='function')throw new TypeError(name+' must be a function');
 const records=new Map(),latest=new Map(),queue=[];
 let running=false;
 const current=record=>isActive(record.tripId)&&latest.get(record.owner)===record.key;
 const notify=()=>{try{onChange();}catch(_){/* A view update must not stop location resolution. */}};
 function finish(record,status){record.status=status;record.done(status);}
 async function locate(record){
  if(!current(record))return null;
  try{
   const candidates=await search(record.place);
   if(!current(record))return null;
   const candidate=await match(record.place,candidates);
   if(!candidate){finish(record,'pending');return null;}
   if(!current(record))return null;
   const place=await confirm(record.place,candidate);
   if(!current(record))return null;
   return{placeId:record.expected.id,place,expected:{...record.expected}};
  }catch(_){finish(record,'failed');return null;}
 }
 function savedIds(result){
  if(Array.isArray(result))return new Set(result);
  if(result&&Array.isArray(result.saved))return new Set(result.saved);
  return null;
 }
 async function drain(){
  if(running)return;
  running=true;
  try{
   while(queue.length){
    const batch=queue.splice(0,2);
    const requests=await Promise.all(batch.map(locate));
    const groups=new Map();
    batch.forEach((record,i)=>{
     if(!requests[i]||!current(record)){if(record.status==='matching')finish(record,'pending');return;}
     if(!groups.has(record.tripId))groups.set(record.tripId,[]);
     groups.get(record.tripId).push({record,request:requests[i]});
    });
    for(const [tripId,items] of groups){
     const active=items.filter(({record})=>current(record));
     items.filter(item=>!active.includes(item)).forEach(({record})=>finish(record,'pending'));
     if(!active.length)continue;
     try{
      const result=await save(active.map(item=>item.request),tripId),ids=savedIds(result);
      active.forEach(({record})=>finish(record,!current(record)?'pending':result===false?'failed':ids&&!ids.has(record.expected.id)?'pending':'matched'));
     }catch(_){active.forEach(({record})=>finish(record,current(record)?'failed':'pending'));}
    }
    notify();
   }
  }finally{running=false;}
 }
 function resolve(places,tripId){
  if(!isActive(tripId))return Promise.resolve([]);
  const promises=[];let added=false;
  for(const place of places||[]){
   if(!place||!text(place.id))continue;
   const key=identity(place,tripId),owner=JSON.stringify([text(tripId),text(place.id)]);
   if(place.confirmed===true||place.autoLocationAllowed===false){latest.set(owner,null);continue;}
   latest.set(owner,key);
   let record=records.get(key);
   if(!record){
    const snapshot=expected(place);
    record={key,owner,tripId,expected:snapshot,place:{...place,...snapshot},status:'matching'};
    record.promise=new Promise(done=>{record.done=done;});
    records.set(key,record);queue.push(record);added=true;
   }
   promises.push(record.promise);
  }
  if(added){queueMicrotask(drain);notify();}
  return Promise.all(promises);
 }
 function state(place,tripId){return place?.confirmed===true?'matched':place?.autoLocationAllowed===false?'pending':records.get(identity(place||{},tripId))?.status||'pending';}
 function retry(places,tripId){
  for(const place of places||[]){if(!place)continue;const key=identity(place,tripId),record=records.get(key);if(record&&record.status!=='matching'&&record.status!=='matched')records.delete(key);}
  return resolve(places,tripId);
 }
 return{resolve,state,retry};
}
return{create};
});
