import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';

test('continuous fallback shows the same saved coordinate across front and profile without WebGL',async({page})=>{
 test.setTimeout(180000);
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl'?null:original.call(this,kind,...args);};});
 const beforeFiles={playerPortraitFace:'continuous-hair-source-playerPortraitFace.js-2026-10-08',playerSideAppearance:'continuous-hair-source-playerSideAppearance.js-2026-10-08',partedHairFlow:'whole-head-regression-partedHairFlow.js-2026-10-08',longHairFlow:'whole-head-regression-longHairFlow.js-2026-10-08',croppedHairVolume:'whole-head-regression-croppedHairVolume.js-2026-10-08'};
 await page.route('**/lib/fallback-before/*.js',async route=>{const name=path.basename(new URL(route.request().url()).pathname,'.js');await route.fulfill({contentType:'text/javascript',path:beforeFiles[name]?'docs/visual-qa/references/'+beforeFiles[name]:'public/lib/'+name+'.js'});});
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const person=ensurePlayerVisualIdentity({id:'fallback-fixed-person',age:27,heightInches:74,weightLbs:225,profile:{}},{newPlayer:true}),natural=playerAppearance(person);
 const players=['buzz','crew','afro','side-part','long'].flatMap(hairstyle=>[.5,1.5,2.5].map(position=>({...person,appearance:{...natural,hairstyle,hairTexture:'wavy',hairTexturePosition:position},visualFrame:playerFrame(person)})));
 const report=await page.evaluate(async players=>{
  const modules=[await import('/lib/fallback-before/playerPortraitFace.js'),await import('/lib/playerPortraitFace.js')],sides=[await import('/lib/fallback-before/playerSideAppearance.js'),await import('/lib/playerSideAppearance.js')];
  const main=document.createElement('main');main.style.cssText='padding:12px;max-width:1200px;margin:auto;color:var(--ink-strong);background:var(--panel)';
  const observations=[];
  for(const[i,p]of players.entries()){
   const before=JSON.stringify(p),card=document.createElement('section');card.id='fallback-row-'+i;card.innerHTML='<h2>'+p.appearance.hairstyle+' · '+p.appearance.hairTexturePosition+'</h2>';
   const outputs=[];
   for(let j=0;j<2;j++){
    const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;align-items:center';const label=document.createElement('span');label.textContent=j?'After':'Before';row.append(label);
    const holder=document.createElement('div');holder.style.cssText='width:144px;flex-shrink:0';holder.innerHTML=modules[j].buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:'-fallback-'+i+'-'+j});holder.firstElementChild.style.width='144px';
    const side=document.createElement('div');side.innerHTML='<svg width="105" height="150" viewBox="-15 -20 115 155">'+sides[j].buildPlayerSideHead(p,{x:40,y:15,height:100,idSuffix:'-fallback-side-'+i+'-'+j})+'</svg>';
    row.append(holder,side);card.append(row);outputs.push(holder.innerHTML+side.innerHTML);
   }
   if(JSON.stringify(p)!==before)throw Error('Identity changed');if(outputs.some(s=>/NaN|Infinity|undefined/.test(s)))throw Error('Invalid fallback');
   observations.push({id:p.id,hairstyle:p.appearance.hairstyle,position:p.appearance.hairTexturePosition,unchanged:true});main.append(card);
  }
  document.body.replaceChildren(main);const diagnostics=(await import('/lib/playerHeadImage.js')).playerHeadImageDiagnostics();return{observations,diagnostics};
 },players);
 expect(report.diagnostics.unavailable).toBe(true);expect(report.diagnostics.contexts).toBe(0);
 await fs.mkdir('output/playwright',{recursive:true});report.captures=[];
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<players.length;i++){const file=`output/playwright/continuous-fallback-${i}-${size}-${theme}.png`;await page.locator('#fallback-row-'+i).screenshot({path:file});report.captures.push({file,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),page:'controlled-continuous-fallback-gallery',state:players[i].appearance.hairstyle+' / '+players[i].appearance.hairTexturePosition,theme,viewport:{width,height}});}
 }
 await fs.writeFile('output/playwright/continuous-fallback.json',JSON.stringify(report,null,2));
});
