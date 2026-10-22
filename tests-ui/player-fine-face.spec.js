import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('legacy SVG fine facial landmarks retain independent front and side controls',async({page})=>{
  const phase=process.env.FINE_FACE_CAPTURE_PHASE||'after';
  if(phase==='before')for(const file of ['playerPortraitFace','playerSideAppearance'])await page.route(`**/lib/${file}.js`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/fine-face-before/${file}.js.txt`,'utf8')}));
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');await page.emulateMedia({reducedMotion:'reduce'});
  const base=ensurePlayerVisualIdentity({id:'fine-control',age:24,heightInches:74,weightLbs:225,profile:{},ratings:{strength:70}},{newPlayer:true});
  // The optional fine recipe on the retained v2 projection exercises SVG
  // component landmarks. Current generated dossier coverage is separate.
  const a={...playerAppearance(base),version:'portrait-identity-v2',hairstyle:'shaved',facialHair:'clean',nasalRootWidth:1,nasalWingWidth:1,upperLipScale:1,lowerLipScale:1,chinProjection:0,foreheadSlope:0,browRidge:.5};
  const cases=[['Nasal root','nasalRootWidth',.75,1.25],['Nasal wings','nasalWingWidth',.75,1.25],['Upper lip','upperLipScale',.65,1.4],['Lower lip','lowerLipScale',.65,1.4],['Chin projection','chinProjection',-.7,.7],['Forehead slope','foreheadSlope',-.7,.7],['Brow ridge','browRidge',0,1]];
  const players=cases.flatMap(([label,key,lo,hi])=>[lo,hi].map(value=>({...base,name:`${label}: ${value}`,appearance:{...a,[key]:value},visualFrame:playerFrame(base)})));
  await page.evaluate(async players=>{
    const portrait=await import('/lib/playerPortraitFace.js'),buildPlayerPortraitSvg=portrait.buildLegacyPlayerPortraitSvg||portrait.buildPlayerPortraitSvg;const {buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
    const gallery=document.createElement('section');gallery.id='fineFaceGallery';gallery.style.cssText='display:grid;gap:12px;padding:16px;max-width:1200px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    for(const [i,p]of players.entries()){
      const card=document.createElement('article');card.innerHTML=`<h3>${p.name}</h3><div style="display:flex">${buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:`-fine-${i}`})}<svg viewBox="-70 -30 130 170">${buildPlayerSideHead(p,{idSuffix:`-fine-${i}`})}</svg></div>`;
      card.querySelectorAll('svg').forEach(svg=>svg.style.cssText='width:50%;height:auto;display:block');gallery.append(card);
    }document.body.replaceChildren(gallery);
  },players);
  if(phase==='after')await expect(page.locator('.portrait-fine-nose')).toHaveCount(14);
  await expect(page.locator('#fineFaceGallery .player-shared-head-image')).toHaveCount(0);
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.locator('#fineFaceGallery').evaluate((g,cols)=>g.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`,viewport==='desktop'?4:2);
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      await page.locator('#fineFaceGallery').screenshot({path:`output/playwright/s117-fine-face-${phase}-${viewport}-${theme}-gallery.png`});
    }
  }
});

test('real generated fine face remains on dossier and movement after restoration',async({page})=>{
  await createPlayScenario(page);for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
  const id='P2026-BUF-LB-33468504',response=await page.request.get(`/api/player?playerId=${id}`),{profile}=await response.json();
  expect(profile.player.profile.fineFaceRecipe.version).toBe('fine-face-v1');
  await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
  await page.locator('.player-physique > summary').click();await page.locator('.player-physique-side > summary').click();await page.locator('.player-movement > summary').click();
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});if(viewport==='mobile'){await expect(page.locator('#mlFullViewBtn')).toBeVisible();await page.locator('#mlFullViewBtn').click();}
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
      for(const [view,selector]of [['portrait','.player-portrait-card'],['front','.player-physique-svg'],['side','.player-physique-side-svg'],['movement','.player-motion-svg']]){
        await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-fine-face-after-${viewport}-${theme}-${view}.png`});
      }
    }
  }
  await page.reload();await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  const restored=await page.request.get(`/api/player?playerId=${id}`);expect((await restored.json()).profile.player.appearance).toEqual(profile.player.appearance);
});
