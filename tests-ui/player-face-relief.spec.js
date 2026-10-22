import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';

test('actual generated faces at portrait size retain skin and facial individuality',async({page})=>{
  const phase=process.env.FACE_RELIEF_PHASE||'after';
  if(phase==='before')for(const file of ['fineFaceGeometry','portraitSurfaceLighting','playerPortraitFace','playerSideAppearance'])
    await page.route(`**/lib/${file}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/face-relief-before/${file}.js`,'utf8')}));
  await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
  await page.emulateMedia({reducedMotion:'reduce'});
  const league=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}).league;
  const selected=[];
  for(const [style,beard]of[['shaved','clean'],['fade','clean'],['short-curls','short-beard'],['long','full-beard'],['afro','clean'],['side-part','clean'],['braids','clean'],['locs','full-beard']]){
    const player=league.players.find(p=>{const a=playerAppearance(p);return a.hairstyle===style&&a.facialHair===beard;})
      ||league.players.find(p=>playerAppearance(p).hairstyle===style);
    expect(player).toBeTruthy();selected.push({...player,appearance:playerAppearance(player),visualFrame:playerFrame(player)});
  }
  await fs.mkdir('output/playwright',{recursive:true});
  const captures=[];
  for(let start=0;start<selected.length;start+=4){
    await page.evaluate(async players=>{
      const {buildPlayerPortraitSvg}=await import('/lib/playerPortraitFace.js');
      const {buildPlayerSideHead}=await import('/lib/playerSideAppearance.js');
      let gallery=document.querySelector('#faceReliefGallery');
      if(!gallery){gallery=document.createElement('section');gallery.id='faceReliefGallery';document.body.replaceChildren(gallery);}
      gallery.style.cssText='display:grid;gap:16px;padding:16px;max-width:1160px;margin:auto;background:var(--surface);color:var(--ink-strong)';
      gallery.innerHTML=players.map((p,i)=>`<article><h3>${p.name}</h3><div style="max-width:250px;margin:auto">${buildPlayerPortraitSvg(p,{idSuffix:`-relief-${i}`})}</div><svg style="height:115px;width:100%" viewBox="-70 -30 130 170">${buildPlayerSideHead(p,{idSuffix:`-relief-${i}`})}</svg></article>`).join('');
    },selected.slice(start,start+4));
    for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
      await page.setViewportSize({width,height});
      await page.locator('#faceReliefGallery').evaluate((el,columns)=>el.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`,size==='desktop'?4:2);
      for(const theme of ['dark','light']){
        await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
        const file=`output/playwright/face-relief-${phase}-${start}-${size}-${theme}.png`;
        await page.locator('#faceReliefGallery').screenshot({path:file});captures.push({file,size,width,height,theme,start});
      }
    }
  }
  await fs.writeFile(`output/playwright/face-relief-${phase}.json`,JSON.stringify({phase,scope:'Eight actual generated people; untouched appearance/frame DTOs; normal-size illustrative gallery, not empirical calibration or full-game acceptance',players:selected.map(p=>({id:p.id,name:p.name,appearance:p.appearance,visualFrame:p.visualFrame})),captures},null,2));
});
