const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../assets/app/travel-map-provider.js'),'utf8'),C=require('../assets/app/travel-map-core.js');
const place=(id='a',patch={})=>({id,name:'测试地点',city:'西双版纳',cityId:'banna',lat:22,lng:100.8,coordinateSystem:'WGS84',confirmed:true,source:'existing source',wish:true,visits:[{date:'2026-11-01',start:'09:00',end:'10:00',order:1}],...patch});
function element(tag){return {tag,style:{},children:[],events:{},setAttribute(k,v){this[k]=v;},appendChild(c){this.children.push(c);},addEventListener(k,fn){this.events[k]=fn;}};}
function environment({configured=true,sdk='ready',convert,pois=[],searchStatus='complete',pluginFailure=false,geocode}={}){
 const state={maps:[],conversionCalls:[],scripts:[],status:[],searchOptions:[],searches:[],warnings:[]};
 class MapMock{
  constructor(el,options){this.element=el;this.options=options;this.markers=[];this.events={};state.maps.push(this);}
  on(k,fn){this.events[k]=fn;}
  add(m){this.markers.push(m);}
  remove(items){this.markers=this.markers.filter(m=>!items.includes(m));}
  addControl(c){this.control=c;}
  setFitView(m,immediately,padding,maxZoom){this.fit={m,immediately,padding,maxZoom};}
  setZoomAndCenter(zoom,center){this.zoom=zoom;this.center=center;}
  panTo(p){this.pan=p;}
  resize(){this.resized=true;}
  destroy(){this.destroyed=true;}
 }
 class Marker{
  constructor(options){this.options=options;this.events={};}
  on(k,fn){this.events[k]=fn;}
  getPosition(){return this.options.position;}
 }
 const A={Map:MapMock,Marker,Pixel:class{constructor(x,y){this.x=x;this.y=y;}},ToolBar:class{},Geocoder:class{getLocation(name,cb){if(geocode)geocode(name,cb);else cb('complete',{geocodes:[{location:[116.4,39.9]}]});}getAddress(pos,cb){cb('complete',{regeocode:{formattedAddress:'云南省西双版纳傣族自治州景洪市测试街道',addressComponent:{adcode:'532801'}}});}},PlaceSearch:class{
  constructor(options){state.searchOptions.push(options);}
  search(q,cb){state.searches.push(q);cb(searchStatus,{poiList:{pois}});}
 },convertFrom(points,type,cb){state.conversionCalls.push({points,type});if(convert)convert(points,cb);else cb('complete',{info:'ok',locations:points.map(([lng,lat])=>[lng+0.001,lat+0.001])});},plugin(name,cb){if(!pluginFailure)cb();}};
 if(pluginFailure)delete A.PlaceSearch;
 const root={TravelMapCore:C,location:{origin:'http://127.0.0.1:8792'},AbortController,console:{warn:(...args)=>state.warnings.push(args)},
  fetch:async(url)=>({ok:true,json:async()=>String(url).includes('/api/map/config')?{amapJsConfigured:configured,jsKey:'test-public-key'}:{candidates:pois}}),
  setTimeout(fn,ms){const t=setTimeout(fn,pluginFailure&&ms===10000?1:ms);if(!(pluginFailure&&ms===10000))t.unref();return t;},clearTimeout,
  document:{createElement:element,head:{appendChild(script){state.scripts.push(script);state.securityAtAppend=root._AMapSecurityConfig;if(sdk==='load'){root.AMap=A;queueMicrotask(()=>script.onload());}else if(sdk==='error')queueMicrotask(()=>script.onerror());}}}
 };
 if(sdk==='ready')root.AMap=A;
 if(!configured){root.L={map(){const map=new MapMock();map.setView=function(center,zoom){this.center=center;this.zoom=zoom;return this;};map.fitBounds=function(bounds,options){this.fit={bounds,options};};map.invalidateSize=()=>{map.resized=true;};map.remove=()=>{map.destroyed=true;};return map;},
 layerGroup(){let map;return {addTo(m){map=m;return this;},clearLayers(){map.markers=[];},add(m){map.markers.push(m);}};},
 tileLayer(){return {addTo(){return this;},on(){return this;}};},divIcon:options=>options,latLngBounds:points=>points,
 marker(position,options){const m={position,options,events:{},addTo(layer){layer.add(this);return this;},bindTooltip(){return this;},on(k,fn){this.events[k]=fn;return this;},getLatLng(){return this.position;}};return m;}};}
 vm.runInNewContext(source,{window:root,URL,console,Map,Promise,Error,Date,Number,String,Boolean,Array,encodeURIComponent});
 return {root,state,create:()=>root.TravelMapProvider.create({element:'map',onStatus:text=>state.status.push(text),onSelect:id=>{state.selected=id;},onPick:p=>{state.picked=p;}})};
}
test('SDK loading configures only a same-origin security proxy before inserting the public-key script',async()=>{
 const env=environment({sdk:'load'}),adapter=await env.create();
 assert.equal(adapter.provider,'amap');assert.equal(env.state.securityAtAppend.serviceHost,'http://127.0.0.1:8792/_AMapService');
 assert.deepEqual(Object.keys(env.state.securityAtAppend),['serviceHost']);assert.match(env.state.scripts[0].src,/^https:\/\/webapi\.amap\.com\/maps\?v=2\.0&key=/);adapter.destroy();
});
test('WGS84 points are officially converted and cached without changing source coordinates or visits',async()=>{
 const env=environment(),adapter=await env.create(),p=place(),before=structuredClone(p);
 await adapter.render([p],p.id,{fit:true});
 assert.equal(env.state.conversionCalls[0].type,'gps');assert.deepEqual(Array.from(env.state.maps[0].markers[0].options.position),[100.801,22.001]);
 assert.deepEqual(p,before);await adapter.render([p],p.id);assert.equal(env.state.conversionCalls.length,1);adapter.destroy();
});
test('pins use one visual style and no uncertain points or route lines are rendered',async()=>{
 const env=environment(),adapter=await env.create();
 await adapter.render([place('unknown',{confirmed:false}),place('a'),place('b',{wish:false,coordinateSystem:'GCJ02',lat:22.2,lng:100.9})],'a');
 const marks=env.state.maps[0].markers;assert.equal(marks.length,2);assert.equal(marks[0].options.content.className,'tm-marker is-selected');assert.equal(marks[1].options.content.className,'tm-marker');
 assert.equal(marks[0].options.content.children[0].children[0].textContent,'•');marks[1].events.click();assert.equal(env.state.selected,'b');adapter.destroy();
});
test('a stale coordinate conversion never restores old-city markers; empty city filters clear markers and recenter',async()=>{
 let resolve;const env=environment({convert:(points,cb)=>{resolve=cb;}}),adapter=await env.create();
 const old=adapter.render([place('old')],'old');await adapter.render([place('new',{coordinateSystem:'GCJ02'})],'new');
 resolve('complete',{info:'ok',locations:[[100.801,22.001]]});await old;
 assert.equal(env.state.maps[0].markers[0].options.content['aria-label'],'测试地点');assert.equal(env.state.maps[0].markers.length,1);
 env.state.maps[0].markers[0].events.click();assert.equal(env.state.selected,'new');
 await adapter.render([],null,{fit:true,city:'kunming'});assert.equal(env.state.maps[0].markers.length,0);assert.deepEqual(Array.from(env.state.maps[0].center),[102.71,25.04]);adapter.destroy();
});
test('focus called while coordinates are converting waits for the matching rendered marker',async()=>{
 let resolve;const env=environment({convert:(points,cb)=>{resolve=cb;}}),adapter=await env.create();
 const rendering=adapter.render([place('a')],'a');adapter.focus('a');resolve('complete',{info:'ok',locations:[[100.801,22.001]]});await rendering;
 assert.deepEqual(Array.from(env.state.maps[0].pan),[100.801,22.001]);adapter.destroy();
});
test('failed conversions do not place WGS84 directly on the GCJ02 map',async()=>{
 const env=environment({convert:(points,cb)=>cb('error',{})}),adapter=await env.create();
 await adapter.render([place()],'a');assert.equal(env.state.maps[0].markers.length,0);assert.ok(env.state.status.some(text=>text.includes('未在地图标点')));adapter.destroy();
});
test('conversion diagnostics expose only status codes, never arbitrary response text or URLs',async()=>{
 const env=environment({convert:(points,cb)=>cb('error',{info:'USERKEY_PLAT_NOMATCH',infocode:'10009',url:'https://example.invalid/?key=private'})}),adapter=await env.create();
 await adapter.render([place()],'a');assert.deepEqual(env.state.warnings[0],['[travel-map] coordinate conversion','error','USERKEY_PLAT_NOMATCH','10009']);
 assert.ok(env.state.status.some(text=>text.includes('服务平台')));assert.equal(JSON.stringify(env.state.status).includes('private'),false);adapter.destroy();
 const unsafe=environment({convert:(points,cb)=>cb('https://example.invalid',{info:'abcdef0123456789abcdef0123456789',infocode:'https://example.invalid'})}),fallback=await unsafe.create();
 await fallback.render([place()],'a');assert.deepEqual(unsafe.state.warnings[0],['[travel-map] coordinate conversion','unknown','unknown','unknown']);fallback.destroy();
});
test('a complete single-point response may omit info and return a single LngLat without guessing coordinates',async()=>{
 const env=environment({convert:(points,cb)=>cb('complete',{locations:{getLng:()=>100.802,getLat:()=>22.002}})}),adapter=await env.create();
 await adapter.render([place()],'a');assert.deepEqual(Array.from(env.state.maps[0].markers[0].options.position),[100.802,22.002]);adapter.destroy();
});
test('SDK string errors are retained only when they match the uppercase enum allowlist',async()=>{
 for(const [result,expected] of [['USERKEY_PLAT_NOMATCH','USERKEY_PLAT_NOMATCH'],['INVALID_USER_SCODE','INVALID_USER_SCODE'],['https://example.invalid/?key=private','unknown'],['abcdef0123456789abcdef0123456789','unknown']]){
  const env=environment({convert:(points,cb)=>cb('error',result)}),adapter=await env.create();
  await adapter.render([place()],'a');assert.equal(env.state.warnings[0][2],expected);adapter.destroy();
 }
});
test('POI search limits by city adcode and rejects invalid, out-of-bounds, foreign and duplicate POIs',async()=>{
 const pois=[{id:'valid',name:'植物园',adcode:'532823',location:{lng:101.2,lat:21.9},cityname:'西双版纳傣族自治州',address:'勐仑镇'},
  {id:'outside',name:'错误坐标',adcode:'532823',location:{lng:116.4,lat:39.9}},
  {id:'foreign',name:'其他城市',adcode:'530100',location:{lng:101.2,lat:21.9}},
  {id:'valid',name:'重复',adcode:'532823',location:{lng:101.2,lat:21.9}}];
 const env=environment({pois}),adapter=await env.create(),candidates=await adapter.search(place(),'植物园');
 assert.equal(env.state.searchOptions[0].city,'532800');assert.equal(env.state.searchOptions[0].citylimit,true);assert.equal(candidates.length,1);assert.equal(candidates[0].coordinateSystem,'GCJ02');
 const input=place('unlocated',{confirmed:false}),before=structuredClone(input),saved=adapter.confirm(input,candidates[0]);assert.equal(saved.confirmed,true);assert.equal(saved.poiId,'valid');assert.deepEqual(saved.visits,input.visits);assert.equal(saved.wish,input.wish);assert.deepEqual(input,before);
 assert.throws(()=>adapter.confirm(input,{...candidates[0],adcode:'530100'}));assert.throws(()=>adapter.confirm(input,{...candidates[0],lat:39.9}));adapter.destroy();
});
test('SDK loading failure preserves a usable no-op adapter and reports the problem without leaking config',async()=>{
 const env=environment({sdk:'error'}),adapter=await env.create();assert.equal(adapter.provider,'unavailable');await adapter.render([place()],'a');
 assert.ok(env.state.status.some(text=>text.includes('地点列表仍可使用')));assert.equal(env.state.status.some(text=>text.includes('test-public-key')),false);await assert.rejects(()=>adapter.search(place(),'测试'));adapter.destroy();
});
test('search plugin failure rejects clearly and leaves rendered markers intact',async()=>{
 const env=environment({pluginFailure:true}),adapter=await env.create();await adapter.render([place('a',{coordinateSystem:'GCJ02'})],'a');
 await assert.rejects(()=>adapter.search(place(),'测试'),/组件加载超时/);assert.equal(env.state.maps[0].markers.length,1);adapter.destroy();
});
test('Leaflet fallback never renders or confirms GCJ02 and retains only sourced WGS84 markers',async()=>{
 const env=environment({configured:false}),adapter=await env.create();assert.equal(adapter.provider,'leaflet');
 await adapter.render([place(),place('gcj',{coordinateSystem:'GCJ02'}),place('unconfirmed',{confirmed:false})],'a');assert.equal(env.state.maps[0].markers.length,1);
 assert.throws(()=>adapter.confirm(place(),{id:'c',name:'c',city:'西双版纳',adcode:'532801',lat:22,lng:100.8,coordinateSystem:'GCJ02',provider:'amap',source:'amap'}));
 await adapter.render([],null,{city:'puer'});assert.deepEqual(Array.from(env.state.maps[0].center),[22.78,100.97]);adapter.destroy();
});

