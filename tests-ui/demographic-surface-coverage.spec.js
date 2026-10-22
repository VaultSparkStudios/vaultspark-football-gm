import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sizes=[['desktop',1440,1000],['mobile',390,844]];

test('actual generated within-background samples visibly reach shared head and measured body renderers',async({page})=>{
 const bytes=await fs.readFile('docs/PLAYER_COHORT_DIAGNOSTICS_2026-10-06.json');
 const report=JSON.parse(bytes),groups=Object.entries(report.visualSamples.groups);
 expect(groups).toHaveLength(8);
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async groups=>{
  const {buildPlayerPortraitSvg,buildPlayerPhysiqueSvg}=await import('/lib/playerPortrait.js');
  const main=document.createElement('main');main.id='backgroundGallery';main.style.cssText='max-width:960px;margin:auto;padding:16px;background:var(--surface);color:var(--ink-strong)';
  for(const [category,samples]of groups){
   const section=document.createElement('section');section.dataset.category=category;
   const title=document.createElement('h2');title.textContent=`${category} · United States birth · actual generated individuals`;section.append(title);
   const pair=document.createElement('div');pair.className='background-pair';pair.style.cssText='display:grid;gap:16px;grid-template-columns:1fr 1fr';
   for(const [i,sample]of samples.entries()){
    const p=sample.player,card=document.createElement('article');card.dataset.playerId=p.id;
    card.innerHTML=`<div class="sample-head">${buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:'-background-'+category+'-'+i})}</div><div class="sample-body">${buildPlayerPhysiqueSvg(p,{idSuffix:'-background-'+category+'-'+i})}</div>`;
    card.querySelector('.sample-head svg').style.cssText='width:220px;max-width:100%;display:block;margin:auto';
    card.querySelector('.sample-body svg').style.cssText='width:140px;display:block;margin:auto';
    const label=document.createElement('p');label.textContent=`${p.name} · ${p.position} · ${p.heightInches}in/${p.weightLbs}lb · seed${sample.seed}/${sample.cohort}`;card.append(label);pair.append(card);
   }section.append(pair);main.append(section);
  }document.body.replaceChildren(main);
 },groups);
 await fs.mkdir('output/playwright',{recursive:true});const captures=[];
 for(const [category,samples]of groups){
  expect(samples).toHaveLength(2);expect(samples[0].player.id).not.toBe(samples[1].player.id);
  for(const sample of samples){expect(sample.player.profile.identity.surveyCategory).toBe(category);expect(sample.player.profile.identity.birthCountry).toBe('United States');}
  for(const [viewport,width,height]of sizes){
   await page.setViewportSize({width,height});await page.locator('.background-pair').evaluateAll((pairs,mobile)=>pairs.forEach(pair=>pair.style.gridTemplateColumns=mobile?'1fr':'1fr 1fr'),viewport==='mobile');
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    const section=page.locator(`section[data-category="${category}"]`),portraits=section.locator('.sample-head svg');
    const pixels=await Promise.all([portraits.nth(0).screenshot(),portraits.nth(1).screenshot()]);
    expect(hash(pixels[0])).not.toBe(hash(pixels[1]));
    const file=`output/playwright/s117-background-${category}-${viewport}-${theme}.png`;await section.screenshot({path:file});captures.push({file,category,viewport,theme,playerIds:samples.map(s=>s.player.id)});
   }
  }
 }
 await fs.writeFile('output/playwright/s117-background-gallery.json',JSON.stringify({kind:'actual-generated-selected-background-gallery',cohortReportHash:hash(bytes),captures,limits:report.visualSamples.limits},null,2));
});

