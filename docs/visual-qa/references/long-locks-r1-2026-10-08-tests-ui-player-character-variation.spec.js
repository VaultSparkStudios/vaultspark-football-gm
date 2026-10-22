import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
import {playerFrame} from '../src/domain/playerIdentity.js';
const styles=['buzz','fade','crew','short-curls','coils','locs','braids','waves','side-part','swept','long','shaved','receding','afro'];
test('current shared character visibly projects hair, pigments, face, measurements and capacities',async({page})=>{
 test.setTimeout(360000);await createPlayScenario(page);
 const roster=(await(await page.request.get('/api/roster?team=BUF')).json()).roster,base=(await(await page.request.get('/api/player?playerId='+roster[0].id)).json()).profile.player;
 const appearance={...base.appearance,hairstyle:'crew',hairDensity:.85,hairline:.3,facialHair:'clean'},control={...base,appearance};
 const changeAppearance=(name,changes)=>({name,player:{...structuredClone(control),appearance:{...appearance,...changes}}});
 const changeBody=(name,changes)=>{const p={...structuredClone(control),...changes};p.visualFrame=playerFrame(p);return{name,player:p};};
 const groups=[
  ['hair',styles.map(hairstyle=>changeAppearance(hairstyle,{hairstyle}))],
  ['texture',[0,1,2,3].map(hairTexturePosition=>changeAppearance(['straight','wavy','curly','coily'][hairTexturePosition],{hairstyle:'long',hairTextureVersion:'continuous-hair-texture-v1',hairTexturePosition}))],
  ['pigment',[changeAppearance('Light skin',{complexion:.05}),changeAppearance('Deep skin',{complexion:.95}),changeAppearance('Cool undertone',{skinUndertone:-1}),changeAppearance('Warm undertone',{skinUndertone:1}),changeAppearance('Natural blond',{hairColor:'#bda26d',naturalHairColor:'#bda26d'}),changeAppearance('Natural red',{hairColor:'#8a4030',naturalHairColor:'#8a4030'}),changeAppearance('Scalp dye',{dyedHairColor:'#496cb0'})]],
  ['iris',[['Brown','#624329'],['Blue','#68889c'],['Green','#66804b'],['Hazel','#96764a']].map(([name,eyeColor])=>changeAppearance(name,{eyeColor}))],
  ['face',[changeAppearance('Narrow jaw',{jawWidth:.80,chinWidth:.80}),changeAppearance('Broad jaw',{jawWidth:1.16,chinWidth:1.20}),changeAppearance('Narrow face',{faceWidth:.88}),changeAppearance('Broad face',{faceWidth:1.10})]],
  ['body',[changeBody('74 in / 180 lb',{heightInches:74,weightLbs:180}),changeBody('74 in / 330 lb',{heightInches:74,weightLbs:330}),changeBody('64 in / 225 lb',{heightInches:64,weightLbs:225}),changeBody('84 in / 225 lb',{heightInches:84,weightLbs:225}),changeBody('Same size / frame A',{heightInches:74,weightLbs:225,profile:{...control.profile,skeletonRecipe:{...control.profile.skeletonRecipe,seed:'current-frame-a'},individualAnatomyRecipe:{version:'individual-anatomy-v1',seed:'current-frame-a'}}}),changeBody('Same size / frame B',{heightInches:74,weightLbs:225,profile:{...control.profile,skeletonRecipe:{...control.profile.skeletonRecipe,seed:'current-frame-b'},individualAnatomyRecipe:{version:'individual-anatomy-v1',seed:'current-frame-b'}}})]],
  ['capacity',[45,95].map(rating=>({name:rating+' capacities',mode:'run',phase:.37,player:{...structuredClone(control),ratings:{...control.ratings,speed:rating,acceleration:rating,agility:rating,jumping:rating,strength:rating,stamina:rating}}}))]
 ];
 const saved=structuredClone(groups),observations=await page.evaluate(async({groups,control})=>{
  const {createPlayerCharacterModel,createPlayerCharacterView,characterRendererDiagnostics}=await import('/lib/playerCharacter3d.js'),{createHeadRenderer3d}=await import('/lib/playerHead3d.js');
  const root=document.createElement('main');root.id='currentVariationGallery';root.style.cssText='padding:16px;max-width:1280px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  const reports=[],signature=canvas=>{const gl=canvas.getContext('webgl'),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.finish();gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let h=2166136261;for(const v of pixels)h=Math.imul(h^v,16777619);return(h>>>0).toString(16);};
  for(const [group,rows]of groups){
   const section=document.createElement('section');section.dataset.group=group;section.innerHTML=`<h2>${group}</h2>`;const grid=document.createElement('div');grid.className='variation-grid';grid.style.cssText='display:grid;gap:12px';section.append(grid);root.append(section);
   for(const row of rows){
    const before=JSON.stringify(row.player),model=createPlayerCharacterModel(row.player),headCanvas=document.createElement('canvas'),bodyCanvas=document.createElement('canvas');headCanvas.width=headCanvas.height=512;bodyCanvas.width=320;bodyCanvas.height=620;
    const head=createHeadRenderer3d(headCanvas,{transparent:true}),body=createPlayerCharacterView(bodyCanvas,model),card=document.createElement('article');card.dataset.case=row.name;card.innerHTML=`<h3>${row.name}</h3>`;
    const images=document.createElement('div');images.style.cssText='display:flex;align-items:start;background:#13232a';card.append(images);grid.append(card);
    const pixels={};try{
     for(const [label,angle]of [['front',0],['profile',Math.PI/2]]){
      head.draw(model.head,model.person.appearance,model.colors,angle);pixels[label]=signature(headCanvas);const img=document.createElement('img');img.src=headCanvas.toDataURL();img.alt=row.name+' '+label+' head';img.style.cssText='width:32%;height:auto';images.append(img);
     }
     body.draw({mode:row.mode||'neutral',phase:row.phase||0});pixels.body=signature(bodyCanvas);const img=document.createElement('img');img.src=bodyCanvas.toDataURL();img.alt=row.name+' full body';img.style.cssText='width:36%;height:auto';images.append(img);
     reports.push({group,name:row.name,pixels,frame:model.person.visualFrame,ratings:model.person.ratings,colors:model.colors,sameSavedPerson:JSON.stringify(row.player)===before});
    }finally{body.dispose();head.dispose();model.dispose();}
   }
  }
  document.body.replaceChildren(root);await Promise.all([...root.querySelectorAll('img')].map(i=>i.decode()));return{reports,diagnostics:characterRendererDiagnostics(),sameControl:JSON.stringify(control)};
 },{groups,control});
 expect(groups).toEqual(saved);expect(observations.diagnostics).toEqual({activeModels:0,activeViews:0});expect(observations.reports.every(r=>r.sameSavedPerson)).toBe(true);
 for(const group of ['hair','texture','iris','face','body','capacity']){const rows=observations.reports.filter(r=>r.group===group),channel=group==='body'||group==='capacity'?'body':'front';expect(new Set(rows.map(r=>r.pixels[channel])).size,group+' visual projections').toBe(rows.length);}
 const capacities=observations.reports.filter(r=>r.group==='capacity');expect(capacities[0].frame).toEqual(capacities[1].frame);expect(capacities[0].pixels.front).toEqual(capacities[1].pixels.front);
 const frames=observations.reports.filter(r=>r.group==='body');expect(frames[4].frame.heightInches).toEqual(frames[5].frame.heightInches);expect(frames[4].frame.weightLbs).toEqual(frames[5].frame.weightLbs);expect(frames[4].pixels.front).toEqual(frames[5].pixels.front);
 await fs.mkdir('output/playwright',{recursive:true});const captures=[];
 for(const[size,width,height]of [['desktop',1440,1000],['mobile',390,844]])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async({size,theme})=>{(await import('/lib/themeCustomizer.js')).applyTheme(theme);document.querySelectorAll('.variation-grid').forEach(g=>g.style.gridTemplateColumns=`repeat(${size==='desktop'?3:1},minmax(0,1fr))`);},{size,theme});
  for(const[group]of groups){const file=`output/playwright/current-variation-${group}-${size}-${theme}.png`;await page.locator(`section[data-group="${group}"]`).screenshot({path:file});captures.push({file,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),size,theme});}
 }
 await fs.writeFile('output/playwright/current-character-variation.json',JSON.stringify({kind:'controlled-current-shared-character-channel-gallery',observations,captures,limits:['Deliberate comparison fixtures, not population-frequency observations.','Pixel variation does not by itself establish visual naturalism or full channel coverage.','Frame volume/density remain artistic; no full rendered mass or performance certification.','Capacity group checks one run phase; complete six-mode behavior has separate acceptance.'],fullVisualAcceptance:false},null,2)+'\n');
});
