import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
test('modern skull poles: matched saved people',async({page})=>{
 const fixtures=JSON.parse(await fs.readFile('docs/visual-qa/references/production-head-anatomy-fixtures-2026-10-08.json','utf8'));
 const styles=['clean','full-beard'];
 const players=Array.from({length:6},(_,index)=>{const person=fixtures.players[[0,2,4][Math.floor(index/2)]];return{...person,id:person.id,appearance:{...person.appearance,hairstyle:index%2?['side-part','swept','afro'][Math.floor(index/2)]:'shaved',facialPigmentVersion:'facial-pigment-v1',naturalFacialHairColor:['#19191b','#713629','#a58a55'][Math.floor(index/2)],facialHair:styles[index%2]}};});
 players.push({...fixtures.players[0],id:'legacy-face-control',appearance:{...fixtures.players[0].appearance,fineFaceVersion:undefined,hairstyle:'shaved',facialHair:'clean'}});
 await page.route('**/lib/scalp-candidate.mjs',r=>r.fulfill({path:'public/lib/playerHead3d.js',contentType:'text/javascript'}));
 const authority=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_HEAD_POLE_REPAIR_2026-10-08.json','utf8'));
 await page.route('**/lib/pole-historical/*.js',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),row=authority.frozenSources.find(s=>s.original===`public/lib/${name}`);
  if(!row)return route.abort();const body=await fs.readFile('docs/visual-qa/'+row.file);
  expect(crypto.createHash('sha256').update(body).digest('hex')).toBe(row.sha256);
  return route.fulfill({body,contentType:'text/javascript'});
 });
 await page.route('**/lib/scalp-before.mjs',async route=>{
  const body=await fs.readFile('docs/visual-qa/references/player-head-before-pole-repair-2026-10-08.js','utf8');
  return route.fulfill({body:body.replace("'./playerSurfaceLighting.js'","'/lib/pole-historical/playerSurfaceLighting.js'"),contentType:'text/javascript'});
 });
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const result=await page.evaluate(async players=>{
  const before=await import('/lib/scalp-before.mjs'),after=await import('/lib/scalp-candidate.mjs'),historicalAfter=await import('/lib/pole-historical/playerHead3d.js');
  const {appearanceSkinColor,appearanceHairColors,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  const root=document.createElement('main');root.style.cssText='max-width:1200px;margin:auto;padding:12px;color:var(--ink-strong);background:var(--panel)';
  root.innerHTML='<h1>Modern skull poles</h1><p>Matched saved people; before / candidate. 96×120 ordinary portraits, 240×300 inspection. Front, three-quarter, profile and rear.</p>';
  const observations=[];
  for(const[index,p] of players.entries()){
   const original=JSON.stringify(p),hair=appearanceHairColors(p.appearance,26),skin=appearanceSkinColor(p.appearance),colors={skin,scalp:hair.scalp,beard:hair.face,brow:hair.brow,grayShare:hair.grayShare,iris:p.appearance.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
   const section=document.createElement('section');section.id='scalp-person-'+index;section.style.cssText='margin:16px 0';section.innerHTML='<h2>Saved fixture '+p.id+'</h2>';
   const meshes=[],controlFrames=[];
   for(const[clay,label]of[[false,'color']]){
    const a=clay?{...p.appearance,hairstyle:'shaved',facialHair:'clean'}:p.appearance;
    const versions=p.id==='legacy-face-control'?[['before',before],['historical pole repair',historicalAfter],['candidate',after]]:[['before',before],['candidate',after]];
    for(const[state,module]of versions){
     const block=document.createElement('div');block.innerHTML='<h3>'+label+' '+state+'</h3>';const small=document.createElement('div'),large=document.createElement('div');small.style.cssText=large.style.cssText='display:flex;gap:4px';large.className='native';
     const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=module.createHeadRenderer3d(canvas),mesh=module.buildHeadMesh3d(a,colors,{identitySeed:p.id,headOnly:true});
     for(const angle of[0,Math.PI/4,Math.PI/2,Math.PI]){
      renderer.draw(mesh,a,colors,angle,{clay});const image=document.createElement('img');image.src=canvas.toDataURL();if(p.id==='legacy-face-control')controlFrames.push(image.src);image.width=240;image.height=300;large.append(image);
      if(angle!==Math.PI){const ordinary=document.createElement('canvas');ordinary.width=96;ordinary.height=120;ordinary.getContext('2d').drawImage(canvas,0,0,96,120);const thumbnail=document.createElement('img');thumbnail.src=ordinary.toDataURL();thumbnail.width=96;thumbnail.height=120;small.append(thumbnail);}
     }
     for(const angle of[0,Math.PI/4,Math.PI/2]){
      renderer.draw(mesh,a,colors,angle,{blink:1});const closed=canvas.toDataURL();
      renderer.draw(mesh,a,{...colors,iris:'#ff0000'},angle,{blink:1});if(canvas.toDataURL()!==closed)throw Error('Closed eyelids expose changed iris');
      renderer.draw(mesh,a,colors,angle,{blink:0});const open=canvas.toDataURL();
      renderer.draw(mesh,a,colors,angle,{blink:.5});renderer.draw(mesh,a,colors,angle,{blink:0});if(canvas.toDataURL()!==open)throw Error('Blink failed exact open restoration: '+state+' fixture='+index+' angle='+angle);
     }
     if(mesh.vertices.some(v=>!Number.isFinite(v))||mesh.vertices.length/10>65535)throw Error('Invalid bounded mesh');
     if(state==='candidate'&&a.fineFaceVersion==='fine-face-v1')for(const row of [0,64]){
      const first=row*97*10,point=Array.from(mesh.vertices.subarray(first,first+3));
      for(let column=0;column<=96;column++){
       const at=first+column*10;
       if(mesh.vertices.subarray(at,at+3).some((v,i)=>v!==point[i]))throw Error('Current skull pole is not one point');
       const normal=mesh.vertices.subarray(at+3,at+6);if(normal[0]!==0||normal[1]!== (row===0?1:-1)||normal[2]!==0)throw Error('Current skull pole normal changed');
      }
     }
     meshes.push({state,clay,vertices:mesh.vertices.length/10,triangles:mesh.triangles});renderer.dispose();block.append(small,large);section.append(block);
    }
   }
   if(controlFrames.length&&controlFrames.slice(0,4).some((src,i)=>src!==controlFrames[i+4]))throw Error('Historical pole repair changed legacy pixels');
   if(JSON.stringify(p)!==original)throw Error('Saved player mutated');root.append(section);observations.push({id:p.id,inputUnchanged:true,closedIrisOccluded:true,blinkOpenRestored:true,meshes});
  }
  document.body.replaceChildren(root);const style=document.createElement('style');style.textContent='@media(max-width:430px){.native{display:none!important}}';document.head.append(style);return{observations};
 },players);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<players.length;i++)await page.locator('#scalp-person-'+i).screenshot({path:`output/playwright/head-poles-gallery-${i}-${size}-${theme}.png`});
 }
 await fs.writeFile('output/playwright/head-poles-gallery-observations.json',JSON.stringify(result,null,2));
});
