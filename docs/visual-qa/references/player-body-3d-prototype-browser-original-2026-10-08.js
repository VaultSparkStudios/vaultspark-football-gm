import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
test('complete body surface prototype compares one person and mass across physical cameras',async({page})=>{
 test.setTimeout(180000);
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),original=session.league.players.find(p=>p.position==='OL');
 const players=[180,240,350,500].map(weightLbs=>{const p={...structuredClone(original),heightInches:80,weightLbs};return{...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};});
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const result=await page.evaluate(async players=>{
  const {buildPlayerBodyMesh3d,createBodyRenderer3d}=await import('/lib/playerBody3d.js');
  const {buildPlayerPhysiqueSvg}=await import('/lib/playerPortrait.js');
  const root=document.createElement('main');root.style.cssText='max-width:1300px;margin:auto;padding:12px;color:var(--ink-strong);background:var(--panel)';root.innerHTML='<h1>Shared body surface experiment</h1><p>Same saved person at80in; different masses. Neutral views share the physical camera. Clay geometry only; not finished art or mass calibration.</p>';
  const observations=[];
  for(const [i,p]of players.entries()){
   const saved=JSON.stringify(p),section=document.createElement('section');section.id='body-person-'+i;section.innerHTML='<h2>'+p.weightLbs+'lb</h2>';
   const before=document.createElement('div');before.style.cssText='display:flex;gap:4px';before.innerHTML=buildPlayerPhysiqueSvg(p,{view:'front'})+buildPlayerPhysiqueSvg(p,{view:'side'});before.querySelectorAll('svg').forEach(e=>{e.style.width='180px';e.style.height='360px';});section.append(before);
   const gallery=document.createElement('div');gallery.className='body-cameras';gallery.style.cssText='display:flex;gap:4px';const canvas=document.createElement('canvas');canvas.width=320;canvas.height=600;const renderer=createBodyRenderer3d(canvas),mesh=buildPlayerBodyMesh3d(p),frames=[];
   for(const angle of[0,Math.PI/4,Math.PI/2]){renderer.draw(mesh,angle);const img=document.createElement('img');img.src=canvas.toDataURL();img.width=240;img.height=450;gallery.append(img);frames.push(img.src);}
   renderer.draw(mesh,0);if(canvas.toDataURL()!==frames[0])throw Error('Camera round trip changed mesh');
   const motion=document.createElement('div');motion.className='body-modes';motion.style.cssText='display:flex;gap:4px;flex-wrap:wrap';
   for(const mode of ['run','acceleration','cut','jump','strength','endurance']){const posed=buildPlayerBodyMesh3d(p,{mode,phase:.4});renderer.draw(posed,Math.PI/4);const img=document.createElement('img');img.src=canvas.toDataURL();img.width=120;img.height=225;img.title=mode;motion.append(img);if(posed.vertices.some(v=>!Number.isFinite(v)))throw Error('Invalid motion mesh');}
   renderer.dispose();section.append(gallery,motion);root.append(section);if(JSON.stringify(p)!==saved)throw Error('Prototype mutated person');observations.push({mass:p.weightLbs,vertices:mesh.vertices.length/6,triangles:mesh.indices.length/3,parts:mesh.parts.length,physicalCameraRoundTripExact:true,inputUnchanged:true,wholeUnionMassVerified:false});
  }
  document.body.replaceChildren(root);const style=document.createElement('style');style.textContent='@media(max-width:430px){.body-cameras img{width:110px;height:206.25px}}';document.head.append(style);return{observations};
 },players);
 await fs.mkdir('output/playwright',{recursive:true});
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]])for(const theme of['dark','light']){
  await page.setViewportSize({width,height});await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<players.length;i++)await page.locator('#body-person-'+i).screenshot({path:`output/playwright/body-3d-prototype-${i}-${size}-${theme}.png`});
 }
 await fs.writeFile('output/playwright/body-3d-prototype-observations.json',JSON.stringify(result,null,2));
});
