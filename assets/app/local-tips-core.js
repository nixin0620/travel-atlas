/* Date, forecast and expiry rules, shared by browser and offline checks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocalTipsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const n = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
  }
  function addDays(value, offset) {
    const n = parseDate(value);
    return n === null || !Number.isInteger(offset) ? null : new Date(n + offset * DAY).toISOString().slice(0, 10);
  }
  function today(timezone, now = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    return ['year', 'month', 'day'].map(k => p.find(v => v.type === k).value).join('-');
  }
  function windowStatus(date, localToday) {
    if (parseDate(date) === null || parseDate(localToday) === null) return 'invalid';
    const diff = (parseDate(date) - parseDate(localToday)) / DAY;
    return diff < 0 ? 'past' : diff > 15 ? 'future' : 'available';
  }
  function forecastURL(location) {
    const q = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, timezone: location.timezone, daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code', forecast_days: '16' });
    return 'https://api.open-meteo.com/v1/forecast?' + q;
  }
  function forecastFor(data, date) {
    const daily = data && data.daily;
    const i = daily && Array.isArray(daily.time) ? daily.time.indexOf(date) : -1;
    if (i < 0) return null;
    const v = key => Array.isArray(daily[key]) && finite(daily[key][i]) ? daily[key][i] : null;
    const min = v('temperature_2m_min'), max = v('temperature_2m_max');
    if (min === null || max === null || min > max) return null;
    const rain = v('precipitation_probability_max');
    return { min, max, rain: rain !== null && rain >= 0 && rain <= 100 ? rain : null, code: v('weather_code') };
  }
  function clothes(f) {
    if (!f) return '';
    let advice = f.max >= 28 ? '白天穿透气短袖' : f.max >= 20 ? '薄长袖或短袖加外套' : f.max >= 12 ? '长袖配保暖外套' : '保暖外套配长裤';
    if (f.max >= 20 && f.min < 16) advice += '，早晚加外套';
    else if (f.max - f.min >= 10) advice += '，分层穿脱';
    if (f.rain !== null && f.rain >= 50) advice += '；带雨具，穿防滑鞋';
    else if (f.rain !== null && f.rain >= 25) advice += '；随身带折叠伞';
    return advice + '。';
  }
  function weatherLabel(code) {
    if (code === 0) return '☀️ 晴';
    if ([1,2,3].includes(code)) return '⛅ 多云';
    if ([45,48].includes(code)) return '🌫️ 雾';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️ 有雨';
    if ([71,73,75,77,85,86].includes(code)) return '🌨️ 有雪';
    if ([95,96,99].includes(code)) return '⛈️ 雷雨';
    return '🌦️ 预报';
  }
  function safetyState(item, localToday, start, days, locations) {
    for (const key of ['checked_at', 'review_by', 'source_date']) if (parseDate(item[key]) === null) return 'unverified';
    if (!['advisory','event'].includes(item.kind) || item.checked_at > localToday || item.source_date > localToday) return 'unverified';
    if (!Array.isArray(item.applies_to) || !item.applies_to.some(id => locations.includes(id))) return 'irrelevant';
    if (item.review_by < localToday) return 'expired';
    const end = parseDate(start) !== null ? addDays(start, days - 1) : null;
    if (end && item.review_by < end) return 'review';
    if (item.kind === 'event') {
      if (parseDate(item.valid_from) === null || parseDate(item.valid_until) === null || item.valid_from > item.valid_until) return 'unverified';
      if (item.valid_until < localToday) return 'expired';
      if (!end) return 'dates-needed';
      if (start > item.valid_until || end < item.valid_from) return 'irrelevant';
    }
    return 'visible';
  }
  function cacheUsable(entry, now, maxAge) {
    return !!entry && finite(entry.savedAt) && now >= entry.savedAt && now - entry.savedAt <= maxAge && !!entry.data && Array.isArray(entry.data.daily && entry.data.daily.time);
  }
  return { parseDate, addDays, today, windowStatus, forecastURL, forecastFor, clothes, weatherLabel, safetyState, cacheUsable };
});
