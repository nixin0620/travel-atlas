/* Loaded only by scripts/start.py --demo in a separate workspace. */
(function () {
  'use strict';
  function label() {
    document.title = '示例体验 · Travel Atlas';
    for (const selector of ['.jungle-cover-copy', '#journey-app', '#daily']) {
      const parent = document.querySelector(selector);
      if (!parent || parent.querySelector('.public-demo-label')) continue;
      const note = document.createElement('p');
      note.className = 'public-demo-label';
      note.textContent = '公开示例 · 日期与住宿仅供体验，未预订';
      note.style.cssText = 'font:600 12px/1.6 system-ui,sans-serif;letter-spacing:.04em;color:var(--hb-accent,#b08a45);margin:0 0 12px';
      parent.prepend(note);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', label);
  else label();
})();
