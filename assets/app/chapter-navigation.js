/* One owner for chapter navigation. No itinerary or persisted state is changed. */
(function (host) {
  'use strict';
  function activeChapter(items, marker) {
    const visible = items.filter(item => item.visible !== false).sort((a,b) => a.top-b.top);
    if (!visible.length) return null;
    return visible.reduce((active,item) => item.top <= marker ? item.id : active, visible[0].id);
  }
  function targetTop(top, scroll, offset, limit) {
    return Math.max(0, Math.min(limit, top + scroll - offset));
  }
  if (typeof module === 'object' && module.exports) {module.exports = {activeChapter,targetTop}; return;}
  const ids = ['top','china-footprints','route','daily','destinations','booking'];
  let pending = null, frame = 0, queued = 0, initialDone = false, interacted = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function landmark(id) {
    const section = document.getElementById(id);
    return section?.querySelector('.travel-chapter-header') || section;
  }
  function links() {return document.querySelectorAll('.desktop-chapter-rail a[href="#top"],.desktop-chapter-rail nav a,.desktop-chapter-rail .fp-rail-entry,#mobile-guide-menu .mobile-menu-grid a');}
  function highlight(id) {
    links().forEach(link => {
      const active = link.getAttribute('href') === '#' + id;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }
  function current() {
    queued = 0;
    if (pending) {highlight(pending.id); return;}
    const items = ids.map(id => {
      const node = landmark(id);
      return {id, top:node?.getBoundingClientRect().top ?? Infinity, visible:!!node?.getClientRects().length};
    });
    highlight(activeChapter(items, Math.min(160,innerHeight*.22)));
  }
  function queue() {if (!queued) queued = requestAnimationFrame(current);}
  function offset() {
    let value = innerWidth <= 720 ? 12 : 20;
    // Only visible fixed top bars can obscure a heading; bottom mobile controls cannot.
    document.querySelectorAll('[data-chapter-topbar]').forEach(node => {
      const rect = node.getBoundingClientRect();
      if (getComputedStyle(node).position === 'fixed' && rect.top <= 0 && rect.bottom > 0) value = Math.max(value,rect.bottom+12);
    });
    return value;
  }
  function destination(node) {return targetTop(node.getBoundingClientRect().top,scrollY,offset(),Math.max(0,document.documentElement.scrollHeight-innerHeight));}
  function stop() {pending = null; cancelAnimationFrame(frame); frame = 0; queue();}
  function go(id, options = {}) {
    if (!ids.includes(id)) return;
    if (id === 'destinations') window.DestinationGuide?.showBrowse({scroll:false});
    const node = landmark(id);
    if (!node?.getClientRects().length) return;
    stop();
    pending = {id}; highlight(id);
    if (options.history && location.hash !== '#'+id) history.pushState(null,'','#'+id);
    const top = destination(node);
    const smooth = options.smooth !== false && !reduced.matches;
    window.scrollTo({top,behavior:smooth?'smooth':'instant'});
    const start = performance.now(); let stable = 0, last = scrollY;
    function settle(now) {
      if (!pending || pending.id !== id) return;
      const target = destination(node);
      stable = Math.abs(scrollY-last)<.5 ? stable+1 : 0; last = scrollY;
      if (Math.abs(scrollY-target)<2 && stable>=2 || now-start>2200) {
        // Correct late image/layout shifts only at the end of a requested navigation.
        if (Math.abs(scrollY-target)>=2) window.scrollTo({top:target,behavior:'instant'});
        stop(); highlight(id);
        window.dispatchEvent(new CustomEvent('guide:chapter-arrived',{detail:{id}}));
        return;
      }
      frame = requestAnimationFrame(settle);
    }
    frame = requestAnimationFrame(settle);
  }
  host.TravelChapterNavigation = {go,refresh:queue};
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('.desktop-chapter-rail a[href^="#"],#mobile-guide-menu a[href^="#"],.contents-grid a[href^="#"],.cover-actions a[href^="#"]');
    const id = link?.getAttribute('href').slice(1);
    if (!ids.includes(id)) return;
    event.preventDefault(); interacted = true;
    // Mobile navigation's own handler closes its menu before this document handler.
    if (link.closest('#mobile-guide-menu')) {
      document.querySelectorAll('#mobile-guide-menu .mobile-menu-grid a').forEach(item => item.tabIndex = -1);
      document.querySelector('.mobile-nav-trigger')?.focus({preventScroll:true});
    }
    go(id,{history:true});
  });
  window.addEventListener('scroll',queue,{passive:true});
  window.addEventListener('resize',queue);
  window.addEventListener('guide:navigation-ready',queue);
  window.addEventListener('popstate',() => {const id=location.hash.slice(1);if(ids.includes(id)) go(id,{smooth:false});else queue();});
  window.addEventListener('hashchange',queue);
  function interrupt() {
    interacted = true;
    if (pending) window.scrollTo({top:scrollY,behavior:'instant'});
    stop();
  }
  window.addEventListener('wheel',interrupt,{passive:true});
  window.addEventListener('touchstart',interrupt,{passive:true});
  document.addEventListener('keydown',event => {if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key))interrupt();});
  document.addEventListener('pointerdown',event => {if(!event.target.closest('.desktop-chapter-rail,#mobile-guide-menu,.mobile-nav-trigger'))interrupt();},true);
  function initial() {
    if (initialDone || !['route','daily','destinations','booking'].every(id => document.getElementById(id)?.dataset.chapterHeaderReady)) return;
    initialDone = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const id = location.hash.slice(1);
      if (!interacted && ids.includes(id)) go(id,{smooth:false}); else queue();
    }));
  }
  window.addEventListener('travel:headers-ready',initial);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initial,{once:true}); else initial();
  queue();
})(typeof window === 'object' ? window : globalThis);
