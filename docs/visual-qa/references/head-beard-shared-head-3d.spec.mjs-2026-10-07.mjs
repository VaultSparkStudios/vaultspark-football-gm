import{test,expect}from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
test('shared mesh renders front/profile and exposes ordinary-size whole-head quality',async({page})=>{
 const baseline=JSON.parse(await fs.readFile('output/playwright/player-art-benchmark.json','utf8'));
 await page.route('**/player-head-3d.mjs',route=>route.fulfill({path:'prototypes/playerHead3d.mjs',contentType:'text/javascript'}));
 await page.route('**/portrait-art-target.png',route=>route.fulfill({path:'docs/visual-qa/references/player-portrait-art-target-2026-10-07.png',contentType:'image/png'}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');await page.emulateMedia({reducedMotion:'reduce'});
 const observations=await page.evaluate(async players=>{
  const{buildHeadMesh3d,createHeadRenderer3d}=await import('/player-head-3d.mjs');const{appearanceSkinColor,appearanceHairColors,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  const{buildPlayerPortraitSvg}=await import('/lib/playerPortraitFace.js');const{buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
  const gallery=document.createElement('main');gallery.id='head3dBenchmark';gallery.style.cssText='max-width:1240px;margin:auto;padding:20px;background:var(--surface);color:var(--ink-strong);font-family:system-ui';
  gallery.innerHTML='<h1>Shared 3D head experiment</h1><p>Matched saved appearance/frame DTOs. One mesh per person, two camera rotations. Artistic geometry, no production adoption or population calibration.</p>';
  const observations=[];const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=createHeadRenderer3d(canvas);
  for(const type of['production','ordinary','inspection']){
   gallery.insertAdjacentHTML('beforeend',`<h2>${type==='production'?'Current production':type==='ordinary'?'Shared mesh at ordinary size':'Shared mesh at inspection size'}</h2>`);
   const grid=document.createElement('section');grid.style.cssText=`display:grid;grid-template-columns:repeat(auto-fit,minmax(${type==='inspection'?'320':'176'}px,1fr));gap:16px`;
   for(const[i,p]of players.entries()){
    const card=document.createElement('article');card.innerHTML=`<h3>Person ${i}</h3>`;
    const pair=document.createElement('div');pair.style.cssText='display:flex;background:#14232c;border-radius:12px;padding:8px;gap:2px';
    if(type==='production'){
     pair.innerHTML=buildPlayerPortraitSvg(p,{headOnly:true,idSuffix:`-3d-before-${i}`})+`<svg viewBox="-50 -10 115 135">${buildPlayerSideHead(p,{x:0,y:0,height:110,idSuffix:`-3d-before-${i}`})}</svg>`;
     for(const svg of pair.querySelectorAll('svg'))svg.style.cssText='width:80px;height:110px;flex:none';
    }else{
     const skin=appearanceSkinColor(p.appearance),hair=appearanceHairColors(p.appearance,26),colors={skin,scalp:hair.scalp,beard:hair.face,brow:hair.brow,iris:p.appearance.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
     const started=performance.now(),mesh=buildHeadMesh3d(p.appearance,{...colors,grayShare:hair.grayShare},{identitySeed:p.id});const geometryMs=performance.now()-started;
     const original=new Float32Array(mesh.vertices);
     const images=[];
     for(const angle of[0,Math.PI/2]){
      const draw=renderer.draw(mesh,p.appearance,colors,angle),pixels=renderer.readPixels();
      let colored=0;for(let k=0;k<pixels.length;k+=4)if(Math.abs(pixels[k]-17)>8||Math.abs(pixels[k+1]-26)>8||Math.abs(pixels[k+2]-31)>8)colored++;
      if(colored<2000)throw Error(`Blank 3D head ${i}/${angle}`);
      const image=document.createElement('img');image.src=canvas.toDataURL('image/png');image.style.cssText=`width:${type==='inspection'?144:80}px;height:${type==='inspection'?180:100}px;flex:none`;pair.append(image);
      images.push({angle,nonBackgroundPixels:colored,...draw});
     }
     renderer.draw(mesh,p.appearance,colors,0);const open=renderer.readPixels();renderer.draw(mesh,p.appearance,colors,0,{blink:1});const closed=renderer.readPixels();
     let blinkPixels=0;for(let k=0;k<open.length;k+=4)if(open[k]!==closed[k]||open[k+1]!==closed[k+1]||open[k+2]!==closed[k+2])blinkPixels++;
     if(blinkPixels<4)throw Error('Blink did not affect eye pixels');renderer.draw(mesh,p.appearance,colors,0);const reopened=renderer.readPixels();if(reopened.some((v,k)=>v!==open[k]))throw Error('Blink failed exact restoration');
     if(mesh.vertices.some((v,k)=>v!==original[k]))throw Error('Camera rotation or blink changed mesh');
     if(type==='ordinary')observations.push({id:p.id,geometryMs,parts:mesh.parts.length,triangles:mesh.triangles,meshBytes:mesh.vertices.byteLength+mesh.indices.byteLength,views:images,blinkPixels,blinkRestored:true,meshUnchanged:true});
    }
    card.append(pair);grid.append(card);
   }gallery.append(grid);
  }
  renderer.dispose();gallery.insertAdjacentHTML('beforeend','<h2>Separate fictional art target</h2><img src="/portrait-art-target.png" style="display:block;width:600px;max-width:100%;height:auto" alt="Fictional adult athlete art target">');
  document.body.replaceChildren(gallery);window.head3dPeople=players;return observations;
 },baseline.players);
 expect(observations).toHaveLength(6);expect(observations.every(x=>x.meshUnchanged)).toBe(true);expect(await page.evaluate(()=>window.head3dPeople)).toEqual(baseline.players);
 await expect(page.locator('#head3dBenchmark img')).toHaveCount(25);await expect.poll(()=>page.locator('#head3dBenchmark img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0))).toBe(true);
 const captures=[];for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
  const file=`output/playwright/player-shared-head-3d-${size}-${theme}.png`;await page.locator('#head3dBenchmark').screenshot({path:file});captures.push({file,viewport:{width,height},theme,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
 }
 await fs.writeFile('output/playwright/player-shared-head-3d.json',JSON.stringify({scope:'Unadopted shared mesh and camera diagnostic; unchanged saved appearance/frame DTOs',productionChanged:false,observations,captures},null,2));
});
