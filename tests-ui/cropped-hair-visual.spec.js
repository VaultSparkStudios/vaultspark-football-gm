import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';

test('legacy SVG cropped silhouettes and continuous curl controls remain legible at portrait size',async({page})=>{
 test.setTimeout(120000);
 if(process.env.CROPPED_HAIR_BASELINE==='1') {
  // Optional historical renderer comparison; the saved controlled players and
  // live theme assets are identical. Ordinary tests always use current source.
  const source=await fs.readFile('.cache/cropped-hair-before/playerPortrait.js','utf8');
  await page.route('**/lib/playerPortraitFace.js',route=>route.fulfill({contentType:'text/javascript',body:source}));
 }
 await page.goto('/');
 await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const p=ensurePlayerVisualIdentity({id:'cropped-hair-fixture',name:'Hair fixture',age:26,heightInches:75,weightLbs:235,ratings:{strength:80}},{newPlayer:true});
 const base={...playerAppearance(p),facialHair:'clean',complexion:.5,hairline:.3,hairDensity:1,hairLength:1};
 const cases=[
  ['Crew / straight', 'crew','straight','#29201b',1],
  ['Crew / wavy blond', 'crew','wavy','#d2b984',1],
  ['Short / curls', 'short-curls','curly','#473126',1],
  ['Short / coils', 'short-curls','coily','#151210',1],
  ['Coils / curvature .65', 'coils','coily','#29201b',.65],
  ['Coils / curvature 1.45', 'coils','coily','#29201b',1.45],
  ['Afro / curly', 'afro','curly','#713629',1],
  ['Afro / coily', 'afro','coily','#151210',1]
 ].map(([name,hairstyle,hairTexture,hairColor,hairCurvature])=>({...p,name,appearance:{...base,hairstyle,hairTexture,hairColor,naturalHairColor:hairColor,dyedHairColor:null,hairCurvature},visualFrame:playerFrame(p)}));
 await fs.mkdir('output/playwright',{recursive:true});
 const phase=process.env.CROPPED_HAIR_PHASE||'after';
 for(let offset=0;offset<cases.length;offset+=4) {
  await page.evaluate(async players=>{
   // Exercise the retained SVG component explicitly, independently of modern PNG heads.
   const portraitModule=await import('/lib/playerPortraitFace.js');
   const buildPlayerPortraitSvg=portraitModule.buildLegacyPlayerPortraitSvg||portraitModule.buildPlayerPortraitSvg;
   const gallery=document.createElement('section');gallery.id='croppedHairGallery';
   gallery.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px;max-width:580px;margin:auto;background:var(--surface);color:var(--ink-strong)';
   for(const [i,player] of players.entries()) {
    const card=document.createElement('article');card.innerHTML=buildPlayerPortraitSvg(player,{headOnly:true,idSuffix:`-cropped-${i}`});
    card.querySelector('svg').style.cssText='display:block;width:100%;max-height:270px;height:auto';
    const label=document.createElement('p');label.textContent=player.name;label.style.cssText='font:12px/1.3 sans-serif;margin:4px 0';
    card.append(label);gallery.append(card);
   }
   document.body.replaceChildren(gallery);
  },cases.slice(offset,offset+4));
  for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
   await page.setViewportSize({width,height});
   for(const theme of ['dark','light']) {
    await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
    const gallery=page.locator('#croppedHairGallery');
    const bounds=await gallery.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(height);
    const markup=await gallery.innerHTML();expect(markup).not.toMatch(/NaN|Infinity|undefined/);
    expect(await gallery.locator('.portrait-eye').count()).toBe(8);
    await page.screenshot({path:`output/playwright/s117-cropped-hair-${phase}-${offset}-${viewport}-${theme}.png`});
   }
  }
 }
});
