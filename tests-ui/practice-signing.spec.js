import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('practice signing is available in the actual free-agent workspace', async ({page}) => {
  test.setTimeout(180000);
  const phase=process.env.PRACTICE_CAPTURE_PHASE || 'after';
  if(phase==='before') {
    for(const [url,file] of [['**/game.html','game.html'],['**/app.js','app.js'],['**/lib/tabRoster.js','tabRoster.js']]) {
      await page.route(url,async route=>route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':'text/javascript',
        body:(await fs.readFile(`.cache/practice-signing-before/${file}`,'utf8')).replace(/styles\.[a-f0-9]+\.css/g,'styles.css')}));
    }
  }
  await page.goto('/');
  await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
  await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
  await page.fill('#seedInput','11701');
  await page.selectOption('#teamSelect','BUF');
  await page.click('#createLeagueBtn');
  await expect(page).toHaveURL(/\/game\.html$/,{timeout:90000});
  await expect(page.locator('#statusChip')).toContainText('Ready',{timeout:60000});
  for(const id of ['#firstDebriefDecline','#tutSkipBtn']) if(await page.locator(id).isVisible()) await page.locator(id).click();
  const released=await page.evaluate(async()=>{
    const {api}=await import('/lib/appState.js');
    const dashboard=await api('/api/state');
    const teamId=dashboard.controlledTeamId;
    const roster=await api(`/api/roster?team=${teamId}`);
    const player=roster.roster.find(p=>p.rosterSlot==='practice');
    await api('/api/release',{method:'POST',body:{teamId,playerId:player.id,toWaivers:false}});
    return {teamId,playerId:player.id};
  });
  await fs.mkdir('output/playwright',{recursive:true});
  for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    // Wait for the application's declared 150ms viewport debounce before
    // clicking the replacement deck's freshly bound Full View control.
    await page.waitForTimeout(200);
    if(size==='mobile') await expect(page.locator('#mlFullViewBtn')).toBeVisible();
    if(await page.locator('#mlFullViewBtn').isVisible()) await page.locator('#mlFullViewBtn').click();
    if(size==='mobile') await expect.poll(()=>page.evaluate(()=>localStorage.getItem('vsfgm_mobile_loop'))).toBe('0');
    await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
    for(const theme of ['dark','light']) {
      await page.evaluate(async theme=>{const {applyTheme}=await import('/lib/themeCustomizer.js');applyTheme(theme);},theme);
      if(await page.locator('#mlFullViewBtn').isVisible()) await page.locator('#mlFullViewBtn').click();
      await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
      for(const [tab,table] of [['rosterTab','rosterTable'],['faTab','faTable']]) {
        await page.evaluate(async tab=>{const {activateTab}=await import('/lib/gameFlow.js');await activateTab(tab);},tab);
        await page.click(tab==='rosterTab'?'#loadRosterBtn':'#loadFaBtn');
        await expect(page.locator(`#${table} button[data-act]`).first()).toBeVisible();
        if(phase==='after') {
          await expect(page.locator(tab==='rosterTab'?'#practiceRosterGuidance':'#practiceSigningGuidance')).toBeVisible();
          if(tab==='faTab') await expect(page.locator('#faTable button[data-act="sign-practice"]').first()).toBeVisible();
        }
        await page.evaluate(tab=>{const top=document.getElementById(tab).getBoundingClientRect().top+window.scrollY;window.scrollTo(0,Math.max(0,top-130));},tab);
        await expect(page.locator('#toastStack .toast')).toHaveCount(0);
        await page.screenshot({path:`output/playwright/s117-practice-${phase}-${size}-${theme}-${tab}.png`});
        if(size==='mobile') {
          await page.evaluate(({table,phase,tab})=>{
            const target=phase==='after'?document.getElementById(tab==='rosterTab'?'practiceRosterGuidance':'practiceSigningGuidance'):document.getElementById(table);
            const header=document.querySelector('header').getBoundingClientRect().height;
            window.scrollTo(0,Math.max(0,target.getBoundingClientRect().top+window.scrollY-header-12));
            const wrap=document.getElementById(table).closest('.table-wrap');wrap.scrollLeft=wrap.scrollWidth;
          },{table,phase,tab});
          await page.screenshot({path:`output/playwright/s117-practice-${phase}-${size}-${theme}-${tab}-actions.png`});
          await page.evaluate(table=>{document.getElementById(table).closest('.table-wrap').scrollLeft=0;},table);
        }
      }
    }
  }
  if(phase==='before') return;
  // Sign the released player through the actual table and persisted API.
  await page.setViewportSize({width:1440,height:1000});
  const sign=page.locator('#faTable button[data-act="sign-practice"]').first();
  const playerId=await sign.getAttribute('data-id');
  await sign.click();
  await expect(page.locator('#statusChip')).toContainText('Ready');
  const signed=await page.evaluate(async ({playerId,teamId})=>{
    const {api}=await import('/lib/appState.js');
    const response=await api(`/api/roster?team=${teamId}`);return response.roster.find(p=>p.id===playerId);
  },{playerId,teamId:released.teamId});
  expect(signed.rosterSlot).toBe('practice');
  expect(signed.contract.kind).toBe('weekly-practice-contract-v1');
  expect(signed.contract.guaranteed).toBe(0);
});
