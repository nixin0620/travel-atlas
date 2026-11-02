(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TravelMapCore=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const minute=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'')?Number(t.slice(0,2))*60+Number(t.slice(3)):null;
const day=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return false;const t=new Date(d+'T12:00:00Z');return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===d;};
const visitDay=v=>v.date||v.dayId||'';
const coord=p=>Boolean(p&&p.coordinateSystem==='WGS84'&&p.confirmed===true&&typeof p.source==='string'&&p.source.trim().length>0&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180);
function interval(v){const a=minute(v?.start),b=minute(v?.end);return a!==null&&b!==null&&a<b?[a,b]:null;}
function route(places,date){
 if(!date||!day(date)&&!/^plan-[1-9]\d{0,2}$/.test(date))return{segments:[],issues:[],entries:[],message:'选择行程中的一天查看当日顺序。'};
 const entries=places.flatMap(p=>(p.visits||[]).filter(v=>visitDay(v)===date).map(v=>({place:p,visit:v}))).sort((a,b)=>(a.visit.order??0)-(b.visit.order??0));
 const issues=[],blocked=new Set();
 entries.forEach((e,i)=>{if(!e.place.cityId||!Number.isFinite(e.visit.order)||entries.some((other,j)=>j!==i&&other.visit.order===e.visit.order)){blocked.add(i);issues.push({id:e.place.id,reason:'城市或现有安排顺序待确认'});}if(!interval(e.visit)){blocked.add(i);issues.push({id:e.place.id,reason:'开始与结束时间待补全，或结束不晚于开始'});}if(!coord(e.place)){blocked.add(i);issues.push({id:e.place.id,reason:'地图位置待确认'});}});
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){const a=interval(entries[i].visit),b=interval(entries[j].visit);if(a&&b&&a[0]<b[1]&&b[0]<a[1]){blocked.add(i);blocked.add(j);issues.push({id:entries[i].place.id,reason:'与'+entries[j].place.name+'时间冲突'});issues.push({id:entries[j].place.id,reason:'与'+entries[i].place.name+'时间冲突'});}}
 const segments=[];
 for(let i=1;i<entries.length;i++){const a=entries[i-1],b=entries[i];if(!a.place.cityId||a.place.cityId!==b.place.cityId){issues.push({id:b.place.id,reason:'跨城市，不连接顺序线'});continue;}if(blocked.has(i-1)||blocked.has(i))continue;if(interval(a.visit)[1]>interval(b.visit)[0]){issues.push({id:b.place.id,reason:'现有安排顺序与时间不一致'});continue;}segments.push({from:a.place.id,to:b.place.id,points:[[a.place.lat,a.place.lng],[b.place.lat,b.place.lng]]});}
 return{segments,issues,entries,message:segments.length?'虚线仅示意现有安排顺序，非道路导航。':'当前没有可安全连接的相邻安排。'};
}
function filter(places,{city='',status='all',date=''}={}){return places.filter(p=>(!city||p.cityId===city)&&(status!=='wish'||p.wish)&&(status!=='planned'||p.visits?.length)&&(!date||p.visits?.some(v=>v.date===date)));}
function confirm(place,candidate){if(candidate?.city&&!(candidate.city.replace(/市$/,'').includes(place.city.replace(/市$/,''))))throw Error('候选城市与当前地点不同，请调整搜索或核对城市后再确认。');if(!candidate||candidate.coordinateSystem!=='WGS84'||!Number.isFinite(candidate.lat)||Math.abs(candidate.lat)>90||!Number.isFinite(candidate.lng)||Math.abs(candidate.lng)>180||!(typeof candidate.source==='string'&&candidate.source.trim()))throw Error('候选尚无可用的 WGS84 位置，不能确认到当前底图。');return{...place,lat:candidate.lat,lng:candidate.lng,coordinateSystem:'WGS84',source:candidate.source,sourceURL:typeof candidate.sourceURL==='string'?candidate.sourceURL:'',address:candidate.address||place.address,confirmed:true,poiId:candidate.id,confirmedAt:new Date().toISOString()};}
function validate(places){return Array.isArray(places)&&places.length<100&&places.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.cityId==='string'&&typeof p.wish==='boolean'&&Array.isArray(p.visits)&&p.visits.length<30&&p.visits.every(v=>day(v.date)&&typeof v.start==='string'&&typeof v.end==='string'&&Number.isFinite(v.order)));}
function tripDates(trip){
 if(trip&&typeof trip.id==='string'&&trip.id.trim()&&!trip.startDate&&!trip.endDate&&Array.isArray(trip.days)&&trip.days.length>0&&trip.days.length<=366&&trip.days.every((d,i)=>d.date===''&&d.id==='plan-'+(i+1)))return trip.days.map(d=>d.id);
 if(!trip||typeof trip.id!=='string'||!trip.id.trim()||!day(trip.startDate)||!day(trip.endDate))throw Error('当前行程的日期范围不完整。');
 const start=Date.parse(trip.startDate+'T00:00:00Z'),end=Date.parse(trip.endDate+'T00:00:00Z');
 const count=(end-start)/86400000+1;
 if(count<1||count>366)throw Error('行程日期范围应在 1 至 366 天内。');
 return Array.from({length:count},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
}
function belongsToTrip(visit,trip){
 const inRange=day(visit?.date)?visit.date>=trip.startDate&&visit.date<=trip.endDate:visit?.date===''&&!trip.startDate&&!trip.endDate&&trip.days?.some(d=>d.date===''&&d.id===visit.dayId);
 return Boolean(visit&&inRange&&
  (visit.tripId===undefined||visit.tripId===null||visit.tripId===''||visit.tripId===trip.id));
}
function tripVisits(place,trip){
 tripDates(trip);
 return (place?.visits||[]).filter(visit=>belongsToTrip(visit,trip));
}
function mapPlaces(places,{city='',mode='all',date='',trip}={}){
 const dates=tripDates(trip);
 if(mode!=='all'&&mode!=='day')throw Error('请选择全部地点或某日行程。');
 if(mode==='day'&&!dates.includes(date))return [];
 return places.filter(place=>(!city||place.cityId===city)&&(mode==='all'?place.wish===true:
  (place.visits||[]).some(visit=>belongsToTrip(visit,trip)&&visitDay(visit)===date)));
}
function dayEntries(places,{trip,date,city=''}={}){
 if(!tripDates(trip).includes(date))return [];
 return places.filter(place=>!city||place.cityId===city).flatMap(place=>(place.visits||[])
  .filter(visit=>belongsToTrip(visit,trip)&&visitDay(visit)===date).map(visit=>({place,visit})))
  .sort((a,b)=>(Number.isFinite(a.visit.order)?a.visit.order:Infinity)-(Number.isFinite(b.visit.order)?b.visit.order:Infinity));
}
function visitTarget(places,placeId,trip,date){
 tripDates(trip);
 if(!day(date)||date<trip.startDate||date>trip.endDate)throw Error('安排日期必须在当前行程范围内。');
 const matches=places.filter(place=>place.id===placeId);
 if(matches.length!==1)throw Error('未找到唯一的地点，请重新选择。');
 return matches[0];
}
function saveVisit(places,{placeId,trip,date,start='',end='',originalDate=''}={}){
 const place=visitTarget(places,placeId,trip,date);
 if(typeof start!=='string'||typeof end!=='string'||((start!==''||end!=='')&&!interval({start,end})))throw Error('请填写完整的开始和结束时间，结束时间须晚于开始时间。');
 const visits=place.visits||[];
 let original=null;
 if(originalDate){
  if(!day(originalDate)||originalDate<trip.startDate||originalDate>trip.endDate)throw Error('原安排不属于当前行程。');
  const matches=visits.filter(visit=>belongsToTrip(visit,trip)&&visit.date===originalDate);
  if(matches.length!==1)throw Error('原安排已变更或有重复记录，请重新打开日程。');
  original=matches[0];
 }
 if(visits.some(visit=>visit!==original&&belongsToTrip(visit,trip)&&visit.date===date))throw Error('这个地点当天已经安排，请查看或编辑已有安排。');
 const sameDay=original&&original.date===date;
 const order=sameDay?original.order:Math.max(0,...dayEntries(places,{trip,date}).map(entry=>Number.isFinite(entry.visit.order)?entry.visit.order:0))+1;
 const updated={...(original||{}),tripId:trip.id,date,start,end,order};
 const nextVisits=original?visits.map(visit=>visit===original?updated:visit):[...visits,updated];
 return places.map(item=>item===place?{...place,visits:nextVisits}:item);
}
function removeVisit(places,{placeId,trip,date}={}){
 const place=visitTarget(places,placeId,trip,date);
 return places.map(item=>item===place?{...place,visits:(place.visits||[]).filter(visit=>!(belongsToTrip(visit,trip)&&visit.date===date))}:item);
}
return{minute,day,coord,interval,route,filter,confirm,validate,tripDates,tripVisits,mapPlaces,saveVisit,removeVisit,dayEntries};
});
