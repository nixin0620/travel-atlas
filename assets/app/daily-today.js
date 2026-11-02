/* One daily view for planning and travelling. No separate companion overlay. */
(function () {
  'use strict';
  const date = () => window.DailyPlanner?.today() || new Intl.DateTimeFormat('sv-SE').format(new Date());
  function target() {
    const days = window.TripData?.snapshot?.days || [], today = date();
    const dated = days.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date || ''));
    const current = dated.find(day => day.date === today);
    if (current) return { day: current, label: '今天', state: 'today' };
    if (!dated.length) return { day: days[0] || null, label: '每日行程', state: 'undated' };
    if (today < dated[0].date) return { day: dated[0], label: '出发日', state: 'before' };
    if (today > dated.at(-1).date) return { day: dated.at(-1), label: '最后一天', state: 'after' };
    return { day: dated.find(day => day.date > today), label: '下一天', state: 'between' };
  }
  function open(options = {}) {
    const days = window.TripData?.snapshot?.days || [];
    const day = options.dayId ? days.find(day => day.id === options.dayId)
      : options.date ? days.find(day => day.date === options.date) : target().day;
    if ((options.dayId || options.date) && !day) return false;
    const section = document.getElementById('daily');
    if (!section || !window.DailyPlanner) return false;
    window.DestinationGuide?.reveal('daily');
    if (day) window.DailyPlanner.selectDay(day.id);
    if (location.hash !== '#daily') history[options.replace ? 'replaceState' : 'pushState'](history.state, '', '#daily');
    const sheet = document.getElementById('dp-sheet'), heading = sheet?.querySelector('h3') || sheet;
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    const behavior = options.behavior || (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');
    if (sheet && matchMedia('(max-width:720px)').matches) window.scrollTo({top:scrollY + sheet.getBoundingClientRect().top - 16, behavior});
    else (sheet || section).scrollIntoView({behavior, block:'start'});
    window.dispatchEvent(new Event('guide:navigation-ready'));
    return true;
  }
  function refresh() {
    const current = target();
    document.querySelectorAll('[data-daily-today]').forEach(button => {
      const label = button.querySelector('[data-daily-today-label]');
      if (label) label.textContent = current.label;
      button.setAttribute('aria-label', current.day ? '查看' + current.label + '的行程，' + current.day.date : '查看每日行程');
    });
  }
  window.DailyToday = { open, date, target, refresh };
  // Keep old internal callers working while routing to the shared daily planner.
  window.TripCompanion = { open, today: date };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-daily-today]');
    if (!button || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); open();
  });
  window.TravelStorage.whenReady(() => {
    window.TripData?.subscribe(refresh);
    window.addEventListener('tripdata:orders', refresh);
    document.addEventListener('visibilitychange', refresh);
    setInterval(refresh, 60000);
  });
})();
