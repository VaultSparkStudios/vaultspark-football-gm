import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

const phase=process.env.PLAYER_CRAFT_CAPTURE_PHASE||'after';
async function preservedBefore(page) {
  if(phase==='hand-form-before'){for(const file of ['playerHand','playerPortrait','playerMotion'])await page.route(`**/lib/${file}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/hand-form-before/${file}.js`,'utf8')}));return;}
  if(phase==='torso-form-before'){await page.route('**/lib/torsoSurface.js*',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile('.cache/torso-form-before/torsoSurface.js','utf8')}));return;}
  if(phase!=='before')return;
  for(const file of ['playerPortraitFace','portraitSurfaceLighting','fineFaceGeometry','playerPortrait','playerMotion'])await page.route(`**/lib/${file}.js`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/whole-player-craft-before/${file}.js.txt`,'utf8')}));
}
test('whole player craft comparisons preserve saved people and measured size',async({page})=>{
  await preservedBefore(page);
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
  const cases=[['Long blond',74,225,'long','straight','#a58a55','clean',.12,'#66804b'],['Long red',74,225,'long','wavy','#80402d','clean',.12,'#68889c'],['Full beard',74,225,'swept','wavy','#38251c','full-beard',.45,'#81663f'],['Coils',74,225,'coils','coily','#19191b','short-beard',.88,'#624329'],['Hazel eyes',74,225,'shaved','straight','#38251c','clean',.28,'#96764a'],['Gray-green eyes',74,225,'shaved','straight','#38251c','clean',.28,'#718176'],['Tall heavy fast',77,244,'fade','coily','#19191b','stubble',.75,'#624329'],['Compact heavy',68,300,'crew','straight','#38251c','clean',.25,'#68889c']];
  const players=cases.map(([name,heightInches,weightLbs,hairstyle,hairTexture,hairColor,facialHair,complexion,eyeColor],i)=>{
    // The iris pair shares every saved identity/frame channel; only its eye
    // pigment changes. Other cards exercise deliberately different people.
    const p=ensurePlayerVisualIdentity({id:'craft-'+(i===5?4:i),name,age:26,heightInches,weightLbs,profile:{},ratings:{strength:80,speed:90,acceleration:85,jumping:80,agility:85}},{newPlayer:true});
    return {...p,appearance:{...playerAppearance(p),hairstyle,hairTexture,hairColor,naturalHairColor:hairColor,dyedHairColor:null,facialHair,complexion,eyeColor},visualFrame:playerFrame(p)};
  });
  const original=structuredClone(players);
  await page.evaluate(async players=>{
    const {buildPlayerPortraitSvg,buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
    const g=document.createElement('main');g.id='craftGallery';g.style.cssText='display:grid;gap:16px;padding:16px;max-width:1240px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    for(const [i,p]of players.entries()){
      const card=document.createElement('article');card.innerHTML=`<h3>${p.name}</h3><div class="craft-head">${buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:'-craft-'+i})}</div><div class="craft-body" style="display:flex;align-items:start">${buildPlayerPhysiqueSvg(p,{idSuffix:'-craft-'+i})}${buildPlayerMotionSvg(p,{mode:i%2?'cut':'run',phase:.37,idSuffix:'-craft-'+i})}</div>`;
      card.querySelector('.craft-head svg').style.cssText='width:220px;max-width:100%;display:block;margin:auto';
      card.querySelectorAll('.craft-body svg').forEach(s=>s.style.cssText='width:50%;height:auto;display:block');g.append(card);
    }document.body.replaceChildren(g);window.craftPlayers=players;
  },players);
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.locator('#craftGallery').evaluate((g,cols)=>g.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`,size==='desktop'?4:1);
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      await page.locator('#craftGallery').screenshot({path:`output/playwright/s117-whole-craft-${phase}-${size}-${theme}-gallery.png`});
    }
  }
  expect(await page.evaluate(()=>window.craftPlayers)).toEqual(original);
});

test('actual dossier craft remains readable and survives restoration',async({page})=>{
  await preservedBefore(page);
  await createPlayScenario(page);for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
  const id='P2026-BUF-LB-33468504';const {profile}=await (await page.request.get(`/api/player?playerId=${id}`)).json();
  await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
  for(const selector of ['.player-physique','.player-physique-side','.player-movement'])await page.locator(`${selector} > summary`).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const [size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});if(size==='mobile')await page.locator('#mlFullViewBtn').click();
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
      for(const [view,selector]of[['head','.player-portrait-card'],['body','.player-physique-svg'],['motion','.player-motion-svg']]){
        await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-whole-craft-${phase}-${size}-${theme}-${view}.png`});
      }
    }
  }
  await page.reload();await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  const restored=(await (await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
  expect(restored.appearance).toEqual(profile.player.appearance);expect(restored.visualFrame).toEqual(profile.player.visualFrame);
});
