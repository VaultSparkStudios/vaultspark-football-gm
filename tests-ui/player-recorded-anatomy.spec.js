import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {resolvePlayerMeasurements} from '../src/domain/playerMeasurements.js';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

const phase=process.env.RECORDED_ANATOMY_CAPTURE_PHASE||'after';
const base={id:'recorded-dimensions',name:'Measured comparison',age:24,heightInches:74,weightLbs:225,ratings:{strength:70,speed:80,agility:75}};
const make=extra=>{
  const p={...base,...extra};
  return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(phase==='before'?base:p)};
};

test('recorded dimensions change controlled common-scale front, side and cut surfaces',async({page})=>{
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
  const players=[make({name:'Narrow spacing · shorter feet',hipJointSpanInches:6,footLengthInches:9,footWidthInches:3}),
    make({name:'Broad spacing · longer feet',hipJointSpanInches:11,footLengthInches:14,footWidthInches:5})];
  await page.evaluate(async players=>{
    const {buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
    const gallery=document.createElement('section');gallery.id='recordedGallery';gallery.style.cssText='display:grid;gap:16px;padding:16px;max-width:1200px;margin:auto;color:var(--ink-strong);background:var(--surface)';
    for(const [i,p]of players.entries()){
      const card=document.createElement('article');card.dataset.case=i;
      card.innerHTML=`<h3>${p.name}</h3><p>74 inches · 225 lb · same identity and athleticism</p><div style="display:flex">${buildPlayerPhysiqueSvg(p,{view:'front',idSuffix:`-r${i}`})}${buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:`-r${i}`})}${buildPlayerMotionSvg(p,{mode:'cut',phase:.37,idSuffix:`-r${i}`})}</div>`;
      card.querySelectorAll('svg').forEach(svg=>svg.style.cssText='width:33.33%;height:auto;display:block;align-self:start');gallery.append(card);
    }document.body.replaceChildren(gallery);
  },players);
  if(phase==='after'){
    await expect(page.locator('[data-case="0"] [data-foot-length="9"]')).toHaveCount(5);
    await expect(page.locator('[data-case="1"] [data-foot-width="5"]')).toHaveCount(5);
  }
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.locator('#recordedGallery').evaluate((g,columns)=>g.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`,viewport==='desktop'?2:1);
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      await page.locator('#recordedGallery').screenshot({path:`output/playwright/s117-recorded-anatomy-${phase}-${viewport}-${theme}-gallery.png`});
    }
  }
});

test('dossier exposes recorded inputs and explains incompatible measurement fallback',async({page})=>{
  if(phase==='before')await page.route('**/lib/appCore.js',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile('.cache/recorded-anatomy-before/appCore.js','utf8')}));
  await createPlayScenario(page);
  for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
  const id='P2026-BUF-LB-33468504';
  let injected=false;
  await page.route(`**/api/player?playerId=${id}*`,async route=>{
    const response=await route.fetch(),body=await response.json(),p=body.profile.player;
    // The profile DTO exposes canonical dimensions as bodyMeasurements rather
    // than the internal stored record. Retain those existing source fields.
    p.measurements={...p.bodyMeasurements.values,provenance:p.bodyMeasurements.provenance};
    Object.assign(p,{hipJointSpanInches:9,footLengthInches:12.125,footWidthInches:4.125,
      measurementProvenance:{hipJointSpanInches:{kind:'measured',endpoint:'biiliocristal-breadth'},footLengthInches:{kind:'measured',endpoint:'heel-to-longest-toe'}}});
    p.bodyMeasurements=resolvePlayerMeasurements(p);p.visualFrame=playerFrame(p);
    injected=true;
    await route.fulfill({response,json:body});
  });
  await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
  await page.locator('.player-physique > summary').click();await page.emulateMedia({reducedMotion:'reduce'});
  expect(injected,'controlled source dimensions must reach the real dossier response').toBe(true);
  if(phase==='after'){
    await expect(page.locator('.player-physique')).toContainText('Hip joint spacing');
    await expect(page.locator('.player-physique')).toContainText('different measurement method; visual estimate used');
    await expect(page.locator('.player-physique')).toContainText('12.125');
  }
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});if(viewport==='mobile'){await expect(page.locator('#mlFullViewBtn')).toBeVisible();await page.locator('#mlFullViewBtn').click();}
    for(const theme of ['dark','light']){
      await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
      await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
      await page.locator('.player-physique dl').scrollIntoViewIfNeeded();
      await page.screenshot({path:`output/playwright/s117-recorded-anatomy-${phase}-${viewport}-${theme}-dossier.png`});
    }
  }
});
