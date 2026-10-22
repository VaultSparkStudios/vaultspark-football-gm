import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';

test('measured stature, mass, estimated proportions and capacities remain distinct at common scale',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.BODY_COMPARISON_CAPTURE_PHASE||'baseline';
 if(phase==='curved-kit-before')for(const name of ['playerPortrait','playerMotion','torsoSurface'])await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/curved-kit-before/${name}.js`,'utf8')}));
 if(phase==='body-light-before')for(const name of ['playerPortrait','playerMotion','appearancePalette'])await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/body-light-before/${name}.js`,'utf8')}));
 if(phase==='torso-matte-before')await page.route('**/lib/torsoSurface.js*',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile('.cache/torso-matte-before/torsoSurface.js','utf8')}));
 if(phase==='torso-form-before')await page.route('**/lib/torsoSurface.js*',async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile('.cache/torso-form-before/torsoSurface.js','utf8')}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const base=ensurePlayerVisualIdentity({id:'body-comparison',name:'Body comparison',age:25,heightInches:74,weightLbs:225,ratings:{speed:70,acceleration:70,agility:70,jumping:70,strength:70,stamina:70},profile:{}},{newPlayer:true});
 const appearance=playerAppearance(base);
 expect(appearance.fineFaceVersion).toBe('fine-face-v1');
 const make=(name,changes={})=>{const p={...base,...changes,profile:{...base.profile,...changes.profile}};return {...p,name,appearance,visualFrame:playerFrame(p)};};
 const pairs=[
  ['mass',[make('74 in / 180 lb',{weightLbs:180}),make('74 in / 330 lb',{weightLbs:330})]],
  ['stature',[make('64 in / 225 lb',{heightInches:64}),make('84 in / 225 lb',{heightInches:84})]],
  ['proportions',[make('74 in / 225 lb / proportions A',{profile:{skeletonRecipe:{...base.profile.skeletonRecipe,seed:'measured-proportions-a'},individualAnatomyRecipe:{version:'individual-anatomy-v1',seed:'measured-proportions-a'}}}),make('74 in / 225 lb / proportions B',{profile:{skeletonRecipe:{...base.profile.skeletonRecipe,seed:'measured-proportions-b'},individualAnatomyRecipe:{version:'individual-anatomy-v1',seed:'measured-proportions-b'}}})]],
  ['capacities',[make('225 lb / low capacities',{ratings:{...base.ratings,speed:45,acceleration:45,agility:45,jumping:45,strength:45,stamina:45}}),make('225 lb / high capacities',{ratings:{...base.ratings,speed:95,acceleration:95,agility:95,jumping:95,strength:95,stamina:95}})]],
  ['heavy-fast-light-slow',[make('311 lb / fast',{weightLbs:311,ratings:{...base.ratings,speed:90,acceleration:85}}),make('180 lb / slow',{weightLbs:180,ratings:{...base.ratings,speed:45,acceleration:45}})]],
  ['recorded-reach',[make('74 in / 225 lb / shorter recorded reach',{armLengthInches:30,wingspanInches:76}),make('74 in / 225 lb / longer recorded reach',{armLengthInches:35,wingspanInches:86})]]
 ];
 const before=structuredClone(pairs);
 expect(pairs[0][1][1].visualFrame.chestWidthInches).toBeGreaterThan(pairs[0][1][0].visualFrame.chestWidthInches);
 expect(pairs[2][1][0].visualFrame.torsoShare).not.toBe(pairs[2][1][1].visualFrame.torsoShare);
 expect(pairs[3][1][0].visualFrame).toEqual(pairs[3][1][1].visualFrame);
 const report={scope:'Controlled common-scale body comparisons; visual density/proportions remain artistic estimates',pairs:pairs.map(([name,players])=>({name,players:players.map(p=>({name:p.name,frame:p.visualFrame,ratings:p.ratings}))})),captures:[]};
 await fs.mkdir('output/playwright',{recursive:true});
 for(const [pair,players]of pairs){
  await page.evaluate(async players=>{
   const {buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
   const gallery=document.createElement('section');gallery.id='measuredBodyGallery';gallery.style.cssText='display:grid;gap:12px;padding:12px;max-width:960px;margin:auto;color:var(--ink-strong);background:var(--surface)';
   for(const [i,p]of players.entries()){
    const modes=p.name.includes('capacities')?['run','acceleration','cut','jump','strength','endurance']:['run'];
    const card=document.createElement('article');card.innerHTML=`<h3>${p.name}</h3><div class="body-views">${buildPlayerPhysiqueSvg(p,{idSuffix:`-measured-${i}`})}${buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:`-measured-${i}`})}${modes.map(mode=>`<figure style="margin:0;width:304px;max-width:100%"><figcaption>${mode} · posed sample</figcaption>${buildPlayerMotionSvg(p,{mode,phase:.37,idSuffix:`-measured-${i}-${mode}`})}</figure>`).join('')}</div>`;
    card.querySelector('.body-views').style.cssText='display:flex;align-items:start;flex-wrap:wrap';
    card.querySelectorAll('svg').forEach(svg=>svg.style.cssText='display:block;width:100%;max-width:304px;height:auto');gallery.append(card);
   }document.body.replaceChildren(gallery);
  },players);
  expect(await page.locator('#measuredBodyGallery svg').count()).toBeGreaterThanOrEqual(6);
  expect(await page.locator('#measuredBodyGallery .motion-articulated-light').count()).toBeGreaterThan(0);
  if(phase.startsWith('torso-form-'))expect(await page.locator('#measuredBodyGallery .player-torso-form').count()).toBe(phase==='torso-form-before'?0:6);
  const finiteMarkup=await page.locator('#measuredBodyGallery').evaluate(root=>{
   const geometry=root.cloneNode(true);
   // PNG bytes are opaque binary data: legal base64 can contain "NaN".
   // Preserve every geometric/numeric attribute, including the image camera.
   for(const image of geometry.querySelectorAll('image'))for(const attribute of ['href','xlink:href']){
    const value=image.getAttribute(attribute);
    if(value?.startsWith('data:image/png;base64,'))image.setAttribute(attribute,'opaque-png');
   }
   const markup=geometry.innerHTML;
   const path=geometry.querySelector('path');if(!path)throw Error('No geometry validated');
   path.setAttribute('d','MNaN 0 LInfinity undefined');
   return{markup,invalidNumericControl:geometry.innerHTML};
  });
  expect(finiteMarkup.markup).not.toMatch(/NaN|Infinity|undefined/);
  expect(finiteMarkup.invalidNumericControl).toMatch(/NaN|Infinity|undefined/);
  if(pair==='capacities')for(const mode of ['run','acceleration','cut','jump','strength','endurance'])await expect(page.locator(`#measuredBodyGallery svg[data-mode="${mode}"]`)).toHaveCount(2);
  for(const [viewport,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    const file=`output/playwright/s117-measured-body-${phase}-${pair}-${viewport}-${theme}.png`;
    await page.locator('#measuredBodyGallery').screenshot({path:file});
    report.captures.push({file,pair,viewport,width,height,theme,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
   }
  }
 }
 expect(pairs).toEqual(before);
 await fs.writeFile(`output/playwright/s117-measured-body-${phase}.json`,JSON.stringify(report,null,2));
});
