import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
test('saved individual appearance reaches side and animated real dossiers',async({page})=>{
 test.setTimeout(180000);const phase=process.env.SIDE_IDENTITY_PHASE||'after';
 // Disclosed read-only baseline: preserved renderers, current unchanged fixture
 // measurements/identity. No source or gameplay mutation is made by interception.
 if(phase==='before'){
  await page.route('**/lib/playerMotion.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await fs.readFile('.cache/s117-motion-before-side-identity.js.txt','utf8')});});
  await page.route('**/lib/playerPortrait.js*',async route=>{const response=await route.fetch();const body=(await fs.readFile('.cache/s117-playerPortrait-before-side-identity.mjs','utf8')).replaceAll('../public/lib/','./');await route.fulfill({response,body});});
 }
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');await page.click('#createLeagueBtn');await page.waitForURL(/game\.html$/);
 await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator('#rosterTable button[data-player-id]').first().click();
 await page.locator('.player-physique > summary').click();await page.locator('.player-physique-side > summary').click();
 if(phase==='after')await expect(page.locator('.player-physique-side .player-side-head')).toHaveCount(1);
 await page.locator('.player-physique-side > summary').click();await page.locator('.player-movement > summary').click();
 const detail=page.locator('.player-movement');await detail.scrollIntoViewIfNeeded();
 if(phase==='after'){
  // The visible GPU surface animates; its hidden SVG fallback updates only at mode boundaries.
  const canvas=detail.locator('canvas[data-player-character3d]');await expect(canvas).toBeVisible();
  const pixels=()=>canvas.evaluate(c=>{const gl=c.getContext('webgl'),px=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,px);let h=2166136261;for(const v of px)h=Math.imul(h^v,16777619);return h>>>0;});
  const initial=await pixels();await expect.poll(pixels).not.toBe(initial);
  await expect(detail.locator('.player-side-head')).toHaveCount(1);
  const skin=await detail.locator('.player-side-head').getAttribute('data-skin-color');
  await expect(detail.locator('.motion-leg').last()).toHaveAttribute('data-skin-color',skin);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await fs.mkdir('output/playwright',{recursive:true});
 for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(350);
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
   if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
   await detail.scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s117-side-identity-${phase}-${view}-${theme}-dossier.png`});
  }
 }
 const base=ensurePlayerVisualIdentity({id:'side-face-pair',name:'Side face pair',age:24,heightInches:78,weightLbs:340,ratings:{speed:85,acceleration:70,jumping:70,strength:80}},{newPlayer:true});
 const appearance=playerAppearance(base),frame=playerFrame(base);
 const cases=[['Light · close cut',{complexion:.1,hairstyle:'buzz',facialHair:'clean',hairColor:'#b58c58',naturalHairColor:'#b58c58',eyeColor:'#587496',jawWidth:.85}],['Deep · coils',{complexion:.95,hairstyle:'coils',hairTexture:'coily',facialHair:'short-beard',hairColor:'#151210',naturalHairColor:'#151210',eyeColor:'#34251d',noseTip:1.2}],['Dyed locs · natural beard',{complexion:.6,hairstyle:'locs',facialHair:'full-beard',hairColor:'#29201b',naturalHairColor:'#29201b',dyedHairColor:'#713629',eyeColor:'#67784f'}],['Long hair · lighter eyes',{complexion:.3,hairstyle:'long',facialHair:'mustache',hairColor:'#473126',naturalHairColor:'#473126',eyeColor:'#59818b',chinWidth:1.2}]];
 const fixtures=cases.map(([label,a])=>({label,player:{...base,appearance:{...appearance,dyedHairColor:null,...a},visualFrame:frame}}));
 await page.evaluate(async({fixtures})=>{
  const {buildPlayerMotionSvg,buildPlayerPhysiqueSvg}=await import('/lib/playerPortrait.js');const {solvePlayerMotion}=await import('/lib/playerMotion.js');
  const gallery=document.createElement('section');gallery.id='sideIdentityGallery';gallery.style.cssText='display:grid;gap:12px;padding:12px;max-width:1000px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  for(const f of fixtures){const card=document.createElement('article');const label=document.createElement('p');label.textContent=f.label;label.style.minHeight='2.8em';card.append(label);
   const head=document.createElement('div');head.dataset.galleryKind='heads';head.innerHTML=buildPlayerMotionSvg(f.player,{phase:.18});const pose=solvePlayerMotion(f.player,{phase:.18});head.querySelector('svg').setAttribute('viewBox',`105 ${pose.shoulder.y-9-pose.skull-30} 130 155`);head.querySelector('svg').style.cssText='display:block;width:100%;max-width:240px;height:auto;margin:auto';card.append(head);
   const bodies=document.createElement('div');bodies.dataset.galleryKind='bodies';bodies.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px';bodies.innerHTML=buildPlayerPhysiqueSvg(f.player,{view:'side'})+buildPlayerMotionSvg(f.player,{phase:.18});bodies.querySelectorAll('svg').forEach(s=>s.style.cssText='display:block;width:100%;max-width:200px;height:auto;margin:auto');card.append(bodies);gallery.append(card);
  }document.body.replaceChildren(gallery);
 },{fixtures});
 for(const kind of ['heads','bodies']){
  await page.locator('[data-gallery-kind]').evaluateAll((nodes,kind)=>nodes.forEach(n=>n.style.display=n.dataset.galleryKind===kind?(kind==='bodies'?'grid':'block'):'none'),kind);
  for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});await page.locator('#sideIdentityGallery').evaluate(g=>g.style.gridTemplateColumns='repeat(2,minmax(0,1fr))');
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    await page.screenshot({path:`output/playwright/s117-side-identity-${phase}-${view}-${theme}-${kind}.png`,fullPage:true});
   }
  }
 }
});
