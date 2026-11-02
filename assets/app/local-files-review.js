/* Read-only comparisons for the folder connection review. No storage writes. */
(function (global) {
  'use strict';
  const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
  const signature = (raw, settings = {}) => JSON.stringify(stable({ records: raw?.records || {}, media: raw?.media || {}, settings }));
  const same = (a, b) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));
  const orders = raw => { const r = raw?.records || {}; return r.journeyDraft || r.journeyApplied || {}; };
  function summary(raw) {
    const r = raw?.records || {}, o = orders(raw);
    return {
      orders: (o.transports?.length || 0) + (o.stays?.length || 0),
      screenshots: [...(o.transports || []), ...(o.stays || [])].filter(x => x.attachment).length,
      arrangements: r.dailyPlan?.entries?.length || 0,
      picks: ['sightPicks', 'foodPicks', 'shoppingPicks', 'experiencePicks'].reduce((n, key) => n + Object.values(r[key]?.choices || {}).filter(x => x !== 'skip').length, 0) + (r.guideImports?.items || []).filter(i => !i.linked && ['must','wish'].includes(i.choice)).length,
      cities: r.footprints?.cities?.length || 0,
      photos: (raw?.media?.memories || []).reduce((n, x) => n + (x.photos?.length || 0), 0) + (raw?.media?.references?.length || 0)
    };
  }
  const fieldNames = { fromCity: '出发城市', toCity: '到达城市', departDate: '出发日期', arrivalDate: '到达日期', departTime: '出发时间', arrivalTime: '到达时间', fromTerminal: '出发机场／车站', toTerminal: '到达机场／车站', number: '航班／车次', mode: '交通方式', checkedIn: '线上值机', city: '城市', hotel: '酒店', checkIn: '入住日期', checkOut: '退房日期', room: '房型', platform: '订单平台', price: '价格', priceMode: '计价方式', nightlyPrices: '每晚房价', nightlyRates: '每晚房价', address: '地址', note: '留言', notes: '备注', attachment: '订单截图', via: '经停', dayId: '所在日期', slot: '时段', time: '时间', text: '文字安排', place: '地点', locations: '地图位置', order: '排序', title: '标题', name: '名称', emoji: '图标', quantity: '数量', qty: '数量', done: '完成情况', checked: '完成情况', road: '路程预留', ahead: '到站预留', extra: '额外预留', photos: '照片', category: '所属分类', pricing: '计价方式', days: '日期', dataUrl: '图片', lat: '纬度', lng: '经度', url: '链接', mapUrl: '地图链接' };
  function valueText(value, key) {
    if (value === null || value === undefined || value === '') return '未填写';
    if (key === 'attachment') return '已附截图';
    if (key === 'photos') return value.length + ' 张照片';
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (typeof value === 'object') return Array.isArray(value) ? value.map(x => valueText(x)).join('；') : Object.entries(value).filter(([k]) => !['id', 'fingerprint', 'updatedAt', 'createdAt', 'source', 'src'].includes(k)).map(([k, v]) => (fieldNames[k] || k) + '：' + valueText(v, k)).join(' · ') || '已填写';
    if (typeof value === 'string' && value.startsWith('data:image/')) return '已附图片';
    const words = { rainforest: '雨林绿', coast: '海岸蓝', terracotta: '暖陶土', ink: '墨色', burgundy: '勃艮第', midnight: '午夜紫', google: 'Google 地图', apple: 'Apple 地图', route: '交通与住宿', daily: '每日行程', destinations: '目的地指南', booking: '旅行准备', morning: '上午', afternoon: '下午', evening: '晚上', flight: '飞机', train: '高铁／火车', car: '汽车', bus: '巴士', must: '一定安排', wish: '有时间再去', skip: '这次跳过', total: '按总价', nightly: '按每晚' };
    return words[value] || String(value);
  }
  function compare(a, b, names = {}, settingsA = {}, settingsB = {}) {
    const groups = [], ar = a?.records || {}, br = b?.records || {};
    const city = id => names.cities?.[String(id).replace(/^city:/, '')] || id;
    function group(id, label) { const g = { id, label, rows: [] }; groups.push(g); return g; }
    function row(g, label, x, y) { g.rows.push({ label, current: String(x), file: String(y) }); }
    function fields(g, label, x, y) {
      const ignore = new Set(['id', 'updatedAt', 'createdAt', 'fingerprint', 'version', 'tripId']);
      const before = g.rows.length;
      for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) {
        if (ignore.has(k) || same(x?.[k], y?.[k])) continue;
        let xv = valueText(x?.[k], k), yv = valueText(y?.[k], k);
        if (xv === yv) { xv += '（页面内容）'; yv += '（文件内容不同）'; }
        row(g, label + ' · ' + (fieldNames[k] || '其他信息'), xv, yv);
      }
      if (g.rows.length === before && !same(x, y)) row(g, label, '记录信息不同', '记录信息不同');
    }
    function list(g, xs = [], ys = [], title, describe) {
      const xm = new Map(xs.map((x, i) => [x.id ?? i, x])), ym = new Map(ys.map((y, i) => [y.id ?? i, y]));
      for (const id of new Set([...xm.keys(), ...ym.keys()])) {
        const x = xm.get(id), y = ym.get(id); if (same(x, y)) continue;
        const label = title(x || y);
        if (!x || !y) row(g, label, x ? describe(x) : '没有这条记录', y ? describe(y) : '没有这条记录');
        else fields(g, label, x, y);
      }
      if (same([...xm.keys()].sort(), [...ym.keys()].sort()) && !same([...xm.keys()], [...ym.keys()])) row(g, '排列顺序', xs.map(title).join(' → '), ys.map(title).join(' → '));
    }
    const journey = group('journey', '交通与住宿');
    const orderTitle = x => x.hotel || [x.fromCity, x.toCity].filter(Boolean).join(' → ') || '未命名订单';
    const orderInfo = x => [x.city, x.checkIn || x.departDate, x.checkOut || x.departTime, x.number, x.price ? '¥' + x.price : '', x.attachment ? '有截图' : ''].filter(Boolean).join(' · ') || '有这笔订单';
    for (const [slot, prefix] of [['journeyDraft', '编辑中的订单'], ['journeyApplied', '已用于行程的订单']]) {
      const x = ar[slot], y = br[slot]; if (same(x, y)) continue;
      const before = journey.rows.length;
      for (const k of ['transports', 'stays']) list(journey, x?.[k], y?.[k], o => prefix + ' · ' + orderTitle(o), orderInfo);
      if (before === journey.rows.length) row(journey, prefix, x ? '有记录' : '未建立', y ? '有记录，版本不同' : '未建立');
    }
    const daily = group('daily', '每日安排');
    list(daily, ar.dailyPlan?.entries, br.dailyPlan?.entries, x => x.text || x.place?.name || '每日安排', x => [x.dayId, valueText(x.slot), [x.time,x.endTime].filter(Boolean).join('–')].filter(Boolean).join(' · '));
    if (!same(ar.dailyPlan?.locations, br.dailyPlan?.locations)) row(daily, '地点定位', Object.keys(ar.dailyPlan?.locations || {}).length + ' 处定位', Object.keys(br.dailyPlan?.locations || {}).length + ' 处定位（位置记录不同）');
    const imports = group('guideImports', '导入攻略与地点判断');
    list(imports, (ar.guideImports?.items||[]).map(i=>({...i,id:i.sourceId})), (br.guideImports?.items||[]).map(i=>({...i,id:i.sourceId})), i=>i.place.name, i=>({wish:'想去',must:'一定要去',maybe:'待定',skip:'不考虑'}[i.choice]||'未判断')+' · '+i.sources.length+' 条推荐');
    list(imports, ar.guideImports?.guides, br.guideImports?.guides, g=>g.title, g=>'已保留原文与 '+g.images.length+' 张图片');
    const picks = group('picks', '想去清单');
    for (const [k, label] of [['sightPicks', '景点'], ['foodPicks', '美食'], ['shoppingPicks', '购物'], ['experiencePicks', '体验']]) {
      const x = ar[k]?.choices || {}, y = br[k]?.choices || {};
      for (const id of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[id] !== y[id]) row(picks, label + ' · ' + (names.picks?.[k + ':' + id] || id), x[id] ? valueText(x[id]) : '未选择', y[id] ? valueText(y[id]) : '未选择');
    }
    const feet = group('footprints', '城市足迹');
    const xm = new Map((ar.footprints?.cities || []).map(x => [x.id, x])), ym = new Map((br.footprints?.cities || []).map(x => [x.id, x]));
    for (const id of new Set([...xm.keys(), ...ym.keys()])) if (!xm.has(id) || !ym.has(id)) row(feet, city(id), xm.has(id) ? '已点亮' : '未点亮', ym.has(id) ? '已点亮' : '未点亮');
    if (!feet.rows.length && !same(ar.footprints, br.footprints)) row(feet, '足迹记录', '城市相同，记录时间或顺序不同', '城市相同，记录时间或顺序不同');
    const memoir = group('memoir', '旅行日期与城市心愿');
    // One compact row per visit keeps repeat visits distinct without dumping metadata.
    const visitInfo = visit => [city(visit.cityId), visit.startDate ? visit.startDate + (visit.endDate ? ' — ' + visit.endDate : '') : '时间未记录', visit.trip ? '旅行：' + visit.trip : '未归入旅行', '第 ' + visit.order + ' 站'].join(' · ');
    const pageVisits = new Map((ar.memoir?.visits || []).map(v => [v.id, v])), fileVisits = new Map((br.memoir?.visits || []).map(v => [v.id, v]));
    for (const id of new Set([...pageVisits.keys(), ...fileVisits.keys()])) {
      const x = pageVisits.get(id), y = fileVisits.get(id); if (same(x, y)) continue;
      const visit = x || y;
      row(memoir, city(visit.cityId) + '的到访 · ' + (visit.startDate || '时间未记录'), x ? visitInfo(x) : '没有这次到访', y ? visitInfo(y) : '没有这次到访');
    }
    const pageWishes = new Set(ar.memoir?.wishes || []), fileWishes = new Set(br.memoir?.wishes || []);
    for (const id of new Set([...pageWishes, ...fileWishes])) if (pageWishes.has(id) !== fileWishes.has(id)) row(memoir, city(id) + ' · 城市心愿', pageWishes.has(id) ? '想去' : '未加入心愿', fileWishes.has(id) ? '想去' : '未加入心愿');
    if (!memoir.rows.length && !same(ar.memoir, br.memoir)) row(memoir, '旅行回忆记录', ar.memoir ? '有记录' : '没有记录', br.memoir ? ar.memoir ? '内容相同，保存顺序或版本不同' : '有记录' : '没有记录');
    const media = group('media', '照片与留言');
    for (const k of ['memories', 'references']) list(media, a?.media?.[k], b?.media?.[k], x => k === 'memories' ? city(x.id) + '的回忆' : x.name || '旅行样片', x => k === 'memories' ? [x.photos.length + ' 张照片', x.note].filter(Boolean).join(' · ') : '1 张样片');
    const packing = group('packing', '行李与待办');
    const flatten = r => (r?.categories || []).flatMap(c => (c.items || []).map(x => ({ ...x, category: c.name })));
    list(packing, flatten(ar.packing), flatten(br.packing), x => x.name || x.title || '清单项目', x => (x.done || x.checked ? '已完成' : '未完成') + (x.quantity ? ' · ' + x.quantity : ''));
    if (!packing.rows.length && !same(ar.packing, br.packing)) row(packing, '分类与清单设置', '页面设置', '文件设置不同');
    const other = group('other', '其他记录与偏好');
    const labels = { reflection: '旅行心愿', transferPrefs: '接驳预留时间', mapProvider: '地图偏好', journeyUndo: '上次应用的撤销记录', packingPrevious: '旧待办备份' };
    for (const [k, label] of Object.entries(labels)) if (!same(ar[k], br[k])) row(other, label, ar[k] ? k === 'reflection' ? ar[k].wish || '未填写' : '有记录' : '没有记录', br[k] ? k === 'reflection' ? br[k].wish || '未填写' : '有记录，内容不同' : '没有记录');
    for (const k of new Set([...Object.keys(settingsA), ...Object.keys(settingsB)])) if (!same(settingsA[k], settingsB[k])) row(other, k === 'theme' ? '页面配色' : '上次浏览位置', valueText(settingsA[k]), valueText(settingsB[k]));
    // Retain a visible indication for metadata/schema differences that do not change a count.
    if (!groups.some(g => g.rows.length) && signature(a, settingsA) !== signature(b, settingsB)) row(other, '记录版本', '页面记录', '文件记录不同');
    return groups.filter(g => g.rows.length);
  }
  const api = { signature, summary, compare };
  global.TravelLocalReview = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
