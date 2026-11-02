/* Presentation only: keep map transforms, city state and all saved data untouched. */
(function () {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const chapterIds = ['china-footprints', 'route', 'daily', 'destinations', 'booking'];
  const scenes = new Map(), panels = new Map(), seen = new WeakSet(), observed = new WeakSet();
  const ease = 'cubic-bezier(.22,.75,.25,1)';
  let pending = null, frame = 0;

  function cancel(group) { [...group.values()].forEach(finish => finish()); }
  function animate(node, frames, options = {}, group = scenes, cleanup) {
    if (!node || reduced.matches || !node.animate) { cleanup?.(); return; }
    const animation = node.animate(frames, {duration:520, easing:ease, fill:'both', ...options});
    animation.id = group === scenes ? 'guide-chapter-enter' : 'guide-panel-enter';
    const finish = () => {
      if (!group.delete(animation)) return;
      animation.cancel(); cleanup?.();
    };
    group.set(animation, finish);
    animation.finished.then(finish, finish);
  }
  function enter(node, {x = 0, y = 12, delay = 0, duration = 520} = {}, group = scenes) {
    animate(node, [{opacity:0, transform:`translate3d(${x}px,${y}px,0)`}, {opacity:1, transform:'none'}], {delay, duration}, group);
  }
  function holdOffscreenContent(section) {
    if (visible(section)) return;
    const selector = section.id === 'china-footprints'
      ? '.fp-heading-copy,.fp-wish,.fp-map-column,.fp-panel'
      : '.section-heading,#journey-app,#dp-sheet,.packing-app,#dg-browse-panel:not([hidden]) .dg-panel:not([hidden]),#my-wants:not([hidden])';
    for (const node of section.querySelectorAll(selector)) {
      if (!node.animate) continue;
      const animation = node.animate([{opacity:0}, {opacity:0}], {duration:1, fill:'both'});
      animation.id = 'guide-chapter-wait'; animation.pause();
      scenes.set(animation, () => {scenes.delete(animation); animation.cancel();});
    }
  }
  function visible(node) {
    if (!node || node.hidden || !node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    return rect.top < innerHeight && rect.bottom > 0;
  }
  function enterChapter(section) {
    cancel(scenes);
    if (reduced.matches || !visible(section)) return;
    seen.add(section);
    if (section.id !== 'china-footprints') return;
    if (section.id === 'china-footprints') {
      enter(section.querySelector('.fp-heading-copy'), {y:12, duration:480});
      enter(section.querySelector('.fp-wish'), {y:10, delay:60});
      // Move the column as a whole; the draggable tilt and photo coordinates stay together.
      enter(section.querySelector('.fp-map-column'), {y:18, delay:70, duration:760});
      enter(section.querySelector('.fp-panel'), {x:12, y:0, delay:150, duration:620});
      const stage = section.querySelector('.fp-stage');
      if (stage) {
        const glow = document.createElement('div');
        glow.className = 'guide-atlas-glow'; glow.setAttribute('aria-hidden', 'true');
        stage.append(glow);
        animate(glow, [
          {opacity:0, transform:'translate3d(-12%,8%,0)'},
          {opacity:1, offset:.4},
          {opacity:0, transform:'translate3d(12%,-6%,0)'}
        ], {duration:1000, delay:80}, scenes, () => glow.remove());
      }
    } else {
      enter(section.querySelector('.section-heading'), {y:12, duration:460});
      const content = section.querySelector('#journey-app,#dp-sheet,.packing-app,#dg-browse-panel:not([hidden]) .dg-panel:not([hidden]),#my-wants:not([hidden])');
      enter(content, {y:14, delay:65, duration:560});
    }
  }
  function stopNavigation() {
    pending = null; cancelAnimationFrame(frame); frame = 0;
  }
  // Native anchor scrolling/history remain intact. Reveal only after arrival, not mid-scroll.
  function awaitArrival(section) {
    stopNavigation(); cancel(scenes); cancel(panels);
    if (reduced.matches || !section) return;
    if (window.TravelChapterNavigation) return;
    pending = section;
    holdOffscreenContent(section);
    const start = performance.now(); let lastY = scrollY, still = 0;
    function check(now) {
      const margin = (parseFloat(getComputedStyle(section).scrollMarginTop) || 0)
        + (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
      const limit = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const destination = Math.max(0, Math.min(limit, scrollY + section.getBoundingClientRect().top - margin));
      still = Math.abs(scrollY - lastY) < 1 ? still + 1 : 0; lastY = scrollY;
      if (now - start > 60 && still > 1 && Math.abs(scrollY - destination) < 4) {
        stopNavigation(); enterChapter(section); return;
      }
      if (now - start > 2000) {stopNavigation(); cancel(scenes); return;}
      frame = requestAnimationFrame(check);
    }
    frame = requestAnimationFrame(check);
  }
  function sectionForHash(hash) {
    const id = hash.replace(/^#/, '');
    return chapterIds.includes(id) ? document.getElementById(id) : null;
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (link) {
      const section = sectionForHash(link.getAttribute('href'));
      if (section) awaitArrival(section);
      else {stopNavigation(); cancel(scenes);}
    }
    if (event.target.closest('#china-footprints [data-fp-filter]')) {
      cancel(panels);
      enter(document.querySelector('#china-footprints .fp-city-list'), {y:6, duration:280}, panels);
    }
  });
  window.addEventListener('hashchange', () => {
    const section = sectionForHash(location.hash);
    if (section && section !== pending) awaitArrival(section);
    else if (!section) {stopNavigation(); cancel(scenes);}
  });
  function enterPanel(event) {
    cancel(panels);
    const panel = document.getElementById(event.detail.id);
    if (visible(panel)) enter(panel, {y:10, duration:360}, panels);
  }
  window.addEventListener('guide:categorychange', enterPanel);
  window.addEventListener('guide:viewchange', enterPanel);
  window.addEventListener('guide:daychange', () => {
    cancel(panels);
    const sheet = document.getElementById('dp-sheet');
    if (visible(sheet)) enter(sheet, {y:8, duration:320}, panels);
  });

  function stop() {stopNavigation(); cancel(scenes); cancel(panels);}
  window.addEventListener('wheel', stop, {passive:true});
  window.addEventListener('touchstart', stop, {passive:true});
  document.addEventListener('keydown', event => {
    if (['Escape','PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key)) stop();
  });
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('#china-footprints .fp-atlas')) stop();
  }, true);
  document.addEventListener('visibilitychange', () => {if (document.hidden) stop();});
  reduced.addEventListener('change', () => {if (reduced.matches) stop();});

  // The atlas also gets its first entrance when reached by ordinary scrolling.
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || pending || seen.has(entry.target)) continue;
      const rect = entry.target.getBoundingClientRect();
      if (rect.top < -innerHeight * .25) continue;
      enterChapter(entry.target);
    }
  }, {threshold:0, rootMargin:'0px 0px -20% 0px'}) : null;
  function observeChapters() {
    for (const id of chapterIds) {
      const node = document.getElementById(id);
      if (node && !observed.has(node)) {observed.add(node);observer?.observe(node);}
    }
  }
  window.addEventListener('guide:navigation-ready', observeChapters);
  observeChapters();
})();
