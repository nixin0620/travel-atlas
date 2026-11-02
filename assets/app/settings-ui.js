/* Navigation shell for the existing theme picker and backup center. */
(function () {
  'use strict';
  function init() {
    const paths = {
      settings: '<path d="m9 3-.6 2.4-2 .9L4 5.6 2.5 8.2l1.8 1.7-.2 2.2L2.5 14.2 4 16.8l2.4-.5 1.8 1.3L9 20h3l.7-2.4 2-1 2.3.7 1.5-2.6-1.7-1.8.1-2.2 1.6-1.9L17 6.2l-2.4.5-1.8-1.3L12 3Z"/><circle cx="10.5" cy="11.5" r="3"/>',
      palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3Z"/><circle cx="7" cy="11" r=".7"/><circle cx="10" cy="7" r=".7"/><circle cx="15" cy="7.5" r=".7"/><circle cx="17.5" cy="11.5" r=".7"/>',
      data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
      next: '<path d="m9 5 7 7-7 7"/>',
      back: '<path d="m15 5-7 7 7 7"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>'
    };
    const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">'+paths[name]+'</svg>';
    const dialog = document.createElement('dialog');
    dialog.id='travel-settings';dialog.className='settings-dialog';dialog.setAttribute('aria-labelledby','settings-title');
    dialog.innerHTML=`<header><button type="button" data-settings-back aria-label="返回设置" hidden>${icon('back')}</button><h2 id="settings-title">设置</h2><button type="button" data-settings-close aria-label="关闭设置">${icon('close')}</button></header>
      <div class="settings-home">
        <button type="button" class="settings-row" data-settings-view="appearance">${icon('palette')}<span><b>外观与配色</b><small>切换全站主题与配色</small></span>${icon('next')}</button>
        <button type="button" class="settings-row" data-settings-view="backup">${icon('data')}<span><b>数据与备份</b><small>备份到电脑 · 从备份恢复</small></span>${icon('next')}</button>
      </div><div class="settings-appearance" hidden></div>`;
    document.body.append(dialog);
    let opener=null,afterClose=null;
    const home=dialog.querySelector('.settings-home'),appearance=dialog.querySelector('.settings-appearance'),back=dialog.querySelector('[data-settings-back]');
    function show(view) {
      const isAppearance=view==='appearance';
      home.hidden=isAppearance;appearance.hidden=!isAppearance;back.hidden=!isAppearance;
      dialog.querySelector('h2').textContent=isAppearance?'外观与配色':'设置';
      if(isAppearance)window.HandbookTheme.mount(appearance);
      dialog.scrollTop=0;
    }
    function open(view='home',trigger) {
      opener=trigger||opener||document.activeElement;afterClose=null;
      show(view);if(!dialog.open)dialog.showModal();
      document.querySelectorAll('[data-settings-open]').forEach(b=>b.setAttribute('aria-expanded','true'));
      (view==='appearance'?back:dialog.querySelector('[data-settings-close]')).focus({preventScroll:true});
    }
    function close(){dialog.close();}
    dialog.querySelector('[data-settings-close]').onclick=close;
    back.onclick=()=>{show('home');home.querySelector('button').focus({preventScroll:true});};
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('close',()=>{
      document.querySelectorAll('[data-settings-open]').forEach(b=>b.setAttribute('aria-expanded','false'));
      const next=afterClose;afterClose=null;
      if(next)next();else if(opener?.isConnected)opener.focus({preventScroll:true});
    });
    home.addEventListener('click',e=>{
      const view=e.target.closest('[data-settings-view]')?.dataset.settingsView;
      if(view==='appearance'){show(view);back.focus({preventScroll:true});}
      else if(view==='backup'){
        const trigger=opener;
        afterClose=()=>window.TravelBackupCenter.open('home',{returnFocus:trigger,onBack:()=>open('home',trigger)});
        close();
      }
    });
    window.TravelSettings={open};
    const mobileMenu=document.querySelector('.mobile-menu-panel'),mobileTrigger=document.querySelector('.mobile-nav-trigger');
    for(const host of [document.querySelector('.guide-rail-footer'),mobileMenu].filter(Boolean)){
      const button=document.createElement('button');button.type='button';button.className='settings-launch';button.dataset.settingsOpen='';
      button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);button.setAttribute('aria-expanded','false');
      button.innerHTML=icon('settings')+'<span>设置</span>'+icon('next');
      button.onclick=()=>{
        const mobile=host===mobileMenu;
        if(mobile&&mobileTrigger?.getAttribute('aria-expanded')==='true')mobileTrigger.click();
        open('home',mobile?mobileTrigger:button);
      };
      host.append(button);
      if(host===mobileMenu){
        const sync=()=>{button.tabIndex=host.getAttribute('aria-hidden')==='true'?-1:0;};
        sync();new MutationObserver(sync).observe(host,{attributes:true,attributeFilter:['aria-hidden']});
      }
    }
    document.body.classList.add('has-travel-settings');
  }
  const ready=()=>window.TravelStorage.whenReady(init);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
