import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
test('legacy and modern measurement tails at common scale, both themes and viewport sizes',async({page})=>{
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const rows=[];
 for(const [heightInches,weightLbs]of [[77,308],[74,410],[87,225],[74,130],[96,650]]){
  const players=['regional-body-shape-v2','regional-body-shape-v3'].map(version=>{
   const p=ensurePlayerVisualIdentity({id:'body-tail-ui',name:'Measurement control',age:24,heightInches,weightLbs,ratings:{speed:80,acceleration:75,agility:70,jumping:70,strength:70,stamina:70},profile:{regionalBodyShapeRecipe:{version,seed:'tail-ui'}}},{newPlayer:true});
   return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
  });rows.push({heightInches,weightLbs,players});
 }
 const before=JSON.stringify(rows);
 const checks=await page.evaluate(async rows=>{
  const {buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
  const {solvePlayerMotion}=await import('/lib/playerMotion.js');
  const gallery=document.createElement('main');gallery.id='bodyTailGallery';gallery.style.cssText='padding:12px;background:var(--surface);color:var(--ink-strong);display:grid;gap:18px';
  gallery.innerHTML='<h1>Measured-body comparison</h1><p>Controlled fictional examples. All drawings use 2.1 CSS pixels per anatomical inch; hair is excluded from stature.</p>';
  const checks=[];
  for(const [i,row]of rows.entries()){
   const card=document.createElement('article');card.dataset.case=i;card.innerHTML=`<h2>${row.heightInches} inches · ${row.weightLbs} pounds</h2>`;card.style.cssText='min-width:0;border:1px solid var(--line);padding:8px';
   for(const [j,p]of row.players.entries()){
    const section=document.createElement('section');section.dataset.decoder=j;section.innerHTML=`<h3>${j?'Modern':'Retained legacy'} frame: ${p.visualFrame.heightInches}″ / ${p.visualFrame.weightLbs} lb</h3><div style="display:flex;flex-wrap:wrap;align-items:end;gap:8px">${buildPlayerPhysiqueSvg(p,{idSuffix:`${i}-${j}-f`})}${buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:`${i}-${j}-s`})}${buildPlayerMotionSvg(p,{mode:'run',phase:.37,idSuffix:`${i}-${j}-m`})}</div>`;
    section.querySelectorAll(':scope > div > svg').forEach(svg=>{const b=svg.viewBox.baseVal;svg.style.cssText=`width:${b.width*.35}px;height:${b.height*.35}px;flex:none;display:block`;});card.append(section);
    const pose=solvePlayerMotion(p,{mode:'run',phase:.37});checks.push({i,j,height:p.visualFrame.heightInches,mass:p.visualFrame.weightLbs,skull:pose.skull,svgCount:section.querySelectorAll(':scope > div > svg').length});
   }gallery.append(card);
  }document.body.replaceChildren(gallery);return checks;
 },rows);
 expect(JSON.stringify(rows)).toBe(before);
 for(const row of checks){expect(row.svgCount).toBe(3);if(row.j){expect(row.height).toBe(rows[row.i].heightInches);expect(row.mass).toBe(rows[row.i].weightLbs);expect(row.skull).toBe((9.4+(row.height-74)*.035)*6);}}
 await fs.mkdir('output/playwright',{recursive:true});
 for(const [viewport,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.locator('#bodyTailGallery').screenshot({path:`output/playwright/body-tail-${viewport}-${theme}-gallery.png`});
   for(const i of [1,4])await page.locator(`[data-case="${i}"]`).screenshot({path:`output/playwright/body-tail-${viewport}-${theme}-case-${i}.png`});
  }
 }
 await fs.writeFile('output/playwright/body-tail-browser-checks.json',JSON.stringify({controlledExamples:true,scaleCssPixelsPerInch:2.1,checks},null,2));
});
