import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
test('fitted production beard: shared front, oblique and profile at ordinary size',async({page})=>{
 const fixtures=JSON.parse(await fs.readFile('docs/visual-qa/references/production-head-anatomy-fixtures-2026-10-08.json','utf8'));
 const players=['clean','stubble','mustache','goatee','short-beard','full-beard'].map(facialHair=>({...fixtures.players[0],id:'matched-'+facialHair,appearance:{...fixtures.players[0].appearance,hairstyle:'shaved',facialHair}}));
 for(const index of[2,4])players.push({...fixtures.players[index],appearance:{...fixtures.players[index].appearance,facialHair:'full-beard'}});
 await page.route('**/lib/beard-candidate.mjs',r=>r.fulfill({path:'public/lib/playerHead3d.js',contentType:'text/javascript'}));
 await page.route('**/lib/beard-before.mjs',r=>r.fulfill({path:'docs/visual-qa/references/production-beard-before-2026-10-08.js',contentType:'text/javascript'}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const result=await page.evaluate(async players=>{
  const before=await import('/lib/beard-before.mjs'),after=await import('/lib/beard-candidate.mjs');
  const {appearanceSkinColor,appearanceHairColors,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  const root=document.createElement('main');root.style.cssText='max-width:1200px;margin:auto;padding:12px;color:var(--ink-strong);background:var(--panel)';
  root.innerHTML='<h1>Fitted facial hair</h1><p>Same saved person; before / candidate. 96×120 ordinary portraits, 240×300 inspection. Front, three-quarter and profile.</p>';
  const observations=[];
  for(const[index,p] of players.entries()){
   const original=JSON.stringify(p),hair=appearanceHairColors(p.appearance,26),skin=appearanceSkinColor(p.appearance),colors={skin,scalp:hair.scalp,beard:hair.face,brow:hair.brow,grayShare:hair.grayShare,iris:p.appearance.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
   const section=document.createElement('section');section.id='beard-person-'+index;section.style.cssText='margin:16px 0';section.innerHTML='<h2>Saved fixture '+p.id+'</h2>';
   const meshes=[];
   for(const[clay,label]of[[false,'color'],[true,'clay']]){
    const a=clay?{...p.appearance,hairstyle:'shaved'}:p.appearance;
    for(const[state,module]of[['before',before],['candidate',after]]){
     const block=document.createElement('div');block.innerHTML='<h3>'+label+' '+state+'</h3>';const small=document.createElement('div'),large=document.createElement('div');small.style.cssText=large.style.cssText='display:flex;gap:4px';large.className='native';
     const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=module.createHeadRenderer3d(canvas),mesh=module.buildHeadMesh3d(a,colors,{identitySeed:p.id,headOnly:true});
     for(const angle of[0,Math.PI/4,Math.PI/2]){
      renderer.draw(mesh,a,colors,angle,{clay});const image=document.createElement('img');image.src=canvas.toDataURL();image.width=240;image.height=300;large.append(image);
      const ordinary=document.createElement('canvas');ordinary.width=96;ordinary.height=120;ordinary.getContext('2d').drawImage(canvas,0,0,96,120);const thumbnail=document.createElement('img');thumbnail.src=ordinary.toDataURL();thumbnail.width=96;thumbnail.height=120;small.append(thumbnail);
     }
     if(mesh.vertices.some(v=>!Number.isFinite(v))||mesh.vertices.length/10>65535)throw Error('Invalid bounded mesh');
     meshes.push({state,clay,vertices:mesh.vertices.length/10,triangles:mesh.triangles});renderer.dispose();block.append(small,large);section.append(block);
    }
   }
   if(JSON.stringify(p)!==original)throw Error('Saved player mutated');root.append(section);observations.push({id:p.id,inputUnchanged:true,meshes});
  }
  document.body.replaceChildren(root);const style=document.createElement('style');style.textContent='@media(max-width:430px){.native{display:none!important}}';document.head.append(style);return{observations};
 },players);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<players.length;i++)await page.locator('#beard-person-'+i).screenshot({path:`output/playwright/beard-gallery-${i}-${size}-${theme}.png`});
 }
 await fs.writeFile('output/playwright/beard-gallery-observations.json',JSON.stringify(result,null,2));
});
