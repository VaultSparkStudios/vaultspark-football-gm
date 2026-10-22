import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
test('continuous hair candidate: fixed modern people and exact legacy non-scalp control',async({page})=>{
 const fixtures=JSON.parse(await fs.readFile('docs/visual-qa/references/production-head-anatomy-fixtures-2026-10-08.json','utf8'));
 const choices=[['side-part',0],['side-part',.5],['side-part',.9999],['side-part',1.0001],['side-part',1.5],['side-part',1.9999],['side-part',2.0001],['side-part',2.5],['side-part',3],['long',.5],['long',1.5],['long',2.5],['crew',1.9999],['crew',2.0001]];
 const players=choices.map(([hairstyle,position],index)=>{const person=fixtures.players[0];return{...person,id:person.id,appearance:{...person.appearance,hairstyle,hairTexture:['straight','wavy','curly','coily'][Math.min(3,Math.floor(position))],hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition:position,facialHair:'clean'}};});
 players.push({...fixtures.players[0],id:'no-scalp-bearded-control',appearance:{...fixtures.players[0].appearance,hairstyle:'shaved',facialHair:'full-beard'}});
 // Preserve the modern scalp-free gallery person, and separately retain the
 // older decoder's exact shader invariant. Modern facial sculpt is allowed
 // to differ from the historical hair-only baseline.
 const modernControl=players.at(-1);
 players.push({...modernControl,id:'legacy-no-scalp-bearded-control',appearance:{...modernControl.appearance,fineFaceVersion:undefined}});
 await page.route('**/lib/scalp-candidate.mjs',r=>r.fulfill({path:'public/lib/playerHead3d.js',contentType:'text/javascript'}));
 const authority=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_CONTINUOUS_HAIR_PRODUCTION_2026-10-08.json','utf8'));
 await page.route('**/lib/scalp-historical/*.js',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),row=authority.sources.find(s=>s.original===`public/lib/${name}`);
  if(!row)return route.abort();const body=await fs.readFile('docs/visual-qa/'+row.file);
  expect(crypto.createHash('sha256').update(body).digest('hex')).toBe(row.sha256);
  return route.fulfill({body,contentType:'text/javascript'});
 });
 await page.route('**/lib/scalp-before.mjs',async route=>{
  const body=await fs.readFile('docs/visual-qa/references/production-continuous-hair-before-2026-10-08.js','utf8');
  return route.fulfill({body:body.replace("'./playerSurfaceLighting.js'","'/lib/scalp-historical/playerSurfaceLighting.js'"),contentType:'text/javascript'});
 });
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const result=await page.evaluate(async players=>{
  const before=await import('/lib/scalp-before.mjs'),after=await import('/lib/scalp-candidate.mjs'),historicalAfter=await import('/lib/scalp-historical/playerHead3d.js');
  const {appearanceSkinColor,appearanceHairColors,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  const root=document.createElement('main');root.style.cssText='max-width:1200px;margin:auto;padding:12px;color:var(--ink-strong);background:var(--panel)';
  root.innerHTML='<h1>Continuous hair candidate</h1><p>Same saved person; historical hair baseline / current candidate. Modern facial sculpt may differ. The explicitly legacy scalp-free control retains exact pixels. 96×120 ordinary portraits, 240×300 inspection. Front, three-quarter and profile.</p>';
  const observations=[];
  for(const[index,p] of players.entries()){
   const original=JSON.stringify(p),hair=appearanceHairColors(p.appearance,26),skin=appearanceSkinColor(p.appearance),colors={skin,scalp:hair.scalp,beard:hair.face,brow:hair.brow,grayShare:hair.grayShare,iris:p.appearance.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
   const section=document.createElement('section');section.id='scalp-person-'+index;section.style.cssText='margin:16px 0';section.innerHTML='<h2>'+p.appearance.hairstyle+' / texture position '+p.appearance.hairTexturePosition+'</h2>';
   const meshes=[],controlFrames=[];
   for(const[clay,label]of[[false,'color']]){
    const a=clay?{...p.appearance,hairstyle:'shaved',facialHair:'clean'}:p.appearance;
    const comparedAfter=p.id==='legacy-no-scalp-bearded-control'?historicalAfter:after;
    for(const[state,module]of[['before',before],['candidate',comparedAfter]]){
     const block=document.createElement('div');block.innerHTML='<h3>'+label+' '+state+'</h3>';const small=document.createElement('div'),large=document.createElement('div');small.style.cssText=large.style.cssText='display:flex;gap:4px';large.className='native';
     const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=module.createHeadRenderer3d(canvas),mesh=module.buildHeadMesh3d(a,colors,{identitySeed:p.id,headOnly:true});
     for(const angle of[0,Math.PI/4,Math.PI/2]){
      renderer.draw(mesh,a,colors,angle,{clay});const image=document.createElement('img');image.src=canvas.toDataURL();if(p.appearance.hairstyle==='shaved')controlFrames.push(image.src);image.width=240;image.height=300;large.append(image);
      const ordinary=document.createElement('canvas');ordinary.width=96;ordinary.height=120;ordinary.getContext('2d').drawImage(canvas,0,0,96,120);const thumbnail=document.createElement('img');thumbnail.src=ordinary.toDataURL();thumbnail.width=96;thumbnail.height=120;small.append(thumbnail);
     }
     if(mesh.vertices.some(v=>!Number.isFinite(v))||mesh.vertices.length/10>65535)throw Error('Invalid bounded mesh');
     meshes.push({state,clay,vertices:mesh.vertices.length/10,triangles:mesh.triangles});renderer.dispose();block.append(small,large);section.append(block);
    }
   }
   let modernNonScalpComparisons=0;
   if(p.id==='no-scalp-bearded-control'){
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=after.createHeadRenderer3d(canvas);
    for(const position of [0,.9999,1.0001,1.9999,2.0001,3]){
     const a={...p.appearance,hairTexturePosition:position},mesh=after.buildHeadMesh3d(a,colors,{identitySeed:p.id,headOnly:true});
     if(mesh.vertices.some(v=>!Number.isFinite(v))||mesh.vertices.length/10>65535)throw Error('Invalid current scalp-free mesh');
     for(const [i,angle]of [0,Math.PI/4,Math.PI/2].entries()){
      renderer.draw(mesh,a,colors,angle);if(canvas.toDataURL()!==controlFrames[i+3])throw Error('Current scalp texture contaminated non-scalp pixels');modernNonScalpComparisons++;
     }
    }
    renderer.dispose();
   }
   const nonScalpControl=controlFrames.length?{
    scope:p.appearance.fineFaceVersion==='fine-face-v1'?'modern sculpt historical comparison':'immutable continuous-hair before/after legacy non-scalp pixels',
    changedViews:controlFrames.slice(0,3).filter((src,i)=>src!==controlFrames[i+3]).length
   }:null;
   if(nonScalpControl&&p.appearance.fineFaceVersion!=='fine-face-v1'&&nonScalpControl.changedViews)throw Error('Legacy non-scalp compiled shader changed pixels');
   if(JSON.stringify(p)!==original)throw Error('Saved player mutated');root.append(section);observations.push({id:p.id,inputUnchanged:true,meshes,nonScalpControl,modernNonScalpComparisons});
  }
  document.body.replaceChildren(root);const style=document.createElement('style');style.textContent='@media(max-width:430px){.native{display:none!important}}';document.head.append(style);return{observations};
 },players);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<players.length;i++)await page.locator('#scalp-person-'+i).screenshot({path:`output/playwright/continuous-hair-candidate-gallery-${i}-${size}-${theme}.png`});
 }
 await fs.writeFile('output/playwright/continuous-hair-candidate-gallery-observations.json',JSON.stringify(result,null,2));
});
