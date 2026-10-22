import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('legacy SVG fine-face components retain sculpted form across pigment and grooming',async({page})=>{
  const phase=process.env.FACE_LIGHTING_CAPTURE_PHASE||'after';
  if(phase==='before')for(const file of ['playerPortraitFace','playerSideAppearance','fineFaceGeometry'])await page.route(`**/lib/${file}.js`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/face-lighting-before/${file}.js.txt`,'utf8')}));
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');await page.emulateMedia({reducedMotion:'reduce'});
  const base=ensurePlayerVisualIdentity({id:'fine-control',age:24,heightInches:74,weightLbs:225,profile:{},ratings:{strength:70}},{newPlayer:true});
  const a={...playerAppearance(base),hairstyle:'shaved',facialHair:'clean',nasalRootWidth:1,nasalWingWidth:1,upperLipScale:1,lowerLipScale:1,chinProjection:0,foreheadSlope:0,browRidge:.5};
  const cases=[['Close crop','fade','black','clean',.08],['Curls','short-curls','brown','short-beard',.35],['Coils','afro','black','clean',.90],['Swept','swept','red','full-beard',.45],['Shaved','shaved','black','stubble',.80],['Long','long','blond','clean',.10],['Locs','locs','black','full-beard',.70],['Waves','waves','brown','short-beard',.55]];
  const colors={black:'#19191b',brown:'#38251c',red:'#80402d',blond:'#a58a55'};
  const players=cases.map(([name,hairstyle,color,facialHair,complexion],i)=>{
    const p=ensurePlayerVisualIdentity({...base,id:'light-control-'+i,profile:{faceSeed:'light-control-'+i}},{newPlayer:true});
    // A v2 projection with the optional fine recipe exercises the retained
    // SVG component; current generated dossier coverage follows separately.
    return {...p,name,appearance:{...playerAppearance(p),version:'portrait-identity-v2',hairstyle,hairTexture:hairstyle==='afro'?'coily':hairstyle==='short-curls'?'curly':'wavy',naturalHairColor:colors[color],hairColor:colors[color],dyedHairColor:null,facialHair,complexion},visualFrame:playerFrame(p)};
  });
  await page.evaluate(async players=>{
    const portrait=await import('/lib/playerPortraitFace.js'),buildPlayerPortraitSvg=portrait.buildLegacyPlayerPortraitSvg||portrait.buildPlayerPortraitSvg;const {buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
    const gallery=document.createElement('section');gallery.id='fineFaceGallery';gallery.style.cssText='display:grid;gap:12px;padding:16px;max-width:1200px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    for(const [i,p]of players.entries()){
      const card=document.createElement('article');card.innerHTML=`<h3>${p.name}</h3><div style="display:flex">${buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:`-fine-${i}`})}<svg viewBox="-70 -30 130 170">${buildPlayerSideHead(p,{idSuffix:`-fine-${i}`})}</svg></div>`;
      card.querySelectorAll('svg').forEach(svg=>svg.style.cssText='width:50%;height:auto;display:block');gallery.append(card);
    }document.body.replaceChildren(gallery);
  },players);
  if(phase==='after')await expect(page.locator('.portrait-fine-nose')).toHaveCount(8);
  await expect(page.locator('#fineFaceGallery .player-shared-head-image')).toHaveCount(0);
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.locator('#fineFaceGallery').evaluate((g,cols)=>g.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`,viewport==='desktop'?4:2);
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      await page.locator('#fineFaceGallery').screenshot({path:`output/playwright/s117-face-lighting-${phase}-${viewport}-${theme}-gallery.png`});
    }
  }
});

test('real generated fine face remains on dossier and movement after restoration',async({page})=>{
  const phase=process.env.FACE_LIGHTING_CAPTURE_PHASE||'after';
  if(phase==='before')for(const file of ['playerPortraitFace','playerSideAppearance','fineFaceGeometry'])await page.route(`**/lib/${file}.js`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/face-lighting-before/${file}.js.txt`,'utf8')}));
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
      for(const [view,selector]of [['portrait','.player-portrait-card'],['movement','.player-motion-svg']]){
        await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-face-lighting-${phase}-${viewport}-${theme}-${view}.png`});
      }
    }
  }
  await page.reload();await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  const restored=await page.request.get(`/api/player?playerId=${id}`);expect((await restored.json()).profile.player.appearance).toEqual(profile.player.appearance);
});
