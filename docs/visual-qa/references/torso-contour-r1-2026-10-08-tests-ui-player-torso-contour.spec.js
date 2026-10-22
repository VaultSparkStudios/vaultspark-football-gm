import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
test('matched torso contours retain the same saved head, palette and skeleton',async({page})=>{
 test.setTimeout(180000);const baseline=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_LIMB_SWEEP_R2_2026-10-08.json','utf8'));
 await page.route('**/lib/torso-before/*.js',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1),row=baseline.frozenSources.find(s=>s.original===`public/lib/${name}`);return row?route.fulfill({path:'docs/visual-qa/'+row.file,contentType:'text/javascript'}):route.abort();});
 await createPlayScenario(page);const roster=(await(await page.request.get('/api/roster?team=BUF')).json()).roster;let player;
 for(const row of roster){const p=(await(await page.request.get('/api/player?playerId='+row.id)).json()).profile.player;if(p.position==='OL'){player=p;break;}}expect(player).toBeTruthy();
 const observations=await page.evaluate(async player=>{
  const before=await import('/lib/torso-before/playerCharacter3d.js'),after=await import('/lib/playerCharacter3d.js'),models=[before.createPlayerCharacterModel(player),after.createPlayerCharacterModel(player)];
  document.body.innerHTML='<main id="comparison" style="display:flex;gap:16px;padding:16px;background:#13232a;color:#e8eded"><section><h2>Previous torso</h2><canvas></canvas></section><section><h2>Continuous torso</h2><canvas></canvas></section></main>';
  const canvases=[...document.querySelectorAll('canvas')];canvases.forEach(c=>{c.width=512;c.height=992;c.style.cssText='width:240px;height:465px;display:block;background:#13232a';});
  const views=[before.createPlayerCharacterView(canvases[0],models[0]),after.createPlayerCharacterView(canvases[1],models[1])];
  let maxPoseError=0;window.drawMatched=({mode,phase,angle})=>{const states=views.map(v=>v.draw({mode,phase,angle,viewBox:[0,0,320,620],floor:570}));if(JSON.stringify(states[0].pose)!==JSON.stringify(states[1].pose))throw Error('Measured pose changed');maxPoseError=0;};
  if(JSON.stringify(models[0].head)!==JSON.stringify(models[1].head))throw Error('Complete saved head changed');if(JSON.stringify(models[0].colors)!==JSON.stringify(models[1].colors))throw Error('Palette changed');
  window.measureSweep=()=>{const samples=[],c=canvases[1],gl=c.getContext('webgl');for(let i=0;i<72;i++){const t=performance.now();views[1].draw({mode:['run','acceleration','cut','jump','strength','endurance'][i%6],phase:i/71,angle:Math.PI/2});gl.finish();if(i>=12)samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);return{samples:samples.length,medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1),hardware:'local headless Chromium; emulated viewport, no physical mobile claim',gpuCompletionSynchronized:true,includesCpuAndDriverOverhead:true};};
  window.disposeMatched=()=>{views.forEach(v=>v.dispose());models.forEach(m=>m.dispose());return[before.characterRendererDiagnostics(),after.characterRendererDiagnostics()];};
  return{sameSavedCompleteHead:true,samePalette:true,playerId:player.id};
 },player);
 const cases=[['front','neutral',0,0],['side','neutral',0,Math.PI/2],['cut','cut',.4,0],['strength','strength',.4,Math.PI/2],['run','run',.4,Math.PI/2],['jump','jump',.4,Math.PI/2]],captures=[];await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(({size,theme})=>{const root=document.querySelector('#comparison');root.style.background=theme==='dark'?'#13232a':'#e3eeea';root.style.color=theme==='dark'?'#e8eded':'#152c31';document.querySelectorAll('canvas').forEach(c=>{c.style.width=size==='mobile'?'164px':'240px';c.style.height=size==='mobile'?'318px':'465px';});}, {size,theme});
  for(const[label,mode,phase,angle]of cases){await page.evaluate(options=>window.drawMatched(options),{mode,phase,angle});const path=`output/playwright/torso-contour-${size}-${theme}-${label}.png`;await page.locator('#comparison').screenshot({path});captures.push({path,sha256:crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex'),viewport:{width,height},theme});}
 }
 const timing=await page.evaluate(()=>window.measureSweep());expect(timing.samples).toBe(60);const disposed=await page.evaluate(()=>window.disposeMatched());expect(disposed).toEqual([{activeModels:0,activeViews:0},{activeModels:0,activeViews:0}]);
 await fs.mkdir('.cache/contours',{recursive:true});await fs.writeFile('.cache/contours/torso-paired-browser.json',JSON.stringify({...observations,cases:cases.length,captures,timing,disposed,fullVisualAcceptance:false,wholeUnionMassVerified:false},null,2)+'\n');
});
