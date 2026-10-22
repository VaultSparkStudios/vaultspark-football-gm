import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';

test('static definition retains the same body across strength while movement remains available',async({page})=>{
 const phase=process.env.STATIC_DEFINITION_PHASE||'final';
 let frame=playerFrame;
 if(phase==='before'){
  const prior=(await fs.readFile('.cache/static-definition-before/playerIdentity.js','utf8')).replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,s)=>`from ${q}${pathToFileURL(path.resolve('src/domain',s)).href}${q}`);
  frame=(await import(`data:text/javascript;base64,${Buffer.from(prior).toString('base64')}`)).playerFrame;
 }
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const base=ensurePlayerVisualIdentity({id:'static-definition-control',name:'Same person',age:25,heightInches:74,weightLbs:225,ratings:{speed:70,acceleration:70,agility:70,jumping:70,strength:70,stamina:70},profile:{}},{newPlayer:true});
 const players=[40,99].map(strength=>{const p={...base,ratings:{...base.ratings,strength}};return {...p,appearance:playerAppearance(p),visualFrame:frame(p)};});
 const before=structuredClone(players);
 if(phase==='final')expect(players[0].visualFrame).toEqual(players[1].visualFrame);
 else expect(players[0].visualFrame.muscleDefinition).not.toBe(players[1].visualFrame.muscleDefinition);
 await page.evaluate(async players=>{
  const {buildPlayerPhysiqueSvg,buildPlayerPortraitSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
  const gallery=document.createElement('section');gallery.id='definitionGallery';gallery.style.cssText='display:grid;gap:12px;padding:12px;max-width:1000px;margin:auto;color:var(--ink-strong);background:var(--surface)';
  for(const p of players){
   const card=document.createElement('article');card.innerHTML=`<h3>Same person / strength ${p.ratings.strength}</h3><div style="display:flex;align-items:start;flex-wrap:wrap">${buildPlayerPortraitSvg(p)}${buildPlayerPhysiqueSvg(p)}${buildPlayerPhysiqueSvg(p,{view:'side'})}${buildPlayerMotionSvg(p,{mode:'run',phase:.37})}</div>`;
   card.querySelectorAll('svg').forEach(svg=>svg.style.cssText='display:block;width:100%;max-width:230px;height:auto');gallery.append(card);
  }document.body.replaceChildren(gallery);
 },players);
 expect(await page.locator('#definitionGallery').innerHTML()).not.toMatch(/NaN|Infinity|undefined/);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const [viewport,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await page.locator('#definitionGallery').screenshot({path:`output/playwright/static-definition-${phase}-${viewport}-${theme}.png`});
   if(viewport==='mobile')for(const [i,strength]of[40,99].entries())for(const [j,view]of['portrait','body'].entries())await page.locator('#definitionGallery article').nth(i).locator(':scope > div > svg').nth(j).screenshot({path:`output/playwright/static-definition-${phase}-${viewport}-${theme}-${strength}-${view}.png`});
  }
 }
 expect(players).toEqual(before);
});
