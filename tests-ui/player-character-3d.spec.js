import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
const capturePrefix=process.env.CHARACTER_CAPTURE_PREFIX||'character-final';
test.beforeEach(async({page})=>{
 if(process.env.CHARACTER_CAPTURE_BASELINE!=='s117')return;
 for(const [module,file]of [['playerBody3d','person-material-2026-10-08-public-lib-playerBody3d.js'],['playerBodyAnimation3d','extremities-2026-10-08-public-lib-playerBodyAnimation3d.js']]){
  await page.route(`**/lib/${module}.js`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`docs/visual-qa/references/${file}`,'utf8')}));
 }
});
test('actual dossier uses complete saved head and cached measured body in front, profile and six motion modes',async({page})=>{
 test.setTimeout(180000);await createPlayScenario(page);await page.emulateMedia({reducedMotion:'reduce'});
 const roster=(await(await page.request.get('/api/roster?team=BUF')).json()).roster;
 let id,original;for(const row of roster){const p=(await(await page.request.get('/api/player?playerId='+row.id)).json()).profile.player;if(p.position==='OL'){id=row.id;original=p;break;}}expect(original).toBeTruthy();
 for(const close of['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(close).isVisible())await page.locator(close).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
 await page.locator('.player-physique > summary').click();await page.locator('.player-physique-side > summary').click();await page.locator('.player-movement > summary').click();
 await expect(page.locator('.player-physique-svg')).toHaveAttribute('data-character-renderer','shared-3d');await expect(page.locator('.player-physique-side-svg')).toHaveAttribute('data-character-renderer','shared-3d');await expect(page.locator('.player-motion-svg')).toHaveAttribute('data-character-renderer','shared-3d');
 const modes=['run','acceleration','cut','jump','strength','endurance'],captures=[];
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});const mobile=await page.evaluate(async()=>(await import('/lib/mobileLoop.js')).isMobileModeEnabled());if(mobile){await expect(page.locator('#mlFullViewBtn')).toBeVisible();await page.locator('#mlFullViewBtn').click();}await expect(page.locator('body')).not.toHaveClass(/mobile-loop-active/);await expect(page.locator('#playerModal')).toBeVisible();await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  for(const mode of modes){await page.locator('[data-motion-mode]').selectOption(mode);await expect(page.locator('.player-motion-svg')).toHaveAttribute('data-character-renderer','shared-3d');const path=`output/playwright/${capturePrefix}-${size}-${theme}-${mode}.png`;if(size==='mobile'){await page.locator('.player-motion-svg').scrollIntoViewIfNeeded();await page.screenshot({path});}else await page.locator('.player-body-comparisons').screenshot({path});captures.push({path,sha256:crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex')});}
  if(size==='mobile')for(const[view,selector]of[['front','.player-physique-svg'],['side','.player-physique-side-svg']]){await page.locator(selector).scrollIntoViewIfNeeded();const path=`output/playwright/${capturePrefix}-${size}-${theme}-${view}.png`;await page.screenshot({path});captures.push({path,sha256:crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex')});}
 }
 const after=(await(await page.request.get('/api/player?playerId='+id)).json()).profile.player;expect(after.appearance).toEqual(original.appearance);expect(after.visualFrame).toEqual(original.visualFrame);
 const beforeClose=await page.evaluate(async()=>(await import('/lib/playerCharacter3d.js')).characterRendererDiagnostics());expect(beforeClose).toEqual({activeModels:1,activeViews:3});await page.locator('#closePlayerModalBtn').click();await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerCharacter3d.js')).characterRendererDiagnostics())).toEqual({activeModels:0,activeViews:0});
 await fs.writeFile(`output/playwright/${capturePrefix}-observations.json`,JSON.stringify({playerId:id,captures,inputIdentityAndFrameUnchanged:true,completeVisualAcceptance:false},null,2)+'\n');
});
test('dossier retains measured SVG views and motion when WebGL is unavailable',async({page})=>{
 await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'||type==='webgl2'?null:get.call(this,type,...args);};});
 await createPlayScenario(page);await page.emulateMedia({reducedMotion:'reduce'});for(const id of['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator('#rosterTable button[data-player-id]').first().click();await page.locator('.player-physique > summary').click();await page.locator('.player-movement > summary').click();
 await expect(page.locator('[data-character-renderer]')).toHaveCount(0);await expect(page.locator('.physique-athlete')).toBeVisible();await page.locator('[data-motion-mode]').selectOption('cut');await expect(page.locator('.player-motion-svg')).toHaveAttribute('data-mode','cut');await expect(page.locator('[data-motion-content]')).toBeVisible();
 await page.locator('#closePlayerModalBtn').click();await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerCharacter3d.js')).characterRendererDiagnostics())).toEqual({activeModels:0,activeViews:0});
});
test('actual character advances, pauses and follows reduced-motion preference without replacing its canvas',async({page})=>{
 await createPlayScenario(page);await page.emulateMedia({reducedMotion:'no-preference'});for(const id of['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator('#rosterTable button[data-player-id]').first().click();await page.locator('.player-physique > summary').click();await page.locator('.player-movement > summary').click();await page.locator('.player-motion-svg').scrollIntoViewIfNeeded();
 const canvas=page.locator('.player-motion-svg [data-player-character3d]'),image=()=>canvas.evaluate(c=>c.toDataURL());await expect(canvas).toBeVisible();await canvas.evaluate(c=>{c.__characterContinuity='same-canvas';});const first=await image();await expect.poll(image).not.toBe(first);
 await page.locator('[data-motion-toggle]').click();await expect(page.locator('[data-motion-toggle]')).toHaveText('Play');const paused=await image();await page.waitForTimeout(180);expect(await image()).toBe(paused);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('[data-motion-toggle]')).toBeDisabled();const reduced=await image();await page.waitForTimeout(180);expect(await image()).toBe(reduced);expect(await canvas.evaluate(c=>c.__characterContinuity)).toBe('same-canvas');
 await page.locator('#closePlayerModalBtn').click();await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerCharacter3d.js')).characterRendererDiagnostics())).toEqual({activeModels:0,activeViews:0});
});
