import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';

test('head shader and measured-surface light agree on controlled albedo and normals',async({page})=>{
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const result=await page.evaluate(async()=>{
  const {characterSurfaceColor}=await import('/lib/playerSurfaceLighting.js');
  const {buildHeadMesh3d,createHeadRenderer3d}=await import('/lib/playerHead3d.js');
  const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const renderer=createHeadRenderer3d(canvas),base=buildHeadMesh3d({hairstyle:'shaved'},colors,{headOnly:true}),samples=[];
  for(const pigment of ['#382420','#593629','#8e634b','#d4bea0','#f0ceb4'])for(const normal of [[0,0,1],[-1,0,0],[1,0,0],[0,1,0],[.8,-.2,.5]]){
   const rgb=[1,3,5].map(i=>parseInt(pigment.slice(i,i+2),16)/255);
   const vertices=new Float32Array([[-40,-40,20],[40,-40,20],[40,40,20],[-40,40,20]].flatMap(point=>[...point,...normal,...rgb,20]));
   const mesh={...base,vertices,indices:new Uint16Array([0,1,2,0,2,3]),triangles:2};
   renderer.draw(mesh,{},colors);const px=renderer.readPixels().slice((32*64+32)*4,(32*64+32)*4+4);
   const expected=characterSurfaceColor(pigment,normal),cpu=[1,3,5].map(i=>parseInt(expected.slice(i,i+2),16));
   samples.push({pigment,normal,gpu:Array.from(px.slice(0,3)),cpu,maxChannelError:Math.max(...cpu.map((v,i)=>Math.abs(v-px[i]))),opaque:px[3]===255});
  }
  renderer.dispose();return {samples};
 });
 expect(result.samples).toHaveLength(25);expect(result.samples.every(s=>s.opaque&&s.maxChannelError<=1)).toBe(true);
 await fs.mkdir('output/playwright',{recursive:true});await fs.writeFile('output/playwright/skin-lighting-shader.json',JSON.stringify(result,null,2));
});

