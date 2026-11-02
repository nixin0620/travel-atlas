/* Shared presentation for the four trip chapters. Existing controls retain their handlers. */
(function () {
  'use strict';
  const chapters = ['route', 'daily', 'destinations', 'booking'];
  const mountains = '<path d="M8 137 94 81l30 20 74-69 55 62 32-21 75 64M64 137l49-33 30 14 55-63 27 47 27 16m-91 19 37-48 24 32 22 16M0 146h440M38 155h203m42 0h115"/><path d="m288 106 49-48 30 25 24-17 57 63m-123-35 12-16 16 19"/><circle cx="300" cy="37" r="16"/>';
  const palms = '<path d="M329 142q14-48 4-83m1 9q-30-32-51-12 30-4 51 12m0 0q14-39 41-27-25 8-41 27m0 0q33-12 48 14-31-10-48-14m0 0q-22-4-30 27 10-17 30-27M401 145q-8-32-2-55m0 7q-17-20-34-9 21 0 34 9m0 0q12-25 30-13-20 2-30 13m0 0q24-7 32 11-19-9-32-11"/>';
  const temple = '<path d="M222 142V104h53v38m-63-38h73l-22-15h-30Zm21-15 15-20 15 20m-15-20V41m-5 14h10m-21 87v-23h16v23m-70 0v-26h30m77 0h29v26m-139-26 28-19 24 19m63 0 25-19 27 19"/>';
  const luggage = '<rect x="227" y="62" width="95" height="88" rx="9"/><path d="M250 62V48q0-8 8-8h32q8 0 8 8v14m-53 14v60m59-60v60m-71 14v7m84-7v7M203 147q-16-40-2-72m-1 39-23-18m24 33 20-20M341 145q19-38 17-66m-6 36 21-17m-28 32-14-21"/><ellipse cx="367" cy="65" rx="46" ry="12"/><path d="m335 62 8-29q4-14 20-13h8q16 2 18 16l6 26m-53-20q22 9 48 0"/>';
  function art(id) {
    return '<svg class="travel-header-art" viewBox="0 0 460 168" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (id === 'booking' ? luggage : mountains + (id === 'route' ? '<path stroke-dasharray="3 5" d="M284 74q57-26 114-61"/><path d="m390 12 15 3-11 7m5-8-6-9"/>' : palms + temple)) + '</svg>';
  }
  function wrapHeading(root, heading) {
    const header = document.createElement('header');
    header.className = 'travel-chapter-header';
    heading.before(header); header.append(heading);
    return header;
  }
  function enhance(id) {
    const root = document.getElementById(id);
    if (!root || root.dataset.chapterHeaderReady) return !!root?.dataset.chapterHeaderReady;
    let header, heading;
    if (id === 'destinations') {
      header = root.querySelector('.pg-page-head');
      if (!header) return false;
      heading = header.firstElementChild;
      const title = heading.querySelector('h2');
      const copy = document.createElement('div');
      copy.innerHTML = '<p class="eyebrow">DESTINATION GUIDE</p>';
      copy.append(title);
      const subtitle = document.createElement('p');
      subtitle.textContent = '发现值得去的地方，整理旅行清单。';
      copy.append(subtitle);
      heading.innerHTML = '<span class="section-no">03</span>';
      heading.append(copy); heading.classList.add('section-heading');
    } else {
      heading = root.querySelector('.section-heading');
      if (!heading) return false;
      if (id === 'route') {
        header = root.querySelector('.jo-masthead');
        if (!header) return false;
        const stats = header.querySelector('.jo-hero-stats');
        if (stats) header.after(stats);
        const toolbar = root.querySelector('.jo-toolbar');
        if (toolbar) header.append(toolbar);
      } else header = wrapHeading(root, heading);
    }
    header.classList.add('travel-chapter-header');
    heading.classList.add('travel-chapter-heading');
    // Headers are stable landmarks, never translated or hidden by entrance effects.
    heading.classList.remove('reveal-item');
    header.insertAdjacentHTML('beforeend', art(id));
    root.dataset.chapterHeaderReady = 'true';
    return true;
  }
  let observer;
  function init() {
    const ready = chapters.map(enhance).every(Boolean);
    if (ready) {
      observer?.disconnect();
      window.dispatchEvent(new Event('travel:headers-ready'));
    }
    return ready;
  }
  if (!init()) {
    observer = new MutationObserver(init);
    observer.observe(document.querySelector('main'), {childList:true, subtree:true});
  }
})();
