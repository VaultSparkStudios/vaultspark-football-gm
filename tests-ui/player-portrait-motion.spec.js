import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
test('actual portrait blinks, honors reduced motion, cleans up and recovers its graphics context',async({page})=>{
 test.setTimeout(120000);page.setDefaultTimeout(20000);const id='P2026-BUF-LB-33468504';
 // Target the shared offscreen portrait cache. The dossier also creates body
 // contexts; losing whichever context happened to be created last tests those.
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const result=original.call(this,kind,...args);if(kind==='webgl'&&result&&this.width===440&&this.height===880){window.portraitTestGL=result;window.portraitTestCanvas=this;}return result;};});
 await page.emulateMedia({reducedMotion:'reduce'});await createPlayScenario(page);
 for(const close of['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(close).isVisible())await page.locator(close).click();
 const before=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
 const image=page.locator('.player-portrait-card .player-shared-head-image');await expect(image).toHaveAttribute('data-blink-pose','0');
 const open=await image.getAttribute('href');
 expect(await page.evaluate(()=>!!window.portraitTestGL&&window.portraitTestGL.canvas===window.portraitTestCanvas&&!window.portraitTestCanvas.isConnected)).toBe(true);
 await page.evaluate(()=>{
  window.portraitTestExtension=window.portraitTestGL.getExtension('WEBGL_lose_context');
  const image=document.querySelector('.player-portrait-card .player-shared-head-image');
  const observer=new MutationObserver(()=>{if(image.dataset.blinkPose==='1'){window.observedClosedSource=image.getAttribute('href');window.lossDuringClosedPose=true;observer.disconnect();window.portraitTestExtension.loseContext();}});
  observer.observe(image,{attributes:true,attributeFilter:['data-blink-pose']});
 });
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect.poll(()=>page.evaluate(()=>window.lossDuringClosedPose),{timeout:10000,intervals:[16]}).toBe(true);
 expect(await page.evaluate(src=>window.observedClosedSource!==src,open)).toBe(true);
 await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerHeadImage.js')).playerHeadImageDiagnostics().unavailable)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(image).toHaveAttribute('data-blink-pose','0');expect((await image.getAttribute('href'))===open).toBe(true);
 await page.evaluate(()=>window.portraitTestExtension.restoreContext());
 await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerHeadImage.js')).playerHeadImageDiagnostics().unavailable)).toBe(false);
 expect(await page.evaluate(async({player,src})=>(await import('/lib/playerHeadImage.js')).tryPlayerHeadImage(player).src===src,{player:before,src:open})).toBe(true);
 const geometryReuse=await page.evaluate(async()=>(await import('/lib/playerHeadImage.js')).playerHeadImageDiagnostics());expect(geometryReuse.meshBuilds).toBe(1);
 // Freeze explicit renderer poses for pixel inspection after the real cycle.
 // Replacing the image exercises disconnect cleanup, without changing a player.
 await image.evaluate(el=>el.replaceWith(el.cloneNode(true)));
 await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerPortraitMotion.js')).portraitMotionDiagnostics().mounted)).toBe(0);
 const captures=[];
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});const mobile=await page.evaluate(async()=>(await import('/lib/mobileLoop.js')).isMobileModeEnabled());
  if(mobile){await expect(page.locator('body')).toHaveClass(/mobile-loop-active/);await page.locator('#mlFullViewBtn').click();}
  else await expect(page.locator('body')).not.toHaveClass(/mobile-loop-active/);
  for(const theme of['dark','light'])for(const pose of[0,1]){
   await page.evaluate(async({theme,pose,player})=>{(await import('/lib/themeCustomizer.js')).applyTheme(theme);const projected=(await import('/lib/playerHeadImage.js')).tryPlayerHeadImage(player,{blink:pose});document.querySelector('.player-portrait-card .player-shared-head-image').setAttribute('href',projected.src);},{theme,pose,player:before});
   await page.locator('.player-portrait-card').scrollIntoViewIfNeeded();const file=`output/playwright/portrait-motion-${size}-${theme}-${pose?'closed':'open'}.png`;
   await page.screenshot({path:file,animations:'disabled'});captures.push({file,theme,pose,controlledPose:true,viewport:{width,height},sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
  }
 }
 const extension=await page.evaluate(()=>{window.portraitTestExtension=window.portraitTestGL.getExtension('WEBGL_lose_context');return!!window.portraitTestExtension;});expect(extension).toBe(true);
 await page.evaluate(()=>window.portraitTestExtension.loseContext());
 await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerHeadImage.js')).playerHeadImageDiagnostics().unavailable)).toBe(true);
 const fallback=await page.evaluate(async player=>{const face=await import('/lib/playerPortraitFace.js');return face.buildPlayerPortraitSvg(player)===face.buildLegacyPlayerPortraitSvg(player);},before);expect(fallback).toBe(true);
 await page.evaluate(()=>window.portraitTestExtension.restoreContext());
 await expect.poll(()=>page.evaluate(async()=>(await import('/lib/playerHeadImage.js')).playerHeadImageDiagnostics().unavailable)).toBe(false);
 const recovery=await page.evaluate(async player=>{const mod=await import('/lib/playerHeadImage.js');return{src:mod.tryPlayerHeadImage(player).src,diagnostics:mod.playerHeadImageDiagnostics()};},before);
 expect(recovery.src===open).toBe(true);expect(recovery.diagnostics.contexts).toBe(1);
 const after=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;expect(after).toEqual(before);
 await fs.writeFile('output/playwright/portrait-motion.json',JSON.stringify({scope:'Actual blink cycle and reduced-motion reopening; controlled pose screenshots; explicit browser context loss/restoration',captures,geometryReuse,actualCyclePassed:true,reducedMotionExactOpen:true,disconnectCleanupPassed:true,contextRecoveryExactOpen:true,playerUnchanged:true},null,2));
});
