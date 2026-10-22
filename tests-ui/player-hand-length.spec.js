import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {resolveBodyVolume} from '../src/domain/playerMeasurements.js';

test('recorded hand length appears separately and moves wrists at fixed fingertip reach',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.HAND_LENGTH_PHASE||'after';
 if(phase==='before'){
  await page.route('**/lib/playerPortrait.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('(f.handLengthInches ?? f.heightInches * .10) * unit','f.heightInches * .10 * unit')});});
  await page.route('**/lib/appCore.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('  if (record.values.handLengthInches != null) rows.push(["Hand length", "handLengthInches"]);','')});});
 }
 // Read-only measured-data fixture in a real dossier; not an observed athlete.
 await page.route('**/api/player?*',async route=>{
  const response=await route.fetch(),payload=await response.json(),p=payload.profile.player,f=p.visualFrame;
  p.bodyMeasurements.values.handLengthInches=8.125;
  p.bodyMeasurements.provenance.handLengthInches={kind:'measured',source:'browser-fixture'};
  if(phase!=='before')p.visualFrame={...f,...resolveBodyVolume({height:f.heightInches,weight:f.weightLbs,shoulderSpan:f.shoulderSpanInches,torsoShare:f.torsoShare,armLength:f.armLengthInches,handLength:8.125,individuality:f.limbShapeVariation}),handLengthInches:8.125};
  await route.fulfill({response,json:payload});
 });
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');
 await page.click('#createLeagueBtn');await page.waitForURL(/game\.html$/);
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');
 await page.locator('#rosterTable button[data-player-id]').first().click();
 const body=page.locator('.player-physique');await body.locator(':scope > summary').click();
 if(phase!=='before')await expect(body.locator('dl')).toContainText('Hand length8.125');
 await fs.mkdir('output/playwright',{recursive:true});await page.emulateMedia({reducedMotion:'reduce'});
 for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
  await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
  await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await body.locator('dl').scrollIntoViewIfNeeded();
   await page.screenshot({path:`output/playwright/s117-hand-length-${phase}-${viewport}-${theme}-dossier.png`});
  }
 }
 const base={id:'hand-length-fixture',name:'Hand measurement comparison',heightInches:75,weightLbs:210,armLengthInches:33,handSizeInches:10.25,age:24};
 const fixtures=[7,9].map(handLengthInches=>({...base,handLengthInches,appearance:playerAppearance(base),visualFrame:playerFrame(phase==='before'?base:{...base,handLengthInches})}));
 await page.evaluate(async players=>{
  const {buildPlayerPhysiqueSvg}=await import('/lib/playerPortrait.js');
  const gallery=document.createElement('section');gallery.id='handGallery';gallery.style.cssText='display:grid;gap:8px;padding:8px;background:var(--surface);color:var(--ink-strong)';
  players.forEach((p,i)=>{for(const view of ['front','side']){const card=document.createElement('article');card.innerHTML=buildPlayerPhysiqueSvg(p,{view,idSuffix:`-${i}-${view}`});card.querySelector('svg').style.cssText='width:100%;display:block';const label=document.createElement('p');label.textContent=`${view}: hand length ${p.handLengthInches} in; arm 33 in; span 10.25 in`;card.append(label);gallery.append(card);}});
  document.body.replaceChildren(gallery);
 },fixtures);
 for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#handGallery').evaluate((e,n)=>e.style.gridTemplateColumns=`repeat(${n},minmax(0,1fr))`,viewport==='desktop'?4:2);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await page.locator('#handGallery').screenshot({path:`output/playwright/s117-hand-length-${phase}-${viewport}-${theme}-gallery.png`});
  }
 }
});
