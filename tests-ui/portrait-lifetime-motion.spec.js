import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createSession,createSessionFromSnapshot} from '../src/runtime/bootstrap.js';
import {encodeSnapshot,decodeSnapshot} from '../src/adapters/persistence/snapshotCodec.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {setPlayerGrooming} from '../src/domain/playerVisualIdentity.js';

test('actual trade, yearly progression and save preserve face; blink and reduced motion remain coherent',async({page})=>{
  test.setTimeout(240000);
  const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
  const dto=p=>({...structuredClone(p),appearance:playerAppearance(p),visualFrame:playerFrame(p)});
  let player,before;
  for(const outgoing of session.league.players.filter(p=>p.teamId==='BUF'&&p.age<27&&!['K','P'].includes(p.position))){
    const candidates=session.league.players.filter(p=>p.teamId!=='BUF'&&p.teamId!=='FA'&&p.position===outgoing.position&&Math.abs(p.overall-outgoing.overall)<=3);
    for(const incoming of candidates){
      const input={teamA:'BUF',teamB:incoming.teamId,teamAPlayerIds:[outgoing.id],teamBPlayerIds:[incoming.id]};
      if(session.evaluateTradePackage(input).ok){before=dto(outgoing);expect(session.tradePlayers(input).ok).toBe(true);player=outgoing;break;}
    }
    if(player)break;
  }
  expect(player,'actual command must accept a trade').toBeTruthy();
  const traded=dto(player);
  expect(traded.teamId).not.toBe(before.teamId);
  expect(traded.appearance).toEqual(before.appearance);
  session.phase='offseason';session.runRosterYearRollover();
  expect(player.age).toBe(before.age+1);
  expect(playerAppearance(player)).toEqual(before.appearance);
  const aged=dto(player);
  const restored=createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(session.toSnapshot())));
  const copy=restored.league.players.find(p=>p.id===player.id)||restored.league.retiredPlayers.find(p=>p.id===player.id);
  expect(playerAppearance(copy)).toEqual(before.appearance);
  expect(copy.profile.skeletonRecipe).toEqual(before.profile.skeletonRecipe);
  const saved=dto(copy);
  setPlayerGrooming(copy,{hairstyle:'long',dyedHairColor:'#8844aa',facialHair:'short-beard'});
  const groomed=dto(copy);
  for(const key of ['faceWidth','faceLength','jawWidth','noseWidth','eyeColor','complexion'])
    expect(groomed.appearance[key],key).toEqual(before.appearance[key]);
  const gray={...saved,age:42,appearance:{...saved.appearance,grayOnsetAge:28}};
  const fixtures=[['Before actual trade',before],['After actual trade',traded],['After actual annual progression',aged],['After compressed save restoration',saved],['Grooming change after restoration',groomed],['Age42 graying visual fixture',gray]];
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
  await page.emulateMedia({reducedMotion:'reduce'});
  const render=async(rows,{legacy=false}={})=>page.evaluate(async({rows,legacy})=>{
    const current=await import('/lib/playerPortrait.js');
    const {buildLegacyPlayerPortraitSvg}=await import('/lib/playerPortraitFace.js');
    const {tryPlayerHeadImage}=await import('/lib/playerHeadImage.js');
    const buildPlayerPortraitSvg=legacy?buildLegacyPlayerPortraitSvg:current.buildPlayerPortraitSvg;
    const gallery=document.createElement('section');gallery.id='lifetimeGallery';
    gallery.style.cssText='display:grid;gap:16px;padding:20px;max-width:1100px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    for(const [label,p] of rows){const card=document.createElement('article');card.innerHTML=buildPlayerPortraitSvg(p,{headOnly:!p.motionFullBody,idSuffix:`-lifetime-${gallery.children.length}`});const caption=document.createElement('p');caption.textContent=label;card.append(caption);gallery.append(card);}
    document.body.replaceChildren(gallery);
    if(legacy)return [];
    return rows.map(([,person],i)=>{
      const image=tryPlayerHeadImage(person),displayed=gallery.children[i].querySelector('.player-shared-head-image')?.getAttribute('href');
      if(!image||image.src!==displayed)throw Error('Career portrait differs from current saved-person projection');
      return displayed;
    });
  },{rows,legacy});
  const careerImages=await render(fixtures);
  expect(careerImages[1]).toBe(careerImages[0]);
  expect(careerImages[3]).toBe(careerImages[2]);
  expect(careerImages[4]).not.toBe(careerImages[3]);
  // Exercise actual geometric blink output on the restored modern person.
  const modernBlink=await page.evaluate(async person=>{
    const {tryPlayerHeadImage}=await import('/lib/playerHeadImage.js');
    const original=JSON.stringify(person);
    const views=[0,Math.PI/4,Math.PI/2].map(angle=>{
      const open=tryPlayerHeadImage(person,{angle,blink:0})?.src;
      const closed=tryPlayerHeadImage(person,{angle,blink:1})?.src;
      const reopened=tryPlayerHeadImage(person,{angle,blink:0})?.src;
      return{valid:Boolean(open&&closed&&reopened),changed:open!==closed,restored:open===reopened};
    });
    return{views,inputUnchanged:JSON.stringify(person)===original};
  },saved);
  expect(modernBlink).toEqual({views:Array.from({length:3},()=>({valid:true,changed:true,restored:true})),inputUnchanged:true});
  await fs.mkdir('output/playwright',{recursive:true});
  const captures=[];
  for(let group=0;group<2;group++){
    await render(fixtures.slice(group*3,group*3+3));
    for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
      await page.setViewportSize({width,height});
      await page.locator('#lifetimeGallery').evaluate((g,columns)=>g.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`,viewport==='desktop'?3:2);
      for(const theme of ['dark','light']){
        await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
        await expect(page.locator('.player-shared-head-image')).toHaveCount(3);
        expect(await page.locator('.player-shared-head-image').evaluateAll(images=>images.every(image=>image.getAnimations().length===0))).toBe(true);
        const file=`output/playwright/s117-lifetime-${group}-${viewport}-${theme}.png`;
        await page.screenshot({path:file});captures.push({file,viewport,theme});
      }
    }
  }
  // Keep the legacy SVG fallback's CSS blink and breathing contract separate
  // from the modern geometric blink proof above.
  await render([['Legacy SVG animation phases',{...saved,motionFullBody:true}]],{legacy:true});await page.setViewportSize({width:1440,height:1000});
  await page.locator('#lifetimeGallery').evaluate(g=>{g.style.width='300px';g.style.gridTemplateColumns='1fr';});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('.portrait-eye').first()).toHaveCSS('animation-name','portrait-blink');
  await expect(page.locator('.portrait-athlete')).toHaveCSS('animation-name','portrait-breathe');
  await page.locator('.portrait-athlete').evaluate(e=>{const animation=e.getAnimations()[0];animation.pause();animation.currentTime=0;});
  const phases=[];
  for(const [phase,progress] of [['open',.40],['closed',.445]]){
    const bounds=await page.locator('.portrait-eye').evaluateAll((eyes,progress)=>eyes.map(eye=>{
      const animation=eye.getAnimations()[0];animation.pause();const timing=animation.effect.getTiming();animation.currentTime=timing.delay+Number(timing.duration)*progress;
      const bounds=eye.getBoundingClientRect();return {x:bounds.x,width:bounds.width,y:bounds.y,height:bounds.height};
    }),progress);
    const file=`output/playwright/s117-lifetime-blink-${phase}.png`;await page.screenshot({path:file});captures.push({file,phase});phases.push(bounds);
  }
  phases[0].forEach((open,i)=>{expect(phases[1][i].height).toBeLessThan(open.height*.15);expect(Math.abs(phases[1][i].x-open.x)).toBeLessThan(1);expect(Math.abs(phases[1][i].width-open.width)).toBeLessThan(1);});
  await page.locator('.portrait-eye').evaluateAll(eyes=>eyes.forEach(eye=>{const a=eye.getAnimations()[0],t=a.effect.getTiming();a.currentTime=t.delay+Number(t.duration)*.40;}));
  const breathing=[];
  for(const [phase,progress] of [['rest',0],['inhale',.5]]){
    breathing.push(await page.locator('.portrait-athlete').evaluate((e,progress)=>{const a=e.getAnimations()[0],t=a.effect.getTiming();a.currentTime=t.delay+Number(t.duration)*progress;const b=e.getBoundingClientRect();return {width:b.width,height:b.height};},progress));
    const file=`output/playwright/s117-lifetime-breathe-${phase}.png`;await page.screenshot({path:file});captures.push({file,phase});
  }
  expect(breathing[1].height/breathing[0].height).toBeCloseTo(1.003,3);
  expect(Math.abs(breathing[1].width-breathing[0].width)).toBeLessThan(1);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.portrait-eye').first()).toHaveCSS('animation-name','none');
  await expect(page.locator('.portrait-athlete')).toHaveCSS('animation-name','none');
  await fs.writeFile('output/playwright/s117-lifetime-motion.json',JSON.stringify({trade:{playerId:player.id,from:before.teamId,to:traded.teamId},actualAnnualAge:[before.age,aged.age],actualCompressedRestore:true,currentCareerRastersVerified:true,modernBlink,cssAnimationScope:'explicit legacy SVG fallback',grayFixture:'artistic age42/onset28 example, not empirical aging frequencies',phases,breathing,captures,limits:['One actual annual boundary is not whole-career aging acceptance','Gallery is focused iteration evidence, not immutable whole-app visual certification']},null,2));
});
