(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.TravelMapProvider=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
// Bounds mirror server.py: a search constraint, never evidence of POI identity.
const cities={
 banna:{name:'西双版纳',adcode:'532800',bbox:[99.8,21,101.9,22.8],center:[100.8,22]},
 puer:{name:'普洱',adcode:'530800',bbox:[99,22,102.4,24.9],center:[100.97,22.78]},
 yuxi:{name:'玉溪',adcode:'530400',bbox:[101.2,23.3,103.1,24.95],center:[102.54,24.35]},
 kunming:{name:'昆明',adcode:'530100',bbox:[102,24.2,103.8,26.6],center:[102.71,25.04]}
};
const extraCities=Object.create(null);
const cityFor=place=>cities[place.cityId]||extraCities[place.cityId]||(place.city?{name:place.city,adcode:place.city}:null);
const coordinates=p=>Boolean(p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180);
const sourced=p=>coordinates(p)&&p.confirmed===true&&typeof p.source==='string'&&Boolean(p.source.trim());
const inBounds=(p,c)=>Boolean(c&&coordinates(p)&&(!c.bbox||p.lng>=c.bbox[0]&&p.lng<=c.bbox[2]&&p.lat>=c.bbox[1]&&p.lat<=c.bbox[3]));
const cityMatches=(candidate,city)=>{
 const code=String(candidate.adcode||'');
 if(code&&/^\d{6}$/.test(city.adcode))return /^\d{6}$/.test(code)&&code.slice(0,4)===city.adcode.slice(0,4);
 const name=String(candidate.city||'');
 return Boolean(name&&city.name&&name.replace(/市$/,'')===city.name.replace(/市$/,''));
};
function point(location){
 const lng=typeof location?.getLng==='function'?location.getLng():Array.isArray(location)?location[0]:location?.lng;
 const lat=typeof location?.getLat==='function'?location.getLat():Array.isArray(location)?location[1]:location?.lat;
 return coordinates({lng,lat})?[lng,lat]:null;
}
function conversionDiagnostic(status,result){
 const safeStatus=['complete','error','no_data'].includes(status)?status:'unknown';
 const stringInfo=typeof result==='string'&&/^[A-Z][A-Z_]{2,60}$/.test(result)?result:null,rawInfo=result?.info;
 const info=stringInfo||(typeof rawInfo==='string'&&(rawInfo==='ok'||rawInfo==='OK'||(rawInfo.length<=80&&/^[A-Z]+(?:_[A-Z0-9]+)+$/.test(rawInfo)))?rawInfo:'unknown');
 const infocode=/^\d{1,6}$/.test(String(result?.infocode||''))?String(result.infocode):'unknown';
 // These three allowlisted scalar fields cannot contain a URL, Key or response body.
 root.console?.warn?.('[travel-map] coordinate conversion',safeStatus,info,infocode);
 const reason=info==='USERKEY_PLAT_NOMATCH'||infocode==='10009'?'Key 的服务平台与位置转换接口不匹配':
  safeStatus==='complete'?'服务返回的位置格式不完整':'位置转换服务暂不可用';
 return reason+'（'+[safeStatus,info,infocode].filter(value=>value!=='unknown').join(' / ')+ '）。';
}
function later(ms,run,message){
 return new Promise((resolve,reject)=>{let done=false;const timer=root.setTimeout(()=>finish(Error(message)),ms);
  function finish(error,value){if(done)return;done=true;root.clearTimeout(timer);error?reject(error):resolve(value);}
  try{run(finish);}catch(_){finish(Error(message));}
 });
}
async function json(url,ms){
 const controller=new root.AbortController(),timer=root.setTimeout(()=>controller.abort(),ms);
 try{const response=await root.fetch(url,{credentials:'omit',signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('服务暂不可用，请稍后重试。');return await response.json();}
 catch(_){throw Error('地图服务连接超时或暂不可用，请稍后重试。');}
 finally{root.clearTimeout(timer);}
}
let sdkPromise;
function loadSdk(key){
 if(sdkPromise)return sdkPromise;
 // The security code stays on the server. This must precede SDK loading.
 root._AMapSecurityConfig={serviceHost:root.location.origin+'/_AMapService'};
 if(root.AMap?.Map)return Promise.resolve(root.AMap);
 sdkPromise=later(15000,finish=>{
  const script=root.document.createElement('script');script.async=true;
  script.src='https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(key);
  script.onload=()=>root.AMap?.Map?finish(null,root.AMap):finish(Error('高德地图未能完成初始化，请刷新重试。'));
  script.onerror=()=>finish(Error('高德地图加载失败，地点列表仍可使用。'));
  root.document.head.appendChild(script);
 },'高德地图加载超时，地点列表仍可使用。').catch(error=>{sdkPromise=null;throw error;});
 return sdkPromise;
}
function plugin(A,name){
 const property=name.replace('AMap.','');
 if(A[property])return Promise.resolve();
 return later(10000,finish=>A.plugin(name,()=>A[property]?finish(null):finish(Error('地图搜索组件未加载，请稍后重试。'))),'地图组件加载超时，请稍后重试。');
}
function checkedConfirm(C,provider,place,candidate){
 const city=cityFor(place);
 if(!city||!inBounds(candidate,city)||!cityMatches(candidate,city))throw Error('候选位置不在当前城市，请核对名称和地址后再确认。');
 if(candidate.coordinateSystem==='WGS84')return C.confirm(place,candidate);
 if(provider!=='amap'||candidate.coordinateSystem!=='GCJ02'||candidate.provider!=='amap'||!candidate.id||!candidate.source)throw Error('这个候选位置暂不能用于当前地图。');
 return {...place,lat:candidate.lat,lng:candidate.lng,coordinateSystem:'GCJ02',confirmed:true,source:candidate.source,
  sourceURL:typeof candidate.sourceURL==='string'?candidate.sourceURL:'',poiId:candidate.id,address:candidate.address||place.address,
  locationAdcode:candidate.adcode,confirmedAt:new Date().toISOString()};
}
async function fallbackSearch(place,q){
 if(!cities[place.cityId])throw Error('请先确认地点所属城市。');
 const url=new URL('/api/map/poi',root.location.origin);url.searchParams.set('q',q);url.searchParams.set('city',place.city);url.searchParams.set('cityId',place.cityId);
 const data=await json(url.href,15000);
 return (Array.isArray(data.candidates)?data.candidates:[]).filter(c=>typeof c?.name==='string'&&c.coordinateSystem==='WGS84'&&inBounds(c,cities[place.cityId])&&cityMatches(c,cities[place.cityId])).slice(0,8);
}
function pin(name,label,selected,onSelect){
 const el=root.document.createElement('div'),span=root.document.createElement('span'),b=root.document.createElement('b');
 el.className='tm-marker'+(selected?' is-selected':'');el.style.width='34px';el.style.height='40px';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',name);
 b.textContent=label==null?'•':String(label);span.appendChild(b);el.appendChild(span);
 if(selected){const label=root.document.createElement('em');label.textContent=name;label.className='tm-pin-label';el.appendChild(label);}
 el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect();}});
 return el;
}
function emptyAdapter(C,onStatus,message){
 onStatus(message);
 return {provider:'unavailable',render:async()=>{},focus(){},resize(){},search:async()=>{throw Error(message);},confirm:(place,candidate)=>checkedConfirm(C,'unavailable',place,candidate),isLocated:p=>sourced(p)&&['WGS84','GCJ02'].includes(p.coordinateSystem),destroy(){}};
}
function createLeaflet(C,{element,onSelect,onStatus},prefix=''){
 const L=root.L;if(!L)return emptyAdapter(C,onStatus,'地图组件未加载，地点列表仍可使用。');
 const map=L.map(element,{scrollWheelZoom:false}).setView([22,100.8],12),layer=L.layerGroup().addTo(map),markers=new Map();let destroyed=false;
 const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
 let failed=false;tile.on('tileload',()=>{if(!destroyed&&!failed)onStatus(prefix);});tile.on('tileerror',()=>{failed=true;if(!destroyed)onStatus('部分底图未能加载，地点列表仍可使用。');});
 onStatus(prefix||'正在加载底图…');
 return {provider:'leaflet',isLocated:p=>C.coord(p),confirm:(p,c)=>checkedConfirm(C,'leaflet',p,c),search:fallbackSearch,
  async render(rows,selected,{fit=false,city:cityId='',labels={}}={}){
   if(destroyed)return;layer.clearLayers();markers.clear();
   rows.forEach((p,index)=>{if(!C.coord(p))return;const mark=L.marker([p.lat,p.lng],{title:p.name,alt:p.name,icon:L.divIcon({className:'',html:pin(p.name,labels[p.id],p.id===selected,()=>onSelect(p.id)),iconSize:[34,40],iconAnchor:[17,40]})}).addTo(layer);
    const label=root.document.createElement('span');label.textContent=p.name;mark.bindTooltip(label);mark.on('click',()=>onSelect(p.id));markers.set(p.id,mark);
   });
   if(fit&&markers.size)map.fitBounds(L.latLngBounds([...markers.values()].map(m=>m.getLatLng())),{padding:[42,42],maxZoom:16,animate:false});
   if(!markers.size){const city=cities[cityId]||(rows.length&&rows.every(p=>p.cityId===rows[0].cityId)?cities[rows[0].cityId]:null);map.setView(city?[city.center[1],city.center[0]]:[23.5,101.5],city?9:6,{animate:false});}
  },
  focus(id){const mark=markers.get(id);if(mark&&!destroyed)map.panTo(mark.getLatLng());},resize(){if(!destroyed)map.invalidateSize({pan:false});},destroy(){destroyed=true;map.remove();markers.clear();}
 };
}
function createAmap(C,A,{element,onSelect,onStatus,onPick}){
 const map=new A.Map(element,{zoom:12,center:cities.banna.center,viewMode:'2D',resizeEnable:true,scrollWheel:true,mapStyle:'amap://styles/normal',features:['bg','road','point'],showLabel:true}),markers=new Map(),conversionCache=new Map();
 let picking=false,previewMarker=null,pickEpoch=0;
 let destroyed=false,epoch=0,pendingFocus=null,loadMessage='正在加载高德底图…',locationMessage='',controlMessage='';
 const announce=()=>{if(!destroyed)onStatus([loadMessage,locationMessage,controlMessage].filter(Boolean).join(' '));};
 map.on('complete',()=>{loadMessage='';announce();});
 const loadTimer=root.setTimeout(()=>{if(loadMessage){loadMessage='底图仍在加载，地点列表可以继续使用。';announce();}},12000);
 plugin(A,'AMap.ToolBar').then(()=>{if(!destroyed)map.addControl(new A.ToolBar({position:'LT'}));}).catch(()=>{controlMessage='缩放工具暂不可用，可双击或双指缩放地图。';announce();});
 announce();
 map.on('click',event=>{const pos=point(event.lnglat);if(picking&&pos&&!destroyed)onPick({lng:pos[0],lat:pos[1]});});
 function clearPreview(){pickEpoch++;if(previewMarker){map.remove([previewMarker]);previewMarker=null;}}
 function preview(candidate){
  clearPreview();if(destroyed||!coordinates(candidate))return;
  const current=pickEpoch;
  const draw=pos=>{if(destroyed||current!==pickEpoch)return;previewMarker=new A.Marker({position:pos,content:pin(candidate.name||'选中的位置','+',true,()=>{}),offset:new A.Pixel(-17,-40),zIndex:400});map.add(previewMarker);if(candidate.manual)map.panTo(pos);else map.setZoomAndCenter(16,pos);};
  if(candidate.coordinateSystem==='GCJ02')draw([candidate.lng,candidate.lat]);
  else {prepareConversions([{...candidate,confirmed:true}]);conversionCache.get(candidate.lng+','+candidate.lat)?.then(draw).catch(()=>onStatus('预览位置转换失败，请重新选择。'));}
 }
 async function pick(place,pos){
  const city=cityFor(place);if(!city||!inBounds(pos,city))throw Error('选点超出当前城市，请切换城市后再选。');
  await plugin(A,'AMap.Geocoder');
  const result=await later(12000,finish=>new A.Geocoder({city:city.adcode,extensions:'base'}).getAddress([pos.lng,pos.lat],(status,result)=>status==='complete'&&result?.regeocode?finish(null,result.regeocode):finish(Error('地址暂未解析成功，请重新选点或搜索地点。'))),'地址查询超时，请重新选点。');
  const adcode=String(result.addressComponent?.adcode||''),component=result.addressComponent||{},resolvedCity=typeof component.city==='string'&&component.city?component.city:component.province||'';
  if(!cityMatches({adcode,city:resolvedCity},city))throw Error('选点不在当前城市，请切换城市后再选。');
  return {id:'manual:'+pos.lng.toFixed(6)+','+pos.lat.toFixed(6),name:'地图选点',lng:pos.lng,lat:pos.lat,city:city.name,cityId:place.cityId,adcode,address:result.formattedAddress||'',coordinateSystem:'GCJ02',provider:'amap',source:'高德地图 / 手动选点',manual:true};
 }
 const isLocated=p=>sourced(p)&&['WGS84','GCJ02'].includes(p.coordinateSystem);
 function prepareConversions(rows){
  const missing=new Map();for(const p of rows)if(isLocated(p)&&p.coordinateSystem==='WGS84'){const key=p.lng+','+p.lat;if(!conversionCache.has(key))missing.set(key,p);}
  const pairs=[...missing];
  for(let offset=0;offset<pairs.length;offset+=40){
   const batch=pairs.slice(offset,offset+40);
   const request=later(12000,finish=>A.convertFrom(batch.map(([,p])=>[p.lng,p.lat]),'gps',(status,result)=>{
    const locations=result?.locations;
    let converted=Array.isArray(locations)?locations.map(point):[];
    // Documented response is an array of LngLat; tolerate a single point only for a one-point request.
    if(batch.length===1&&(converted.length!==1||!converted[0])&&point(locations))converted=[point(locations)];
    const successInfo=result?.info===undefined||String(result.info).toLowerCase()==='ok';
    if(status!=='complete'||!successInfo||converted.length!==batch.length||converted.some(p=>!p))finish(Error(conversionDiagnostic(status,result)));
    else finish(null,converted);
   }),'位置转换超时，已保留地点列表，请稍后重试。');
   batch.forEach(([key],i)=>{const pending=request.then(values=>values[i]).catch(error=>{if(conversionCache.get(key)===pending)conversionCache.delete(key);throw error;});conversionCache.set(key,pending);});
  }
 }
 async function search(place,q){
  const city=cityFor(place);if(!city)throw Error('请先确认地点所属城市。');
  if(!String(q||'').trim())return [];
  await plugin(A,'AMap.PlaceSearch');if(destroyed)throw Error('地图已关闭，请重新打开。');
  const service=new A.PlaceSearch({city:city.adcode,citylimit:true,pageSize:8,pageIndex:1,extensions:'all',autoFitView:false});
  const results=await later(15000,finish=>service.search(String(q).trim(),(status,result)=>{
   if(status==='no_data')return finish(null,[]);
   if(status!=='complete')return finish(Error('高德地点搜索暂不可用，请稍后重试。'));
   finish(null,Array.isArray(result?.poiList?.pois)?result.poiList.pois:[]);
  }),'地点搜索超时，请稍后重试。');
  if(destroyed)throw Error('地图已关闭，请重新打开。');
  const seen=new Set();return results.map(p=>{
   const pos=point(p.location);if(!pos||typeof p.id!=='string'||!p.id||typeof p.name!=='string')return null;
   return {id:p.id,name:p.name,lng:pos[0],lat:pos[1],city:p.cityname||p.city||p.pname||'',adcode:String(p.adcode||''),cityId:place.cityId,
    address:[...new Set([p.pname,p.cityname,p.adname,typeof p.address==='string'?p.address:''].filter(Boolean))].join(''),
    coordinateSystem:'GCJ02',provider:'amap',source:'高德地图 / JS API',sourceURL:'https://www.amap.com/place/'+encodeURIComponent(p.id)};
  }).filter(c=>{if(!c||seen.has(c.id)||!inBounds(c,city)||!cityMatches(c,city))return false;seen.add(c.id);return true;}).slice(0,8);
 }
 return {provider:'amap',setCities(rows){for(const c of rows||[])if(c.id&&c.name&&!cities[c.id]&&extraCities[c.id]?.name!==c.name)extraCities[c.id]={name:c.name,adcode:c.name};},isLocated,search,preview,clearPreview,pick,setPicking(value){picking=Boolean(value);map.setDefaultCursor?.(picking?'crosshair':'grab');},confirm:(p,c)=>checkedConfirm(C,'amap',p,c),
  async render(rows,selected,{fit=false,city:cityId='',labels={}}={}){
   if(destroyed)return;const current=++epoch;
   if(pendingFocus!==selected)pendingFocus=null;
   if(markers.size)map.remove([...markers.values()]);markers.clear();
   prepareConversions(rows);
   const resolved=await Promise.all(rows.map(async(p,index)=>{if(!isLocated(p))return null;
    try{const pos=p.coordinateSystem==='GCJ02'?[p.lng,p.lat]:await conversionCache.get(p.lng+','+p.lat);return {p,index,pos};}
    catch(error){return {failed:true,message:error.message};}
   }));
   if(destroyed||current!==epoch)return;
   const failures=[...new Set(resolved.filter(p=>p?.failed).map(p=>p.message))];
   locationMessage=failures.length?failures.join(' ')+' 未在地图标点，原位置与地点列表仍保留。':'';
   for(const entry of resolved){if(!entry||entry.failed)continue;const {p,index,pos}=entry;
    const mark=new A.Marker({position:pos,content:pin(p.name,labels[p.id],p.id===selected,()=>onSelect(p.id)),offset:new A.Pixel(-17,-40),title:p.name,zIndex:p.id===selected?200:100});
    mark.on('click',()=>onSelect(p.id));map.add(mark);markers.set(p.id,mark);
   }
   if(fit&&markers.size)map.setFitView([...markers.values()],true,[48,40,48,40],16);
   if(!markers.size){const city=cities[cityId]||extraCities[cityId]||(rows.length&&rows.every(p=>p.cityId===rows[0].cityId)?cityFor(rows[0]):null);
    if(city&&!city.center){
     // This lookup only frames the selected city; it never creates a place marker.
     try{await plugin(A,'AMap.Geocoder');const pos=await later(10000,finish=>new A.Geocoder({city:city.name}).getLocation(city.name,(status,result)=>{const pos=point(result?.geocodes?.[0]?.location);status==='complete'&&pos?finish(null,pos):finish(Error('城市地图暂未加载，请搜索具体地点。'));}),'城市地图加载超时。');city.center=pos;if(current===epoch&&!destroyed)map.setZoomAndCenter(10,pos);}catch(error){if(current===epoch&&!destroyed){locationMessage=error.message;announce();}}
    }else map.setZoomAndCenter(city?9:6,city?city.center:[101.5,23.5]);
   }
   if(pendingFocus&&markers.has(pendingFocus)){map.panTo(markers.get(pendingFocus).getPosition());pendingFocus=null;}
   announce();
  },
  focus(id){if(destroyed)return;const mark=markers.get(id);if(mark)map.panTo(mark.getPosition());else pendingFocus=id;},
  resize(){if(!destroyed&&typeof map.resize==='function')map.resize();},
  destroy(){clearPreview();destroyed=true;epoch++;root.clearTimeout(loadTimer);markers.clear();conversionCache.clear();map.destroy();}
 };
}
async function create({element='map',onSelect=()=>{},onStatus=()=>{},onPick=()=>{}}={}){
 const C=root.TravelMapCore;if(!C)throw Error('地点数据组件未加载。');
 const options={element,onSelect,onStatus,onPick};let config;
 try{config=await json('/api/map/config',8000);}catch(_){return createLeaflet(C,options,'未能读取地图配置，暂用原底图。');}
 if(!config?.amapJsConfigured)return createLeaflet(C,options);
 if(typeof config.jsKey!=='string'||!config.jsKey.trim())return emptyAdapter(C,onStatus,'高德地图配置不完整，地点列表仍可使用。');
 try{return createAmap(C,await loadSdk(config.jsKey),options);}
 catch(_){return emptyAdapter(C,onStatus,'高德地图加载失败或超时，请刷新重试；地点列表仍可使用。');}
}
return {create};
});
