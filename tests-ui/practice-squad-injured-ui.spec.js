import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {startStaticClientHost,configureClient,createClientLeague,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
const phase=process.env.PS_INJURED_CAPTURE_PHASE||'after';
test.beforeAll(async()=>{host=await startStaticClientHost();await fs.mkdir('output/playwright',{recursive:true});});
test.afterAll(async()=>{await host?.close();});
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} roster places and returns an injured practice player with retained terms`,async({page})=>{
 if(phase==='before'&&!worker)test.skip();
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
 const p=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 applyInjury(p,{type:'Out 6W',weeksRemaining:6});const terms=structuredClone(p.contract);
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 await page.evaluate(async snapshot=>{const {api}=await import('./lib/appState.js');await api('/api/snapshot/import',{method:'POST',body:{snapshot}});const {loadState}=await import('./lib/gameFlow.js');await loadState();},session.toSnapshot());
 for(const id of ['#firstDebriefDecline','#tutSkipBtn'])if(await page.locator(id).isVisible())await page.locator(id).click();
 await page.click('[data-testid="tab-roster"]');await page.click('#loadRosterBtn');await page.locator(`[data-designation-select="${p.id}"]`).click();
 async function capture(state){if(!worker)return;
  for(const[size,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(250);if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('./lib/themeCustomizer.js')).applyTheme(t),theme);
    await page.waitForTimeout(250);
    if(await page.locator('#mlFullViewBtn').isVisible())await page.locator('#mlFullViewBtn').click();
    await expect(page.locator('#mobileLoopOverlay')).toBeHidden();await expect(page.locator('#toastStack .toast')).toHaveCount(0,{timeout:10000});
    await page.locator('#designationSelectedPlayerText').evaluate(target=>{const h=document.querySelector('header').getBoundingClientRect().height;window.scrollTo(0,Math.max(0,target.getBoundingClientRect().top+window.scrollY-h-14));});
    await page.screenshot({path:`output/playwright/s117-ps-injured-${phase}-${state}-${size}-${theme}.png`});
   }
  }
 }
 await capture('selected');if(phase==='before')return;
 await page.setViewportSize({width:1440,height:1000});
 await expect(page.locator('#designationType')).toHaveValue('ps-injured');
 await expect(page.locator('#reserveDesignationGuidance')).toContainText('practice place');
 await page.click('#applyDesignationBtn');await expect(page.locator('#reserveDesignationGuidance')).toContainText('Practice Squad/Injured');
 await expect(page.locator('#clearDesignationBtn')).toHaveText('Return to Practice Squad');await expect(page.locator('#clearDesignationBtn')).toBeDisabled();await capture('placed');
 await page.evaluate(async id=>{const {api}=await import('./lib/appState.js');for(let i=0;i<6;i++){await api('/api/advance-week',{method:'POST',body:{count:1}});const {roster}=await api('/api/roster?team=BUF');if(roster.find(p=>p.id===id).reserveStatus.activation.ok)return;}throw Error('No healed eligible practice return after six actual advances');},p.id);
 await page.click('#loadRosterBtn');await expect(page.locator('#beginReservePracticeBtn')).toBeEnabled();
 await page.click('#beginReservePracticeBtn');await expect(page.locator('#reserveDesignationGuidance')).toContainText('Practice window:');await capture('ready');
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('#clearDesignationBtn')).toBeEnabled();await page.click('#clearDesignationBtn');await expect(page.locator('#clearDesignationBtn')).toHaveText('Clear Designation');
 const actual=await page.evaluate(async id=>{const {api}=await import('./lib/appState.js');return (await api('/api/snapshot/export')).snapshot.league.players.find(p=>p.id===id);},p.id);
 expect(actual.rosterSlot).toBe('practice');expect(actual.reserveStatus).toBeNull();expect(actual.reserveHistory).toHaveLength(1);
 const {payLedger,...paid}=actual.contract,{payLedger:old,...original}=terms;expect(paid).toEqual(original);
 expect(Object.keys(payLedger).length).toBeGreaterThan(0);await capture('returned');
 await page.setViewportSize({width:1440,height:1000});await saveSlot(page,'ps-injured-ui');await page.reload();await waitGameReady(page);
 const restored=await page.evaluate(async id=>{const {api}=await import('./lib/appState.js');return (await api('/api/snapshot/export')).snapshot.league.players.find(p=>p.id===id);},p.id);expect(restored).toEqual(actual);
});
