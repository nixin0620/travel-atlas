/* Planning dates are not bookings. Stored inside the existing journey backup. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TravelPlanCore = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw Error(message); };
  const text = (value, max = 180) => typeof value === 'string' && value.trim().length <= max ? value.trim() : fail('旅行规划文字格式不正确');
  // Match the existing TripData canonical names, including its legacy aliases.
  // Normalize before compiling IDs so content, native days and maps share a city.
  const cityName = value => {
    const name = text(value, 100).normalize('NFKC').replace(/\s+/g, ' ').replace(/市$/, '');
    return ({'西双版纳傣族自治州':'西双版纳','西双版纳州':'西双版纳','版纳':'西双版纳','景洪':'西双版纳'})[name] || name;
  };
  const add = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const validDate = date => /^20\d\d-\d\d-\d\d$/.test(date) && Number.isFinite(Date.parse(date + 'T00:00:00Z')) && add(date, 0) === date;
  function photo(value) {
    if (!value) return null;
    const url = text(value.url, 4000000);
    if (!/^(?:assets\/[\w./-]+|https:\/\/[^\s<>"'`]+|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/.test(url) || url.includes('/../')) fail('配图地址不正确');
    const sourceURL = text(value.sourceURL || '', 2000);
    if (!/^https:\/\/[^\s<>]+$/.test(sourceURL)) fail('配图需要来源页面');
    const licenseURL = value.licenseURL || '';
    if (licenseURL && !/^https:\/\/[^\s<>"'`]+$/.test(licenseURL)) fail('图片授权链接不正确');
    return {url, sourceURL, licenseURL, alt: text(value.alt || ''), credit: text(value.credit || '', 400), license: text(value.license || '', 200), width: Number(value.width) || 0, height: Number(value.height) || 0};
  }
  function location(value) {
    if (!value) return null;
    if (!Number.isFinite(value.latitude) || Math.abs(value.latitude)>90 || !Number.isFinite(value.longitude) || Math.abs(value.longitude)>180) fail('城市位置格式不正确');
    const timezone=text(value.timezone||'',100),sourceURL=text(value.sourceURL||'',2000);
    try {new Intl.DateTimeFormat('en',{timeZone:timezone});} catch(_){fail('城市需要有效时区');}
    if(!/^https:\/\/[^\s<>]+$/.test(sourceURL))fail('城市位置需要来源页面');
    return {latitude:value.latitude,longitude:value.longitude,timezone,sourceURL};
  }
  function tips(values) {
    if(values==null)return [];
    if(!Array.isArray(values)||values.length>30)fail('当地贴士格式不正确');
    return values.map(v=>{if(!['culture','safety','language'].includes(v.kind)||!/^https:\/\/[^\s<>]+$/.test(v.sourceURL||'')||!validDate(v.checkedAt))fail('贴士需要分类、来源和核验日期');return{kind:v.kind,title:text(v.title,100),text:text(v.text,600),sourceURL:text(v.sourceURL,2000),checkedAt:v.checkedAt};});
  }
  function packing(value) {
    if(!value)return {note:'',suggestions:[]};
    if(!Array.isArray(value.suggestions||[])||(value.suggestions||[]).length>50)fail('行李建议格式不正确');
    return {note:text(value.note||'',600),suggestions:(value.suggestions||[]).map(v=>{if(v.quantity!=null&&(!Number.isInteger(v.quantity)||v.quantity<1||v.quantity>999))fail('行李数量无效');return{name:text(v.name,120),reason:text(v.reason||'',600),quantity:v.quantity??null,category_name:text(v.category_name||'行程专属',50),emoji:text(v.emoji||'🎒',24)};})};
  }
  function clean(raw) {
    if (raw == null) return null;
    if (raw.version !== 1 || !Array.isArray(raw.days) || !raw.days.length || raw.days.length > 366 || !Array.isArray(raw.cities)) fail('旅行规划格式不正确');
    const cities = raw.cities.map(c => ({name: cityName(c.name), countryCode: /^[A-Z]{2}$/.test(c.countryCode) ? c.countryCode : null, photo: photo(c.photo),location:location(c.location),tips:tips(c.tips)}));
    if (cities.some(c => !c.name) || new Set(cities.map(c => c.name)).size !== cities.length) fail('规划城市不能为空或重复');
    const names = new Set(cities.map(c => c.name));
    const days = raw.days.map(d => {
      const date = text(d.date || '', 10), city = cityName(d.city), alsoCities = [...new Set((d.alsoCities || []).map(cityName))];
      if (!names.has(city) || alsoCities.some(c => !names.has(c))) fail('日期引用了未定义城市');
      if (date && !validDate(date)) fail('规划日期无效');
      return {date, city, alsoCities, title: text(d.title || ''), summary: text(d.summary || '', 600)};
    });
    if (days.some(d => d.date) && (!days[0].date || !days.every((d, i) => d.date === add(days[0].date, i)))) fail('规划日期须连续；日期待定时全部留空');
    if(raw.travelers!=null&&(!Number.isInteger(raw.travelers)||raw.travelers<1||raw.travelers>99))fail('人数需为1–99的整数或留空');
    return {version: 1, title: text(raw.title || ''), cover: photo(raw.cover), travelers:raw.travelers??null,packing:packing(raw.packing),cities, days};
  }
  function mergeView(view, state) {
    const plan = clean(state.plan);
    if (!plan) return view;
    const dated = Boolean(plan.days[0].date);
    // Undated recommendations must not move or relabel a dated booked journey.
    if (!dated && view.startDate) return view;
    const dates = [plan.days[0].date, view.startDate].filter(Boolean).sort();
    const ends = [plan.days.at(-1).date, view.endDate].filter(Boolean).sort();
    const startDate = dates[0] || '', endDate = ends.at(-1) || '';
    const count = dated ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1 : plan.days.length;
    if (count > 366) fail('合并后的行程超过 366 天，请核对订单与规划日期');
    const planDays = Array.from({length: count}, (_, i) => {
      const date = dated ? add(startDate, i) : '';
      const p = dated ? plan.days.find(d => d.date === date) : plan.days[i];
      const stay = state.stays.find(h => h.checkIn && h.checkOut && date >= h.checkIn && date < h.checkOut);
      const arrival = view.transports.filter(t => (t.arrivalDate || t.departDate) === date && t.toCity !== view.returnCity).at(-1);
      const city = stay?.city || arrival?.toCity || p?.city || view.stops.find(s => s.arrivalDate <= date && s.departureDate >= date)?.city || '待安排';
      return {...p, date, city, alsoCities: [...new Set([...(p?.alsoCities || []), p?.city, city].filter(Boolean))]};
    });
    const names = [...new Set(planDays.flatMap(d => [d.city, ...d.alsoCities]).filter(c => c !== '待安排'))];
    const stops = names.map(city => {
      const existing = view.stops.find(s => s.city === city), visits = planDays.filter(d => d.city === city || d.alsoCities.includes(city));
      const bookings = state.stays.filter(s => s.city === city);
      return {...existing, city, bookings, issues: existing?.issues || [], nights: Math.max(0, planDays.slice(0, -1).filter(d => d.city === city).length), arrivalDate: visits[0]?.date || '', departureDate: visits.at(-1)?.date || ''};
    });
    return {...view, real: true, planning: true, planDays, stops, startDate, endDate, days: count, nights: Math.max(0, count - 1), durationKnown: true, nightsKnown: true};
  }
  function routeCheck(view, original) {
    if (!view.planning) return original;
    const issues = original.issues.filter(i => !['stay','transport'].includes(i.kind)), legs = [], stops = new Map();
    const addLeg=(from,to,date,role)=>{if(view.transports.some(t=>t.fromCity===from&&t.toCity===to&&(t.departDate||t.arrivalDate)===date))return;const item={kind:'transport',from,to,date,role,title:(from||'出发地')+' → '+(to||'下一站 / 返程')+'：交通待确认'};legs.push(item);issues.push(item);};
    let previous='';
    for (const day of view.planDays) {
      if(day.city!==previous)addLeg(previous,day.city,day.date,previous?'城际':'去程');
      for(const city of day.alsoCities.filter(c=>c!==day.city)){addLeg(day.city,city,day.date,'当日往返');addLeg(city,day.city,day.date,'当日往返');}
      previous=day.city;
    }
    if(previous)addLeg(previous,'',view.endDate,'离开');
    for(const stop of view.stops){
      const local=[], missing=view.planDays.slice(0,-1).filter(d=>d.city===stop.city&&!stop.bookings.some(h=>d.date&&h.checkIn<=d.date&&h.checkOut>d.date));
      const groups=[];for(const d of missing){const last=groups.at(-1);if(d.date&&last&&last.end===d.date)last.end=add(d.date,1);else groups.push({start:d.date,end:d.date?add(d.date,1):'',count:1});}
      for(const g of groups){const count=g.start?Math.round((Date.parse(g.end)-Date.parse(g.start))/86400000):g.count,item={kind:'stay',city:stop.city,checkIn:g.start,checkOut:g.end,count,title:stop.city+'：'+(g.start?g.start+' — '+g.end+' · ':'')+count+' 晚住宿待确认'};local.push(item);issues.push(item);}
      stops.set(stop.city,{start:stop.arrivalDate,end:stop.departureDate,nightCount:stop.nights,issues:local});
    }
    return {issues,legs,stops};
  }
  return {clean, mergeView, photo, copy, cityName, routeCheck};
});
