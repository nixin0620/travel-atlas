(function () {
  'use strict';
  const root = document.querySelector('#tips .local-tips-app');
  const seedNode = document.getElementById('local-tips-data');
  const C = window.LocalTipsCore;
  if (!root || !seedNode || !C) return;
  let seed;
  try { seed = JSON.parse(seedNode.textContent); } catch (_) { return; }
  const config = seed.weather || {};
  const locations = config.locations || [], days = config.days || [];
  const form = root.querySelector('.weather-form'), input = form.querySelector('input');
  const status = root.querySelector('[data-weather-status]');
  const dayList = root.querySelector('[data-weather-days]'), cards = root.querySelector('[data-weather-cities]');
  const fold = root.querySelector('[data-tip-kind="climate"]');
  const storageKey = 'travel-weather-date-v1:' + seed.trip_id;
  const storage = { get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }, set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {} } };
  const initial = storage.get(storageKey);
  let start = C.parseDate(initial) !== null ? initial : C.parseDate(seed.start_date) !== null ? seed.start_date : '';
  let selected = 0, revision = 0;
  const inFlight = new Map(), memory = new Map();
  input.value = start;
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function localToday(loc = locations[0]) { try { return C.today(loc ? loc.timezone : 'UTC'); } catch (_) { return C.today('UTC'); } }
  function chooseDay() {
    const today = localToday();
    const index = days.findIndex(d => C.addDays(start, d.day - 1) === today);
    selected = index >= 0 ? index : 0;
  }
  function renderDays() {
    dayList.replaceChildren();
    if (!start) return;
    days.forEach((d, i) => {
      const b = el('button', 'weather-day', 'D' + d.day + ' · ' + C.addDays(start, d.day - 1).slice(5));
      b.type = 'button'; b.dataset.weatherDay = String(i); b.setAttribute('aria-pressed', String(i === selected));
      b.title = d.locations.map(id => locations.find(l => l.id === id)?.label || id).join(' → ');
      b.addEventListener('click', () => { selected = i; renderDays(); renderWeather(); });
      dayList.append(b);
    });
  }
  async function fetchLocation(loc, force) {
    const key = 'travel-weather-v1:' + loc.latitude + ',' + loc.longitude + ':' + loc.timezone;
    const cached = memory.get(key) || storage.get(key), now = Date.now();
    if (!force && C.cacheUsable(cached, now, 30 * 60 * 1000)) return { ...cached, stale: false };
    if (inFlight.has(key)) return inFlight.get(key);
    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(C.forecastURL(loc), { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (!data.daily || !Array.isArray(data.daily.time)) throw new Error('Missing daily forecast');
        const entry = { data, savedAt: Date.now() };
        memory.set(key, entry); storage.set(key, entry);
        return { ...entry, stale: false };
      } catch (error) {
        if (C.cacheUsable(cached, Date.now(), 6 * 60 * 60 * 1000)) return { ...cached, stale: true };
        throw error;
      } finally { clearTimeout(timeout); }
    })();
    inFlight.set(key, request);
    try { return await request; } finally { inFlight.delete(key); }
  }
  async function renderWeather(force = false) {
    const current = ++revision;
    cards.replaceChildren();
    if (!locations.length || !days.length) { status.textContent = '此手册尚未配置每日地点，暂无法查询天气。'; return; }
    if (!start) { status.textContent = '设置出发日期，按每天实际地点查看预报。'; return; }
    const day = days[selected], date = C.addDays(start, day.day - 1);
    status.textContent = '第 ' + day.day + ' 天 · ' + date + ' · 日期仅用于本模块的天气与提醒，不修改行程订单。';
    const targets = day.locations.map(id => locations.find(l => l.id === id)).filter(Boolean);
    await Promise.all(targets.map(async loc => {
      const card = el('article', 'weather-city');
      card.append(el('h4', '', loc.label), el('p', 'weather-result', '正在查询…'));
      cards.append(card);
      const message = card.querySelector('.weather-result');
      const availability = C.windowStatus(date, localToday(loc));
      if (availability !== 'available') {
        message.textContent = availability === 'past' ? '该日期已过去，不展示当日天气。' : '还未进入预报范围，请在出发前约两周再看。';
        return;
      }
      try {
        const result = await fetchLocation(loc, force);
        if (revision !== current) return;
        const forecast = C.forecastFor(result.data, date);
        if (!forecast) { message.textContent = '数据源暂未返回这一天的完整预报，请稍后更新。'; return; }
        message.textContent = C.weatherLabel(forecast.code) + ' · ' + Math.round(forecast.min) + '–' + Math.round(forecast.max) + '°C';
        card.append(el('p', 'weather-rain', forecast.rain === null ? '降雨概率暂缺' : '降雨概率 ' + Math.round(forecast.rain) + '%'));
        card.append(el('p', 'weather-clothes', C.clothes(forecast)));
        const timestamp = new Intl.DateTimeFormat('zh-CN', { timeZone: loc.timezone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(result.savedAt));
        card.append(el('small', result.stale ? 'weather-stale' : 'weather-updated', (result.stale ? '更新失败 · 显示缓存 ' : '获取于 ') + timestamp + '（当地时间）'));
      } catch (_) {
        if (revision === current) message.textContent = '暂时无法获取天气，请联网后点“更新”。';
      }
    }));
  }
  function renderSafety() {
    const states = [];
    root.querySelectorAll('[data-safety-item]').forEach(node => {
      let state = 'unverified';
      try { state = C.safetyState(JSON.parse(node.dataset.safetyMeta), localToday(), start, days.length, locations.map(l => l.id)); } catch (_) {}
      node.hidden = state !== 'visible'; states.push(state);
    });
    const count = states.filter(s => s === 'visible').length;
    const needsReview = states.some(s => ['expired','review','unverified','dates-needed'].includes(s));
    const s = root.querySelector('[data-safety-status]');
    if (s) s.textContent = (count ? '已核对 ' + count + ' 条目的地提醒。' : '暂无可用于本次日期的已核对提醒。') + (needsReview ? '部分信息待复核，请查看下方官方通告。' : '') + '非实时警报。';
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (C.parseDate(input.value) === null) { status.textContent = '请选择有效的出发日期。'; return; }
    start = input.value; storage.set(storageKey, start); chooseDay(); renderDays(); renderSafety(); renderWeather();
  });
  root.querySelector('[data-weather-refresh]').addEventListener('click', () => renderWeather(true));
  fold.addEventListener('toggle', () => { if (fold.open) renderWeather(); });
  root.querySelector('[data-tip-kind="safety"]')?.addEventListener('toggle', renderSafety);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderSafety(); if (fold.open) renderWeather(); } });
  chooseDay(); renderDays(); renderSafety();
  // Native details stay closed; forecast requests are deferred until the user opens weather.
})();
