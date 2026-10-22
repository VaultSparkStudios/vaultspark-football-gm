import{test,expect}from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
test('saved face and iris controls produce coherent front/profile rasters at display and inspection sizes',async({page})=>{
 await page.route('**/player-head-3d.mjs',route=>route.fulfill({path:'prototypes/playerHead3d.mjs',contentType:'text/javascript'}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');await page.emulateMedia({reducedMotion:'reduce'});
 const report=await page.evaluate(async()=>{
  const{buildHeadMesh3d,createHeadRenderer3d}=await import('/player-head-3d.mjs');
  const base={seed:'controlled-face',hairstyle:'shaved',facialHair:'clean',faceLength:1,eyeAperture:1,eyeTilt:0,eyelidCrease:.6,browWeight:1,browArch:1,browAngle:0,lipCurve:0,facialAsymmetry:0,chinProjection:0,foreheadSlope:0,irisShade:0,irisInnerMix:.2,irisPattern:.5};
  const colors={skin:'#b18468',scalp:'#38241a',brow:'#38241a',beard:'#38241a',iris:'#648575',mouth:'#98604f'};
  const groups={geometry:{faceLength:[.92,1.09],eyeTilt:[-2,2],eyelidCrease:[.2,1],browArch:[.7,1.35],browAngle:[-2,2],lipCurve:[-1,1],facialAsymmetry:[-1,1],chinProjection:[-.7,.7],foreheadSlope:[-.7,.7]},material:{browWeight:[.75,1.35],irisShade:[-.25,.25],irisInnerMix:[0,.65],irisPattern:[.1,1],freckles:[false,true],mole:[null,{x:182,y:175}]}};
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=createHeadRenderer3d(canvas);
  const displayed=document.createElement('canvas');displayed.width=96;displayed.height=120;const context=displayed.getContext('2d',{willReadFrequently:true});
  const root=document.createElement('main');root.style.cssText='max-width:1240px;margin:auto;padding:18px;color:var(--ink-strong);background:var(--surface);font-family:system-ui';
  root.innerHTML='<h1>Saved facial controls</h1><p>One anatomical person; matched minimum/maximum saved controls. Front/profile use one mesh. 96px displayed pixels and 240px inspection pixels measured separately. Prototype; full naturalism remains open.</p>';
  const report={comparisons:[],groups:{},inputUnchanged:true};
  const changed=(left,right)=>{let count=0;for(let k=0;k<left.length;k+=4)if(left[k]!==right[k]||left[k+1]!==right[k+1]||left[k+2]!==right[k+2])count++;return count;};
  for(const[group,controls]of Object.entries(groups)){
   const section=document.createElement('section');section.id=`face-${group}`;section.style.cssText='padding:16px;background:var(--surface)';section.innerHTML=`<h2>${group}</h2>`;
   const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(216px,1fr));gap:16px';
   report.groups[group]=[];
   for(const[key,limits]of Object.entries(controls)){
    const results=[];
    for(const v of limits){
     const a={...base,[key]:v},before=JSON.stringify(a),mesh=buildHeadMesh3d(a,colors),original=new Float32Array(mesh.vertices);
     const native=[],ordinary=[],card=document.createElement('article');card.innerHTML=`<h3>${key} ${v===null?'none':typeof v==='object'?'present':v}</h3>`;
     const pair=document.createElement('div');pair.style.cssText='display:flex;gap:4px';
     for(const angle of[0,Math.PI/2]){
      renderer.draw(mesh,a,colors,angle);native.push(renderer.readPixels());context.clearRect(0,0,96,120);context.drawImage(canvas,0,0,96,120);ordinary.push(context.getImageData(0,0,96,120).data);
      const image=document.createElement('img');image.src=displayed.toDataURL();image.alt=`${key} ${angle===0?'front':'profile'}`;image.style.cssText='width:96px;height:120px';pair.append(image);
     }
     if(before!==JSON.stringify(a)||mesh.vertices.some((v,i)=>v!==original[i]))throw Error('Rendering changed saved anatomy');
     renderer.draw(mesh,a,colors,0,{blink:1});renderer.draw(mesh,a,colors,0);
     if(renderer.readPixels().some((v,i)=>v!==native[0][i]))throw Error('Blink did not exactly restore facial controls');
     results.push({native,ordinary});card.append(pair);grid.append(card);
    }
    const counts={group,key,display:{width:96,height:120,front:changed(results[0].ordinary[0],results[1].ordinary[0]),profile:changed(results[0].ordinary[1],results[1].ordinary[1])},inspection:{width:240,height:300,front:changed(results[0].native[0],results[1].native[0]),profile:changed(results[0].native[1],results[1].native[1])}};
    if(counts.inspection.front+counts.inspection.profile<1)throw Error('No native response '+key);
    if(counts.display.front+counts.display.profile<1)throw Error('No displayed response '+key);
    report.comparisons.push(counts);report.groups[group].push(key);
   }
   section.append(grid);root.append(section);
  }
  renderer.dispose();document.body.replaceChildren(root);return report;
 });
 expect(report.comparisons).toHaveLength(15);expect(report.inputUnchanged).toBe(true);
 const captures=[];
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
  for(const group of Object.keys(report.groups)){
   const file=`output/playwright/head-face-${group}-${size}-${theme}.png`;await page.locator(`#face-${group}`).screenshot({path:file});
   captures.push({file,group,viewport:{width,height},theme,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
  }
 }
 await fs.writeFile('output/playwright/head-face.json',JSON.stringify({scope:'Unadopted saved-face controls; nonzero pixel response is not perceptual recognition or craft acceptance',...report,captures},null,2));
});
