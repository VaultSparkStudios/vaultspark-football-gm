import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';

test('legacy SVG face surfaces preserve individual features across pigmentation at dossier scale',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.IDENTITY_CAPTURE_PHASE||'surface-current';
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const p=ensurePlayerVisualIdentity({id:'face-surface',name:'Face surface',age:26,heightInches:74,weightLbs:220,ratings:{strength:80},profile:{faceSeed:'face-surface'}},{newPlayer:true});
 const a={...playerAppearance(p),hairstyle:'shaved',facialHair:'clean',freckles:false,mole:null,eyeColor:'#587496',skinUndertone:0};
 const pairs=[.05,.5,.98].map(complexion=>[
  {...p,name:`Angular · skin ${complexion}`,appearance:{...a,complexion,faceWidth:.9,jawWidth:.85,cheekFullness:.85,cheekbone:1.2,noseWidth:.9,lipFullness:.8,browWeight:.8},visualFrame:playerFrame(p)},
  {...p,name:`Fuller · skin ${complexion}`,appearance:{...a,complexion,faceWidth:1.1,jawWidth:1.15,cheekFullness:1.15,cheekbone:.9,noseWidth:1.15,lipFullness:1.2,browWeight:1.2},visualFrame:playerFrame(p)}
 ]);
 const captures=[];await fs.mkdir('output/playwright',{recursive:true});
 for(const [group,players] of pairs.entries()){
  await page.evaluate(async players=>{
   // Exercise the retained SVG component explicitly, independently of modern PNG heads.
   const {buildLegacyPlayerPortraitSvg:buildPlayerPortraitSvg}=await import('/lib/playerPortraitFace.js');
   let g=document.getElementById('surfaceReview');if(!g){g=document.createElement('section');g.id='surfaceReview';document.body.replaceChildren(g);}
   g.style.cssText='display:grid;gap:12px;padding:12px;margin:auto;width:max-content;background:var(--surface);color:var(--ink-strong)';g.replaceChildren();
   for(const [i,p] of players.entries()){
    const card=document.createElement('article');card.style.width='280px';
    card.innerHTML=buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:`-surface-${i}`});card.querySelector('svg').style.cssText='display:block;width:280px;height:auto';
    const label=document.createElement('p');label.textContent=p.name;label.style.cssText='font:12px/1.3 sans-serif;margin:4px 0';card.append(label);g.append(card);
   }
  },players);
  await expect(page.locator('.portrait-eye')).toHaveCount(4);
  expect(await page.locator('#surfaceReview').innerHTML()).not.toMatch(/NaN|Infinity|undefined/);
  for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});await page.locator('#surfaceReview').evaluate((g,cols)=>g.style.gridTemplateColumns=`repeat(${cols},280px)`,viewport==='desktop'?2:1);
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    const box=await page.locator('#surfaceReview').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.height).toBeLessThanOrEqual(height);
    const file=`output/playwright/s117-${phase}-${group}-${viewport}-${theme}.png`;
    await page.locator('#surfaceReview').screenshot({path:file});captures.push({file,group,viewport,width,height,theme,players:players.map(p=>p.name),portraitWidth:280});
   }
  }
 }
 await fs.writeFile(`output/playwright/s117-${phase}-surfaces.json`,JSON.stringify({phase,captures,limits:'Controlled head surfaces at 280px; no empirical phenotype prevalence or overall appearance certification.'},null,2));
});
