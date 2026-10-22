import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';

test('actual heavy-player dossier and common-scale anatomy comparisons',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.PHYSIQUE_CAPTURE_PHASE||'after';
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 await page.click('#createLeagueBtn');await expect(page).toHaveURL(/\/game\.html$/,{timeout:90000});
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');
 await expect(page.locator('#rosterTable button[data-player-id]').first()).toBeVisible();
 const chosen=await page.evaluate(async()=>{
  const {api,state}=await import('/lib/appState.js');
  const roster=await api(`/api/roster?teamId=${encodeURIComponent(state.controlledTeamId)}`);
  const players=roster.players||roster.roster||[];
  return players.filter(p=>p.rosterSlot==='active').sort((a,b)=>b.weightLbs-a.weightLbs)[0];
 });
 expect(chosen?.weightLbs).toBeGreaterThan(280);
 await page.locator(`#rosterTable button[data-player-id="${chosen.id}"]`).first().click();
 await expect(page.locator('#playerModal')).not.toHaveClass(/hidden/);
 const body=page.locator('.player-physique');await body.locator(':scope > summary').click();
 await body.locator('.player-physique-side > summary').click();
 await page.emulateMedia({reducedMotion:'reduce'});await fs.mkdir('output/playwright',{recursive:true});
 const captures=[];
 for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(220);
  if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
  await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
  await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   for(const view of ['front','side']){
    const figure=body.locator(view==='front'?'.player-physique-svg':'.player-physique-side-svg');
    await figure.evaluate(e=>e.scrollIntoView({block:'center'}));
    await expect(page.locator('#closePlayerModalBtn')).toBeInViewport();
    const rect=await figure.boundingBox(),header=await page.locator('.player-modal-header').boundingBox();
    expect(rect.y).toBeGreaterThanOrEqual(header.y+header.height-1);
    const file=`output/playwright/s117-anatomy-${phase}-${viewport}-${theme}-dossier-${view}.png`;
    await page.screenshot({path:file});captures.push({file,viewport,theme,kind:'actual dossier',view,playerId:chosen.id});
   }
  }
 }
 const cases=[['Balanced',74,220,80,32],['Compact heavy',70,320,90,31],['Tall heavy',79,340,90,35],['Tall light',80,185,70,34],['Lighter counterpart',74,190,70,31],['Heavier counterpart',74,330,70,31]];
 const fixtures=cases.map(([name,heightInches,weightLbs,strength,armLengthInches])=>{
  const p={id:'anatomy-comparison',name,age:24,heightInches,weightLbs,armLengthInches,jerseyNumber:17,ratings:{strength,speed:80}};
  return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
 });
 await page.evaluate(async players=>{
  const {buildPlayerPhysiqueSvg}=await import('/lib/playerPortrait.js');
  const gallery=document.createElement('section');gallery.id='anatomyGallery';
  gallery.style.cssText='display:grid;gap:12px;padding:12px;background:var(--surface);color:var(--ink-strong);max-width:1150px;margin:auto';
  players.forEach((p,i)=>{for(const view of ['front','side']){
   const card=document.createElement('article');card.dataset.group=String(Math.floor(i/3));
   card.innerHTML=buildPlayerPhysiqueSvg(p,{view,idSuffix:`-${i}-${view}`});
   card.querySelector('svg').style.cssText='display:block;width:100%;height:auto';
   const label=document.createElement('p');label.textContent=`${p.name} · ${view} · ${p.heightInches}″ / ${p.weightLbs} lb · arm ${p.armLengthInches}″ · strength ${p.ratings.strength}`;
   label.style.cssText='font-size:14px;line-height:1.4;margin:8px 0';card.append(label);gallery.append(card);
  }});document.body.replaceChildren(gallery);
 },fixtures);
 for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  await page.locator('#anatomyGallery').evaluate((e,columns)=>e.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`,viewport==='desktop'?6:2);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   for(const group of [0,1]){
    await page.locator('#anatomyGallery article').evaluateAll((cards,g)=>cards.forEach(c=>c.style.display=Number(c.dataset.group)===g?'block':'none'),group);
    const file=`output/playwright/s117-anatomy-${phase}-${viewport}-${theme}-comparison-${group}.png`;
    await page.locator('#anatomyGallery').screenshot({path:file});captures.push({file,viewport,theme,kind:'common-scale comparisons',group});
   }
  }
 }
 await fs.writeFile(`output/playwright/s117-anatomy-${phase}.json`,JSON.stringify({phase,actualPlayer:chosen,fixtures,captures},null,2));
});
