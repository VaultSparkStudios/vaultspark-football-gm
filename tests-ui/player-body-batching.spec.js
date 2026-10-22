import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {createPlayScenario} from './helpers/weekly-scenarios.js';
test('current batched draws retain exact rendered pixels, saved head, palette and skeleton versus unmerged draws',async({page})=>{
 test.setTimeout(180000);
 // Compare only the optimization: both lanes use today's geometry/materials.
 // The historical source comparison remains in player-body-batching.test.js.
 // This lane disables exactly the adjacent-range merge, preserving every draw.
 await page.route('**/lib/batch-before/*.js',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  if(!/^[a-zA-Z0-9]+\.js$/.test(name))return route.abort();
  let body=await fs.readFile(`public/lib/${name}`,'utf8');
  if(name==='playerBody3d.js'){
   const merge='if(previous&&previous.material===material&&previous.leg===leg&&previous.torso===torso&&previous.firstIndex+previous.indexCount===firstIndex)';
   expect(body.split(merge)).toHaveLength(2);body=body.replace(merge,'if(false)');
  }
  return route.fulfill({body,contentType:'text/javascript'});
 });
 await createPlayScenario(page);const roster=(await(await page.request.get('/api/roster?team=BUF')).json()).roster;let player;
 for(const row of roster){const p=(await(await page.request.get('/api/player?playerId='+row.id)).json()).profile.player;if(p.position==='OL'){player=p;break;}}expect(player).toBeTruthy();
 const observations=await page.evaluate(async player=>{
  const before=await import('/lib/batch-before/playerCharacter3d.js'),after=await import('/lib/playerCharacter3d.js'),models=[before.createPlayerCharacterModel(player),after.createPlayerCharacterModel(player)];
  document.body.innerHTML='<main id="comparison" style="display:flex;gap:16px;padding:16px;background:#13232a;color:#e8eded"><section><h2>Previous draws</h2><canvas></canvas></section><section><h2>Batched draws</h2><canvas></canvas></section></main>';
  const canvases=[...document.querySelectorAll('canvas')];canvases.forEach(c=>{c.width=512;c.height=992;c.style.cssText='width:240px;height:465px;display:block;background:#13232a';});
  const views=[before.createPlayerCharacterView(canvases[0],models[0]),after.createPlayerCharacterView(canvases[1],models[1])];
  const drawCounts=[0,0];canvases.forEach((c,i)=>{const gl=c.getContext('webgl'),draw=gl.drawElements.bind(gl);gl.drawElements=(...args)=>{drawCounts[i]++;return draw(...args);};});let comparisons=0;window.drawMatched=({mode,phase,angle})=>{const states=views.map(v=>v.draw({mode,phase,angle,viewBox:[0,0,320,620],floor:570}));if(JSON.stringify(states[0].pose)!==JSON.stringify(states[1].pose))throw Error('Measured pose changed');const pixels=canvases.map(c=>{const gl=c.getContext('webgl'),p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;});for(let i=0;i<pixels[0].length;i++)if(pixels[0][i]!==pixels[1][i])throw Error('Rendered pixel changed at '+i+' in '+mode);comparisons++;};
  if(JSON.stringify(models[0].head)!==JSON.stringify(models[1].head))throw Error('Complete saved head changed');if(JSON.stringify(models[0].colors)!==JSON.stringify(models[1].colors))throw Error('Palette changed');
  window.measureSweep=()=>{
   const updates=[[],[]];models.forEach((m,index)=>{const update=m.update.bind(m);m.update=options=>{const start=performance.now(),state=update(options);updates[index].push(performance.now()-start);return state;};});const blocks=[];for(let block=0;block<3;block++){const samples=[[],[]];for(let i=0;i<72;i++)for(const index of (i%2?[1,0]:[0,1])){const t=performance.now();views[index].draw({mode:['run','acceleration','cut','jump','strength','endurance'][i%6],phase:i/71,angle:Math.PI/2});canvases[index].getContext('webgl').finish();if(i>=12)samples[index].push(performance.now()-t);}
    blocks.push(samples.map(a=>{a.sort((x,y)=>x-y);return{samples:a.length,medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)};}));}
   const calls=[0,1].map(index=>{drawCounts[index]=0;views[index].draw({mode:'run',phase:.4,angle:Math.PI/2});return drawCounts[index];});
   const updateTiming=updates.map(samples=>{samples.sort((a,b)=>a-b);return{samples:samples.length,medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1)};});return{blocks,updateTiming,drawCallsBefore:calls[0],drawCallsAfter:calls[1],exactPixelComparisons:comparisons,hardware:'local headless Chromium; alternating contexts, no physical mobile claim',gpuCompletionSynchronized:true,includesCpuAndDriverOverhead:true};
  };
  window.disposeMatched=()=>{views.forEach(v=>v.dispose());models.forEach(m=>m.dispose());return[before.characterRendererDiagnostics(),after.characterRendererDiagnostics()];};
  return{sameSavedCompleteHead:true,samePalette:true,playerId:player.id};
 },player);
 const cases=[['front','neutral',0,0],['side','neutral',0,Math.PI/2],['cut','cut',.4,0],['strength','strength',.4,Math.PI/2],['run','run',.4,Math.PI/2],['jump','jump',.4,Math.PI/2]],captures=[];await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(({size,theme})=>{const root=document.querySelector('#comparison');root.style.background=theme==='dark'?'#13232a':'#e3eeea';root.style.color=theme==='dark'?'#e8eded':'#152c31';document.querySelectorAll('canvas').forEach(c=>{c.style.width=size==='mobile'?'164px':'240px';c.style.height=size==='mobile'?'318px':'465px';});}, {size,theme});
  for(const[label,mode,phase,angle]of cases){await page.evaluate(options=>window.drawMatched(options),{mode,phase,angle});const path=`output/playwright/body-batch-${size}-${theme}-${label}.png`;await page.locator('#comparison').screenshot({path});captures.push({path,sha256:crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex'),viewport:{width,height},theme});}
 }
 const timing=await page.evaluate(()=>window.measureSweep());expect(timing.blocks).toHaveLength(3);expect(timing.drawCallsAfter).toBeLessThan(timing.drawCallsBefore);expect(timing.exactPixelComparisons).toBe(24);const disposed=await page.evaluate(()=>window.disposeMatched());expect(disposed).toEqual([{activeModels:0,activeViews:0},{activeModels:0,activeViews:0}]);
 await fs.mkdir('.cache/contours',{recursive:true});await fs.writeFile('.cache/contours/batch-paired-browser.json',JSON.stringify({...observations,cases:cases.length,captures,timing,disposed,fullVisualAcceptance:false,wholeUnionMassVerified:false},null,2)+'\n');
});
