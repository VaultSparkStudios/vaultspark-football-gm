import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
test('actual dossier exposes strength/endurance movement with stable identity and accessible motion controls',async({page})=>{
 const phase=process.env.CAPACITY_MOVEMENT_PHASE||'after';
 if(phase==='before')for(const name of ['appCore','playerMotion','playerPortrait'])await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/capacity-motion-before/${name}.js`,'utf8')}));
 if(phase==='before')await page.route('**/styles.css*',async route=>route.fulfill({contentType:'text/css',body:await fs.readFile('.cache/capacity-motion-before/styles.css','utf8')}));
 await createPlayScenario(page);
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 const id='P2026-BUF-LB-33468504';
 const profile=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');
 await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
 await page.locator('.player-physique > summary').click();
 const detail=page.locator('.player-movement');await detail.locator(':scope > summary').click();
 await detail.scrollIntoViewIfNeeded();
 const select=detail.locator('[data-motion-mode]');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect(select.locator('option')).toHaveCount(phase==='before'?4:6);
 if(phase==='after'){
  await select.selectOption('strength');await expect(detail.locator('svg')).toHaveAttribute('data-mode','strength');
  const canvas=detail.locator('[data-player-character3d]');await expect(canvas).toBeVisible();
  await expect(detail.locator('.player-motion-svg')).toHaveAttribute('data-character-renderer','shared-3d');
  const image=()=>canvas.evaluate(c=>c.toDataURL());
  const initial=await image();await expect.poll(image).not.toBe(initial);
  await detail.locator('[data-motion-toggle]').click();
  await expect(detail.locator('[data-motion-toggle]')).toHaveText('Play');
  const paused=await image();await page.waitForTimeout(150);expect(await image()).toBe(paused);
  await select.selectOption('endurance');await expect(detail.locator('svg')).toHaveAttribute('data-mode','endurance');
  await detail.locator('[data-motion-toggle]').click();
  const enduranceInitial=await image();await expect.poll(image).not.toBe(enduranceInitial);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(detail.locator('[data-motion-toggle]')).toBeDisabled();
 if(phase==='after'){
  const canvas=detail.locator('[data-player-character3d]'),reduced=await canvas.evaluate(c=>c.toDataURL());
  await page.waitForTimeout(150);expect(await canvas.evaluate(c=>c.toDataURL())).toBe(reduced);
 }
 await fs.mkdir('output/playwright',{recursive:true});
 const captures=[];
 for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  if(viewport==='mobile'){
   // The responsive decision deck opens on its debounced resize callback.
   await expect(page.locator('#mlFullViewBtn')).toBeVisible();
   await page.locator('#mlFullViewBtn').click();
  }
  await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   for(const mode of ['strength','endurance']){
    await select.selectOption(phase==='before'?'run':mode);
    if(phase==='after')await page.evaluate(async({player,mode})=>{
     // Controlled elapsed pose in the actual dossier; no player field or career clock changes.
     const {buildPlayerMotionSvg,solvePlayerMotion}=await import('/lib/playerMotion.js');
     const {createPlayerCharacterModel,createPlayerCharacterView}=await import('/lib/playerCharacter3d.js');
     const svg=document.querySelector('.player-motion-svg');
     const rendered=document.createElement('div');
     rendered.innerHTML=buildPlayerMotionSvg(player,{mode,phase:mode==='strength'?.55:.5,idSuffix:svg.dataset.motionInstance});
     svg.querySelector('[data-motion-content]').innerHTML=rendered.querySelector('[data-motion-content]').innerHTML;
     svg.querySelector('[data-motion-caption]').textContent=rendered.querySelector('[data-motion-caption]').textContent;
     document.querySelector('[data-motion-status]').textContent=rendered.querySelector('[data-motion-caption]').textContent;
     // The paused production dossier displays a GPU view. Render the chosen
     // inspection phase into that actual canvas using the same saved-person
     // pipeline; updating the hidden fallback alone would mislabel the image.
     const productionCanvas=svg.querySelector('[data-player-character3d]');if(!productionCanvas)throw Error('Missing current capacity canvas');
     // Keep the mounted renderer's context/attribute bindings untouched. The
     // controlled inspection uses its own current-renderer canvas in the
     // same dossier viewport, then restores the live view after capture.
     const canvas=document.createElement('canvas');canvas.width=productionCanvas.width;canvas.height=productionCanvas.height;canvas.style.cssText=productionCanvas.style.cssText;canvas.dataset.capacityInspection='';
     productionCanvas.after(canvas);productionCanvas.style.display='none';
     const model=createPlayerCharacterModel(player),view=createPlayerCharacterView(canvas,model),pose=solvePlayerMotion(player,{mode,phase:mode==='strength'?.55:.5});
     view.draw({mode,phase:mode==='strength'?.55:.5,angle:Math.PI/2,viewBox:svg.getAttribute('viewBox').trim().split(/\s+/).map(Number),floor:pose.floor});
     window.cleanupCapacityInspection=()=>{view.dispose();model.dispose();canvas.remove();productionCanvas.style.display='block';delete window.cleanupCapacityInspection;};
    },{player:profile,mode});
    await detail.scrollIntoViewIfNeeded();
    await detail.locator('svg').scrollIntoViewIfNeeded();
    await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
    expect(await detail.locator('svg').evaluate(svg=>{
     const r=svg.getBoundingClientRect(),top=Math.max(r.top,0),bottom=Math.min(r.bottom,innerHeight);
     return document.elementFromPoint(r.left+r.width/2,(top+bottom)/2)?.closest('svg')===svg;
    })).toBe(true);
    await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
    const file=`output/playwright/capacity-dossier-${phase}-${viewport}-${theme}-${mode}.png`;
    await page.screenshot({path:file});captures.push({viewport,theme,mode,file});
    const elementFile=`output/playwright/capacity-dossier-${phase}-${viewport}-${theme}-${mode}-element.png`;
    await detail.locator('svg').screenshot({path:elementFile});captures.push({viewport,theme,mode,file:elementFile});
    if(phase==='after')await page.evaluate(()=>window.cleanupCapacityInspection?.());
   }
  }
 }
 await page.reload();await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 const restored=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
 expect(restored.appearance).toEqual(profile.appearance);expect(restored.visualFrame).toEqual(profile.visualFrame);
 await fs.writeFile(`output/playwright/capacity-dossier-${phase}.json`,JSON.stringify({phase,captures,restorationPassed:true},null,2));
});
