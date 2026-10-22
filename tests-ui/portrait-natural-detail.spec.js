import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { ensurePlayerVisualIdentity } from '../src/domain/playerVisualIdentity.js';

test('natural hair and iris controls have independent visible effects under matched eyelids', async ({ page }) => {
  test.setTimeout(180000);
  const phase=process.env.IDENTITY_CAPTURE_PHASE || 'natural-after';
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
  await page.emulateMedia({reducedMotion:'reduce'});
  const p=ensurePlayerVisualIdentity({id:'natural-detail',name:'Natural detail',age:24,heightInches:74,weightLbs:220,ratings:{strength:80},profile:{faceSeed:'natural-detail'}},{newPlayer:true});
  const a={...playerAppearance(p),detailVersion:'natural-appearance-detail-v1',hairstyle:'long',hairTexture:'curly',facialHair:'clean',eyeColor:'#587496',complexion:.4,hairCurvature:1,hairWaveScale:1,hairStrandWidth:1,irisShade:0,irisInnerMix:.2,irisPattern:.3};
  const rows=[['hairCurvature',.65,1.45],['hairWaveScale',.65,1.5],['hairStrandWidth',.65,1.5],['irisShade',-.25,.25],['irisInnerMix',0,.65],['irisPattern',0,1]];
  const render=async players=>page.evaluate(async players=>{
    const {buildPlayerPortraitSvg}=await import('/lib/playerPortrait.js');
    let g=document.getElementById('naturalGallery');
    if(!g){g=document.createElement('section');g.id='naturalGallery';document.body.replaceChildren(g);}
    g.style.cssText='display:grid;gap:12px;padding:16px;max-width:1100px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    g.replaceChildren();
    players.forEach((p,i)=>{const c=document.createElement('article');c.innerHTML=buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:`-natural-${i}`});c.querySelector('svg').style.cssText='display:block;width:100%;height:auto';const label=document.createElement('p');label.textContent=p.name;c.append(label);g.append(c);});
  },players);
  const make=(key,value)=>({...p,name:`${key}: ${value}`,appearance:{...a,[key]:value},visualFrame:playerFrame(p)});
  await page.setViewportSize({width:1440,height:1000});
  const pixelChecks=[];
  for(const [key,lo,hi] of rows){const hashes=[];for(const value of [lo,hi]){await render([make(key,value)]);await page.locator('#naturalGallery').evaluate(g=>{g.style.width='280px';g.style.gridTemplateColumns='1fr';});const b=await page.locator('#naturalGallery svg').screenshot();hashes.push(crypto.createHash('sha256').update(b).digest('hex'));}if(!phase.includes('before'))expect(hashes[0],`${key} rendered effect`).not.toBe(hashes[1]);pixelChecks.push({key,hashes});}
  const captures=[];
  for(let group=0;group<rows.length;group+=3){await render(rows.slice(group,group+3).flatMap(([key,lo,hi])=>[make(key,lo),make(key,hi)]));for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.locator('#naturalGallery').evaluate((g,n)=>{g.style.width='auto';g.style.gridTemplateColumns=`repeat(${n},minmax(0,1fr))`;},viewport==='desktop'?3:2);for(const theme of ['dark','light']){await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);const file=`output/playwright/s117-${phase}-${viewport}-${group}-${theme}.png`;await fs.mkdir('output/playwright',{recursive:true});await page.locator('#naturalGallery').screenshot({path:file});captures.push({file,viewport,width,theme});}}}
  const reportName=phase.startsWith('whole-head-')?`${phase}-natural-details`:phase;
  await fs.writeFile(`output/playwright/s117-${reportName}.json`,JSON.stringify({pixelChecks,captures},null,2));
});
