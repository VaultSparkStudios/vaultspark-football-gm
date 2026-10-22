import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';
test('closed and mass-fitted clay body keeps one physical camera and original person',async({page})=>{
 test.setTimeout(180000);
 const fixtures=JSON.parse(await fs.readFile('.cache/body-union/fixtures.json','utf8'));
 const currentSource=(await fs.readFile('test-support/appearance/playerBody3d.js','utf8')).replaceAll("from '../../public/lib/","from '/lib/");
 await page.route('**/lib/playerBody3d.js',route=>route.fulfill({contentType:'application/javascript',body:currentSource}));
 const beforeSource=(await fs.readFile('docs/visual-qa/references/player-body-3d-before-closure-2026-10-08.js','utf8')).replaceAll("from './","from '/lib/");
 await page.route('**/lib/playerBody3d-before-closure.js',route=>route.fulfill({contentType:'application/javascript',body:beforeSource}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const observations=await page.evaluate(async fixtures=>{
  const current=await import('/lib/playerBody3d.js'),before=await import('/lib/playerBody3d-before-closure.js');
  const root=document.createElement('main');root.id='union-gallery';root.innerHTML='<h1>Neutral body union fit</h1><p>Shared person:80in. Before and fitted clay share a104in neutral camera; six motions use160in. No automatic player resizing. Density is an artistic1kg/L proxy, not measured tissue.</p>';
  const results=[];
  for(const[i,{player,bulkScale}]of fixtures.entries()){
   const saved=JSON.stringify(player),section=document.createElement('section');section.id='union-person-'+i;section.innerHTML='<h2>'+player.weightLbs+'lb</h2>';
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=600;
   const renderer=current.createBodyRenderer3d(canvas,{verticalSpanInches:104,floorMarginInches:4});
   const draw=(mesh,angle,parent,label)=>{renderer.draw(mesh,angle);const figure=document.createElement('figure');figure.innerHTML='<figcaption>'+label+'</figcaption>';const img=document.createElement('img');img.src=canvas.toDataURL();figure.append(img);parent.append(figure);return img.src;};
   const previous=before.buildPlayerBodyMesh3d(player),fitted=current.buildPlayerBodyMesh3d(player,{bulkScale});
   const pairs=[];for(const [name,mesh]of[['Before',previous],['Closed, union fitted',fitted]]){const row=document.createElement('div');row.className='neutral-row';section.append(row);const images=[];for(const[angle,label]of[[0,'front'],[Math.PI/4,'three-quarter'],[Math.PI/2,'profile']])images.push(draw(mesh,angle,row,name+' '+label));pairs.push(images);}
   renderer.draw(fitted,0);if(canvas.toDataURL()!==pairs[1][0])throw Error('Camera round trip changed surface');renderer.dispose();
   const motionCanvas=document.createElement('canvas');motionCanvas.width=320;motionCanvas.height=600;const motionRenderer=current.createBodyRenderer3d(motionCanvas),motionRow=document.createElement('div');motionRow.className='motion-row';section.append(motionRow);
   for(const mode of['run','acceleration','cut','jump','strength','endurance']){const mesh=current.buildPlayerBodyMesh3d(player,{bulkScale,mode,phase:.4});motionRenderer.draw(mesh,Math.PI/4);const figure=document.createElement('figure');figure.innerHTML='<figcaption>'+mode+'</figcaption>';const img=document.createElement('img');img.src=motionCanvas.toDataURL();figure.append(img);motionRow.append(figure);}
   motionRenderer.dispose();root.append(section);
   if(saved!==JSON.stringify(player))throw Error('Rendering changed person');if(JSON.stringify(previous.pose)!==JSON.stringify(fitted.pose))throw Error('Mass fitting changed measured pose');
   if(pairs[0].some((src,j)=>src===pairs[1][j]))throw Error('Mass fitting had no visible effect');
   results.push({weightLbs:player.weightLbs,bulkScale,inputUnchanged:true,poseUnchanged:true,cameraRoundTripExact:true,neutralImagesChanged:true,wholeUnionMassVerified:false,productionDossierIntegrated:false});
  }
  document.body.replaceChildren(root);const style=document.createElement('style');style.textContent='#union-gallery{max-width:800px;margin:auto;padding:12px;background:var(--panel);color:var(--ink-strong)}.neutral-row,.motion-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:600px}figure{margin:0;min-width:0}figure img{display:block;width:100%;aspect-ratio:320/600}figcaption{font-size:12px;min-height:32px}.motion-row{margin-top:12px}@media(max-width:430px){.motion-row{grid-template-columns:repeat(2,minmax(0,1fr))}}';document.head.append(style);return results;
 },fixtures);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<fixtures.length;i++)await page.locator('#union-person-'+i).screenshot({path:`output/playwright/body-union-fit-${i}-${size}-${theme}.png`});
 }
 await fs.writeFile('output/playwright/body-union-fit-observations.json',JSON.stringify({observations},null,2)+'\n');
});
