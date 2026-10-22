import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';

test('actual dossier provides dimension-preserving animated studies, pause and reduced motion',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.ATHLETE_MOTION_PHASE||'after';
 if(phase==='before')await page.route('**/lib/appCore.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/^    <details class="player-movement">.*\r?\n/m,'')});});
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');await page.click('#createLeagueBtn');await page.waitForURL(/game\.html$/);
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');
 const playerButton=page.locator('#rosterTable button[data-player-id]').first(),playerId=await playerButton.getAttribute('data-player-id');
 const original=(await(await page.request.get(`/api/player?playerId=${playerId}`)).json()).profile.player;
 await playerButton.click();
 const physique=page.locator('.player-physique');await physique.locator(':scope > summary').click();
 if(phase==='after'){
  const detail=page.locator('.player-movement');await detail.locator(':scope > summary').click();
  await detail.scrollIntoViewIfNeeded();
  await page.emulateMedia({reducedMotion:'no-preference'});
  const svg=detail.locator('.player-motion-svg'),canvas=svg.locator('[data-player-character3d]');
  await expect(svg).toHaveAttribute('data-character-renderer','shared-3d');await expect(canvas).toBeVisible();
  await canvas.evaluate(c=>{c.__athleticMotionContinuity='same-canvas';});
  // Successful GPU frames intentionally leave the hidden SVG fallback alone.
  // Observe the actual displayed raster, not fallback serialization.
  const image=()=>canvas.evaluate(c=>c.toDataURL());
  const start=await image();
  await expect.poll(image).not.toBe(start);
  await detail.locator(':scope > summary').click();await page.waitForTimeout(160);
  const closed=await image();await page.waitForTimeout(160);expect(await image()).toBe(closed);
  await detail.locator(':scope > summary').click();await detail.scrollIntoViewIfNeeded();
  await expect.poll(image).not.toBe(closed);
  await detail.locator('[data-motion-toggle]').click();await expect(detail.locator('[data-motion-toggle]')).toHaveText('Play');
  const paused=await image();await page.waitForTimeout(160);expect(await image()).toBe(paused);
  await detail.locator('[data-motion-mode]').selectOption('jump');await expect(svg).toHaveAttribute('data-mode','jump');
  await expect(detail.locator('[data-motion-caption]')).toContainText('Controlled jump');
  await expect(detail.locator('[data-motion-status]')).toContainText('Controlled jump');
  await expect(svg.locator(':scope > text').first()).toHaveText('24″');
  const capacity=await page.evaluate(async person=>{
    const {playerMovementProfile,solvePlayerMotion}=await import('/lib/playerMotion.js');
    const profile=playerMovementProfile(person),ground=solvePlayerMotion(person,{mode:'jump',phase:.25}),apex=solvePlayerMotion(person,{mode:'jump',phase:.5});
    return{jumpInches:profile.jumpInches,riseInches:(ground.legs[0].end.y-apex.legs[0].end.y)/6,
      finite:[ground,apex].every(p=>[p.floor,...p.legs.flatMap(l=>[l.root.x,l.root.y,l.joint.x,l.joint.y,l.end.x,l.end.y])].every(Number.isFinite))};
  },original);
  expect(capacity.finite).toBe(true);expect(capacity.jumpInches).toBeGreaterThanOrEqual(5);expect(capacity.jumpInches).toBeLessThanOrEqual(18);
  expect(capacity.riseInches).toBeCloseTo(capacity.jumpInches,6);
  const jumpStart=await image();await detail.locator('[data-motion-toggle]').click();
  await expect(detail.locator('[data-motion-toggle]')).toHaveText('Pause');await expect.poll(image).not.toBe(jumpStart);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(detail.locator('[data-motion-toggle]')).toBeDisabled();
  await expect(detail.locator('[data-motion-toggle]')).toHaveText('Motion reduced');
  const reduced=await image();await page.waitForTimeout(160);expect(await image()).toBe(reduced);
  expect(await canvas.evaluate(c=>c.__athleticMotionContinuity)).toBe('same-canvas');
  const after=(await(await page.request.get(`/api/player?playerId=${playerId}`)).json()).profile.player;
  for(const key of ['appearance','visualFrame','heightInches','weightLbs','measurements','ratings'])expect(after[key]).toEqual(original[key]);
 }
 await fs.mkdir('output/playwright',{recursive:true});await page.emulateMedia({reducedMotion:'reduce'});
 for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
   await (phase==='after'?page.locator('.player-movement'):physique).scrollIntoViewIfNeeded();
   await page.screenshot({path:`output/playwright/s117-athlete-motion-${phase}-${viewport}-${theme}-dossier.png`});
  }
 }
 // This separate controlled gallery deliberately exercises the SVG fallback:
 // its incomplete legacy fixtures have no modern fine-face recipe or mount.
 const base={id:'athletic-motion-fixture',name:'Athletic motion comparison',heightInches:74,weightLbs:220,age:24,ratings:{speed:40,acceleration:40,jumping:40,strength:70}};
 const fixtures=[['Same frame · slower run',{...base},'run',.18],['Same frame · faster run',{...base,ratings:{...base.ratings,speed:99,acceleration:99}},'run',.18],['Heavy-fast · controlled jump',{...base,heightInches:78,weightLbs:340,ratings:{...base.ratings,speed:99,jumping:99}},'jump',.5],['Tall-light · controlled jump',{...base,heightInches:83,weightLbs:190,ratings:{...base.ratings,jumping:40}},'jump',.5]].map(([label,p,mode,phase])=>({label,p:{...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)},mode,phase}));
 await page.evaluate(async({fixtures,phase})=>{
  const {buildPlayerMotionSvg,buildPlayerPhysiqueSvg}=await import('/lib/playerPortrait.js');
  const gallery=document.createElement('section');gallery.id='athleticGallery';gallery.style.cssText='display:grid;gap:12px;padding:12px;max-width:960px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  for(const fixture of fixtures){const card=document.createElement('article');const label=document.createElement('p');label.textContent=fixture.label;label.style.minHeight='2.8em';card.append(label);card.insertAdjacentHTML('beforeend',phase==='before'?buildPlayerPhysiqueSvg(fixture.p,{view:'side'}):buildPlayerMotionSvg(fixture.p,{mode:fixture.mode,phase:fixture.phase}));card.querySelector('svg').style.cssText='display:block;width:100%;max-width:220px;height:auto;margin:auto';gallery.append(card);}document.body.replaceChildren(gallery);
 },{fixtures,phase});
 for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#athleticGallery').evaluate(g=>g.style.gridTemplateColumns='repeat(2,minmax(0,1fr))');
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await page.screenshot({path:`output/playwright/s117-athlete-motion-${phase}-${viewport}-${theme}-gallery.png`,fullPage:true});
  }
 }
});
