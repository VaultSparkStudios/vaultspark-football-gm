import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('actual dossier shares one saved head across portrait, measured body and all movement modes',async({page})=>{
 test.setTimeout(180000);page.setDefaultTimeout(20000);const id='P2026-BUF-LB-33468504',captures=[];
 await page.route('**/lib/playerHeadImage.js',r=>r.fulfill({contentType:'text/javascript',body:'export function tryPlayerHeadImage(){return null;}'}));
 await createPlayScenario(page);await page.emulateMedia({reducedMotion:'reduce'});
 const before=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
 for(const stage of['before','after']){
  await page.setViewportSize({width:1440,height:1000});
  if(stage==='after'){await page.unroute('**/lib/playerHeadImage.js');await page.goto('/game.html');await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});}
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
    if(stage==='after')await expect(page.locator('.player-portrait-card [data-head-renderer]')).toHaveCount(1);else await expect(page.locator('.player-shared-head-image')).toHaveCount(0);
    await page.locator(selector).scrollIntoViewIfNeeded();
    const file=`output/playwright/shared-head-production-${stage}-${size}-${theme}-${state}.png`;await page.screenshot({path:file,animations:'disabled'});
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
 await fs.writeFile('output/playwright/shared-head-production.json',JSON.stringify({scope:'Actual dossier before/after production head projection; no career or demographic calibration claim',playerId:id,captures,agreement,diagnostics,cacheProof,playerUnchanged:true},null,2));
});

test('unavailable WebGL preserves the existing complete portrait fallback',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl'?null:original.call(this,kind,...args);};});
 await createPlayScenario(page);
 const player=(await(await page.request.get('/api/player?playerId=P2026-BUF-LB-33468504')).json()).profile.player;
 const fallback=await page.evaluate(async player=>{
  const face=await import('/lib/playerPortraitFace.js'),images=await import('/lib/playerHeadImage.js');
  const rendered=face.buildPlayerPortraitSvg(player);return{exact:rendered===face.buildLegacyPlayerPortraitSvg(player),hasSvg:rendered.startsWith('<svg '),diagnostics:images.playerHeadImageDiagnostics()};
 },player);
 expect(fallback.exact).toBe(true);expect(fallback.hasSvg).toBe(true);expect(fallback.diagnostics.unavailable).toBe(true);expect(fallback.diagnostics.contexts).toBe(0);
});
