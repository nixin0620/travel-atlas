(function () {
  'use strict';
  function init() {
    const T = window.TripData, context = window.GuideCityContext;
    if (!T || !context || document.getElementById('destinations')) return;
    const categories = [
      ['sights', '景点', '先看同类差异，再挑想去的地方。'],
      ['food', '美食', '看看环境与特色菜，把想吃的留下。'],
      ['move', '体验', '给旅途留一点亲手参与的时间。'],
      ['shops', '购物', '先挑喜欢的好物，再决定去哪逛。'],
      ['tips', '当地贴士', '天气、接驳与地方文化，按这次停留来查看。']
    ];
    const panels = categories.map(([id]) => document.getElementById(id));
    if (panels.some(p => !p)) return;
    const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let active = 'sights', view = 'browse', frame = 0;
    const hub = document.createElement('section');
    hub.id = 'destinations'; hub.className = 'destination-guide';
    hub.setAttribute('aria-labelledby', 'dg-title');
    hub.innerHTML = `<div class="shell dg-heading"><div class="section-heading"><span class="section-no">03</span><div><p class="eyebrow">EXPLORE EACH STOP</p><h2 id="dg-title">目的地指南</h2><p>收藏喜欢的地点，安排进每天的行程。</p></div></div></div>
      <div class="dg-navigation"><div class="shell dg-nav-layout"><div class="dg-city-row"><span class="dg-city-label" id="dg-city-label">选择目的地</span><select id="dg-city" hidden aria-hidden="true" tabindex="-1"></select><button type="button" class="dg-city-trigger" id="dg-city-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="dg-city-options" aria-labelledby="dg-city-label dg-city-name" aria-describedby="dg-stay"><span class="dg-city-copy"><span id="dg-city-name"></span><span id="dg-stay"></span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button></div>
      <div class="dg-views" role="tablist" aria-label="发现地点或我的想去"><button type="button" role="tab" id="dg-view-browse" data-dg-view="browse" aria-controls="dg-browse-panel" aria-selected="true">发现地点</button><button type="button" role="tab" id="dg-view-saved" data-dg-view="saved" aria-controls="my-wants" aria-selected="false" tabindex="-1">我的想去<span data-gp-total hidden></span></button></div>
      <div class="dg-tabs" role="tablist" aria-label="目的地指南分类">${categories.map(([id,name]) => `<button type="button" role="tab" id="dg-tab-${id}" data-dg-tab="${id}" aria-controls="${id}" aria-selected="false" tabindex="-1">${name}</button>`).join('')}</div></div></div>
      <div class="dg-panels" id="dg-browse-panel" role="tabpanel" aria-labelledby="dg-view-browse"></div><div id="my-wants" class="dg-saved-panel" role="tabpanel" aria-labelledby="dg-view-saved" tabindex="0" hidden><div class="shell" data-dg-saved-host></div></div>`;
    panels[0].before(hub);
    for (const panel of panels) {
      panel.classList.add('dg-panel'); panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'dg-tab-' + panel.id); panel.tabIndex = 0;
      hub.querySelector('.dg-panels').append(panel);
    }
    // Keep original controls inside their event-delegation root and retain Pick IDs.
    const browseTools = [];
    const browseSpecs = [
      {id:'sight-decision-app', result:'.sv-results', groups:[['收藏状态','.sv-filters','data-sv-filter'],['景点类型','[data-sv-kind-city]','data-sv-kind']], source:'#sv-xhs-panel'},
      {id:'food-picks-app', result:'#food-pick-results', groups:[['餐饮类型','.fp-kind-filters','data-food-kind-filter'],['收藏状态','.fp-status-filters','data-food-filter']], source:'#food-xhs-panel'},
      {id:'experience-picks-app', result:'#experience-results', groups:[['收藏状态','.xp-filters','data-xp-filter']]},
      {id:'shopping-picks-app', result:'#shopping-results', groups:[['好物类型','#shopping-kind-filters','data-sg-kind'],['收藏状态','#shopping-collection-filters','data-sg-collection']], modes:'.sg-modes'}
    ];
    function readingFold(root, nodes, label, after) {
      if (!nodes.length) return null;
      const fold = document.createElement('details'); fold.className = 'dg-reading';
      const summary = document.createElement('summary'); summary.textContent = label;
      fold.append(summary, ...nodes);
      if (after) after.after(fold); else root.append(fold);
      return fold;
    }
    for (const spec of browseSpecs) {
      const root = document.getElementById(spec.id), result = root?.querySelector(spec.result);
      if (!root || !result) continue;
      const bar = document.createElement('div'); bar.className = 'dg-browse-tools';
      bar.innerHTML = '<div class="dg-browse-info"></div><details class="dg-filters"><summary><span data-dg-filter-label>筛选</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4 8h8M6 12h4"/></svg></summary><div class="dg-filter-content"></div></details><div class="dg-active-filters" hidden><span></span><button type="button" data-dg-clear>清除筛选</button></div>';
      root.prepend(bar);
      const info = bar.querySelector('.dg-browse-info'), details = bar.querySelector('details'), body = bar.querySelector('.dg-filter-content');
      details.before(bar.querySelector('.dg-active-filters'));
      if (spec.modes) {
        const modes = document.createElement('div'); modes.className = 'dg-browse-modes';
        modes.append(root.querySelector(spec.modes)); bar.before(modes);
      }
      info.append(result);
      root.querySelectorAll('.fp-storage-warning,.xp-warning,.sg-warning').forEach(node => {if (node.closest('noscript') === null) bar.after(node);});
      const sections = spec.groups.map(([label, selector, attribute]) => {
        const nodes = [...root.querySelectorAll(selector)], field = document.createElement('div');
        field.className = 'dg-filter-field';
        const heading = document.createElement('span'); heading.className = 'dg-filter-label'; heading.textContent = label;
        field.append(heading, ...nodes); body.append(field);
        return {field, nodes, attribute};
      });
      const source = spec.source && root.querySelector(spec.source);
      const sourceFold = source && readingFold(root, [source], '收藏来源', bar);
      if (sourceFold) sourceFold.classList.add('dg-source-fold');
      function refreshTools() {
        const chosen = [];
        for (const {field, nodes, attribute} of sections) {
          const available = nodes.filter(node => !node.hidden);
          const hidden = !available.length; if (field.hidden !== hidden) field.hidden = hidden;
          for (const node of available) for (const button of node.querySelectorAll('button['+attribute+'][aria-pressed="true"]')) {
            if (!['all','selected'].includes(button.getAttribute(attribute))) chosen.push(button.childNodes[0].textContent.trim());
          }
        }
        const imported = source?.querySelector('[data-sv-import-only],[data-food-import-only]');
        if (source && sourceFold.hidden !== source.hidden) sourceFold.hidden = source.hidden;
        if (imported?.getAttribute('aria-pressed') === 'true') chosen.push('小红书收藏');
        const text = chosen.length ? '筛选 · ' + chosen.length : '筛选', label = bar.querySelector('[data-dg-filter-label]');
        if (label.textContent !== text) label.textContent = text;
        const activeFilters = bar.querySelector('.dg-active-filters'), activeText = activeFilters.querySelector('span');
        if (activeFilters.hidden !== !chosen.length) activeFilters.hidden = !chosen.length;
        if (activeText.textContent !== chosen.join(' · ')) activeText.textContent = chosen.join(' · ');
        const unavailable = !sections.some(section => !section.field.hidden);
        if (details.hidden !== unavailable) details.hidden = unavailable;
      }
      function resetFilters() {
        for (const {nodes, attribute} of sections) for (const node of nodes.filter(n => !n.hidden)) {
          const button = node.querySelector('button['+attribute+'="all"],button['+attribute+'="selected"]');
          if (button?.getAttribute('aria-pressed') !== 'true') button?.click();
        }
        const imported = source?.querySelector('[data-sv-import-only],[data-food-import-only]');
        if (imported?.getAttribute('aria-pressed') === 'true') imported.click();
        refreshTools(); details.querySelector('summary').focus({preventScroll:true});
      }
      bar.querySelector('[data-dg-clear]').addEventListener('click', resetFilters);
      details.addEventListener('keydown', event => {
        if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();details.open = false;details.querySelector('summary').focus({preventScroll:true});}
      });
      // A changed Pick may remove its card from a filtered list. Keep keyboard focus visible.
      root.addEventListener('click', event => {
        const card = event.target.closest('[data-sv-id],[data-food-id],[data-xp-id]');
        if (card && event.target.closest('[data-sv-pick],[data-food-pick],[data-xp-pick]')) requestAnimationFrame(() => {
          if (card.hidden && (document.activeElement === document.body || card.contains(document.activeElement))) details.querySelector('summary').focus({preventScroll:true});
        });
      });
      let pending = false;
      new MutationObserver(() => {if (!pending) {pending = true;requestAnimationFrame(() => {pending = false;refreshTools();});}}).observe(root,{subtree:true,attributes:true,attributeFilter:['aria-pressed','hidden']});
      refreshTools(); browseTools.push({root, details, refresh:refreshTools});
    }
    const sightRoot = document.getElementById('sight-decision-app');
    const comparison = sightRoot.querySelector('#sv-comparison');
    const comparisonFold = readingFold(sightRoot, [...sightRoot.querySelectorAll('[data-sv-city-lead]'), comparison, ...sightRoot.querySelectorAll('.sv-index')].filter(Boolean), '景点对比', sightRoot.querySelector('#sv-more'));
    if (comparisonFold) comparisonFold.classList.add('dg-comparison-fold');
    function mountPicks() {
      window.GuidePicks?.mount?.(hub.querySelector('[data-dg-saved-host]'));
      hub.classList.toggle('dg-unified-picks',Boolean(window.GuidePicks));
    }
    window.addEventListener('guide:picks-ready', mountPicks);
    mountPicks();

    // Reuse the original DOM, event handlers and storage keys. No candidate or order data is copied.
    const select = hub.querySelector('#dg-city');
    const cityTrigger = hub.querySelector('#dg-city-trigger');
    const cityMenu = document.createElement('div');
    cityMenu.id = 'dg-city-options'; cityMenu.className = 'dg-city-menu'; cityMenu.hidden = true;
    cityMenu.setAttribute('role', 'listbox'); cityMenu.setAttribute('aria-label', '选择目的地');
    // Outside the navigation container so the menu is never clipped by it.
    document.body.append(cityMenu);
    let cityOpen = false, cityActive = 0, cityPositionFrame = 0, citySearch = '', citySearchTimer = 0;
    function closeCities(restoreFocus = false) {
      cityOpen = false; cityMenu.hidden = true;
      cityTrigger.setAttribute('aria-expanded', 'false'); cityTrigger.removeAttribute('aria-activedescendant');
      cityMenu.getAnimations?.().forEach(animation => animation.cancel());
      cancelAnimationFrame(cityPositionFrame); cityPositionFrame = 0;
      clearTimeout(citySearchTimer); citySearch = '';
      if (restoreFocus && !cityTrigger.disabled) cityTrigger.focus({preventScroll:true});
    }
    function positionCities() {
      cityPositionFrame = 0; if (!cityOpen) return;
      const rect = cityTrigger.getBoundingClientRect(), viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      if (rect.bottom < top || rect.top > top + height) {closeCities(); return;}
      const menuWidth = Math.min(Math.max(280, rect.width), width - 24);
      cityMenu.style.width = menuWidth + 'px';
      cityMenu.style.left = Math.max(left + 12, Math.min(rect.left, left + width - menuWidth - 12)) + 'px';
      const below = top + height - rect.bottom - 20, above = rect.top - top - 20;
      const up = below < Math.min(cityMenu.scrollHeight, 300) && above > below;
      cityMenu.style.maxHeight = Math.max(56, Math.min(420, up ? above : below)) + 'px';
      const menuHeight = cityMenu.getBoundingClientRect().height;
      const y = up ? rect.top - menuHeight - 8 : rect.bottom + 8;
      cityMenu.style.top = Math.max(top + 12, Math.min(y, top + height - menuHeight - 12)) + 'px';
      cityMenu.dataset.side = up ? 'above' : 'below';
    }
    function queueCityPosition() {
      if (cityOpen && !cityPositionFrame) cityPositionFrame = requestAnimationFrame(positionCities);
    }
    function focusCity(index) {
      const options = Array.from(cityMenu.children);
      if (!options.length) return;
      cityActive = Math.max(0, Math.min(index, options.length - 1));
      options.forEach((option, i) => option.classList.toggle('is-focused', i === cityActive));
      cityTrigger.setAttribute('aria-activedescendant', options[cityActive].id);
      const item = options[cityActive], edge = item.offsetTop + item.offsetHeight;
      if (item.offsetTop < cityMenu.scrollTop) cityMenu.scrollTop = item.offsetTop;
      else if (edge > cityMenu.scrollTop + cityMenu.clientHeight) cityMenu.scrollTop = edge - cityMenu.clientHeight;
    }
    function openCities(index = select.selectedIndex) {
      if (cityTrigger.disabled) return;
      cityOpen = true; cityMenu.hidden = false; cityTrigger.setAttribute('aria-expanded', 'true');
      positionCities(); focusCity(index);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) cityMenu.animate?.([
        {opacity:0, transform:'translateY(4px)'}, {opacity:1, transform:'none'}
      ], {duration:160, easing:'ease-out'});
    }
    function chooseCity(value) {
      closeCities(true);
      if (select.value !== value) {select.value = value;select.dispatchEvent(new Event('change', {bubbles:true}));}
    }
    cityTrigger.addEventListener('click', () => cityOpen ? closeCities() : openCities());
    cityTrigger.addEventListener('keydown', event => {
      const key = event.key, count = cityMenu.children.length;
      if (['ArrowDown','ArrowUp','Home','End'].includes(key)) {
        event.preventDefault();
        if (!cityOpen) openCities(key === 'Home' ? 0 : key === 'End' ? count - 1 : select.selectedIndex);
        else focusCity(key === 'Home' ? 0 : key === 'End' ? count - 1 : cityActive + (key === 'ArrowDown' ? 1 : -1));
      } else if (cityOpen && (key === 'Enter' || key === ' ')) {
        event.preventDefault(); chooseCity(cityMenu.children[cityActive].dataset.dgCity);
      } else if (cityOpen && key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeCities(true);
      } else if (key === 'Tab') closeCities();
      else if (key.length === 1 && key.trim() && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        event.preventDefault(); if (!cityOpen) openCities();
        clearTimeout(citySearchTimer); citySearch += key.toLocaleLowerCase();
        const index = Array.from(select.options).findIndex(option => option.textContent.toLocaleLowerCase().startsWith(citySearch));
        if (index >= 0) focusCity(index);
        citySearchTimer = setTimeout(() => {citySearch = '';}, 700);
      }
    });
    cityMenu.addEventListener('pointerdown', event => {if (event.pointerType === 'mouse') event.preventDefault();});
    cityMenu.addEventListener('click', event => {
      const option = event.target.closest('[data-dg-city]'); if (option) chooseCity(option.dataset.dgCity);
    });
    document.addEventListener('pointerdown', event => {
      if (cityOpen && !cityTrigger.contains(event.target) && !cityMenu.contains(event.target)) closeCities();
    }, true);
    document.addEventListener('focusin', event => {
      if (cityOpen && !cityTrigger.contains(event.target) && !cityMenu.contains(event.target)) closeCities();
    });
    window.addEventListener('scroll', event => {if (!(event.target instanceof Node) || !cityMenu.contains(event.target)) queueCityPosition();}, true);
    window.addEventListener('resize', queueCityPosition);
    window.visualViewport?.addEventListener('resize', queueCityPosition);
    window.visualViewport?.addEventListener('scroll', queueCityPosition);
    window.addEventListener('pagehide', () => closeCities());
    const tips = document.getElementById('tips-real-content');
    function filterTips() {
      const city = context.get(), all = city === 'all';
      for (const node of tips.querySelectorAll('[data-trip-city]')) {
        // Separate city filtering from the weather controller's validity/expiry visibility.
        node.classList.toggle('dg-other-city', !all && node.dataset.tripCity !== city);
      }
      const culture = tips.querySelector('[data-tip-kind="culture"]');
      if (culture) culture.classList.toggle('dg-other-city', !Array.from(culture.querySelectorAll('.local-tip')).some(n => !n.classList.contains('dg-other-city')));
      const code = T.snapshot?.destinations.find(d => d.id === city)?.countryCode;
      tips.querySelectorAll('[data-tip-country]').forEach(n => n.classList.toggle('dg-other-city', !all && n.dataset.tipCountry !== code));
      tips.querySelectorAll('[data-weather-region]').forEach(n => n.classList.toggle('dg-other-city', !all && n.dataset.weatherRegion !== city));
      const weatherSummary = tips.querySelector('[data-tip-kind="climate"] summary em');
      if (weatherSummary && !weatherSummary.textContent.startsWith('全程 · ')) weatherSummary.textContent = '全程 · ' + weatherSummary.textContent;
      const transfer = tips.querySelector('[data-transfer-cities]');
      if (transfer) transfer.classList.toggle('dg-all-cities', all);
    }
    function renderContext() {
      const data = T.snapshot, city = context.get() || data?.destinations[0]?.id || 'all';
      const destinations = (data?.destinations || []).filter((d,i,a) => a.findIndex(x => x.id === d.id) === i);
      const routeLabel = destinations.map(d => d.name).join(' · ') || '你的旅行';
      const mobileCaption = document.querySelector('.mobile-menu-panel header small');
      if (mobileCaption) mobileCaption.textContent = routeLabel;
      const menuRange = document.querySelector('.mobile-nav-trigger b');
      if (menuRange) menuRange.textContent = '01—04';
      const contents = document.querySelector('.contents-section');
      if (contents) contents.dataset.dgRouteCaption = routeLabel;
      const options = destinations.map(d => `<option value="${E(d.id)}">${E(d.name)}</option>`).join('') + '<option value="all">全部目的地</option>';
      if (select.innerHTML !== options) select.innerHTML = options;
      select.value = city; select.disabled = !destinations.length; hub.dataset.city = city;
      const stayLabel = id => id === 'all' ? destinations.length + ' 个目的地 · 按行程顺序'
        : (data?.destinations || []).filter(d => d.id === id).map(d => T.label(d).replace(d.name + ' · ', '')).join(' / ');
      cityTrigger.disabled = select.disabled;
      hub.querySelector('#dg-city-name').textContent = !destinations.length ? '暂无目的地' : select.selectedOptions[0]?.textContent || '全部目的地';
      hub.querySelector('#dg-stay').textContent = !destinations.length ? '先完善交通与住宿' : stayLabel(city);
      const rows = [...destinations, {id:'all', name:'全部目的地'}];
      const menuHTML = rows.map((d, i) => `<div class="dg-city-option${d.id === 'all' ? ' dg-city-option-all' : ''}" role="option" id="dg-city-option-${i}" data-dg-city="${E(d.id)}" aria-selected="${d.id === city}"><span><b>${E(d.name)}</b><small>${E(stayLabel(d.id))}</small></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg></div>`).join('');
      if (cityMenu.innerHTML !== menuHTML) cityMenu.innerHTML = menuHTML;
      if (select.disabled) closeCities();
      else if (cityOpen) {positionCities(); focusCity(select.selectedIndex);}
      filterTips();
    }
    function setView(next, options = {}) {
      const previous = view, navigation = hub.querySelector('.dg-navigation');
      const navTop = navigation.getBoundingClientRect().top;
      view = ['saved','discover'].includes(next) ? next : 'browse'; hub.dataset.dgView = view;
      const discovery=hub.querySelector('#place-first-guide');if(discovery)discovery.hidden=view!=='discover';
      hub.querySelector('#dg-browse-panel').hidden = view !== 'browse';
      hub.querySelector('#my-wants').hidden = view !== 'saved';
      hub.querySelector('.dg-tabs').hidden = view !== 'browse';
      hub.querySelectorAll('[data-dg-view]').forEach(button => {
        const selected = button.dataset.dgView === view;
        button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      });
      closeCities();
      if (view === 'saved') window.GuidePicks?.render?.();
      const hash = view === 'discover' ? '#destinations' : view === 'saved' ? '#my-wants' : '#' + active;
      if (options.history && location.hash !== hash) history.pushState(null, '', hash);
      if (options.scroll) hub.scrollIntoView({behavior:'instant', block:'start'});
      else if (navTop >= -1 && navTop < innerHeight && navigation.getBoundingClientRect().top < -1) {
        // Keep the controls in sight if switching panels changes the scroll position.
        navigation.scrollIntoView({behavior:'instant', block:'start'});
      }
      if (options.focus) hub.querySelector('[data-dg-view="'+view+'"]')?.focus({preventScroll:true});
      if (previous !== view) window.dispatchEvent(new CustomEvent('guide:viewchange', {detail:{id:view === 'discover' ? 'destinations' : view === 'saved' ? 'my-wants' : 'dg-browse-panel'}}));
      window.dispatchEvent(new Event('guide:navigation-ready'));
    }
    function showSaved(options = {}) {if(window.GuideDiscovery)window.GuideDiscovery.show('wish',options);else setView('saved',options);}
    function showBrowse(options = {}) {if(window.GuideDiscovery)window.GuideDiscovery.show('all',options);else setView('browse', options);}
    function show(id, options = {}) {
      if (!categories.some(c => c[0] === id)) return false;
      const importedKind={sights:'sight',food:'food',move:'experience',shops:'shopping'}[id];
      if(importedKind&&window.GuideDiscovery)return window.GuideDiscovery.browse(importedKind,options);
      const previous = active;
      active = id;
      for (const panel of panels) panel.hidden = panel.id !== active;
      hub.querySelectorAll('[data-dg-tab]').forEach(button => {
        const selected = button.dataset.dgTab === active;
        button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      });
      setView('browse', {focus:options.focus});
      browseTools.forEach(tool => { tool.details.open = false; tool.refresh(); });
      renderContext();
      if (options.history && location.hash !== '#' + id) history.pushState(null, '', '#' + id);
      window.dispatchEvent(new Event('guide:navigation-ready'));
      if (previous !== active) window.dispatchEvent(new CustomEvent('guide:categorychange', {detail:{id:active, previous}}));
      return true;
    }
    function reveal(id) {
      const target = document.getElementById(id);
      const panel = target?.closest('.dg-panel');
      if (!panel) return false;
      const legacyCard=target.closest('[data-sv-id],[data-food-id],[data-xp-id],[data-sg-id]');
      if(legacyCard&&window.GuideDiscovery){const entry=[['sight','svId'],['food','foodId'],['experience','xpId'],['shopping','sgId']].find(([,key])=>legacyCard.dataset[key]);return window.GuideDiscovery.revealPlace(entry[0]+':'+legacyCard.dataset[entry[1]]);}
      show(panel.id);
      const card = target.closest('[data-sv-id],[data-food-id],[data-xp-id],[data-sg-id]');
      const city = card && (card.dataset.city || card.dataset.foodCity || card.dataset.xpCity || card.dataset.sgCity);
      if (city) context.set(city, {source:'deep-link'});
      return true;
    }
    window.DestinationGuide = {show, reveal, showSaved, showBrowse, showDiscovery:options=>setView('discover',options), showLegacySaved:options=>setView('saved',options), get category() {return active;}, get view() {return view;}};
    hub.querySelector('.dg-views').addEventListener('click', event => {
      const button = event.target.closest('[data-dg-view]');
      if (button) {if(button.dataset.dgView==='saved')showSaved({history:true});else showBrowse({history:true});}
    });
    hub.querySelector('.dg-views').addEventListener('keydown', event => {
      const buttons = Array.from(hub.querySelectorAll('[data-dg-view]')), index = buttons.indexOf(event.target);
      if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      if(buttons[next].dataset.dgView==='saved')showSaved({history:true,focus:true});else showBrowse({history:true,focus:true});
    });
    select.addEventListener('change', () => context.set(select.value, {source:'destination-guide'}));
    hub.querySelector('.dg-tabs').addEventListener('click', e => {
      const button = e.target.closest('[data-dg-tab]');
      if (button) show(button.dataset.dgTab, {history:true});
    });
    hub.querySelector('.dg-tabs').addEventListener('keydown', e => {
      const buttons = Array.from(hub.querySelectorAll('[data-dg-tab]')), index = buttons.indexOf(e.target);
      if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length-1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      show(buttons[next].dataset.dgTab, {history:true}); buttons[next].focus({preventScroll:true});
    });
    // Reveal hidden panels before existing anchors or candidate-focus handlers run.
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href^="#"]');
      if (link) reveal(decodeURIComponent(link.hash.slice(1)));
    }, true);
    window.addEventListener('guide:show-candidate', e => {if(window.GuideDiscovery&&e.detail?.id){window.GuideDiscovery.revealPlace(e.detail.kind+':'+e.detail.id);return;}show({sight:'sights',food:'food',experience:'move',shopping:'shops'}[e.detail?.kind]);}, true);
    function followHash() {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id === 'my-wants') {showSaved({scroll:true}); return;}
      if(id==='destinations'&&window.GuideDiscovery){window.GuideDiscovery.show('all',{scroll:!window.TravelChapterNavigation});return;}
      if (reveal(id) || id === 'destinations') {if(window.GuideDiscovery&&view==='discover')return;requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({block:'start',behavior:'instant'}));}
    }
    window.addEventListener('hashchange', followHash);
    window.addEventListener('popstate', followHash);
    window.addEventListener('guide:citychange', renderContext);
    window.addEventListener('tripweather:updated', () => {filterTips(); renderDailyWeather();});
    // Tip banks are rebuilt after Apply; country and city filtering must follow that rebuild.
    const observer = new MutationObserver(() => {if (!frame) frame = requestAnimationFrame(() => {frame = 0; filterTips();});});
    observer.observe(tips, {childList:true,subtree:true});
    T.subscribe(() => {
      const city = context.get();
      if (!city || (city !== 'all' && !T.has(city))) context.set(T.snapshot?.destinations[0]?.id || 'all', {source:'trip'});
      renderContext();
    });
    // Weather is optional context; past dates do not need an empty forecast card.
    // The full forecast, sources and missing-data states remain in Local tips.
    function renderDailyWeather() {
      const box = document.querySelector('[data-dg-day-weather]'), day = window.DailyPlanner?.selectedDay;
      if (!box || !day) return;
      const rows = window.TripWeatherView?.getDay(day.date) || [];
      const now = new Date(), today = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
      const visible = rows.filter(r => r.state !== 'past');
      box.hidden = !day.date || (rows.length ? !visible.length : day.date < today);
      if (box.hidden) { box.replaceChildren(); return; }
      const forecast = visible.filter(r => r.hasForecast);
      const text = forecast.length ? forecast.map(r => r.city+' · '+r.headline).join('；') : visible.some(r => r.state === 'future') ? '临近出发再看预报' : '查看当天预报';
      const html = `<div class="dg-day-weather"><span class="dp-context-label">天气</span><button type="button" data-dg-weather-open>${E(text)} <span aria-hidden="true">↗</span></button></div>`;
      if (box.innerHTML !== html) box.innerHTML = html;
    }
    const sheet = document.getElementById('dp-sheet');
    if (sheet) new MutationObserver(renderDailyWeather).observe(sheet, {childList:true});
    let weatherRevision = -1;
    const dailyObserver = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting) || weatherRevision === T.snapshot?.revision) return;
      const date = window.DailyPlanner?.selectedDay?.date;
      if (!date || (window.TripWeatherView?.getDay(date) || []).every(r => r.state === 'past')) return;
      weatherRevision = T.snapshot?.revision;
      window.TripWeatherView?.ensure();
    });
    // Observe the changing daily sheet rather than the whole long section.
    if (sheet) dailyObserver.observe(sheet);
    document.addEventListener('click', e => {
      if (e.target.closest('[data-dg-weather-open]')) {
        const city = window.DailyPlanner?.selectedDay?.cityId;
        if (city) context.set(city, {source:'daily-weather'});
        show('tips', {history:true});
        window.TripWeatherView?.showDay(window.DailyPlanner?.selectedDay?.date);
      }
    });
    window.addEventListener('guide:daychange', renderDailyWeather);
    show('sights'); followHash(); renderDailyWeather();
    window.dispatchEvent(new Event('guide:navigation-ready'));
  }
  window.TravelStorage.whenReady(init);
})();
