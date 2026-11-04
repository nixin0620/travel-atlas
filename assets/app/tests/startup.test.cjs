const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script id="travel-startup-controller">([\s\S]*?)<\/script>/)[1];

function boot({ missingStorage = false, bootError = null, missingGuide = false, renderState = 'ready', hash = '#destinations' } = {}) {
  const handlers = {}, frames = [], timers = new Map(), callbacks = [];
  const nodes = Object.fromEntries(['travel-startup', 'travel-startup-title', 'travel-startup-message', 'travel-startup-retry', 'place-first-guide'].map(id => [id, { hidden: false, dataset: {}, textContent: '', addEventListener: (name, fn) => { handlers[name] = fn; } }]));
  nodes['place-first-guide'].dataset.renderState = renderState;
  nodes['travel-startup-retry'].hidden = true;
  nodes['travel-startup-title'].hidden = true;
  let inert = true, reloads = 0;
  const documentElement = { dataset: { travelBoot: 'loading' } };
  const window = { TripData: {}, DailyPlanner: {}, DestinationGuide: {}, GuideDiscovery: missingGuide ? null : {}, TravelStorage: missingStorage ? null : { bootError, whenReady: fn => callbacks.push(fn) } };
  const context = { window, document: { documentElement, getElementById: id => nodes[id], querySelector: () => ({ removeAttribute: name => { if (name === 'inert') inert = false; } }), addEventListener: (name, fn) => { handlers[name] = fn; } }, location: { hash, href: 'http://127.0.0.1:8787/' + hash, reload: () => { reloads++; } }, performance: { now: () => 100 }, setTimeout: fn => { timers.set(1, fn); return 1; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => frames.push(fn) };
  vm.runInNewContext(script, context);
  return { nodes, window, state: () => documentElement.dataset.travelBoot, inert: () => inert, reloads: () => reloads, timerCount: () => timers.size,
    dom: () => handlers.DOMContentLoaded(), storage: () => callbacks.forEach(fn => fn()), frame: () => frames.splice(0).forEach(fn => fn()), timeout: () => timers.get(1)?.(), retry: () => handlers.click({ preventDefault() {} }) };
}

test('initial HTML gates both legacy content and focus before any external asset', () => {
  assert.match(html.slice(0, 150), /data-travel-boot="loading"/);
  assert.ok(html.indexOf('id="travel-startup-critical"') < html.indexOf('<link rel="stylesheet"'));
  assert.ok(html.indexOf('id="travel-startup-controller"') < html.indexOf('<link rel="stylesheet"'));
  assert.ok(html.indexOf('id="travel-startup"') < html.indexOf('<main inert>'));
  assert.match(html, /body>:not\(#travel-startup\) \*\{visibility:hidden!important/);
  assert.match(html, /<noscript>[\s\S]*?请启用 JavaScript/);
});
test('startup uses the existing home cover for every chapter without a separate skeleton', () => {
  const cover = html.slice(html.indexOf('<div id="travel-startup"'), html.indexOf('<main inert>'));
  const home = html.slice(html.indexOf('<header class="hero jungle-cover"'), html.indexOf('<section id="china-footprints"'));
  assert.equal(cover.match(/<img[^>]+src="([^"]+)"/)[1], home.match(/<img[^>]+src="([^"]+)"/)[1]);
  assert.match(cover, /<span>沿途，<\/span><em>慢慢走。<\/em>/);
  assert.doesNotMatch(cover, /skeleton|startup-atlas|startup-china|startup-links/);
  for (const hash of ['#china-footprints', '#route', '#daily', '#destinations', '#booking', '#unknown']) {
    const app = boot({ hash });
    app.dom();
    assert.equal(app.nodes['travel-startup-title'].hidden, true);
    assert.equal(app.nodes['travel-startup-retry'].href, 'http://127.0.0.1:8787/' + hash);
    assert.equal(app.state(), 'loading');
  }
});
test('public startup keeps photos external and ships no private catalog', () => {
  // The 7fd7247 public HTML baseline is 2.18 MB; guard against embedded catalogs.
  assert(Buffer.byteLength(html) < 2_300_000, 'Startup HTML grew beyond the public baseline allowance');
  assert.doesNotMatch(html, /assets\/catalog\/[a-f0-9]{24}\.(?:jpg|png|webp)/);
  const cover = fs.readFileSync(path.join(__dirname, '../assets/demo-landscape.svg'), 'utf8');
  assert.match(cover, /<svg/);
  assert.doesNotMatch(html, /data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{10000}/);
});
test('slow storage keeps legacy content hidden; readiness, not a fixed delay, opens the UI', () => {
  const app = boot(); app.dom();
  assert.equal(app.state(), 'loading'); assert.equal(app.inert(), true);
  app.frame(); assert.equal(app.state(), 'loading');
  app.storage(); app.frame(); assert.equal(app.state(), 'loading');
  app.frame(); assert.equal(app.state(), 'ready');
  assert.equal(app.inert(), false); assert.equal(app.nodes['travel-startup'].hidden, true);
  assert.equal(app.timerCount(), 0);
});
test('storage failure shows recovery instead of exposing static sample data', () => {
  const app = boot({ bootError: Error('read failed') }); app.dom(); app.storage(); app.frame(); app.frame();
  assert.equal(app.state(), 'error'); assert.equal(app.inert(), true);
  assert.equal(app.nodes['travel-startup-title'].hidden, false);
  assert.match(app.nodes['travel-startup-message'].textContent, /本地旅行数据/);
  assert.equal(app.nodes['travel-startup-retry'].hidden, false);
});
test('a missing storage script has an actionable error', () => {
  const app = boot({ missingStorage: true }); app.dom();
  assert.equal(app.state(), 'error'); assert.equal(app.inert(), true);
  assert.match(app.nodes['travel-startup-message'].textContent, /资源/);
});
test('missing guide or failed first render never reveals half-initialized UI', () => {
  for (const options of [{ missingGuide: true }, { renderState: 'error' }, { renderState: undefined }]) {
    const app = boot(options);
    if (options.renderState === undefined && !options.missingGuide) delete app.nodes['place-first-guide'].dataset.renderState;
    app.dom(); app.storage(); app.frame(); app.frame();
    assert.equal(app.state(), 'error'); assert.equal(app.inert(), true);
  }
});
test('timeout before body parsing persists its message and permits a late successful load', () => {
  const app = boot(), title = app.nodes['travel-startup-title'];
  delete app.nodes['travel-startup-title'];
  app.timeout(); app.nodes['travel-startup-title'] = title; app.dom();
  assert.equal(app.state(), 'error'); assert.match(app.nodes['travel-startup-message'].textContent, /读取时间较长/);
  app.storage(); app.frame(); app.frame();
  assert.equal(app.state(), 'ready'); assert.equal(app.nodes['travel-startup'].hidden, true);
});
test('retry reloads the same hash without clearing any stored trip data', () => {
  const app = boot({ missingStorage: true }); app.dom(); app.retry();
  assert.equal(app.nodes['travel-startup-retry'].href, 'http://127.0.0.1:8787/#destinations');
  assert.equal(app.reloads(), 1);
});
