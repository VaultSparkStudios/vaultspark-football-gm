import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('production hair volume before/after retains one saved head across actual dossier views',async({page})=>{
 test.setTimeout(180000);page.setDefaultTimeout(20000);let id;const captures=[];
 await page.route('**/lib/playerHead3d.js',r=>r.fulfill({contentType:'text/javascript',path:'docs/visual-qa/references/player-hair-volume-before-2026-10-08.js'}));
 await createPlayScenario(page);await page.emulateMedia({reducedMotion:'reduce'});
 const roster=(await(await page.request.get('/api/roster?team=BUF')).json()).roster;
 let before;
 for(const row of roster){const p=(await(await page.request.get(`/api/player?playerId=${row.id}`)).json()).profile.player;if(['crew','side-part','swept','long'].includes(p.appearance?.hairstyle)){id=row.id;before=p;break;}}
 expect(before,'The real generated roster must contain a touched hairstyle').toBeTruthy();
 expect(before.appearance.hairTextureVersion).toBe('continuous-hair-texture-v1');
 expect(Number.isFinite(before.appearance.hairTexturePosition)).toBe(true);
 for(const stage of['before','after']){
  await page.setViewportSize({width:1440,height:1000});
  if(stage==='after'){await page.unroute('**/lib/playerHead3d.js');await page.goto('/game.html');await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});}
  for(const close of['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(close).isVisible())await page.locator(close).click();
  await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
  for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});
   const mobile=await page.evaluate(async()=>(await import('/lib/mobileLoop.js')).isMobileModeEnabled());
   if(mobile){await expect(page.locator('body')).toHaveClass(/mobile-loop-active/);await page.locator('#mlFullViewBtn').click();}
   else await expect(page.locator('body')).not.toHaveClass(/mobile-loop-active/);
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
   for(const theme of['dark','light'])for(const[state,selector]of[['portrait','.player-portrait-card'],['body','.player-physique'],['motion','.player-movement']]){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    await page.locator('.player-physique').evaluate((el,open)=>el.open=open,state!=='portrait');
    if(state!=='portrait'){await page.locator('.player-physique-side').evaluate(el=>el.open=true);await page.locator('.player-movement').evaluate(el=>el.open=true);await page.locator('[data-motion-mode]').selectOption(state==='motion'?'strength':'run');}
    await expect(page.locator('.player-portrait-card [data-head-renderer]')).toHaveCount(1);
    await page.locator(selector).scrollIntoViewIfNeeded();
    const file=`output/playwright/production-hair-volume-${stage}-${size}-${theme}-${state}.png`;await page.screenshot({path:file,animations:'disabled'});
    captures.push({file,stage,state,theme,viewport:{width,height},sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
   }
  }
  if(stage==='before')await page.locator('#closePlayerModalBtn').click();
 }
 const agreement=[];
 for(const mode of['run','acceleration','cut','jump','strength','endurance']){
  await page.locator('[data-motion-mode]').selectOption(mode);
  const same=await page.evaluate(mode=>{const src=selector=>document.querySelector(selector)?.getAttribute('href');const front=src('.player-portrait-card image'),body=src('.player-physique-svg image'),side=src('.player-physique-side-svg image'),motion=src('.player-motion-svg image');return{mode,frontBody:front===body&&!!front,sideMotion:mode==='cut'?motion===front:motion===side};},mode);
  expect(same.frontBody).toBe(true);expect(same.sideMotion).toBe(true);agreement.push(same);
 }
 const diagnostics=await page.evaluate(async()=>{
  const mod=await import('/lib/playerHeadImage.js');return mod.playerHeadImageDiagnostics();
 });
 expect(diagnostics.contexts).toBe(1);expect(diagnostics.cacheEntries).toBeLessThanOrEqual(diagnostics.cacheLimit);
 const cacheProof=await page.evaluate(async player=>{
  const mod=await import('/lib/playerHeadImage.js'),first=mod.tryPlayerHeadImage(player).src;
  for(let i=0;i<35;i++)mod.tryPlayerHeadImage({...player,id:`resource-stress-${i}`});
  const bounded=mod.playerHeadImageDiagnostics(),restored=mod.tryPlayerHeadImage(player).src===first;
  const malformed=mod.tryPlayerHeadImage({...player,appearance:{...player.appearance,eyeColor:'invalid'}})===null;
  const malformedSkin=mod.tryPlayerHeadImage({...player,appearance:{...player.appearance,complexion:NaN}})===null;
  return{bounded,restored,malformed,malformedSkin,healthy:!mod.playerHeadImageDiagnostics().unavailable};
 },before);
 expect(cacheProof.bounded.cacheEntries).toBe(32);expect(cacheProof.bounded.contexts).toBe(1);expect(cacheProof.restored).toBe(true);expect(cacheProof.malformed).toBe(true);expect(cacheProof.malformedSkin).toBe(true);expect(cacheProof.healthy).toBe(true);
 const after=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;expect(after).toEqual(before);
 await fs.writeFile('output/playwright/production-hair-volume.json',JSON.stringify({scope:'Actual dossier before/after occupied curl and lock geometry; no complete craft or population acceptance',playerId:id,hairstyle:before.appearance.hairstyle,captures,agreement,diagnostics,cacheProof,playerUnchanged:true},null,2));
});
