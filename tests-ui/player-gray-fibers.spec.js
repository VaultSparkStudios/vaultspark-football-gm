import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';

test('salt-and-pepper strands retain saved hair in front and side views',async({page})=>{
  const phase=process.env.GRAY_CAPTURE_PHASE||'after';
  if(phase==='before')for(const file of ['playerPortraitFace.js','playerSideAppearance.js'])
    await page.route(`**/lib/${file}`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/gray-before/${file}.txt`,'utf8')}));
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
  await page.emulateMedia({reducedMotion:'reduce'});
  const base={id:'gray-gallery',age:24,heightInches:76,weightLbs:240,ratings:{strength:80},profile:{appearanceRecipe:{version:'portrait-identity-v3',seed:'gray-gallery',complexionBand:[0,1]},appearanceDetailRecipe:{version:'natural-appearance-detail-v1',seed:'gray-gallery'}}};
  const a={...playerAppearance(base),hairColor:'#29201b',naturalHairColor:'#29201b',dyedHairColor:null,grayOnsetAge:32,hairDensity:1,facialHair:'short-beard'};
  const cases=[['Young curls',24,'crew','curly',null],['Salt-and-pepper curls',44,'crew','curly',null],['Gray long hair',48,'long','wavy',null],['Dyed long hair',48,'long','wavy','#843877'],['Gray locs',48,'locs','coily',null],['Shaved scalp',48,'shaved','coily',null]];
  const fixtures=cases.map(([name,age,hairstyle,hairTexture,dyedHairColor])=>({...base,name,age,appearance:{...a,hairstyle,hairTexture,dyedHairColor},visualFrame:playerFrame(base)}));
  await page.evaluate(async fixtures=>{
    const {buildPlayerPortraitSvg}=await import('/lib/playerPortrait.js');
    const {buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
    const gallery=document.createElement('section');gallery.id='grayGallery';
    gallery.style.cssText='display:grid;gap:16px;padding:16px;max-width:1000px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    for(const [i,p]of fixtures.entries()){
      const card=document.createElement('article');card.dataset.case=String(i);
      card.innerHTML=`<h3>${p.name}</h3><div style="display:flex;align-items:center">${buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:`-gray-${i}`})}<svg class="gray-side" viewBox="-70 -30 130 170">${buildPlayerSideHead(p,{idSuffix:`-gray-${i}`})}</svg></div>`;
      card.querySelectorAll('svg').forEach(svg=>svg.style.cssText='display:block;width:50%;height:auto');gallery.append(card);
    }
    document.body.replaceChildren(gallery);
  },fixtures);
  if(phase==='after'){
    await expect(page.locator('[data-case="1"] [data-gray-fiber]').first()).toBeAttached();
    await expect(page.locator('[data-case="0"] [data-gray-fiber]')).toHaveCount(0);
    await expect(page.locator('[data-case="3"] [data-gray-fiber]')).toHaveCount(0);
    await expect(page.locator('[data-case="5"] [data-gray-fiber]')).toHaveCount(0);
  }
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    await page.locator('#grayGallery').evaluate((gallery,columns)=>gallery.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`,viewport==='desktop'?3:1);
    for(const theme of ['dark','light']){
      await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
      await page.locator('#grayGallery').screenshot({path:`output/playwright/s117-gray-${phase}-${viewport}-${theme}.png`});
    }
  }
});
