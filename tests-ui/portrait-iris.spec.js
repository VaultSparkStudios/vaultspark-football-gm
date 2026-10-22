import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {EYE_COLORS,playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';

test('legacy SVG iris colors remain visible inside unchanged lids at dossier size',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.IDENTITY_CAPTURE_PHASE||'iris-after';
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const p=ensurePlayerVisualIdentity({id:'iris-review',name:'Iris review',age:24,heightInches:74,weightLbs:220,ratings:{strength:80},profile:{faceSeed:'iris-review'}},{newPlayer:true});
 const base={...playerAppearance(p),hairstyle:'short-curls',hairTexture:'curly',facialHair:'clean',irisShade:0,irisInnerMix:.2,irisPattern:.5};
 const make=(eyeColor,complexion)=>({...p,name:`${eyeColor} · skin ${complexion}`,appearance:{...base,eyeColor,complexion},visualFrame:playerFrame(p)});
 const render=players=>page.evaluate(async players=>{
  // Exercise the retained SVG component explicitly, independently of modern PNG heads.
   const {buildLegacyPlayerPortraitSvg:buildPlayerPortraitSvg}=await import('/lib/playerPortraitFace.js');
  let g=document.getElementById('irisReview');
  if(!g){g=document.createElement('section');g.id='irisReview';document.body.replaceChildren(g);}
  g.style.cssText='display:grid;gap:12px;padding:12px;margin:auto;background:var(--surface);color:var(--ink-strong);width:max-content;max-width:100%';g.replaceChildren();
  for(const [i,p] of players.entries()){
   const card=document.createElement('article');card.style.width='280px';
   card.innerHTML=buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:`-iris-review-${i}`});card.querySelector('svg').style.cssText='display:block;width:280px;height:auto';
   const label=document.createElement('p');label.textContent=p.name;label.style.cssText='font:12px/1.3 sans-serif;margin:4px 0';card.append(label);g.append(card);
  }
 },players);
 await fs.mkdir('output/playwright',{recursive:true});
 const palette=[];const outlines=[];
 await page.setViewportSize({width:1440,height:1000});
 for(const color of EYE_COLORS){
  await render([make(color,.4)]);
  const eye=page.locator('.portrait-eye').first();
  const png=await eye.screenshot();palette.push({color,sha256:crypto.createHash('sha256').update(png).digest('hex')});
  outlines.push(await eye.locator('clipPath path').getAttribute('d'));
 }
 expect(new Set(palette.map(p=>p.sha256)).size).toBe(EYE_COLORS.length);
 expect(new Set(outlines).size).toBe(1);
 const captures=[];
 for(const color of ['#57412c','#746047','#587496']){
  await render([make(color,.05),make(color,.98)]);
  for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});await page.locator('#irisReview').evaluate((g,cols)=>g.style.gridTemplateColumns=`repeat(${cols},280px)`,viewport==='desktop'?2:1);
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    const box=await page.locator('#irisReview').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.height).toBeLessThanOrEqual(height);
    const file=`output/playwright/s117-${phase}-${color.slice(1)}-${viewport}-${theme}.png`;
    await page.screenshot({path:file});captures.push({file,color,viewport,width,height,theme});
   }
  }
 }
 await fs.writeFile(`output/playwright/s117-${phase}-palette.json`,JSON.stringify({phase,palette,outlines,captures,limits:'Controlled 280px portraits; gallery evidence does not certify the complete appearance or lifetime requirement.'},null,2));
});
