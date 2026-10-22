import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';

test('regional moving bodies remain measured and distinct in actual dossiers and common-scale views',async({page})=>{
 test.setTimeout(180000);const phase=process.env.MOTION_SURFACES_PHASE||'after';
 if(phase==='before')await page.route('**/lib/playerMotion.js*',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await fs.readFile('.cache/s117-motion-before-regional-surfaces.js.txt','utf8')});
 });
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');await page.click('#createLeagueBtn');await page.waitForURL(/game\.html$/);
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator('#rosterTable button[data-player-id]').first().click();
 await page.locator('.player-physique > summary').click();await page.locator('.player-movement > summary').click();
 const detail=page.locator('.player-movement');await detail.scrollIntoViewIfNeeded();
 if(phase==='after'){
  // Retain the regional fallback contract while observing animation on the
  // visible production canvas; its hidden SVG updates only at mode boundaries.
  const motionSvg=detail.locator('.player-motion-svg'),canvas=motionSvg.locator('[data-player-character3d]');
  await expect(motionSvg).toHaveAttribute('data-character-renderer','shared-3d');
  await expect(canvas).toBeVisible();
  for(const mode of ['run','jump','acceleration']){
   await detail.locator('[data-motion-mode]').selectOption(mode);
   await expect(detail.locator('.motion-upper-surface')).toHaveCount(4);
   await expect(detail.locator('.motion-lower-surface')).toHaveCount(4);
   await expect(detail.locator('.motion-hand')).toHaveCount(2);
   const skin=await detail.locator('.player-side-head').getAttribute('data-skin-color');
   await expect(detail.locator('.motion-leg').last()).toHaveAttribute('data-skin-color',skin);
  }
  await detail.locator('[data-motion-mode]').selectOption('run');
  await canvas.evaluate(c=>{c.__motionSurfaceContinuity='same-canvas';});
  const image=()=>canvas.evaluate(c=>c.toDataURL()),initial=await image();
  await expect.poll(image).not.toBe(initial);
  expect(await canvas.evaluate(c=>c.__motionSurfaceContinuity)).toBe('same-canvas');
 }
 await page.emulateMedia({reducedMotion:'reduce'});await fs.mkdir('output/playwright',{recursive:true});
 for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  if(view==='mobile'){
   await expect(page.locator('#mlFullViewBtn')).toBeVisible();
   await page.locator('#mlFullViewBtn').click();
  }
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
   await detail.scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-motion-surfaces-${phase}-${view}-${theme}-dossier.png`});
  }
 }
 const fixedAppearance=playerAppearance({id:'regional-common-appearance',age:24});
 const fixtures=[['Short · heavy',62,270,'short'],['Tall · light',86,180,'tall-light'],['Tall · heavy',86,380,'tall-heavy'],['Heavy · fast',78,340,'heavy-fast'],['Equal size · frame A',74,225,'frame-a'],['Equal size · frame B',74,225,'frame-b']].map(([label,heightInches,weightLbs,id])=>{
  const p={id,name:label,age:24,heightInches,weightLbs,ratings:{speed:90,acceleration:85,jumping:85,strength:85}};
  return {label,player:{...p,appearance:fixedAppearance,visualFrame:playerFrame(p)}};
 });
 await page.evaluate(async({fixtures})=>{
  const {buildPlayerMotionSvg,buildPlayerPhysiqueSvg}=await import('/lib/playerPortrait.js');
  const gallery=document.createElement('section');gallery.id='motionSurfaceGallery';gallery.style.cssText='display:grid;gap:20px;padding:16px;max-width:1280px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  for(const f of fixtures){
   const card=document.createElement('article'),label=document.createElement('p');label.textContent=`${f.label} · ${f.player.heightInches}″ / ${f.player.weightLbs} lb`;label.style.cssText='min-height:2.6em;font-weight:600';card.append(label);
   const bodies=document.createElement('div');bodies.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:10px';bodies.innerHTML=buildPlayerPhysiqueSvg(f.player,{view:'side'})+buildPlayerMotionSvg(f.player,{phase:.18});
   bodies.querySelectorAll('svg').forEach(s=>s.style.cssText='display:block;width:100%;height:auto;margin:auto');card.append(bodies);gallery.append(card);
  }
  document.body.replaceChildren(gallery);
 },{fixtures});
 for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#motionSurfaceGallery').evaluate((g,view)=>g.style.gridTemplateColumns=view==='desktop'?'repeat(3,minmax(0,1fr))':'minmax(0,1fr)',view);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await page.screenshot({path:`output/playwright/s117-motion-surfaces-${phase}-${view}-${theme}-gallery.png`,fullPage:true});
  }
 }
});