test('same-background actual players open through roster, scouting and draft product views',async({page})=>{
 test.setTimeout(240000);await createPlayScenario(page);await page.emulateMedia({reducedMotion:'reduce'});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await fs.mkdir('output/playwright',{recursive:true});const captures=[],players=[];let mobileFullViewChosen=false;
 for(const [surface,table,button]of [['roster','rosterTable','loadRosterBtn'],['draft','draftAvailableTable','prepareDraftBtn'],['scouting','scoutingTable','loadScoutingBtn']]){
  if(surface==='draft'){
   // Disclosed offseason presentation fixture, preserving the actual generated
   // players/class through the real snapshot import. This is not an annual
   // gameplay proof; the managed career run supplies that separate evidence.
   const exported=await page.request.get('/api/snapshot/export');expect(exported.ok()).toBe(true);
   const {snapshot}=await exported.json();snapshot.phase='offseason';snapshot.currentWeek=19;
   const imported=await page.request.post('/api/snapshot/import',{data:{snapshot}});expect(imported.ok(),await imported.text()).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1000});await page.click(`[data-testid="tab-${surface}"]`);await page.click(`#${button}`);
  await expect(page.locator(`#${table} .link-btn[data-player-id]`).first()).toBeVisible();
  if(surface==='draft')await expect(page.locator('#seasonReviewModal')).toBeVisible();
  if(await page.locator('#seasonReviewModal').isVisible()){
   for(const [viewport,width,height]of sizes){
    await page.setViewportSize({width,height});
    for(const theme of ['dark','light']){
     await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
     const card=page.locator('.season-review-card');
     const geometry=await card.evaluate(el=>({height:el.getBoundingClientRect().height,scroll:el.scrollHeight,client:el.clientHeight}));
     expect(geometry.height).toBeLessThanOrEqual(height-47);
     await page.locator('#closeSeasonReviewBtn').scrollIntoViewIfNeeded();
     await expect(page.locator('#closeSeasonReviewBtn')).toBeInViewport();
     await page.screenshot({path:`output/playwright/s117-season-review-scroll-${viewport}-${theme}.png`});
    }
   }
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('#closeSeasonReviewBtn').click({timeout:12000});
   await expect(page.locator('#seasonReviewModal')).toBeHidden();
  }
  const ids=await page.locator(`#${table} .link-btn[data-player-id]`).evaluateAll(buttons=>buttons.slice(0,24).map(b=>b.dataset.playerId));
  const profiles=await Promise.all(ids.map(async id=>{const response=await page.request.get(`/api/player?playerId=${encodeURIComponent(id)}&seasonType=regular`);expect(response.ok(),`${surface}/${id}: ${response.status()} ${await response.text()}`).toBe(true);return (await response.json()).profile.player;}));
  const pair=profiles.filter(p=>p.profile.identity.surveyCategory==='Black'&&p.profile.identity.birthCountry==='United States').slice(0,2);
  expect(pair,`${surface}: actual same-background pair`).toHaveLength(2);expect(pair[0].appearance).not.toEqual(pair[1].appearance);players.push({surface,players:pair.map(p=>({id:p.id,identity:p.profile.identity,appearance:p.appearance,visualFrame:p.visualFrame}))});
  for(const [viewport,width,height]of sizes){
   await page.setViewportSize({width,height});const full=page.locator('#mlFullViewBtn');
   // The resize handler runs asynchronously. Wait for the first mobile deck
   // before choosing Full View; an immediate hidden check can race its opening.
   if(viewport==='mobile'&&!mobileFullViewChosen){await expect(full).toBeVisible();await full.click();mobileFullViewChosen=true;}
   else if(await full.isVisible())await full.click();
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    const tableFile=`output/playwright/s117-background-access-${surface}-${viewport}-${theme}.png`;await page.locator(`#${table} .link-btn[data-player-id="${pair[0].id}"]`).scrollIntoViewIfNeeded();await page.screenshot({path:tableFile});captures.push({file:tableFile,surface,viewport,theme,state:'actual-list'});
    for(const [i,p]of pair.entries()){
     await page.locator(`#${table} .link-btn[data-player-id="${p.id}"]`).click({timeout:12000});await expect(page.locator('#playerModal')).toBeVisible();
     if(surface!=='roster'){
      await expect(page.locator('#playerModal .profile-badge-row')).toContainText('Unsigned Prospect');
      await expect(page.locator('#playerModal .profile-badge-row')).toContainText('(scouted)');
      await expect(page.locator('#playerModal .player-story-card--bio')).toContainText('Scouting estimates');
     }
     const portrait=page.locator('#playerModal .player-portrait-svg').first();await portrait.scrollIntoViewIfNeeded();await expect(portrait).toBeVisible();
     const file=`output/playwright/s117-background-access-${surface}-${i}-${viewport}-${theme}.png`;await portrait.screenshot({path:file});captures.push({file,surface,playerId:p.id,viewport,theme,state:'actual-opened-profile'});await page.locator('#closePlayerModalBtn').click();
    }
   }
  }
 }
 await fs.writeFile('output/playwright/s117-background-access.json',JSON.stringify({kind:'actual-product-background-access',players,captures,limits:['One common reporting category/birthplace pair per actual access path; selected cases are not population frequency estimates.','Draft/scouting use a disclosed offseason-phase snapshot fixture with the actual generated class; not a played annual-boundary or draft-clock proof.']},null,2));
});
