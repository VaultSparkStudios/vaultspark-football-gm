import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('dossier keeps portrait, body comparisons and movement readable across sizes/themes',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.DOSSIER_LAYOUT_PHASE||'after';
 await createPlayScenario(page);
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 const id='P2026-BUF-LB-33468504';
 const before=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');
 await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await fs.mkdir('output/playwright',{recursive:true});
 const captures=[];
 for(const [size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  if(size==='mobile'){await expect(page.locator('#mlFullViewBtn')).toBeVisible();await page.locator('#mlFullViewBtn').click();}
  await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
  for(const theme of ['dark','light']){
   await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
   for(const [state,selector]of[['portrait','.player-portrait-card'],['body','.player-physique'],['motion','.player-movement']]){
    if(state==='portrait')await page.locator('.player-physique').evaluate(el=>el.open=false);
    else {
     await page.locator('.player-physique').evaluate(el=>el.open=true);
     await page.locator('.player-physique-side').evaluate(el=>el.open=true);
     await page.locator('.player-movement').evaluate(el=>el.open=true);
     await page.locator('[data-motion-mode]').selectOption(state==='motion'?'strength':'run');
    }
    await page.locator(selector).scrollIntoViewIfNeeded();
    if(state==='body')await page.locator('.player-physique-svg').scrollIntoViewIfNeeded();
    if(phase==='after'&&size==='desktop'&&state!=='portrait')await page.locator('.player-modal-card').evaluate(card=>{
     const top=document.querySelector('.player-body-comparisons').getBoundingClientRect().top;
     const header=document.querySelector('.player-modal-header').getBoundingClientRect().bottom;
     card.scrollTop+=top-header-12;
    });
    await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
    const box=await page.locator(selector).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    if(phase==='after'&&state==='body'&&size==='desktop')expect(box.width).toBeGreaterThan(900);
    if(phase==='after'&&state!=='portrait')for(const svg of ['.player-physique-svg','.player-physique-side-svg','.player-motion-svg']){
     const bounds=await page.locator(svg).boundingBox();expect(bounds.height).toBeLessThanOrEqual(height*.56+1);
    }
    if(phase==='after'&&state==='body'&&size==='desktop'){
     const front=await page.locator('.player-physique-svg').boundingBox(),side=await page.locator('.player-physique-side-svg').boundingBox();
     expect(Math.abs(front.y-side.y)).toBeLessThan(1);expect(Math.abs(front.height-side.height)).toBeLessThan(1);
    }
    const file=`output/playwright/dossier-layout-${phase}-${size}-${theme}-${state}.png`;
    await page.screenshot({path:file});captures.push({file,size,theme,state,width,height});
   }
  }
 }
 const after=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
 expect(after.appearance).toEqual(before.appearance);expect(after.visualFrame).toEqual(before.visualFrame);
 await fs.writeFile(`output/playwright/dossier-layout-${phase}.json`,JSON.stringify({captures,playerId:id},null,2));
});
