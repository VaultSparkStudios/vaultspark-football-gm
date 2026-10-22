import{test,expect}from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
test('whole anatomy before/after and clay in three cameras at actual intrinsic sizes',async({page})=>{
 const baseline=JSON.parse(await fs.readFile('output/playwright/player-art-benchmark.json','utf8'));
 await page.route('**/head-anatomy-current.mjs',r=>r.fulfill({path:'prototypes/playerHead3d.mjs',contentType:'text/javascript'}));
 await page.route('**/head-anatomy-before.mjs',r=>r.fulfill({path:'.cache/head-anatomy-before/playerHead3d.mjs',contentType:'text/javascript'}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const observations=await page.evaluate(async players=>{
  const current=await import('/head-anatomy-current.mjs'),before=await import('/head-anatomy-before.mjs');
  const{appearanceSkinColor,appearanceHairColors,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  const root=document.createElement('main');root.style.cssText='padding:14px;max-width:1240px;margin:auto;color:var(--ink-strong);background:var(--surface);font-family:system-ui';
  root.innerHTML='<h1>Complete anatomy comparison</h1><p>Unadopted prototype. Front / three-quarter / profile. True 96×120 ordinary rasters; 240×300 native inspection rasters on desktop. Clay isolates anatomy with hair shaved and beard clean.</p>';
  const observations=[];
  for(const[index,p]of players.entries()){
   const section=document.createElement('section');section.id=`person-${index}`;section.style.cssText='padding:10px;background:var(--surface);margin-bottom:24px';section.innerHTML=`<h2>Saved person ${p.id}</h2>`;
   const hair=appearanceHairColors(p.appearance,26),skin=appearanceSkinColor(p.appearance),colors={skin,scalp:hair.scalp,beard:hair.face,brow:hair.brow,grayShare:hair.grayShare,iris:p.appearance.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
   const original=JSON.stringify(p);
   for(const[state,module,clay]of[['before',before,false],['after',current,false],['clay',current,true]]){
    const a=clay?{...p.appearance,hairstyle:'shaved',facialHair:'clean'}:p.appearance;
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;
    const renderer=module.createHeadRenderer3d(canvas),mesh=module.buildHeadMesh3d(a,colors,{identitySeed:p.id}),saved=new Float32Array(mesh.vertices);
    const ordinary=document.createElement('canvas');ordinary.width=96;ordinary.height=120;const ctx=ordinary.getContext('2d');
    const block=document.createElement('div');block.innerHTML=`<h3>${state}</h3>`;
    const small=document.createElement('div'),large=document.createElement('div');small.style.cssText=large.style.cssText='display:flex;gap:4px';large.className='native';
    const views=[];
    for(const angle of[0,Math.PI/4,Math.PI/2]){
     renderer.draw(mesh,a,colors,angle,{clay});const pixels=renderer.readPixels();
     ctx.clearRect(0,0,96,120);ctx.drawImage(canvas,0,0,96,120);
     const img=document.createElement('img');img.src=ordinary.toDataURL();img.width=96;img.height=120;img.alt=`${state} ${angle} ordinary`;small.append(img);
     const native=document.createElement('img');native.src=canvas.toDataURL();native.width=240;native.height=300;native.alt=`${state} ${angle} native`;large.append(native);
     const rgba=ctx.getImageData(0,0,96,120).data;let colored=0;for(let k=0;k<rgba.length;k+=4)if(Math.abs(rgba[k]-17)>8||Math.abs(rgba[k+1]-26)>8||Math.abs(rgba[k+2]-31)>8)colored++;
     if(colored<500)throw Error('Blank ordinary head');views.push({angle,ordinaryColoredPixels:colored,nativePixels:pixels.length/4});
    }
    if(mesh.vertices.some((v,i)=>v!==saved[i])||JSON.stringify(p)!==original)throw Error('Camera changed identity');
    block.append(small,large);section.append(block);renderer.dispose();observations.push({id:p.id,state,views,inputUnchanged:true});
   }
   root.append(section);
  }
  document.body.replaceChildren(root);return observations;
 },[baseline.players[0],baseline.players[2],baseline.players[4]]);
 expect(observations).toHaveLength(9);
 const captures=[];
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async({theme,mobile})=>{(await import('/lib/themeCustomizer.js')).applyTheme(theme);document.querySelectorAll('.native').forEach(x=>x.style.display=mobile?'none':'flex');},{theme,mobile:size==='mobile'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let person=0;person<3;person++){
   const file=`output/playwright/head-anatomy-person-${person}-${size}-${theme}.png`;await page.locator(`#person-${person}`).screenshot({path:file});captures.push({file,person,theme,viewport:{width,height},sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
  }
 }
 await fs.writeFile('output/playwright/head-anatomy.json',JSON.stringify({productionChanged:false,fullAppearanceAccepted:false,scope:'Coordinated anatomy candidate; clay has deliberately removed grooming. No measured facial or demographic coefficients.',observations,captures},null,2));
});
