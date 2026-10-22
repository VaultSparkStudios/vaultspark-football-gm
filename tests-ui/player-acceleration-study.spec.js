import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';

test('actual dossier acceleration build-up and controlled capacity comparisons',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.ACCELERATION_STUDY_PHASE||'after';
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');await page.click('#createLeagueBtn');await page.waitForURL(/game\.html$/);
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator('#rosterTable button[data-player-id]').first().click();
 await page.locator('.player-physique > summary').click();
 const detail=page.locator('.player-movement');await detail.locator(':scope > summary').click();await detail.scrollIntoViewIfNeeded();
 if(phase==='after'){
  await detail.locator('[data-motion-mode]').selectOption('acceleration');
  await expect(detail.locator('svg')).toHaveAttribute('data-mode','acceleration');
  await expect(detail.locator('[data-motion-caption]')).toContainText('Ready (0%)');
  await expect(detail.locator('[data-motion-caption]')).toContainText('Building speed',{timeout:10000});
  await expect(detail.locator('[data-motion-caption]')).toContainText('Steady pace (100%)',{timeout:10000});
  await detail.locator('[data-motion-toggle]').click();
  const still=await detail.locator('[data-motion-content]').innerHTML();await page.waitForTimeout(180);
  expect(await detail.locator('[data-motion-content]').innerHTML()).toBe(still);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(detail.locator('[data-motion-toggle]')).toBeDisabled();
  await expect(detail.locator('[data-motion-caption]')).toContainText('Ready (0%)');
 }
 // Baseline is the existing steady treadmill state; after is the new drill.
 await page.emulateMedia({reducedMotion:'reduce'});await fs.mkdir('output/playwright',{recursive:true});
 for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
   await detail.scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-acceleration-${phase}-${view}-${theme}-dossier.png`});
  }
 }
 const base={id:'acceleration-pair',name:'Acceleration pair',heightInches:78,weightLbs:340,ratings:{speed:85,acceleration:40,jumping:70,strength:80}};
 const fixtures=[['Low acceleration · early build-up',40,.22],['High acceleration · early build-up',99,.22],['Low acceleration · steady pace',40,.55],['High acceleration · steady pace',99,.55]].map(([label,acceleration,p])=>{
  const player={...base,ratings:{...base.ratings,acceleration}};return {label,phase:p,player:{...player,appearance:playerAppearance(player),visualFrame:playerFrame(player)}};
 });
 await page.evaluate(async({fixtures,phase})=>{
  const {buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
  const gallery=document.createElement('section');gallery.id='accelerationGallery';gallery.style.cssText='display:grid;gap:12px;padding:12px;max-width:960px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  for(const f of fixtures){const card=document.createElement('article');const label=document.createElement('p');label.textContent=f.label;label.style.minHeight='2.8em';card.append(label);card.insertAdjacentHTML('beforeend',buildPlayerMotionSvg(f.player,{mode:phase==='before'?'run':'acceleration',phase:f.phase}));card.querySelector('svg').style.cssText='display:block;width:100%;max-width:220px;height:auto;margin:auto';gallery.append(card);}
  document.body.replaceChildren(gallery);
 },{fixtures,phase});
 for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#accelerationGallery').evaluate(g=>g.style.gridTemplateColumns='repeat(2,minmax(0,1fr))');
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await page.screenshot({path:`output/playwright/s117-acceleration-${phase}-${view}-${theme}-gallery.png`,fullPage:true});
  }
 }
});
