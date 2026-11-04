const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = id => html.match(new RegExp('<script[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</script>'))[1];
const context = vm.createContext({ window: {} });
vm.runInContext(script('china-footprints-core'), context);
const C = context.window.ChinaFootprintsCore;
const data = JSON.parse(script('china-footprints-data'));
const known = new Set(data.cities.map(c => c.id));
const result = visited => JSON.parse(JSON.stringify(C.stats(visited, data.cities)));

test('visited statistics count distinct provinces, with municipalities counting once', () => {
  const stats = result({ '110000': '2026-10-20', '530800': '2026-10-20', '532800': '2026-10-20' });
  assert.equal(stats.cityCount, 3);
  assert.equal(stats.provinceIds.length, 2);
  assert.ok(stats.provinceIds.includes('110000'));
  assert.ok(stats.provinceIds.includes('530000'));
});

test('unmarking the last city removes its province; undo restores both totals', () => {
  let visited = { '110000': '2026-10-20', '530800': '2026-10-20', '532800': '2026-10-20' };
  const undo = { ...visited };
  delete visited['530800'];
  assert.equal(result(visited).provinceIds.length, 2);
  delete visited['532800'];
  assert.equal(result(visited).provinceIds.length, 1);
  assert.equal(result(visited).cityCount, 1);
  visited = undo;
  assert.equal(result(visited).cityCount, 3);
  assert.equal(result(visited).provinceIds.length, 2);
});

test('journey cities, duplicate imports and unknown city ids cannot inflate visited totals', () => {
  const trip = C.tripCities({ destinations: [{ name: '普洱' }, { name: '西双版纳' }, { name: '普洱市' }] }, data.cities);
  assert.equal(trip.length, 2);
  assert.equal(result({}).cityCount, 0);
  const imported = C.clean({ type: 'china-footprints', version: 1, cities: [
    { id: '530800' }, { id: '530800' }, { id: 'unknown' }
  ] }, known);
  assert.equal(imported.skipped, 1);
  assert.equal(result(imported.visited).cityCount, 1);
  assert.equal(result({ ...imported.visited, unknown: '2026-10-20' }).cityCount, 1);
});

test('changing the viewed city or reading memories cannot change the visited record', () => {
  const visited = { '530800': '2026-10-20' };
  const before = JSON.stringify(visited);
  const provinces = new Map(data.provinces.map(p => [p.id, p]));
  C.matches(data.cities.find(c => c.id === '532800'), '西双版纳', provinces);
  C.stats(visited, data.cities);
  C.pack(visited);
  assert.equal(JSON.stringify(visited), before);
});
