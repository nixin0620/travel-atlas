#!/usr/bin/env node
/* Compile researched content into the existing app's records, not custom HTML. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Plan = require('../assets/app/travel-plan-core.js');
const Imports = require('../assets/app/dot-import-core.js');
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);
const cityKey = value => {const name=Plan.cityName(value);return ({'丽江':'lijiang','普洱':'puer','西双版纳':'banna','昆明':'kunming','玉溪':'yuxi'}[name] || 'city-' + Array.from(name.toLowerCase()).map(c => c.codePointAt(0).toString(16)).join('-'));};
const fail = message => {throw Error(message);};
function compile(profile, base, tripId = 'travel-atlas-public-v1') {
  if (profile.version !== 1 || !Array.isArray(profile.places) || profile.places.length > 200) fail('需要 version:1 的旅行内容包');
  profile = {...profile, cities:profile.cities?.map(c=>({...c,name:Plan.cityName(c.name)})), days:profile.days?.map(d=>({...d,city:Plan.cityName(d.city),alsoCities:(d.alsoCities||[]).map(Plan.cityName)})), places:profile.places.map(p=>({...p,city:Plan.cityName(p.city)}))};
  const warnings = [];
  const photo = p => {
    if (!p) return null;
    if (!p.file || !p.credit || !p.license) fail('图片需提供 file、credit、license 和 sourceURL');
    const target = fs.realpathSync(path.resolve(base, p.file)), root = fs.realpathSync(base) + path.sep;
    if (!target.startsWith(root)) fail('图片必须在内容包目录内');
    const bytes = fs.readFileSync(target), ext = path.extname(target).toLowerCase(), type = {'.jpg':'jpeg','.jpeg':'jpeg','.png':'png','.webp':'webp'}[ext];
    if (!type || bytes.length > 2200000) fail('图片需为 JPEG/PNG/WebP，单张不超过 2.2 MB');
    const signature = type === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 : type === 'png' ? bytes.subarray(1,4).toString() === 'PNG' : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!signature || !(p.width >= 480 && p.height >= 240)) fail('请先检查图片真实格式、尺寸和清晰度');
    return Plan.photo({...p, url:'data:image/' + type + ';base64,' + bytes.toString('base64')});
  };
  const plan = Plan.clean({...profile, cover:photo(profile.cover), cities:profile.cities.map(c => ({...c, photo:photo(c.photo)}))});
  const names = new Set(plan.cities.map(c => c.name)), places = new Map(), sourceIds = new Set();
  const items = profile.places.map(p => {
    if (!/^[\w-]{1,80}$/.test(p.id || '') || places.has(p.id)) fail('地点 id 缺失或重复');
    if (!names.has(p.city) || !['sight','food','experience','shopping'].includes(p.kind) || !p.name?.trim() || !p.description?.trim()) fail('地点需要明确的城市、分类、名称和一句话介绍');
    if (!p.address?.trim()) fail(p.name + ' 缺少具体地址；菜名、城市名不能代替可安排的地点');
    if (!Array.isArray(p.sources) || !p.sources.length || p.sources.some(s => !/^https:\/\/[^\s<>]+$/.test(s.url) || !s.title || !/^20\d\d-\d\d-\d\d$/.test(s.checkedAt))) fail(p.name + ' 缺少已核对来源');
    const evidenceSources=p.sources.map(source=>{const reasons=source.reasons||[{label:'核心体验',text:p.description}];if(!Array.isArray(reasons)||!reasons.length||reasons.length>30||reasons.some(r=>typeof r.text!=='string'||!r.text.trim()||r.text.length>2000||r.label&&typeof r.label!=='string'))fail(p.name+' 的来源说明格式不正确');return {...source,reasons:reasons.map(r=>({label:r.label||'',text:r.text}))};});
    const sourceId = p.kind + ':atlas-' + hash(p.city + '|' + p.kind + '|' + p.name.trim());
    if (sourceIds.has(sourceId)) fail('重复地点：' + p.name);
    sourceIds.add(sourceId);
    const image = photo(p.photo);
    if (!image) warnings.push(p.name + '：缺少地点实景图片');
    const location = p.location;
    if (location && (!Number.isFinite(location.lat) || Math.abs(location.lat) > 90 || !Number.isFinite(location.lng) || Math.abs(location.lng) > 180 || !['WGS84','GCJ02'].includes(location.coordinateSystem) || !/^https:\/\//.test(location.sourceURL || ''))) fail(p.name + ' 坐标缺少可核对来源或坐标系');
    if (!location) warnings.push(p.name + '：位置尚待地图确认');
    const place = {sourceId, kind:p.kind, cityId:cityKey(p.city), city:p.city, name:p.name.trim(), address:p.address, description:p.description, openingNote:p.description,
      lat:location?.lat ?? null, lng:location?.lng ?? null, coordinateSystem:location?.coordinateSystem, geoSource:location ? '资料参考位置 · ' + location.sourceURL : '', locationPending:!location,
      poiId:location ? 'reference:' + hash(location.sourceURL) : '', coordinateEvidence:location ? {provider:'reference',poiId:'reference:' + hash(location.sourceURL),lat:location.lat,lng:location.lng,coordinateSystem:location.coordinateSystem,source:location.sourceURL,confirmedAt:p.sources[0].checkedAt+'T00:00:00Z',matchMethod:'researched-reference'} : null,
      publicPhotos:image ? [image] : [], publicEvidence:evidenceSources.map((s, i) => ({...s, id:sourceId + ':' + i, type:'system'}))};
    places.set(p.id, place);
    return {sourceId, place, city:p.city, choice:p.wanted === true ? 'wish' : null, linked:false, sources:[]};
  });
  const entries = [];
  profile.days.forEach((d, i) => {
    for (const [n, stop] of (d.stops || []).entries()) {
      const slot = stop.slot || 'morning', dayId = d.date || 'plan-' + (i + 1), time = stop.time || '', endTime = stop.endTime || '';
      if (!['morning','afternoon','evening'].includes(slot)) fail('日程时段无效');
      if ((time || endTime) && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= time)) fail('日程时间需完整且结束晚于开始');
      if (stop.note) {entries.push({id:'atlas-note-' + hash(dayId + '|' + n + '|' + stop.note), dayId, slot, time, endTime, type:'note', text:stop.note});continue;}
      const place = places.get(stop.placeId);
      if (!place || ![d.city,...(d.alsoCities || [])].includes(place.city)) fail('安排的地点与当天城市不匹配：' + stop.placeId);
      const id = 'atlas-visit-' + hash(dayId + '|' + place.sourceId);
      if (entries.some(e => e.id === id)) fail('同一天重复安排地点：' + place.name);
      entries.push({id, dayId, slot, time, endTime, place});
      items.find(item => item.sourceId === place.sourceId).choice = 'wish';
    }
  });
  if (!plan.cover) warnings.push('缺少目的地封面图片');
  const missingPhotos = [
    ...(!plan.cover ? ['目的地封面'] : []),
    ...plan.cities.filter(c=>!c.photo).map(c=>'城市：'+c.name),
    ...items.filter(i=>!i.place.publicPhotos.length).map(i=>'地点：'+i.place.name)
  ];
  const imports = Imports.validate({version:1,tripId,items,guides:[]},tripId);
  const journey = {version:2,tripId,initialized:true,transports:[],stays:[],plan};
  const daily = {version:1,entries,locations:{}};
  const result = {version:1, id:hash(JSON.stringify(profile)), tripId, journey, imports, daily,
    report:{cities:plan.cities.length, days:plan.days.length, places:items.length, scheduled:entries.filter(e=>e.type!=='note').length, photos:items.filter(i=>i.place.publicPhotos.length).length, visualReady:missingPhotos.length===0, missingPhotos, warnings}};
  if (Buffer.byteLength(JSON.stringify(result)) > 65000000) fail('内容包过大，请压缩图片');
  return result;
}
function install(profileFile, workspace, {allowIncomplete=false} = {}) {
  const base = path.dirname(path.resolve(profileFile)), marker = path.join(workspace,'.travel-atlas-workspace.json');
  if (!fs.existsSync(marker) || JSON.parse(fs.readFileSync(marker)).app !== 'travel-atlas') fail('请先用 start.py 创建个人工作目录');
  if (JSON.parse(fs.readFileSync(marker)).demo) fail('个人内容不写入示例工作目录');
  const html = fs.readFileSync(path.join(workspace,'index.html'),'utf8');
  if (!html.includes('travel-plan-import.js') || !html.includes('TravelPlanCore.clean')) fail('工作目录是旧版应用；先保留备份并升级应用，不要改写 HTML 拼接攻略');
  const seed = JSON.parse(html.match(/<script[^>]*id="journey-seed"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const compiled = compile(JSON.parse(fs.readFileSync(profileFile,'utf8')),base,seed.tripId);
  if (!compiled.report.visualReady && !allowIncomplete) fail('图文规划尚未完成，缺少图片：'+compiled.report.missingPhotos.join('、')+'。请补齐后再安装；仅在用户接受无图草稿时使用 --allow-incomplete。已有规划未修改。');
  const file = path.join(workspace,'travel-plan-seed.js');
  const content = '/* Generated researched content; applied through the native planner. */\nwindow.TravelPlanSeed = ' + JSON.stringify(compiled).replace(/</g,'\\u003c') + ';\n';
  if (fs.existsSync(file) && fs.readFileSync(file,'utf8') !== content && fs.statSync(file).size > 200) fs.copyFileSync(file,file + '.' + Date.now() + '.bak');
  fs.writeFileSync(file + '.tmp',content);fs.renameSync(file + '.tmp',file);
  fs.writeFileSync(path.join(workspace,'travel-plan-report.json'),JSON.stringify(compiled.report,null,2));
  return compiled.report;
}
module.exports = {compile,install,cityKey};
if (require.main === module) {
  try {if(process.argv.length !== 4 && !(process.argv.length===5&&process.argv[4]==='--allow-incomplete')) fail('用法：node scripts/build-trip.cjs <trip.json> <个人工作目录> [--allow-incomplete]');console.log(JSON.stringify(install(process.argv[2],process.argv[3],{allowIncomplete:process.argv[4]==='--allow-incomplete'}),null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
