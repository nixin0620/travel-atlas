/* Build a first-browser snapshot before any UI module reads or writes storage. */
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw Error(message); };
  function prepare(initial) {
    const next = copy(initial);
    // A supplied baseline or legacy browser values already belong to the user.
    // Empty/deleted saved snapshots never reach this function: the bridge reuses them.
    const occupied = Object.keys(next.values).length || Object.values(next.media).some(rows => rows?.length);
    if (occupied) return next;
    if (!Object.hasOwn(root, 'TravelPlanSeed')) fail('初始旅行文件未能载入，请重新载入重试。');
    const seed = root.TravelPlanSeed;
    if (seed !== null && (!seed || typeof seed !== 'object' || Array.isArray(seed))) fail('初始旅行文件格式不正确，请重新生成后重试。');
    const marker = {version:1, status:seed ? 'applied' : 'empty', seedId:seed?.id || null};
    if (!seed) return {...next, initialContent:marker};
    const journeySeed = JSON.parse(root.document.getElementById('journey-seed').textContent);
    const packing = JSON.parse(root.document.getElementById('packing-data').textContent);
    const B = root.TravelBackupCore, J = root.TravelJourneyCore;
    const c = B.config(journeySeed, packing, root.document.body.dataset.handbookDestination);
    if (seed.version !== 1 || !seed.id || seed.tripId !== c.tripId || !seed.journey?.plan) fail('初始旅行内容不完整或不属于当前旅行。');
    const journey = J.clean(seed.journey, c.tripId);
    const trip = root.TripData.build(J.model(journey), journey);
    const imports = root.DotImportCore.validate(copy(seed.imports), c.tripId);
    const daily = copy(seed.daily);
    const records = Object.fromEntries(Object.keys(c.slots).map(slot => [slot, null]));
    Object.assign(records, {journeyDraft:journey, journeyApplied:journey, guideImports:imports, dailyPlan:daily});
    const raw = {type:B.TYPE, version:B.VERSION, tripId:c.tripId, packingTripId:c.packingTripId,
      createdAt:new Date().toISOString(), records, media:next.media};
    B.validate(raw, c, {journey:value => J.clean(value, c.tripId)});
    for (const entry of daily.entries) {
      if (!root.DailyPlanCore.active(entry, trip)) fail('初始日程与旅行日期或城市不匹配。');
      if (entry.type !== 'note' && !imports.items.some(item => item.sourceId === entry.place.sourceId && item.choice)) fail('初始日程缺少关联的 My Pick 地点。');
    }
    const photos = [journey.plan.cover, ...journey.plan.cities.map(city => city.photo),
      ...imports.items.flatMap(item => item.place.publicPhotos || []),
      ...daily.entries.flatMap(entry => entry.place?.publicPhotos || [])].filter(Boolean);
    if (photos.some(photo => !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.url))) fail('初始照片未完整打包，请重新生成旅行内容。');
    if (new Blob([JSON.stringify(raw)]).size > B.MAX_BYTES) fail('初始旅行内容超过备份容量，请压缩图片后重试。');
    for (const [slot, value] of Object.entries(records)) if (value !== null) next.values[c.slots[slot].key] = JSON.stringify(value);
    next.initialContent = marker;
    return next;
  }
  root.TravelInitialContent = {prepare};
})(typeof window === 'object' ? window : globalThis);
