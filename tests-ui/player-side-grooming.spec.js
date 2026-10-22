import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance} from '../src/domain/playerIdentity.js';
import {HAIR_STYLE_RULES} from '../public/lib/portraitAppearanceContract.js';

test('individual side grooming is readable in all styles and actual dossiers',async({page})=>{
 test.setTimeout(180000);
 const phase=process.env.SIDE_GROOMING_PHASE||'after';
 if(phase==='before')await page.route('**/lib/playerSideAppearance.js*',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await fs.readFile('.cache/s117-side-head-before-grooming.js.txt','utf8')});
 });
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
 await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');await page.click('#createLeagueBtn');await page.waitForURL(/game\.html$/);
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator('#rosterTable button[data-player-id]').first().click();
 await page.locator('.player-physique > summary').click();await page.locator('.player-physique-side > summary').click();await page.locator('.player-movement > summary').click();
 const motion=page.locator('.player-movement');await motion.scrollIntoViewIfNeeded();
 await expect(motion.locator('.player-side-head')).toHaveCount(1);
 await page.emulateMedia({reducedMotion:'reduce'});await fs.mkdir('output/playwright',{recursive:true});
 for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  if(view==='mobile'){await expect(page.locator('#mlFullViewBtn')).toBeVisible();await page.locator('#mlFullViewBtn').click();}
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
   await motion.scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-side-grooming-${phase}-${view}-${theme}-dossier.png`});
  }
 }
 const original=playerAppearance({id:'side-grooming-common',age:24});
 const fixtures=Object.entries(HAIR_STYLE_RULES).map(([style,rule],i)=>({label:style,
  player:{id:'side-grooming-common',age:24,profile:{appearanceRecipe:{seed:'frozen-side-grooming'}},appearance:{...original,
   complexion:i%3===0?.15:i%3===1?.55:.92,hairstyle:style,hairTexture:rule.textures.includes('coily')&&['afro','coils','short-curls'].includes(style)?'coily':rule.textures[0],
   naturalHairColor:i%3===0?'#b58c58':'#29201b',hairColor:i%3===0?'#b58c58':'#29201b',dyedHairColor:style==='locs'?'#713629':null,
   hairLength:1,hairDensity:1,hairline:.3,hairCurvature:1,hairWaveScale:1,hairStrandWidth:1,facialHair:['clean','short-beard','full-beard'][i%3]}}}));
 const legal=Object.entries(HAIR_STYLE_RULES).flatMap(([style,r])=>r.textures.map(texture=>({style,texture})));
 const result=await page.evaluate(async({fixtures,legal,original})=>{
  const {buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
  const gallery=document.createElement('section');gallery.id='sideGroomingGallery';gallery.style.cssText='padding:16px;max-width:1180px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  const heading=document.createElement('h2');heading.textContent='Saved grooming · all 14 styles';gallery.append(heading);
  for(let group=0;group<2;group++){
   const grid=document.createElement('div');grid.dataset.groomingGroup=String(group);grid.style.cssText='display:grid;gap:12px;margin-bottom:16px';
   for(const f of fixtures.slice(group*7,group*7+7)){
    const card=document.createElement('article');card.style.cssText='min-width:0';
    const label=document.createElement('p');label.textContent=`${f.label} · ${f.player.appearance.hairTexture}`;label.style.cssText='font-size:14px;margin:4px 0;min-height:2.4em';card.append(label);
    const image=document.createElement('div');image.innerHTML=`<svg viewBox="-90 -55 180 220" role="img" aria-label="${f.label}"><rect x="-90" y="-55" width="180" height="220" rx="10" fill="#14232c"/><path d="M-17 90 H8 L12 112 Q42 121 55 165 H-66 Q-60 120 -22 112Z" fill="#537d91"/>${buildPlayerSideHead(f.player,{height:100,idSuffix:`-grooming-${f.label}`})}</svg>`;
    image.querySelector('svg').style.cssText='display:block;width:100%;max-height:255px';card.append(image);grid.append(card);
   }
   gallery.append(grid);
  }
  document.body.replaceChildren(gallery);
  const errors=[];
  for(const{style,texture}of legal){
   const holder=document.createElement('div');holder.innerHTML=`<svg>${buildPlayerSideHead({appearance:{...original,hairstyle:style,hairTexture:texture}},{idSuffix:`-validate-${style}-${texture}`})}</svg>`;gallery.append(holder);
   const svg=holder.querySelector('svg');const ids=new Set([...svg.querySelectorAll('[id]')].map(e=>e.id));
   for(const el of svg.querySelectorAll('*'))for(const at of el.attributes)for(const m of at.value.matchAll(/url\(#([^)]*)\)/g))if(!ids.has(m[1]))errors.push(`missing ${m[1]}`);
   const box=svg.querySelector('.player-side-head').getBBox();if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width>170||box.height>215)errors.push(`bounds ${style}/${texture}`);
   holder.remove();
  }
  return {count:legal.length,errors};
 },{fixtures,legal,original});
 expect(result.count).toBe(48);expect(result.errors).toEqual([]);
 for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('[data-grooming-group]').evaluateAll((els,view)=>els.forEach(el=>el.style.gridTemplateColumns=view==='desktop'?'repeat(4,minmax(0,1fr))':'repeat(2,minmax(0,1fr))'),view);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   for(let group=0;group<2;group++){
    await page.locator('[data-grooming-group]').evaluateAll((els,group)=>els.forEach(el=>el.style.display=Number(el.dataset.groomingGroup)===group?'grid':'none'),group);
    await page.screenshot({path:`output/playwright/s117-side-grooming-${phase}-${view}-${theme}-styles-${group}.png`,fullPage:true});
   }
  }
 }
});
