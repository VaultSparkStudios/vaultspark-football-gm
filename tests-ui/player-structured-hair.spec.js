import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
test('arranged hair front and side views show the same saved grooming',async({page})=>{
 const phase=process.env.STRUCTURED_HAIR_CAPTURE_PHASE||'final';
 if(phase==='before')for(const name of ['playerPortraitFace','playerSideAppearance'])await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/structured-hair-before/${name}.js`,'utf8')}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const p=ensurePlayerVisualIdentity({id:'structured-pair',age:28,heightInches:74,weightLbs:225,profile:{}},{newPlayer:true});
 const a=playerAppearance(p),players=['locs','braids'].map(hairstyle=>({...p,appearance:{...a,hairstyle,hairLength:1.1,hairColor:'#35251d',naturalHairColor:'#35251d',dyedHairColor:null,facialHair:'clean'},visualFrame:playerFrame(p)}));
 const original=structuredClone(players);
 await page.evaluate(async players=>{
  const {buildLegacyPlayerPortraitSvg:buildPlayerPortraitSvg}=await import('/lib/playerPortraitFace.js');const {buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
  const g=document.createElement('main');g.id='structuredHair';g.style.cssText='display:grid;gap:12px;padding:12px;max-width:720px;margin:auto;color:var(--ink-strong);background:var(--surface)';
  // Component gallery explicitly exercises the retained SVG decoder, including its fine-face grooming.
  for(const saved of players){const p={...saved,appearance:{...saved.appearance,version:'portrait-identity-v2'}};const card=document.createElement('article');card.innerHTML=`<h3>${p.appearance.hairstyle}</h3><div style="display:flex;align-items:center">${buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:'-'+p.appearance.hairstyle})}<svg viewBox="0 0 100 170" style="width:110px;flex-shrink:0;background:#14232c;border-radius:12px">${buildPlayerSideHead(p,{x:50,y:15,height:125,idSuffix:'-'+p.appearance.hairstyle})}</svg></div>`;card.querySelector('svg').style.cssText='width:220px;max-width:65%;height:auto';g.append(card);}document.body.replaceChildren(g);
 },players);
 expect(await page.locator('[data-arranged-flow]').count()).toBe(phase==='before'?0:4);
 expect(players).toEqual(original);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const [size,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#structuredHair').evaluate((g,size)=>g.style.gridTemplateColumns=size==='desktop'?'1fr 1fr':'1fr',size);
  for(const theme of ['dark','light']){await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);await page.screenshot({path:`output/playwright/s117-structured-hair-${phase}-${size}-${theme}.png`,fullPage:true});}
 }
});


test('current arranged grooming uses the same saved appearance in shared front and profile heads',async({page})=>{
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const p=ensurePlayerVisualIdentity({id:'structured-current',age:28,heightInches:74,weightLbs:225,profile:{}},{newPlayer:true});
 const results=await page.evaluate(async p=>{
  const {buildHeadMesh3d}=await import('/lib/playerHead3d.js');
  const {buildPlayerPortraitSvg}=await import('/lib/playerPortraitFace.js');const {buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
  const {tryPlayerHeadImage}=await import('/lib/playerHeadImage.js');
  const {appearanceHairColors,appearanceSkinColor}=await import('/lib/appearancePalette.js');
  return ['locs','braids'].map(hairstyle=>{
   const player={...p,appearance:{...p.appearance,hairstyle,hairLength:1.1}},original=JSON.stringify(player);
   const a=player.appearance,hair=appearanceHairColors(a,player.age),colors={skin:appearanceSkinColor(a),scalp:hair.scalp,brow:hair.brow,beard:hair.face,iris:a.eyeColor,mouth:'#93604f'};
   const first=buildHeadMesh3d(a,colors,{headOnly:true,identitySeed:player.id}),second=buildHeadMesh3d(a,colors,{headOnly:true,identitySeed:player.id});
   const root=document.createElement('div');root.innerHTML=buildPlayerPortraitSvg(player,{headOnly:true})+'<svg>'+buildPlayerSideHead(player)+'</svg>';
   const images=[...root.querySelectorAll('image')].map(i=>i.getAttribute('href'));
   return {hairstyle,completeHeadStable:JSON.stringify(first)===JSON.stringify(second),finite:[...first.vertices].every(Number.isFinite),sharedImages:images.length===2&&images[0]===tryPlayerHeadImage(player).src&&images[1]===tryPlayerHeadImage(player,{angle:Math.PI/2}).src,unchanged:JSON.stringify(player)===original};
  });
 },{...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)});
 expect(results).toEqual(['locs','braids'].map(hairstyle=>({hairstyle,completeHeadStable:true,finite:true,sharedImages:true,unchanged:true})));
});
