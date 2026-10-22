import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
test('regional breadth and depth share one person across static and moving views',async({page})=>{
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const rows=[];
 for(const [heightInches,weightLbs,seed]of [[74,225,'limb-0'],[74,225,'limb-1'],[77,308,'limb-2'],[62,650,'limb-3'],[96,650,'limb-4']]){
  const players=['regional-body-shape-v3','regional-body-shape-v4'].map(version=>{
   const p=ensurePlayerVisualIdentity({id:'regional-limb-gallery',name:'Regional build control',age:24,heightInches,weightLbs,
    ratings:{speed:80,acceleration:75,agility:70,jumping:70,strength:70,stamina:70},profile:{regionalBodyShapeRecipe:{version,seed}}},{newPlayer:true});
   return {...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};
  });expect(players[0].appearance).toEqual(players[1].appearance);rows.push({heightInches,weightLbs,players});
 }
 const snapshot=JSON.stringify(rows);
 const checks=await page.evaluate(async rows=>{
  const {buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
  const {projectedLimbSections}=await import('/lib/physiqueGeometryContract.js');
  const main=document.createElement('main');main.id='limbGallery';main.style.cssText='padding:12px;display:grid;gap:18px;background:var(--surface);color:var(--ink-strong)';
  main.innerHTML='<h1>Regional body comparison</h1><p>Controlled fictional examples, common 2.1 CSS pixels per inch. Older circular sections above; current breadth/depth below.</p>';
  const checks=[];
  for(const [i,row]of rows.entries()){
   const article=document.createElement('article');article.dataset.case=i;article.style.cssText='padding:8px;min-width:0;border:1px solid var(--line)';article.innerHTML=`<h2>${row.heightInches} inches / ${row.weightLbs} pounds</h2>`;
   for(const [j,p]of row.players.entries()){
    const section=document.createElement('section');section.innerHTML=`<h3>${j?'Regional breadth/depth':'Retained circular sections'}</h3><div style="display:flex;flex-wrap:wrap;align-items:end;gap:8px">${buildPlayerPhysiqueSvg(p,{idSuffix:`${i}-${j}-front`})}${buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:`${i}-${j}-side`})}${buildPlayerMotionSvg(p,{mode:'run',phase:.37,idSuffix:`${i}-${j}-run`})}${buildPlayerMotionSvg(p,{mode:'cut',phase:.37,idSuffix:`${i}-${j}-cut`})}</div>`;
    section.querySelectorAll(':scope > div > svg').forEach(svg=>{const b=svg.viewBox.baseVal;svg.style.cssText=`width:${b.width*.35}px;height:${b.height*.35}px;display:block;flex:none`;});article.append(section);
    checks.push({i,j,frontArm:projectedLimbSections(p.visualFrame,'arm','front'),sideArm:projectedLimbSections(p.visualFrame,'arm','side'),frontLeg:projectedLimbSections(p.visualFrame,'leg','front'),sideLeg:projectedLimbSections(p.visualFrame,'leg','side'),boneDimensions:[p.visualFrame.heightInches,p.visualFrame.armLengthInches,p.visualFrame.legLengthInches]});
   }main.append(article);
  }document.body.replaceChildren(main);return checks;
 },rows);
 expect(JSON.stringify(rows)).toBe(snapshot);
 for(let i=0;i<checks.length;i+=2){expect(checks[i+1].boneDimensions).toEqual(checks[i].boneDimensions);expect(checks[i+1].frontArm).not.toEqual(checks[i+1].sideArm);expect(checks[i+1].frontLeg).not.toEqual(checks[i+1].sideLeg);}
 await fs.mkdir('output/playwright',{recursive:true});
 for(const [viewport,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.locator('#limbGallery').screenshot({path:`output/playwright/regional-limb-${viewport}-${theme}-gallery.png`});
   for(const i of [2,3])await page.locator(`[data-case="${i}"]`).screenshot({path:`output/playwright/regional-limb-${viewport}-${theme}-case-${i}.png`});
  }
 }
 await fs.writeFile('output/playwright/regional-limb-browser-checks.json',JSON.stringify({controlledExamples:true,checks},null,2));
});