test('day labels preserve gaps and repeated visits; all-place pins remain unnumbered',async()=>{
 const env=environment(),adapter=await env.create();await adapter.render([place('a'),place('b')],'a',{labels:{a:'1·4',b:'3'}});
 assert.equal(env.state.maps[0].markers[0].options.content.children[0].children[0].textContent,'1·4');assert.equal(env.state.maps[0].markers[1].options.content.children[0].children[0].textContent,'3');adapter.destroy();
});
test('preview never changes source coordinates and is removed without removing saved pins',async()=>{
 const env=environment(),adapter=await env.create();await adapter.render([place('a',{coordinateSystem:'GCJ02'})],'a');
 const candidate={name:'预览',lat:22.1,lng:100.9,coordinateSystem:'GCJ02'},before=structuredClone(candidate);adapter.preview(candidate);
 assert.equal(env.state.maps[0].markers.length,2);assert.deepEqual(candidate,before);adapter.clearPreview();assert.equal(env.state.maps[0].markers.length,1);adapter.destroy();
});
test('manual selection is opt-in and uses clicked GCJ02 coordinates plus reverse-geocoded address',async()=>{
 const env=environment(),adapter=await env.create(),map=env.state.maps[0];map.events.click({lnglat:[100.8,22]});assert.equal(env.state.picked,undefined);
 adapter.setPicking(true);map.events.click({lnglat:[100.81,22.01]});assert.equal(env.state.picked.lng,100.81);
 const candidate=await adapter.pick(place(),env.state.picked),confirmed=adapter.confirm(place(),candidate);assert.equal(candidate.manual,true);assert.equal(confirmed.lng,100.81);assert.equal(confirmed.coordinateSystem,'GCJ02');assert.match(confirmed.address,/测试街道/);
 await assert.rejects(()=>adapter.pick(place(),{lng:116.4,lat:39.9}),/超出/);adapter.destroy();
});
test('manual searches also support trip cities outside the original four, and reject another city',async()=>{
 const env=environment({pois:[{id:'BJ-POI',name:'故宫博物院',cityname:'北京市',pname:'北京市',adcode:'110101',address:'景山前街4号',location:[116.397,39.918]},{id:'WRONG',name:'其他',cityname:'天津市',adcode:'120101',location:[117.2,39.1]}]}),adapter=await env.create();
 adapter.setCities([{id:'beijing',name:'北京'}]);const target={name:'故宫',cityId:'beijing',city:'北京'},results=await adapter.search(target,'故宫');assert.equal(results.length,1);assert.equal(results[0].id,'BJ-POI');assert.equal(adapter.confirm(target,results[0]).poiId,'BJ-POI');assert.throws(()=>adapter.confirm(target,{...results[0],city:'天津市'}),/不在当前城市/);adapter.destroy();
});
test('late city framing cannot move the map back after switching cities',async()=>{
 let finish,started;const ready=new Promise(resolve=>{started=resolve;});const env=environment({geocode:(name,cb)=>{finish=cb;started();}}),adapter=await env.create();adapter.setCities([{id:'beijing',name:'北京'}]);const pending=adapter.render([],null,{fit:true,city:'beijing'});await ready;
 await adapter.render([],null,{fit:true,city:'kunming'});finish('complete',{geocodes:[{location:[116.4,39.9]}]});await pending;assert.deepEqual(Array.from(env.state.maps[0].center),[102.71,25.04]);adapter.destroy();
});
