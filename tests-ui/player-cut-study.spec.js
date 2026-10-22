import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';

test('actual dossier exposes a preserved-body lateral cut with pause and reduced motion', async ({page}) => {
  test.setTimeout(180000);
  const phase=process.env.CUT_STUDY_PHASE||'after';
  if(phase==='before')for(const file of ['appCore.js','playerPortrait.js','playerMotion.js'])
    await page.route(`**/lib/${file}`,async route=>route.fulfill({status:200,contentType:'text/javascript',
      body:await fs.readFile(`.cache/cut-before/${file}.txt`,'utf8')}));
  await page.addInitScript(()=>localStorage.setItem('vsfgm:runtime-mode','client'));
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Ready');
  await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
  await page.fill('#seedInput','20260306');await page.selectOption('#teamSelect','BUF');await page.click('#createLeagueBtn');
  await expect(page).toHaveURL(/game\.html(?:\?resume=tab)?$/,{timeout:90000});
  await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
  await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');
  await page.locator('#rosterTable button[data-player-id]').first().click();
  await page.locator('.player-physique > summary').click();
  const detail=page.locator('.player-movement');await detail.locator(':scope > summary').click();await detail.scrollIntoViewIfNeeded();
  if(phase==='after'){
    // Capture every actual caption mutation before the mode starts. Polling the
    // transient plant caption can alias with the cycle and repeatedly miss it.
    await detail.evaluate(root=>{
      const caption=root.querySelector('[data-motion-caption]'),history=[];
      const observe=()=>{const text=caption.textContent;if(history.at(-1)?.text!==text)history.push({text,time:performance.now()});};
      const observer=new MutationObserver(observe);observer.observe(caption,{childList:true,characterData:true,subtree:true});observe();
      root.cutCaptionObservation={history,observer};
    });
    await detail.locator('[data-motion-mode]').selectOption('cut');
    await expect(detail.locator('.player-motion-svg')).toHaveAttribute('data-mode','cut');
    const canvas=detail.locator('canvas[data-player-character3d]');await expect(canvas).toBeVisible();
    const pixels=()=>canvas.evaluate(c=>{const gl=c.getContext('webgl'),px=new Uint8Array(c.width*c.height*4);gl.finish();gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,px);let hash=2166136261;for(const value of px)hash=Math.imul(hash^value,16777619);return hash>>>0;});
    const movingBefore=await pixels();await expect.poll(pixels).not.toBe(movingBefore);
    await expect.poll(()=>detail.evaluate(root=>root.cutCaptionObservation.history.map(row=>row.text).join('\n')),{timeout:15000}).toContain('Plant & redirect');
    const captionHistory=await detail.evaluate(root=>{root.cutCaptionObservation.observer.disconnect();return root.cutCaptionObservation.history;});
    await detail.locator('[data-motion-toggle]').click();
    const still=await detail.locator('[data-motion-content]').innerHTML(),pausedPixels=await pixels();await page.waitForTimeout(150);
    expect(await detail.locator('[data-motion-content]').innerHTML()).toBe(still);
    expect(await pixels()).toBe(pausedPixels);
    await fs.mkdir('output/playwright',{recursive:true});await fs.writeFile('output/playwright/s118-cut-motion-observation.json',JSON.stringify({captionHistory,movingBefore,pausedPixels,actualVisibleCanvasAdvanced:true,actualVisibleCanvasPaused:true},null,2));
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect(detail.locator('[data-motion-toggle]')).toBeDisabled();
    await expect(detail.locator('.player-motion-svg')).toHaveAttribute('data-mode','cut');
  }else await page.emulateMedia({reducedMotion:'reduce'});
  await fs.mkdir('output/playwright',{recursive:true});
  let fullViewChosen=false;
  async function capture(kind){
    for(const [view,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
      await page.setViewportSize({width,height});
      if(view==='mobile'&&!fullViewChosen){
        // Wait for the debounced responsive deck before choosing the real UI.
        // An immediate isVisible check can miss its later resize activation.
        await expect(page.locator('#mlFullViewBtn')).toBeVisible();
        await page.locator('#mlFullViewBtn').click();fullViewChosen=true;
      }
      for(const theme of ['dark','light']){
        await page.evaluate(async theme=>(await import('/lib/themeCustomizer.js')).applyTheme(theme),theme);
        if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
        await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
        await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
        if(kind==='dossier')await detail.scrollIntoViewIfNeeded();
        await page.screenshot({path:`output/playwright/s117-cut-${phase}-${view}-${theme}-${kind}.png`,fullPage:kind==='gallery'});
      }
    }
  }
  await capture('dossier');
  const base={id:'cut-pair',name:'Cut pair',age:25,heightInches:78,weightLbs:340,
    ratings:{speed:85,acceleration:70,jumping:70,strength:85,agility:40}};
  const fixtures=[['Low agility · approach',40,.24],['High agility · approach',99,.24],
    ['Low agility · plant',40,.46],['High agility · plant',99,.46],
    ['Short heavy · redirect',70,.5,66,290],['Tall light · redirect',70,.5,84,205]]
    .map(([label,agility,p,heightInches=78,weightLbs=340])=>{
      const player={...base,heightInches,weightLbs,ratings:{...base.ratings,agility}};
      return {label,phase:p,player:{...player,appearance:playerAppearance(player),visualFrame:playerFrame(player)}};
    });
  await page.evaluate(async({fixtures,phase})=>{
    const {buildPlayerMotionSvg}=await import('/lib/playerPortrait.js');
    const gallery=document.createElement('section');gallery.id='cutGallery';
    gallery.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px;max-width:960px;margin:auto;background:var(--surface);color:var(--ink-strong)';
    for(const [i,f]of fixtures.entries()){
      const card=document.createElement('article');const label=document.createElement('p');label.textContent=f.label;label.style.minHeight='2.8em';card.append(label);
      card.insertAdjacentHTML('beforeend',buildPlayerMotionSvg(f.player,{mode:phase==='before'?'run':'cut',phase:f.phase,idSuffix:`gallery-${i}`}));
      card.querySelector('svg').style.cssText='display:block;width:100%;max-width:260px;height:auto;margin:auto';gallery.append(card);
    }
    document.body.replaceChildren(gallery);
  },{fixtures,phase});
  await capture('gallery');
});
