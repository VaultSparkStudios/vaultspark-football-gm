import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
test('historical shoulders preserve head and pose; current character preserves saved measurements and identity',async({page})=>{
 test.setTimeout(180000);const baseline=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_EXTREMITIES_2026-10-08.json','utf8'));
 const historicalAfter=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_SHOULDER_CONTOUR_2026-10-08.json','utf8'));
 for(const [label,authority]of [['before',baseline],['after',historicalAfter]])await page.route(`**/lib/shoulders-${label}/*.js`,async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),row=authority.frozenSources.find(s=>s.original===`public/lib/${name}`);
  if(!row)return route.abort();
  const body=await fs.readFile('docs/visual-qa/'+row.file);expect(crypto.createHash('sha256').update(body).digest('hex')).toBe(row.sha256);
  return route.fulfill({body,contentType:'text/javascript'});
 });
 await createPlayScenario(page);const roster=(await(await page.request.get('/api/roster?team=BUF')).json()).roster;let player;
 for(const row of roster){const p=(await(await page.request.get('/api/player?playerId='+row.id)).json()).profile.player;if(p.position==='OL'){player=p;break;}}expect(player).toBeTruthy();
 const observations=await page.evaluate(async player=>{
  const before=await import('/lib/shoulders-before/playerCharacter3d.js'),after=await import('/lib/shoulders-after/playerCharacter3d.js');
  const current=await import('/lib/playerCharacter3d.js'),{buildHeadMesh3d}=await import('/lib/playerHead3d.js');
  const {appearanceSkinColor,appearanceHairColors,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  const input=JSON.stringify(player),model=current.createPlayerCharacterModel(player),hair=appearanceHairColors(player.appearance,player.age),skin=appearanceSkinColor(player.appearance);
  const expectedColors={skin,scalp:hair.scalp,brow:hair.brow,beard:hair.face,grayShare:hair.grayShare,iris:player.appearance.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
  if(JSON.stringify(model.head)!==JSON.stringify(buildHeadMesh3d(player.appearance,expectedColors,{headOnly:true,identitySeed:player.id})))throw Error('Current model does not use the saved complete head');
  if(JSON.stringify(model.colors)!==JSON.stringify(expectedColors))throw Error('Current saved palette changed');
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));let currentSamples=0;
  for(const mode of ['neutral','run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.4,.7]){
   const {mesh}=model.update({mode,phase}),f=player.visualFrame;
   if(!mesh.vertices.every(Number.isFinite))throw Error('Current extremity mesh is non-finite');
   for(const [limbs,total,share]of [[mesh.pose.arms,f.armSegmentLengthInches,f.upperArmShare],[mesh.pose.legs,f.legLengthInches,f.upperLegShare]])for(const limb of limbs){
    if(Math.abs(distance(limb.root,limb.joint)-total*share)>1e-5||Math.abs(distance(limb.joint,limb.end)-total*(1-share))>1e-5)throw Error('Current saved bone dimensions changed');
   }
   currentSamples++;
  }
  if(JSON.stringify(model.person)!==input||JSON.stringify(player)!==input)throw Error('Current model mutated the saved person');
  model.dispose();if(JSON.stringify(current.characterRendererDiagnostics())!==JSON.stringify({activeModels:0,activeViews:0}))throw Error('Current model leaked');
  const models=[before.createPlayerCharacterModel(player),after.createPlayerCharacterModel(player)];
  document.body.innerHTML='<main id="comparison" style="display:flex;gap:16px;padding:16px;background:#13232a;color:#e8eded"><section><h2>Previous shoulders</h2><canvas></canvas></section><section><h2>Deltoid contours</h2><canvas></canvas></section></main>';
  const canvases=[...document.querySelectorAll('canvas')];canvases.forEach(c=>{c.width=512;c.height=992;c.style.cssText='width:240px;height:465px;display:block;background:#13232a';});
  const views=[before.createPlayerCharacterView(canvases[0],models[0]),after.createPlayerCharacterView(canvases[1],models[1])];
  let detailCanvases=null,maxPoseError=0;window.drawMatched=({mode,phase,angle})=>{canvases.forEach(c=>{c.style.display='block';});detailCanvases?.forEach(c=>{c.style.display='none';});const states=views.map(v=>v.draw({mode,phase,angle,viewBox:[0,0,320,620],floor:570}));if(JSON.stringify(states[0].pose)!==JSON.stringify(states[1].pose))throw Error('Measured pose changed');maxPoseError=0;};
  if(JSON.stringify(models[0].head)!==JSON.stringify(models[1].head))throw Error('Complete saved head changed');if(JSON.stringify(models[0].colors)!==JSON.stringify(models[1].colors))throw Error('Palette changed');
  window.drawDetail=(kind)=>{const state=models[1].update(),pose=state.mesh.pose,f=models[1].person.visualFrame;let angle,box;if(kind==='shoulder'){angle=0;const arm=pose.arms[0],center=arm.root;box=[160+center[0]*6-55,570-center[1]*6-75,110,213];}else{angle=Math.PI/2;const center=pose.shoulder;box=[160+center[2]*6-60,570-center[1]*6-75,120,233];}if(!detailCanvases)detailCanvases=canvases.map(c=>{const d=document.createElement('canvas');d.width=512;d.height=992;c.parentElement.append(d);return d;});
   canvases.forEach((c,i)=>{c.width=1536;c.height=2976;views[i].draw({angle,viewBox:[0,0,320,620],floor:570});const d=detailCanvases[i];d.style.cssText=c.style.cssText;d.style.display='block';const ctx=d.getContext('2d');ctx.fillStyle='#13232a';ctx.fillRect(0,0,d.width,d.height);ctx.drawImage(c,box[0]/320*c.width,box[1]/620*c.height,box[2]/320*c.width,box[3]/620*c.height,0,0,d.width,d.height);c.style.display='none';c.width=512;c.height=992;});};
  window.measureSweep=()=>{const samples=[],c=canvases[1],gl=c.getContext('webgl');for(let i=0;i<72;i++){const t=performance.now();views[1].draw({mode:['run','acceleration','cut','jump','strength','endurance'][i%6],phase:i/71,angle:Math.PI/2});gl.finish();if(i>=12)samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);return{samples:samples.length,medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1),hardware:'local headless Chromium; emulated viewport, no physical mobile claim',gpuCompletionSynchronized:true,includesCpuAndDriverOverhead:true};};
  window.disposeMatched=()=>{views.forEach(v=>v.dispose());models.forEach(m=>m.dispose());return[before.characterRendererDiagnostics(),after.characterRendererDiagnostics()];};
  return{sameSavedCompleteHead:true,samePalette:true,playerId:player.id,currentSavedHeadPaletteSkeletonSamples:currentSamples};
 },player);
 const cases=[['front','neutral',0,0],['side','neutral',0,Math.PI/2],['cut','cut',.4,0],['strength','strength',.4,Math.PI/2],['run','run',.4,Math.PI/2],['jump','jump',.4,Math.PI/2]],captures=[];await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(({size,theme})=>{const root=document.querySelector('#comparison');root.style.background=theme==='dark'?'#13232a':'#e3eeea';root.style.color=theme==='dark'?'#e8eded':'#152c31';document.querySelectorAll('canvas').forEach(c=>{c.style.width=size==='mobile'?'164px':'240px';c.style.height=size==='mobile'?'318px':'465px';});}, {size,theme});
  for(const[label,mode,phase,angle]of cases){await page.evaluate(options=>window.drawMatched(options),{mode,phase,angle});const path=`output/playwright/shoulders-${size}-${theme}-${label}.png`;await page.locator('#comparison').screenshot({path});captures.push({path,sha256:crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex'),viewport:{width,height},theme});}
  for(const kind of['shoulder','profile']){await page.evaluate(kind=>window.drawDetail(kind),kind);const path=`output/playwright/shoulders-${size}-${theme}-${kind}-detail.png`;await page.locator('#comparison').screenshot({path});captures.push({path,sha256:crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex'),viewport:{width,height},theme,inspectionScale:true});}
 }
 const timing=await page.evaluate(()=>window.measureSweep());expect(timing.samples).toBe(60);const disposed=await page.evaluate(()=>window.disposeMatched());expect(disposed).toEqual([{activeModels:0,activeViews:0},{activeModels:0,activeViews:0}]);
 await fs.mkdir('.cache/contours',{recursive:true});await fs.writeFile('.cache/contours/shoulders-paired-browser.json',JSON.stringify({...observations,cases:cases.length,captures,timing,disposed,fullVisualAcceptance:false,wholeUnionMassVerified:false},null,2)+'\n');
});
