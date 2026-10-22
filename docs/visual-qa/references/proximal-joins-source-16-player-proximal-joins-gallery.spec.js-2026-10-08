import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
test('current saved body sections keep attached joins at a fixed physical screen scale',async({page})=>{
 const phase=process.env.PROXIMAL_JOIN_PHASE||'after';
 if(phase==='before')for(const file of['playerPortrait.js','playerMotion.js','profiledLimbSurface.js','torsoSurface.js'])await page.route(`**/lib/${file}`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/shoulder-before/${file}`,'utf8')}));
 const base=ensurePlayerVisualIdentity({id:'proximal-join-control',name:'Controlled comparison',age:24,heightInches:74,weightLbs:240,ratings:{speed:80,acceleration:75,agility:70,jumping:70,strength:80,stamina:75}},{newPlayer:true});
 const players=[[74,190],[74,330],[68,225],[80,361],[86,185],[96,650]].map(([heightInches,weightLbs])=>{const p={...base,heightInches,weightLbs};return{...p,appearance:playerAppearance(p),visualFrame:playerFrame(p)};});
 const before=JSON.stringify(players);await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async players=>{
  const{buildPlayerPhysiqueSvg,buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
  const main=document.createElement('main');main.id='proximalGallery';main.style.cssText='padding:12px;background:var(--surface);color:var(--ink-strong);display:grid;gap:12px';
  for(const[i,p]of players.entries()){
   const card=document.createElement('article');card.dataset.group=String(Math.floor(i/3));card.style.cssText='padding:12px;border:1px solid var(--line);min-width:0';
   const label=document.createElement('h2');label.style.fontSize='16px';label.textContent=`${p.heightInches} inches / ${p.weightLbs} pounds · controlled fictional anatomy`;card.append(label);
   const row=document.createElement('div');row.className='join-figures';row.style.cssText='display:flex;gap:8px;align-items:flex-start';
   row.innerHTML=buildPlayerPhysiqueSvg(p,{view:'front',idSuffix:`join-${i}`})+buildPlayerPhysiqueSvg(p,{view:'side',idSuffix:`join-side-${i}`})+buildPlayerMotionSvg(p,{mode:i===5?'cut':'run',phase:.37,idSuffix:`join-motion-${i}`});
   row.querySelectorAll(':scope > svg').forEach(svg=>{const b=svg.viewBox.baseVal;svg.style.cssText=`display:block;flex:none;width:${b.width*.4}px;height:${b.height*.4}px`;});card.append(row);main.append(card);
  }document.body.replaceChildren(main);
 },players);
 expect(JSON.stringify(players)).toBe(before);await fs.mkdir('output/playwright',{recursive:true});const captures=[];
 for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#proximalGallery').evaluate((g,size)=>{g.style.gridTemplateColumns=size==='desktop'?'repeat(2,minmax(0,1fr))':'1fr';g.querySelectorAll('.join-figures').forEach(row=>row.style.flexDirection=size==='desktop'?'row':'column');},size);
  for(const theme of['dark','light']){
   await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
   for(const group of[0,1]){
    await page.locator('#proximalGallery article').evaluateAll((cards,group)=>cards.forEach(card=>card.style.display=Number(card.dataset.group)===group?'block':'none'),group);
    const scales=await page.locator('#proximalGallery article:visible .join-figures > svg').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().width/n.viewBox.baseVal.width,y:n.getBoundingClientRect().height/n.viewBox.baseVal.height,finite:![n,...n.querySelectorAll('*')].some(e=>[...e.attributes].filter(a=>['d','transform','x','y','cx','cy','r','viewBox','width','height'].includes(a.name)).some(a=>/(?:NaN|Infinity|undefined)/.test(a.value)))})));
    expect(scales).toHaveLength(9);for(const s of scales){expect(Math.abs(s.x-.4)).toBeLessThan(.001);expect(Math.abs(s.y-.4)).toBeLessThan(.001);expect(s.finite).toBe(true);}
    const file=`output/playwright/proximal-joins-${phase}-${size}-${theme}-${group}.png`;await page.locator('#proximalGallery').screenshot({path:file});captures.push({file,size,theme,group,width,height,cssPixelsPerInch:2.4});
   }
  }
 }
 await fs.writeFile(`output/playwright/proximal-joins-${phase}.json`,JSON.stringify({phase,players,captures},null,2)+'\n');
});
