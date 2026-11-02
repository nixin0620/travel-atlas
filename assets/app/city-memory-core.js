/* City keys never collide with legacy province IDs, including municipalities. */
(function (root) {
  'use strict';
  function catalog(data) {
    const places = new Map();
    for (const p of data.provinces.filter(p => !p.decorative)) {
      places.set(p.id, { ...p, province: p.id, legacy: true });
    }
    for (const c of data.cities) {
      places.set('city:' + c.id, { ...c, id: 'city:' + c.id, cityId: c.id, center: c.point, legacy: false });
    }
    return places;
  }
  // Prepare both writes before the caller commits them in one storage transaction.
  function move(source, targetId, target, places, now = new Date().toISOString()) {
    const from = places.get(source?.id), to = places.get(targetId);
    if (!from?.legacy || !to || to.legacy || from.province !== to.province) throw Error('请选择这个省份内的城市。');
    if (target && target.id !== targetId) throw Error('目标城市不匹配，未移动回忆。');
    if (!source.photos.length && !source.note.trim()) throw Error('先添加照片或写下一句话，再归入城市。');
    const photos = [...(target?.photos || []), ...source.photos];
    if (photos.length > 3) throw Error('合并后超过 3 张照片，请先整理两边的照片；原回忆仍保留。');
    const note = [target?.note?.trim(), source.note.trim()].filter(Boolean).join('\n');
    if (note.length > 300) throw Error('合并后的留言超过 300 字，请先精简留言；原回忆仍保留。');
    return [
      { id: targetId, note, photos, updatedAt: now },
      { id: source.id, note: '', photos: [], updatedAt: now }
    ];
  }
  const api = { catalog, move };
  root.CityMemoryCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
