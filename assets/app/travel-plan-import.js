/* One reviewable import, using the existing full-backup snapshot/rollback path. */
(function () {
  'use strict';
  const seed = window.TravelPlanSeed;
  window.TravelStorage.whenReady(() => {
    const B = window.TravelBackup, root = document.querySelector('#journey-app');
    if (!B || !root) return;
    const current = window.TripData.snapshot;
    if (current.plan) {showCredits(current.plan);return;} // Never reapply a seed over an edited journey on refresh.
    if (!seed || seed.tripId !== current.tripId) return;
    const box = document.createElement('div');box.className = 'jo-import-plan';
    box.style.cssText='margin:16px 32px;padding:16px;border:1px solid var(--hb-line-light);border-radius:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
    const label = document.createElement('span');label.textContent = seed.journey.plan.title + ' · ' + seed.report.days + ' 天 · ' + seed.report.places + ' 个地点';
    const button = document.createElement('button');button.className='jo-btn';button.textContent='载入旅行规划';
    const status = document.createElement('span');status.setAttribute('role','status');
    box.append(label,button,status);root.prepend(box);
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try {
        const backup=await B.snapshot(true),old=backup.records;
        if(old.journeyDraft?.plan||old.journeyApplied?.plan)throw Error('已有旅行规划，请在原日程中继续调整。');
        const journey=old.journeyDraft||seed.journey,applied=old.journeyApplied||journey;
        const nextJourney={...journey,plan:seed.journey.plan,initialized:true},nextApplied={...applied,plan:seed.journey.plan,initialized:true};
        // Validate date span before any mutation; leave existing orders untouched.
        window.TravelJourneyCore.model(window.TravelJourneyCore.clean(nextJourney,seed.tripId));
        window.TravelJourneyCore.model(window.TravelJourneyCore.clean(nextApplied,seed.tripId));
        const imports=JSON.parse(JSON.stringify(old.guideImports||{version:1,tripId:seed.tripId,items:[],guides:[]})),remap=new Map();
        for(const item of seed.imports.items){
          const existing=imports.items.find(i=>i.sourceId===item.sourceId||i.place.cityId===item.place.cityId&&window.DotImportCore.normalizeName(i.place.name)===window.DotImportCore.normalizeName(item.place.name));
          if(existing)remap.set(item.sourceId,existing.place);else imports.items.push(item);
        }
        const daily=JSON.parse(JSON.stringify(old.dailyPlan||{version:1,entries:[],locations:{}}));
        for(const original of seed.daily.entries){
          const entry={...original,...(original.place&&remap.has(original.place.sourceId)?{place:remap.get(original.place.sourceId)}:{})};
          if(!daily.entries.some(e=>e.id===entry.id||entry.place&&e.place?.sourceId===entry.place.sourceId&&e.dayId===entry.dayId))daily.entries.push(entry);
        }
        const records={...old,journeyDraft:nextJourney,journeyApplied:nextApplied,guideImports:imports,dailyPlan:daily};
        await B.apply({...backup,records});location.reload();
      } catch(error){status.textContent=error.message;button.disabled=false;}
    });
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
