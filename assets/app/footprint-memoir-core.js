/* Dates are explicit travel dates. markedAt and updatedAt are never chronology inputs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FootprintMemoirCore=api;})(typeof window==='undefined'?this:window,function(){
'use strict';
const empty=()=>({version:1,visits:[],wishes:[]});
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
function clean(raw,known){
 if(!raw||raw.version!==1||!Array.isArray(raw.visits)||raw.visits.length>5000||!Array.isArray(raw.wishes)||raw.wishes.length>2000)throw Error('旅行日期与心愿格式不正确');
 const ids=new Set();const visits=raw.visits.map(v=>{
  if(!v||typeof v.id!=='string'||!v.id||v.id.length>100||ids.has(v.id)||typeof v.cityId!=='string'||(known&&!known.has(v.cityId)))throw Error('到访记录的城市或编号不正确');ids.add(v.id);
  const startDate=v.startDate||'',endDate=v.endDate||'',trip=typeof v.trip==='string'?v.trip.trim():'';
  if((startDate&&!validDate(startDate))||(endDate&&!validDate(endDate))||(endDate&&(!startDate||endDate<startDate)))throw Error('请选择有效的到访日期，结束日期不能早于开始日期');
  if(trip.length>60||!Number.isInteger(v.order)||v.order<1||v.order>999)throw Error('旅行名称或站点顺序不正确');
  return{id:v.id,cityId:v.cityId,startDate,endDate,trip,order:v.order};
 });
 const wishes=[...new Set(raw.wishes)];if(wishes.some(id=>typeof id!=='string'||(known&&!known.has(id))))throw Error('心愿城市不正确');
 return{version:1,visits,wishes};
}
function events(data,visited,today){return data.visits.filter(v=>visited[v.cityId]&&v.startDate&&(!today||(v.endDate||v.startDate)<=today)).slice().sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.order-b.order||a.id.localeCompare(b.id));}
function years(data,visited,today){return [...new Set(events(data,visited,today).map(v=>v.startDate.slice(0,4)))];}
function replay(data,visited,year,count,today){const dated=events(data,visited,today),inYear=dated.filter(v=>v.startDate.slice(0,4)===year),steps=inYear.slice(0,Math.max(0,count)),seen=new Set(dated.filter(v=>v.startDate.slice(0,4)<year).map(v=>v.cityId));steps.forEach(v=>seen.add(v.cityId));return{inYear,steps,lit:[...seen],unknown:Object.keys(visited).filter(id=>!dated.some(v=>v.cityId===id))};}
// A regional walk is a presentation order, never an inferred arrival chronology.
function journey(data,visited,cities,order='auto',today){
 const byId=new Map(cities.map(c=>[c.id,c])),ids=Object.keys(visited).filter(id=>visited[id]&&byId.has(id));
 const dated=events(data,visited,today).filter(v=>byId.has(v.cityId)&&validDate(v.startDate));
 const compare=(a,b)=>{const x=byId.get(a),y=byId.get(b);return (x.country||'CHN').localeCompare(y.country||'CHN')||x.province.localeCompare(y.province)||x.name.localeCompare(y.name,'zh')||a.localeCompare(b);};
 const unknown=ids.filter(id=>!dated.some(v=>v.cityId===id)).sort(compare);
 const kind=order==='region'||!dated.length?'region':'time';
 const regional=id=>({id:'walk:'+id,cityId:id,startDate:'',endDate:'',kind:'region'});
 const stops=kind==='time'?[...dated.map(v=>({...v,kind:'time'})),...unknown.map(regional)]:ids.sort(compare).map(id=>({...regional(id),visitId:dated.filter(v=>v.cityId===id).at(-1)?.id||''}));
 return{stops,order:kind,datedCount:dated.length,unknown,ids};
}
function journeyFrame(plan,count,finished=false){const step=Math.max(0,Math.min(plan.stops.length,Math.trunc(count)||0)),steps=plan.stops.slice(0,step);return {...plan,steps,current:steps.at(-1)||null,step,finished,lit:step===0||finished?plan.ids:[...new Set(steps.map(v=>v.cityId))]};}
function trips(data){return [...new Set(data.visits.map(v=>v.trip).filter(Boolean))];}
function route(data,name){return data.visits.filter(v=>v.trip===name).slice().sort((a,b)=>a.order-b.order||(a.startDate||'9999').localeCompare(b.startDate||'9999')||a.id.localeCompare(b.id));}
function currentRoute(data,cities,fallback=[]){const rows=data?.days?.length?data.days:data?.destinations;if(!rows?.length)return [...fallback];const result=[];for(const row of rows){const name=String(row.city||row.name||'').replace(/市$/,'');const city=cities.find(c=>c.name===name||c.full===name||(c.aliases||[]).includes(name))||cities.find(c=>name.length>=2&&c.full?.startsWith(name));if(city&&result.at(-1)!==city.id)result.push(city.id);}return result;}
// Preserve repeated city stops and use actual itinerary dates, never historical visit dates.
function currentStops(data,cities,fallback=[]){
 const rows=data?.days?.length?data.days:data?.destinations;
 if(!rows?.length)return fallback.map((cityId,i)=>({cityId,order:i+1,id:'current-'+i,startDate:'',endDate:''}));
 const stops=[];
 for(const row of rows){const cityId=currentRoute({days:[row]},cities)[0];if(!cityId)continue;
  const start=row.date||row.arrivalDate||'',end=row.date||row.departureDate||start,previous=stops.at(-1);
  if(previous?.cityId===cityId){if(end)previous.endDate=end;continue;}
  stops.push({cityId,order:stops.length+1,id:'current-'+stops.length,startDate:start,endDate:end});
 }return stops;
}
function currentVisit(data,cityId,activeVisit,tripName){const visits=data.visits.filter(v=>v.cityId===cityId);return visits.find(v=>v.id===activeVisit)||(tripName?visits.filter(v=>v.trip===tripName).at(-1):null)||visits.at(-1);}
function merge(current,incoming){const visits=new Map(current.visits.map(v=>[v.id,v]));incoming.visits.forEach(v=>{if(!visits.has(v.id))visits.set(v.id,v);});return{version:1,visits:[...visits.values()],wishes:[...new Set([...current.wishes,...incoming.wishes])]};}
return{empty,validDate,clean,events,years,replay,journey,journeyFrame,trips,route,currentRoute,currentStops,currentVisit,merge};
});