test('complete body lighting remains coherent across three saved fixtures and six movements',async({page})=>{
 const fixtures=JSON.parse(await fs.readFile('docs/visual-qa/references/production-head-anatomy-fixtures-2026-10-08.json','utf8'));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const observations=await page.evaluate(async players=>{
  const {buildPlayerPortraitSvg,buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
  const {solvePlayerMotion}=await import('/lib/playerMotion.js');
  const {appearanceSkinColor}=await import('/lib/appearancePalette.js');
  const {playerHeadImageDiagnostics}=await import('/lib/playerHeadImage.js');
  const root=document.createElement('main');root.style.cssText='padding:14px;max-width:1200px;margin:auto;color:var(--ink-strong);background:var(--panel);font-family:system-ui';
  root.innerHTML='<h1>One saved person: head, neck, measured body and movement</h1><p>Controlled fictional fixtures. Pigments and anatomy retain their saved values; estimated proportions and lighting remain artistic.</p>';
  const observations=[];
  for(const [index,original]of players.entries()){
   const p={...original,name:'Lighting fixture '+(index+1),age:26,jerseyNumber:40,ratings:{speed:80,acceleration:75,jumping:70,strength:85,endurance:75}},before=JSON.stringify(p);
   const section=document.createElement('section');section.id='lighting-person-'+index;section.style.cssText='padding:10px;margin-bottom:24px';
   section.innerHTML='<h2>'+p.name+'</h2><div class="views" style="display:flex;flex-wrap:wrap;gap:8px"></div>';
   const views=section.querySelector('.views');
   for(const [name,svg,width]of [['portrait',buildPlayerPortraitSvg(p,{idSuffix:'-skin-gallery-'+index}),160],['front',buildPlayerPhysiqueSvg(p,{idSuffix:'-skin-gallery-front-'+index}),160],['profile',buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:'-skin-gallery-side-'+index}),160]]){
    const wrapper=document.createElement('div');wrapper.style.width=width+'px';wrapper.innerHTML='<h3>'+name+'</h3>'+svg;views.append(wrapper);
   }
   const motion=[];
   for(const mode of ['run','acceleration','cut','jump','strength','endurance']){
    const wrapper=document.createElement('div');wrapper.style.width='160px';wrapper.innerHTML='<h3>'+mode+'</h3>'+buildPlayerMotionSvg(p,{mode,phase:.37,idSuffix:'-skin-gallery-'+index+'-'+mode});views.append(wrapper);
    motion.push({mode,pose:solvePlayerMotion(p,{mode,phase:.37})});
   }
   section.querySelectorAll('svg').forEach(svg=>{svg.style.cssText='width:100%;height:auto;display:block';const markup=svg.outerHTML.replace(/data:image\/png;base64,[^"]+/g,'PNG');if(markup.match(/NaN|Infinity|undefined/))throw Error('Invalid surface');});
   if(section.querySelectorAll('[data-head-renderer]').length!==9)throw Error('Shared head missing from a surface');
   if(JSON.stringify(p)!==before)throw Error('Saved identity changed');
   root.append(section);observations.push({id:p.id,skin:appearanceSkinColor(p.appearance),frame:p.visualFrame,motion,completePlayerUnchanged:true});
  }
  document.body.replaceChildren(root);return{observations,diagnostics:playerHeadImageDiagnostics()};
 },[fixtures.players[0],fixtures.players[2],fixtures.players[4]]);
 const captures=[];
 for(const [size,width,height]of [['desktop',1440,1000],['mobile',390,844]])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let person=0;person<3;person++){
   const file=`output/playwright/skin-continuity-gallery-${person}-${size}-${theme}.png`;await page.locator('#lighting-person-'+person).screenshot({path:file});captures.push({file,person,theme,viewport:{width,height},sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
  }
 }
 await fs.writeFile('output/playwright/skin-continuity-gallery.json',JSON.stringify({...observations,captures,fullAppearanceAccepted:false},null,2));
});

test('historical shared skin lighting before/after retains measured shapes and one saved head across actual dossier views',async({page})=>{
 test.setTimeout(180000);page.setDefaultTimeout(20000);const id='P2026-BUF-LB-33468504',captures=[];
 const authority=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_SKIN_CONTINUITY_2026-10-08.json','utf8'));
 for(const row of [...authority.sources,...authority.inputs])expect(crypto.createHash('sha256').update(await fs.readFile('docs/visual-qa/'+row.file)).digest('hex')).toBe(row.sha256);
 for(const name of ["appearancePalette","playerHead3d","playerPortraitFace","playerPortrait","playerMotion"])await page.route('**/lib/'+name+'.js',r=>r.fulfill({contentType:'text/javascript',path:'docs/visual-qa/references/player-skin-continuity-before-'+name+'-2026-10-08.js'}));
 await createPlayScenario(page);await page.emulateMedia({reducedMotion:'reduce'});
 const outlines=[];
 const before=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;
 for(const stage of['before','after']){
  await page.setViewportSize({width:1440,height:1000});
  if(stage==='after'){for(const name of ["appearancePalette","playerHead3d","playerPortraitFace","playerPortrait","playerMotion"])await page.unroute('**/lib/'+name+'.js');for(const row of authority.sources.filter(r=>r.original.startsWith('public/lib/')))await page.route('**/lib/'+row.original.split('/').at(-1),r=>r.fulfill({contentType:'text/javascript',path:'docs/visual-qa/'+row.file}));await page.goto('/game.html');await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});}
  for(const close of['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(close).isVisible())await page.locator(close).click();
  await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`#rosterTable button[data-player-id="${id}"]`).click();
  for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});
   const mobile=await page.evaluate(async()=>(await import('/lib/mobileLoop.js')).isMobileModeEnabled());
   if(mobile){await expect(page.locator('body')).toHaveClass(/mobile-loop-active/);await page.locator('#mlFullViewBtn').click();}
   else await expect(page.locator('body')).not.toHaveClass(/mobile-loop-active/);
   await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
   for(const theme of['dark','light'])for(const[state,selector]of[['portrait','.player-portrait-card'],['body','.player-physique'],['motion','.player-movement']]){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    await page.locator('.player-physique').evaluate((el,open)=>el.open=open,state!=='portrait');
    if(state!=='portrait'){await page.locator('.player-physique-side').evaluate(el=>el.open=true);await page.locator('.player-movement').evaluate(el=>el.open=true);await page.locator('[data-motion-mode]').selectOption(state==='motion'?'strength':'run');}
    await expect(page.locator('.player-portrait-card [data-head-renderer]')).toHaveCount(1);
    await page.locator(selector).scrollIntoViewIfNeeded();
    const file=`output/playwright/skin-continuity-${stage}-${size}-${theme}-${state}.png`;await page.screenshot({path:file,animations:'disabled'});
    captures.push({file,stage,state,theme,viewport:{width,height},sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
   }
  }
  outlines.push(await page.evaluate(()=>{const selectors=['.player-physique-svg','.player-physique-side-svg','.player-motion-svg'];return selectors.map(s=>Array.from(document.querySelectorAll(s+' path')).map(p=>p.getAttribute('d')));}));
  if(stage==='before')await page.locator('#closePlayerModalBtn').click();
 }
 expect(outlines[1]).toEqual(outlines[0]);
 const agreement=[];
 for(const mode of['run','acceleration','cut','jump','strength','endurance']){
  await page.locator('[data-motion-mode]').selectOption(mode);
  const same=await page.evaluate(mode=>{const src=selector=>document.querySelector(selector)?.getAttribute('href');const front=src('.player-portrait-card image'),body=src('.player-physique-svg image'),side=src('.player-physique-side-svg image'),motion=src('.player-motion-svg image');return{mode,frontBody:front===body&&!!front,sideMotion:mode==='cut'?motion===front:motion===side};},mode);
  expect(same.frontBody).toBe(true);expect(same.sideMotion).toBe(true);agreement.push(same);
 }
 const diagnostics=await page.evaluate(async()=>{
  const mod=await import('/lib/playerHeadImage.js');return mod.playerHeadImageDiagnostics();
 });
 expect(diagnostics.contexts).toBe(1);expect(diagnostics.cacheEntries).toBeLessThanOrEqual(diagnostics.cacheLimit);
 const cacheProof=await page.evaluate(async player=>{
  const mod=await import('/lib/playerHeadImage.js'),first=mod.tryPlayerHeadImage(player).src;
  for(let i=0;i<35;i++)mod.tryPlayerHeadImage({...player,id:`resource-stress-${i}`});
  const bounded=mod.playerHeadImageDiagnostics(),restored=mod.tryPlayerHeadImage(player).src===first;
  const malformed=mod.tryPlayerHeadImage({...player,appearance:{...player.appearance,eyeColor:'invalid'}})===null;
  const malformedSkin=mod.tryPlayerHeadImage({...player,appearance:{...player.appearance,complexion:NaN}})===null;
  return{bounded,restored,malformed,malformedSkin,healthy:!mod.playerHeadImageDiagnostics().unavailable};
 },before);
 expect(cacheProof.bounded.cacheEntries).toBe(32);expect(cacheProof.bounded.contexts).toBe(1);expect(cacheProof.restored).toBe(true);expect(cacheProof.malformed).toBe(true);expect(cacheProof.malformedSkin).toBe(true);expect(cacheProof.healthy).toBe(true);
 const after=(await(await page.request.get(`/api/player?playerId=${id}`)).json()).profile.player;expect(after).toEqual(before);
 await fs.writeFile('output/playwright/skin-continuity.json',JSON.stringify({scope:'Actual dossier before/after shared head/body diffuse lighting and neck occlusion; measured shapes and player data unchanged; full craft and calibration remain open',playerId:id,captures,agreement,diagnostics,cacheProof,playerUnchanged:true,bodyPathCoordinatesUnchanged:true},null,2));
});
