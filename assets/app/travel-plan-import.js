/* Photo credits for the native plan; initialization runs before storage readiness. */
(function () {
  'use strict';
  window.TravelStorage.whenReady(() => {
    if (window.TravelStorage.bootError) return;
    const plan = window.TripData?.snapshot?.plan;
    if (plan) showCredits(plan);
  });
  function showCredits(plan) {
    const photos=[plan.cover,...plan.cities.map(c=>c.photo),...(window.DotImports?.read()?.items||[]).flatMap(i=>i.place.publicPhotos||[])].filter(Boolean);
    const unique=photos.filter((p,i)=>photos.findIndex(q=>q.sourceURL===p.sourceURL)===i);
    if(!unique.length)return;
    const details=document.createElement('details');details.style.cssText='padding:12px 24px;font-size:12px;color:var(--hb-muted)';
    const summary=document.createElement('summary');summary.textContent='照片来源';details.append(summary);
    unique.forEach(p=>{const line=document.createElement('p'),source=document.createElement('a');source.href=p.sourceURL;source.target='_blank';source.rel='noopener noreferrer';source.textContent=(p.alt||'旅行图片')+' · '+(p.credit||'来源');line.append(source,document.createTextNode(' · '));const license=document.createElement(p.licenseURL?'a':'span');license.textContent=p.license||'见来源授权';if(p.licenseURL){license.href=p.licenseURL;license.target='_blank';license.rel='noopener noreferrer';}line.append(license,document.createTextNode(' · 页面中可能缩放或裁切'));details.append(line);});
    document.querySelector('#top')?.after(details);
  }
})();
