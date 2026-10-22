import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
test('rooted scalp hair: shared front, oblique and profile at ordinary size',async({page})=>{
 const fixtures=JSON.parse(await fs.readFile('docs/visual-qa/references/production-head-anatomy-fixtures-2026-10-08.json','utf8'));
 const choices=[['side-part','straight'],['side-part','wavy'],['side-part','curly'],['side-part','coily'],['long','straight'],['long','curly'],['buzz','straight'],['fade','coily'],['afro','coily'],['short-curls','curly'],['locs','coily'],['braids','coily'],['side-part','curly'],['long','wavy']];
 const players=choices.map(([hairstyle,hairTexture],index)=>{const person=fixtures.players[index<12?0:index===12?2:4];return{...person,id:'matched-scalp-'+index,appearance:{...person.appearance,hairstyle,hairTexture,facialHair:'clean'}};});
 players.push({...fixtures.players[0],id:'no-scalp-bearded-control',appearance:{...fixtures.players[0].appearance,hairstyle:'shaved',facialHair:'full-beard'}});
 const modernControl=players.at(-1);
 players.push({...modernControl,id:'legacy-no-scalp-bearded-control',appearance:{...modernControl.appearance,fineFaceVersion:undefined}});
 await page.route('**/lib/scalp-candidate.mjs',r=>r.fulfill({path:'public/lib/playerHead3d.js',contentType:'text/javascript'}));
 const authority=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_SCALP_PRODUCTION_2026-10-08.json','utf8'));
 // Compile the original isolated hair comparison with its own frozen shader.
 await page.route('**/lib/scalp-historical/*.js',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),row=authority.sources.find(s=>s.original===`public/lib/${name}`);
  if(!row)return route.abort();const body=await fs.readFile('docs/visual-qa/'+row.file);
  expect(crypto.createHash('sha256').update(body).digest('hex')).toBe(row.sha256);
  return route.fulfill({body,contentType:'text/javascript'});
 });
 await page.route('**/lib/scalp-before.mjs',async route=>{
  const body=await fs.readFile('docs/visual-qa/references/production-scalp-before-2026-10-08.js','utf8');
  return route.fulfill({body:body.replace("'./playerSurfaceLighting.js'","'/lib/scalp-historical/playerSurfaceLighting.js'"),contentType:'text/javascript'});
 });
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const result=await page.evaluate(async players=>{
  const before=await import('/lib/scalp-before.mjs'),after=await import('/lib/scalp-candidate.mjs'),historicalAfter=await import('/lib/scalp-historical/playerHead3d.js');
  const {appearanceSkinColor,appearanceHairColors,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  const root=document.createElement('main');root.style.cssText='max-width:1200px;margin:auto;padding:12px;color:var(--ink-strong);background:var(--panel)';
  root.innerHTML='<h1>Rooted scalp hair</h1><p>Same saved person; historical hair baseline / current candidate. The separate legacy control compares immutable hair-only authorities. 96×120 ordinary portraits, 240×300 inspection. Front, three-quarter and profile.</p>';
  const observations=[];
  for(const[index,p] of players.entries()){
   const original=JSON.stringify(p),hair=appearanceHairColors(p.appearance,26),skin=appearanceSkinColor(p.appearance),colors={skin,scalp:hair.scalp,beard:hair.face,brow:hair.brow,grayShare:hair.grayShare,iris:p.appearance.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
   const section=document.createElement('section');section.id='scalp-person-'+index;section.style.cssText='margin:16px 0';section.innerHTML='<h2>Saved fixture '+p.id+'</h2>';
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
   let currentScalpFreeComparisons=0;
   if(p.id==='no-scalp-bearded-control'){
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=after.createHeadRenderer3d(canvas);
    for(const change of [{hairPart:.1,hairLength:.5,hairDensity:0},{hairPart:.9,hairLength:2,hairDensity:1}]){
     const a={...p.appearance,...change},mesh=after.buildHeadMesh3d(a,colors,{identitySeed:p.id,headOnly:true});
     if(mesh.vertices.some(v=>!Number.isFinite(v))||mesh.vertices.length/10>65535)throw Error('Invalid current scalp-free mesh');
     for(const [i,angle]of [0,Math.PI/4,Math.PI/2].entries()){
      renderer.draw(mesh,a,colors,angle);if(canvas.toDataURL()!==controlFrames[i+3])throw Error('Current scalp grooming contaminated non-scalp pixels');currentScalpFreeComparisons++;
     }
    }renderer.dispose();
   }
   const historicalChangedViews=controlFrames.length?controlFrames.slice(0,3).filter((src,i)=>src!==controlFrames[i+3]).length:null;
   if(p.id==='legacy-no-scalp-bearded-control'&&historicalChangedViews)throw Error('Immutable hair-only change altered legacy non-scalp pixels');
   if(JSON.stringify(p)!==original)throw Error('Saved player mutated');root.append(section);observations.push({id:p.id,inputUnchanged:true,meshes,currentScalpFreeComparisons,historicalChangedViews,comparisonScope:p.id==='legacy-no-scalp-bearded-control'?'immutable hair-only before/after':'historical baseline against current sculpt'});
  }
  document.body.replaceChildren(root);const style=document.createElement('style');style.textContent='@media(max-width:430px){.native{display:none!important}}';document.head.append(style);return{observations};
 },players);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<players.length;i++)await page.locator('#scalp-person-'+i).screenshot({path:`output/playwright/scalp-gallery-${i}-${size}-${theme}.png`});
 }
 await fs.writeFile('output/playwright/scalp-gallery-observations.json',JSON.stringify(result,null,2));
});
