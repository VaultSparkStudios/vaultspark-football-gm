import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {resolveBodyVolume} from '../src/domain/playerMeasurements.js';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('individual limb, pelvic and foot proportions change shared static and moving bodies',async({page})=>{
  const phase=process.env.INDIVIDUAL_ANATOMY_CAPTURE_PHASE||'after';
  if(phase==='before')for(const file of ['playerPortrait.js','playerMotion.js','physiqueGeometryContract.js','profiledLimbSurface.js'])await page.route(`**/lib/${file}`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/individual-anatomy-before/${file}.txt`,'utf8')}));
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
  const base=ensurePlayerVisualIdentity({id:'proportion-control',name:'Control',age:24,heightInches:74,weightLbs:225,armLengthInches:33,handLengthInches:8,jerseyNumber:17,ratings:{strength:70,speed:80},profile:{}},{newPlayer:true});
  const appearance=playerAppearance(base),f=playerFrame(base);
  const cases=[['Longer forearm/shin',{upperArmShare:.49,upperLegShare:.47}],['Longer upper limbs',{upperArmShare:.56,upperLegShare:.55}],['Narrow pelvis',{pelvicBreadthInches:8.5}],['Broad pelvis',{pelvicBreadthInches:11.5}],['Short narrow feet',{footLengthInches:10,footWidthInches:3.2}],['Long broad feet',{footLengthInches:12.5,footWidthInches:5}]];
  const players=cases.map(([name,change])=>{
    const anatomy={...f,...change},volume=resolveBodyVolume({height:f.heightInches,weight:f.weightLbs,shoulderSpan:f.shoulderSpanInches,torsoShare:f.torsoShare,armLength:f.armLengthInches,handLength:8,individuality:f.limbShapeVariation,anatomy});
    return {...base,name,appearance,visualFrame:{...anatomy,...volume}};
  });
  await page.evaluate(async players=>{
    const {buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
    const gallery=document.createElement('section');gallery.id='proportionGallery';gallery.style.cssText='display:grid;gap:16px;padding:16px;max-width:1200px;margin:auto;color:var(--ink-strong);background:var(--surface)';
    for(const [i,p]of players.entries()){
      const card=document.createElement('article');card.dataset.case=i;card.innerHTML=`<h3>${p.name}</h3><div style="display:flex">${buildPlayerPhysiqueSvg(p,{view:'front',idSuffix:`-${i}`})}${buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:`-${i}`})}${buildPlayerMotionSvg(p,{mode:'cut',phase:.37,idSuffix:`-${i}`})}</div>`;
      card.querySelectorAll('svg').forEach(svg=>svg.style.cssText='width:33.33%;height:auto;display:block;align-self:start');gallery.append(card);
    }document.body.replaceChildren(gallery);
  },players);
  if(phase==='after')await expect(page.locator('[data-case="5"] .individual-footwear')).toHaveCount(5);
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.locator('#proportionGallery').evaluate((g,cols)=>g.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`,viewport==='desktop'?2:1);
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      await page.locator('#proportionGallery').screenshot({path:`output/playwright/s117-individual-anatomy-${phase}-${viewport}-${theme}-gallery.png`});
    }
  }
});

test('new anatomy is visible on actual generated dossier and survives restoration',async({page})=>{
  await createPlayScenario(page);for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
  const id='P2026-BUF-LB-33468504',response=await page.request.get(`/api/player?playerId=${id}`),{profile}=await response.json();
  expect(profile.player.profile.individualAnatomyRecipe.version).toBe('individual-anatomy-v1');
  expect(profile.player.visualFrame.upperLegShare).toBeGreaterThan(.47);
  await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
  await page.locator('.player-physique > summary').click();await page.locator('.player-physique-side > summary').click();await page.locator('.player-movement > summary').click();
  await expect(page.locator('#playerModal .individual-footwear')).toHaveCount(5);await page.emulateMedia({reducedMotion:'reduce'});
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});if(viewport==='mobile'){await expect(page.locator('#mlFullViewBtn')).toBeVisible();await page.locator('#mlFullViewBtn').click();}
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
      for(const [view,selector]of [['front','.player-physique-svg'],['side','.player-physique-side-svg'],['movement','.player-motion-svg']]){
        await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-individual-anatomy-after-${viewport}-${theme}-${view}.png`});
      }
    }
  }
  await page.reload();await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  const restored=await page.request.get(`/api/player?playerId=${id}`);expect((await restored.json()).profile.player.visualFrame).toEqual(profile.player.visualFrame);
});
