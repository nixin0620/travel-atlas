const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../city-memory-core.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = id => html.match(new RegExp('<script[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</script>'))[1];
const data = JSON.parse(script('china-footprints-data'));
const places = C.catalog(data);
const context = vm.createContext({});
vm.runInContext(script('guide-backup-feature'), context);
const B = context.TravelBackupCore;
const config = B.config({ tripId: 'test' }, { trip_id: 'test', todo_revision: '1' }, 'test');
const validators = { memoryIds: new Set(places.keys()) };
const backup = memories => ({ type: B.TYPE, version: 1, tripId: 'test', packingTripId: 'test', createdAt: '2026-10-04T00:00:00Z', records: Object.fromEntries(Object.keys(config.slots).map(k => [k, null])), media: { memories, references: [] } });
const row = (id, note = '', photos = []) => ({ id, note, photos, updatedAt: '' });

test('province and city identities stay distinct, including Beijing; city anchors use city coordinates', () => {
  assert.equal(places.get('110000').legacy, true);
  assert.equal(places.get('city:110000').legacy, false);
  assert.deepEqual(places.get('city:530800').center, data.cities.find(c => c.id === '530800').point);
  assert.notDeepEqual(places.get('city:530800').center, places.get('city:532800').center);
});

test('assigning a legacy memory merges without losing photos or notes and does not mutate sources', () => {
  const old = row('530000', '原来省级的留言', [{ id: 'old-photo' }]);
  const city = row('city:530800', '已有普洱留言', [{ id: 'city-photo' }]);
  const before = JSON.stringify([old, city]);
  const [merged, cleared] = C.move(old, city.id, city, places, '2026-10-04');
  assert.equal(merged.note, '已有普洱留言\n原来省级的留言');
  assert.deepEqual(merged.photos.map(p => p.id), ['city-photo', 'old-photo']);
  assert.equal(cleared.id, '530000');
  assert.equal(cleared.photos.length, 0);
  assert.equal(JSON.stringify([old, city]), before);
});

test('overfull or wrong-city assignments never truncate or move original content', () => {
  const old = row('530000', '旧留言', [{ id: 'old' }]);
  const full = row('city:530800', '', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.throws(() => C.move(old, full.id, full, places), /超过 3 张/);
  assert.throws(() => C.move(old, 'city:110000', null, places), /这个省份内/);
  assert.throws(() => C.move(old, full.id, row(full.id, '字'.repeat(300)), places), /超过 300 字/);
  assert.equal(old.photos.length, 1);
  assert.equal(full.photos.length, 3);
});

test('whole-guide backups accept old provinces and more than 34 cities together', () => {
  const memories = [row('530000', '保留的旧回忆'), ...data.cities.slice(0, 40).map(c => row('city:' + c.id, '城市留言'))];
  assert.doesNotThrow(() => B.validate(backup(memories), config, validators));
  assert.throws(() => B.validate(backup([row('city:unknown')]), config, validators), /格式不正确/);
  assert.throws(() => B.validate(backup([row('city:530800'), row('city:530800')]), config, validators), /格式不正确/);
  assert.doesNotThrow(() => B.validate(backup([row('110000'), row('city:110000')]), config, validators));
});
