import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance} from '../src/domain/playerIdentity.js';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('real generated long, afro and parted dossiers retain identity across coherent views',async({page})=>{
 test.setTimeout(240000);
 const phase=process.env.WHOLE_HEAD_PHASE||process.env.CURVED_KIT_PHASE||process.env.BODY_LIGHT_PHASE||process.env.TORSO_MATTE_PHASE||process.env.FACE_RELIEF_PHASE||process.env.HAIR_DOSSIER_PHASE||'after';
 const prefix=process.env.WHOLE_HEAD_PHASE?'whole-head-dossier':process.env.CURVED_KIT_PHASE?'curved-kit-dossier':process.env.BODY_LIGHT_PHASE?'body-light-dossier':process.env.TORSO_MATTE_PHASE?'torso-matte-dossier':process.env.FACE_RELIEF_PHASE?'face-relief-dossier':process.env.HAIR_MATERIAL_PHASE?'hair-material-dossier':'hair-coherence-dossier';
 const baseline=process.env.WHOLE_HEAD_PHASE?'.cache/whole-head-before':process.env.CURVED_KIT_PHASE?'.cache/curved-kit-before':process.env.BODY_LIGHT_PHASE?'.cache/body-light-before':process.env.TORSO_MATTE_PHASE?'.cache/torso-matte-before':process.env.FACE_RELIEF_PHASE?'.cache/face-relief-before':process.env.HAIR_MATERIAL_PHASE?'.cache/hair-material-before':'.cache/hair-coherence-before';
 const baselineModules=process.env.WHOLE_HEAD_PHASE?['playerPortraitFace','playerSideAppearance','fineFaceGeometry','portraitSurfaceLighting','longHairFlow']:process.env.CURVED_KIT_PHASE?['playerPortrait','playerMotion','torsoSurface']:process.env.BODY_LIGHT_PHASE?['playerPortrait','playerMotion','appearancePalette']:process.env.TORSO_MATTE_PHASE?['torsoSurface']:process.env.FACE_RELIEF_PHASE?['playerPortraitFace','playerSideAppearance','fineFaceGeometry','portraitSurfaceLighting']:['playerPortraitFace','playerSideAppearance','longHairFlow','partedHairFlow'];
 if(phase==='before')for(const name of baselineModules)
  await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`${baseline}/${name}.js`,'utf8')}));
 await createPlayScenario(page);
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 const {snapshot}=await(await page.request.get('/api/snapshot/export')).json();
 const cases=(process.env.FACE_RELIEF_PHASE?['shaved','afro','side-part']:['long','afro','side-part']).map(style=>{
  const p=snapshot.league.players.find(p=>p.teamId==='BUF'&&playerAppearance(p).hairstyle===style)
   ||snapshot.league.players.find(p=>playerAppearance(p).hairstyle===style);
  expect(p,`real generated ${style} player`).toBeTruthy();return {style,id:p.id};
 });
 await fs.mkdir('output/playwright',{recursive:true});
 await page.emulateMedia({reducedMotion:'reduce'});
 const report={scope:'Real generated player dossiers and renderer change; no grooming commands or empirical population approval',phase,cases,captures:[]};
 for(const {style,id}of cases){
  const before=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
  await page.evaluate(async id=>(await import('/lib/appCore.js')).loadPlayerModal(id),id);
  await expect(page.locator('.player-portrait-svg')).toHaveAttribute('data-hairstyle',style);
  for(const [size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});
   // The production resize listener applies its gate after a 150ms debounce.
   // Once Full View is selected the preference persists across later players.
   await page.waitForTimeout(200);
   if(size==='mobile'&&await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    for(const state of ['portrait','body']){
     await page.locator('.player-physique').evaluate((el,open)=>el.open=open,state==='body');
     if(state==='body'){
      await page.locator('.player-physique-side').evaluate(el=>el.open=true);
      await page.locator('.player-movement').evaluate(el=>el.open=true);
      await page.locator('[data-motion-mode]').selectOption('run');
     }
     await page.locator(state==='portrait'?'.player-portrait-card':'.player-physique-svg').scrollIntoViewIfNeeded();
     await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
     await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
     await expect(page.locator('#playerModal')).toBeVisible();
     // Presence in the DOM does not prove the player is visible above an
     // asynchronously opened mobile dashboard. Check the rendered surface.
     const target=page.locator(state==='portrait'?'.player-portrait-card':'.player-physique-svg');
     await expect.poll(()=>target.evaluate(el=>{
      const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=Math.max(120,r.top+Math.min(r.height/2,200));
      return Boolean(document.elementFromPoint(x,y)?.closest('#playerModal'));
     })).toBe(true);
     expect(await page.locator('.player-portrait-svg').getAttribute('data-hairstyle')).toBe(style);
     const file=`output/playwright/${prefix}-${phase}-${style}-${size}-${theme}-${state}.png`;
     await page.screenshot({path:file});report.captures.push({file,style,id,size,width,height,theme,state});
    }
   }
  }
  const after=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
  expect(after.appearance).toEqual(before.appearance);expect(after.visualFrame).toEqual(before.visualFrame);
  await page.evaluate(async()=>(await import('/lib/appCore.js')).closePlayerModal());
 }
 await fs.writeFile(`output/playwright/${prefix}-${phase}.json`,JSON.stringify(report,null,2)+'\n');
});
