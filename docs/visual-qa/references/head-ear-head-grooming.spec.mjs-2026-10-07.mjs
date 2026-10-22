import{test,expect}from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
test('shared head exposes controlled scalp and facial grooming in actual browser pixels',async({page})=>{
 await page.route('**/player-head-3d.mjs',route=>route.fulfill({path:'prototypes/playerHead3d.mjs',contentType:'text/javascript'}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');await page.emulateMedia({reducedMotion:'reduce'});
 const report=await page.evaluate(async()=>{
  const{buildHeadMesh3d,createHeadRenderer3d}=await import('/player-head-3d.mjs');
  const base={seed:'controlled-person',faceWidth:1,jawWidth:1,hairstyle:'long',hairTexture:'curly',hairLength:1,hairDensity:.85,hairline:.2,hairPart:.3,hairStrandWidth:1,hairCurvature:1,hairWaveScale:1,hairStrandVariation:.25,facialHair:'clean'};
  const colors={skin:'#a47859',scalp:'#38241a',brow:'#38241a',beard:'#38241a',iris:'#624329',mouth:'#98604f'};
  const root=document.createElement('main');root.style.cssText='max-width:1240px;margin:auto;padding:18px;color:var(--ink-strong);background:var(--surface);font-family:system-ui';
  root.innerHTML='<h1>Controlled shared-head grooming</h1><p>Same anatomical person. Artistic prototype, outside production. Colors fixed; each label names the changed presentation input.</p>';
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;const renderer=createHeadRenderer3d(canvas);
  const displayed=document.createElement('canvas');displayed.width=96;displayed.height=120;const displayContext=displayed.getContext('2d',{willReadFrequently:true});
  const groups={styles:['buzz','fade','crew','short-curls','coils','locs','braids','waves','side-part','swept','long','shaved','receding','afro'].map(hairstyle=>({label:hairstyle,a:{...base,hairstyle}})),
   textures:['straight','wavy','curly','coily'].map(hairTexture=>({label:hairTexture,a:{...base,hairTexture}})),
   facial:['clean','stubble','mustache','goatee','short-beard','full-beard'].map(facialHair=>({label:facialHair,a:{...base,hairstyle:'shaved',facialHair}})),controls:[]};
  for(const[key,limits]of Object.entries({hairLength:[.5,2],hairDensity:[.15,1],hairline:[0,1],hairPart:[.1,.9],hairStrandWidth:[.65,1.5],hairCurvature:[.65,1.45],hairWaveScale:[.65,1.5],hairStrandVariation:[0,.5]}))
   for(const v of limits)groups.controls.push({label:`${key} ${v}`,pair:key,a:{...base,[key]:v}});
  const report={groups:{},pixelComparisons:[]};
  for(const[name,rows]of Object.entries(groups)){
   const section=document.createElement('section');section.id=`grooming-${name}`;section.style.cssText='padding:16px;background:var(--surface);';section.innerHTML=`<h2>${name}</h2>`;
   const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px';
   const results=[];
   for(const row of rows){
    const mesh=buildHeadMesh3d(row.a,colors),card=document.createElement('article');card.innerHTML=`<h3>${row.label}</h3>`;
    const pair=document.createElement('div');pair.style.cssText='display:flex;gap:4px';const pixels=[];
    for(const angle of[0,Math.PI/2]){
     renderer.draw(mesh,row.a,colors,angle);displayContext.clearRect(0,0,96,120);displayContext.drawImage(canvas,0,0,96,120);pixels.push(displayContext.getImageData(0,0,96,120).data);
     const img=document.createElement('img');img.src=displayed.toDataURL();img.alt=`${row.label} ${angle===0?'front':'profile'}`;img.style.cssText='width:96px;height:120px';pair.append(img);
    }
    results.push({label:row.label,pair:row.pair,pixels,meshBytes:mesh.vertices.byteLength+mesh.indices.byteLength});card.append(pair);grid.append(card);
   }
   for(let i=0;i<results.length;i++)for(let j=i+1;j<results.length;j++){
    if(name==='controls'&&results[i].pair!==results[j].pair)continue;
    let changed=0;for(let v=0;v<2;v++)for(let k=0;k<results[i].pixels[v].length;k+=4)if(results[i].pixels[v][k]!==results[j].pixels[v][k]||results[i].pixels[v][k+1]!==results[j].pixels[v][k+1]||results[i].pixels[v][k+2]!==results[j].pixels[v][k+2])changed++;
    if(changed<20)throw Error(`Unexposed ${name}: ${results[i].label}/${results[j].label}, ${changed} pixels`);
    report.pixelComparisons.push({group:name,a:results[i].label,b:results[j].label,changedPixels:changed,viewPixels:{width:96,height:120},views:2});
   }
   report.groups[name]=results.map(({pixels,...row})=>row);section.append(grid);root.append(section);
  }
  renderer.dispose();document.body.replaceChildren(root);return report;
 });
 expect(report.groups.styles).toHaveLength(14);expect(report.groups.textures).toHaveLength(4);expect(report.groups.facial).toHaveLength(6);expect(report.groups.controls).toHaveLength(16);
 const captures=[];
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
  for(const group of Object.keys(report.groups)){
   const file=`output/playwright/head-grooming-${group}-${size}-${theme}.png`;await page.locator(`#grooming-${group}`).screenshot({path:file});
   captures.push({file,group,viewport:{width,height},theme,sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')});
  }
 }
 await fs.writeFile('output/playwright/head-grooming.json',JSON.stringify({scope:'Unadopted controlled-head prototype; pixel differences do not establish naturalism or population calibration',...report,captures},null,2));
});
