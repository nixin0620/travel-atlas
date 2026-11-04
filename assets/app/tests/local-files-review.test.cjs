/* Run: node tests/local-files-review.test.cjs. Synthetic records only. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../local-files-review.js');

const clone = value => structuredClone(value);
function sample() {
  const journey = { version: 2, tripId: 'review-test', transports: [
    { id: 'flight', mode: 'flight', fromCity: '北京', toCity: '西双版纳', departDate: '2026-09-25', departTime: '14:30', arrivalDate: '2026-09-25', arrivalTime: '18:55', number: 'CA1423', price: 2110 }
  ], stays: [
    { id: 'hotel', city: '西双版纳', hotel: '合成测试酒店', checkIn: '2026-09-25', checkOut: '2026-09-28', price: 1068 }
  ] };
  return { type: 'travel-handbook-backup', version: 1, tripId: 'review-test', createdAt: '2026-10-01T00:00:00Z', records: {
    journeyDraft: journey, journeyApplied: clone(journey), journeyUndo: null,
    dailyPlan: { version: 1, entries: [{ id: 'lunch', dayId: '2026-09-25', slot: 'afternoon', type: 'note', text: '在家吃午饭', time: '' }], locations: {} },
    sightPicks: { version: 1, choices: { park: 'must' } }, foodPicks: null, shoppingPicks: null, experiencePicks: null,
    footprints: { type: 'china-footprints', version: 1, cities: [{ id: '460200', markedAt: '2026-09-27T00:00:00Z' }] },
    packing: { version: 3, categories: [{ id: 'docs', name: '证件', items: [{ id: 'passport', name: '护照', checked: false, quantity: 1 }] }] },
    reflection: { version: 1, wish: '下次去看海' }, mapProvider: 'google', transferPrefs: {}, packingPrevious: null
  }, media: { memories: [{ id: 'city:460200', note: '海边的一天', photos: [{ id: 'photo', data: 'data:image/jpeg;base64,YQ==' }] }], references: [] } };
}
const names = { cities: { '460200': '三亚', '530800': '普洱' }, picks: { 'sightPicks:park': '合成测试公园' } };
const group = (a, b, id) => R.compare(a, b, names).find(x => x.id === id);

test('same counts still reveal changed transport times and hotel prices in draft and applied orders', () => {
  const page = sample(), disk = clone(page);
  disk.records.journeyDraft.transports[0].departTime = '16:20';
  disk.records.journeyApplied.stays[0].price = 1280;
  assert.deepEqual(R.summary(page), R.summary(disk));
  const rows = group(page, disk, 'journey').rows;
  assert(rows.some(x => /编辑中的订单.*出发时间/.test(x.label) && x.current === '14:30' && x.file === '16:20'));
  assert(rows.some(x => /已用于行程的订单.*价格/.test(x.label) && x.current === '1068' && x.file === '1280'));
});

test('equal city totals reveal the actual added and removed city names', () => {
  const page = sample(), disk = clone(page);
  disk.records.footprints.cities = [{ id: '530800', markedAt: '2026-09-27T00:00:00Z' }];
  assert.equal(R.summary(page).cities, R.summary(disk).cities);
  assert.deepEqual(group(page, disk, 'footprints').rows, [
    { label: '三亚', current: '已点亮', file: '未点亮' },
    { label: '普洱', current: '未点亮', file: '已点亮' }
  ]);
});

test('a deliberately unlit city remains unlit in the comparison; inputs are never merged', () => {
  const page = sample(), disk = clone(page);
  page.records.footprints.cities = [];
  const beforePage = JSON.stringify(page), beforeDisk = JSON.stringify(disk);
  assert.deepEqual(group(page, disk, 'footprints').rows, [{ label: '三亚', current: '未点亮', file: '已点亮' }]);
  assert.equal(JSON.stringify(page), beforePage);
  assert.equal(JSON.stringify(disk), beforeDisk);
});

test('changing a photo with the same photo count is reported without exposing base64', () => {
  const page = sample(), disk = clone(page);
  disk.media.memories[0].photos[0].data = 'data:image/jpeg;base64,Yg==';
  assert.equal(R.summary(page).photos, R.summary(disk).photos);
  const media = group(page, disk, 'media');
  assert(media.rows.some(x => /三亚.*照片/.test(x.label) && x.current !== x.file));
  assert(!JSON.stringify(media).includes('base64'));
  assert.notEqual(R.signature(page), R.signature(disk));
});

test('memory note and screenshot replacements remain visible even when totals match', () => {
  const page = sample(), disk = clone(page);
  page.records.journeyDraft.transports[0].attachment = { src: 'data:image/jpeg;base64,YQ==', name: 'order.jpg' };
  disk.records.journeyDraft.transports[0].attachment = { src: 'data:image/jpeg;base64,Yg==', name: 'order.jpg' };
  disk.media.memories[0].note = '日落时再去一次';
  assert.deepEqual(R.summary(page), R.summary(disk));
  assert(group(page, disk, 'journey').rows.some(x => /订单截图/.test(x.label) && x.current !== x.file));
  assert(group(page, disk, 'media').rows.some(x => /留言/.test(x.label) && x.current === '海边的一天' && x.file === '日落时再去一次'));
});

test('pick priority, daily time, and packing completion differences have readable values', () => {
  const page = sample(), disk = clone(page);
  disk.records.sightPicks.choices.park = 'wish';
  disk.records.dailyPlan.entries[0].slot = 'evening';
  disk.records.packing.categories[0].items[0].checked = true;
  assert(group(page, disk, 'picks').rows.some(x => x.label === '景点 · 合成测试公园' && x.current === '一定安排' && x.file === '有时间再去'));
  assert(group(page, disk, 'daily').rows.some(x => /时段/.test(x.label) && x.current === '下午' && x.file === '晚上'));
  assert(group(page, disk, 'packing').rows.some(x => /完成情况/.test(x.label) && x.current === '否' && x.file === '是'));
});

test('signature ignores snapshot creation time and object-key order, but retains array order', () => {
  const page = sample(), disk = clone(page);
  disk.createdAt = '2026-10-07T00:00:00Z';
  disk.records = Object.fromEntries(Object.entries(disk.records).reverse());
  disk.records.journeyDraft.transports[0] = Object.fromEntries(Object.entries(disk.records.journeyDraft.transports[0]).reverse());
  assert.equal(R.signature(page, { theme: 'rainforest', lastSection: 'route' }), R.signature(disk, { lastSection: 'route', theme: 'rainforest' }));
  assert.deepEqual(R.compare(page, disk, names), []);
  disk.records.journeyDraft.transports.push({ ...disk.records.journeyDraft.transports[0], id: 'flight-2', number: 'CA1000' });
  const reversed = clone(disk);
  reversed.records.journeyDraft.transports.reverse();
  assert.notEqual(R.signature(disk), R.signature(reversed));
  assert(group(disk, reversed, 'journey').rows.some(x => x.label === '排列顺序'));
});

test('same city with changed marking metadata is not silently treated as identical', () => {
  const page = sample(), disk = clone(page);
  disk.records.footprints.cities[0].markedAt = '2026-10-07T00:00:00Z';
  assert.notEqual(R.signature(page), R.signature(disk));
  assert(group(page, disk, 'footprints').rows.length > 0);
});

test('equal records with different settings are shown and require a choice', () => {
  const page = sample();
  assert.notEqual(R.signature(page, { theme: 'rainforest' }), R.signature(page, { theme: 'coast' }));
  const other = R.compare(page, page, names, { theme: 'rainforest' }, { theme: 'coast' }).find(x => x.id === 'other');
  assert(other.rows.some(x => x.label === '页面配色' && x.current !== x.file));
});

test('summary falls back to applied orders only when draft is absent, not deliberately empty', () => {
  const raw = sample();
  raw.records.journeyDraft = null;
  assert.equal(R.summary(raw).orders, 2);
  raw.records.journeyDraft = { version: 2, tripId: 'review-test', transports: [], stays: [] };
  assert.equal(R.summary(raw).orders, 0);
  assert(group(raw, sample(), 'journey').rows.some(x => x.current === '没有这条记录'));
});

test('visit date ranges, trip names and stop order stay visible alongside other differences', () => {
  const page = sample();
  page.records.memoir = { version: 1, visits: [{ id: 'visit-a', cityId: '460200', startDate: '2023-05-01', endDate: '2023-05-03', trip: '看海', order: 1 }], wishes: [] };
  const disk = clone(page);
  Object.assign(disk.records.memoir.visits[0], { startDate: '2024-05-02', endDate: '2024-05-04', trip: '春日旅行', order: 3 });
  disk.records.reflection.wish = '下次去看山';
  assert.deepEqual(R.summary(page), R.summary(disk));
  const rows = group(page, disk, 'memoir').rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].current, '三亚 · 2023-05-01 — 2023-05-03 · 旅行：看海 · 第 1 站');
  assert.equal(rows[0].file, '三亚 · 2024-05-02 — 2024-05-04 · 旅行：春日旅行 · 第 3 站');
  assert(group(page, disk, 'other').rows.some(x => x.label === '旅行心愿'));
});

test('repeated city visits compare individually and missing dates remain unrecorded', () => {
  const page = sample();
  page.records.memoir = { version: 1, visits: [
    { id: 'visit-a', cityId: '460200', startDate: '2023-05-01', endDate: '', trip: '看海', order: 1 },
    { id: 'visit-b', cityId: '460200', startDate: '', endDate: '', trip: '', order: 2 }
  ], wishes: [] };
  const disk = clone(page);
  disk.records.memoir.visits.splice(1, 1, { id: 'visit-c', cityId: '530800', startDate: '2024-09-01', endDate: '2024-09-01', trip: '秋游', order: 1 });
  const beforePage = JSON.stringify(page), beforeDisk = JSON.stringify(disk);
  const rows = group(page, disk, 'memoir').rows;
  assert.equal(rows.length, 2);
  assert(rows.some(x => x.label === '三亚的到访 · 时间未记录' && x.current === '三亚 · 时间未记录 · 未归入旅行 · 第 2 站' && x.file === '没有这次到访'));
  assert(rows.some(x => x.current === '没有这次到访' && x.file === '普洱 · 2024-09-01 — 2024-09-01 · 旅行：秋游 · 第 1 站'));
  assert.equal(JSON.stringify(page), beforePage);
  assert.equal(JSON.stringify(disk), beforeDisk);
});

test('city wishes show additions and removals independently of footprints and freeform wishes', () => {
  const page = sample();
  page.records.memoir = { version: 1, visits: [], wishes: ['460200'] };
  const disk = clone(page);
  disk.records.memoir.wishes = ['530800'];
  disk.records.reflection.wish = '下次去看山';
  assert.deepEqual(group(page, disk, 'memoir').rows, [
    { label: '三亚 · 城市心愿', current: '想去', file: '未加入心愿' },
    { label: '普洱 · 城市心愿', current: '未加入心愿', file: '想去' }
  ]);
  assert.equal(group(page, disk, 'footprints'), undefined);
  assert(group(page, disk, 'other').rows.some(x => x.label === '旅行心愿'));
});

test('older backups without memoir expose records that restoration would remove', () => {
  const legacy = sample(), page = clone(legacy);
  page.records.memoir = { version: 1, visits: [{ id: 'visit-a', cityId: '460200', startDate: '', endDate: '', trip: '夏日', order: 1 }], wishes: ['530800'] };
  const rows = group(page, legacy, 'memoir').rows;
  assert(rows.some(x => /三亚的到访/.test(x.label) && x.file === '没有这次到访'));
  assert(rows.some(x => x.label === '普洱 · 城市心愿' && x.file === '未加入心愿'));
  assert.equal(group(legacy, clone(legacy), 'memoir'), undefined);
  assert.equal(group(page, clone(page), 'memoir'), undefined);
});
