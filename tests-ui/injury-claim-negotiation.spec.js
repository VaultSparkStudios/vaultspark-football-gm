import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {fileElevationInjurySalaryClaim} from '../src/domain/injurySalaryClaims.js';
import {startStaticClientHost,configureClient,createClientLeague,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
// Controlled before-source interception must not be bypassed by cached Pages
// delivery. Dedicated service-worker tests cover offline/cache behavior.
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{host=await startStaticClientHost({sourceOverrides:phase==='before'?{
 'game.html':'.cache/injury-claim-ui-before/game.html',
 'lib/gameFlow.js':'.cache/injury-claim-ui-before/gameFlow.js',
 'lib/rosterActions.js':'.cache/injury-claim-ui-before/rosterActions.js'
}:{}});});test.afterAll(async()=>{await host?.close();});
const phase=process.env.CLAIM_UI_PHASE||'after';
function gameplaySnapshot(snapshot){
 const result=structuredClone(snapshot);
 // Reading the real API increments request counts/timings. Ignore only that
 // known telemetry object, while comparing every saved gameplay field.
 delete result.league.observability;
 return result;
}
async function captureClaimState(page,state,selector){
 for(const [size,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  if(size==='mobile'&&await page.evaluate(()=>localStorage.getItem('vsfgm_mobile_loop')!=='0')){
   await expect(page.locator('#mlFullViewBtn')).toBeVisible();
   await page.locator('#mlFullViewBtn').click();
  }
  await expect(page.locator('#mobileLoopOverlay')).toBeHidden();
  await page.locator('#sideMenu').evaluate(async el=>{
   await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));
  });
  for(const theme of ['dark','light']){
   await page.evaluate(async t=>(await import('./lib/themeCustomizer.js')).applyTheme(t),theme);
   await page.locator(selector).scrollIntoViewIfNeeded();
   await page.screenshot({path:`output/playwright/claim-negotiation-${state}-${size}-${theme}.png`});
  }
 }
}
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} GM salary-claim offer and save restoration`,async({page})=>{
 const panelResponses=[];
 // The in-page runtime loads more than the default250 Resource Timing entries.
 // Observe the real response from navigation onward so lazy loading remains
 // verifiable without depending on that finite diagnostic buffer.
 page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('/injurySalaryClaimsPanel.js'))panelResponses.push(response.status());});
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 expect(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok).toBe(true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});applyInjury(player,{type:'Recorded qualifying injury',weeksRemaining:12},{gameId:game.gameId});
 fileElevationInjurySalaryClaim(league,{playerId:player.id,gameId:game.gameId,claimedCents:10000001});
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 if(phase==='before')await expect(page.locator('#injurySalaryClaimsCard')).toHaveCount(0);
 if(phase==='after')expect(panelResponses).toEqual([]);
 await page.evaluate(async snapshot=>{const {api}=await import('./lib/appState.js');await api('/api/snapshot/import',{method:'POST',body:{snapshot}});const {loadState}=await import('./lib/gameFlow.js');await loadState();},session.toSnapshot());
 await page.locator('[data-testid="tab-roster"]').click();await page.locator('#loadRosterBtn').click();
 if(phase==='before')await expect(page.locator('#injurySalaryClaimsCard')).toHaveCount(0);
 if(phase!=='before'){
  await expect(page.locator('#injurySalaryClaimsCard')).toBeVisible();
  await expect.poll(()=>panelResponses).toEqual([200]);
 }
 await fs.mkdir('output/playwright',{recursive:true});
 if(worker)await captureClaimState(page,phase,phase==='before'?'#loadRosterBtn':'#injurySalaryClaimsCard');
 if(phase==='before')return;
 const read=()=>page.evaluate(async()=>{const {api}=await import('./lib/appState.js');return (await api('/api/snapshot/export')).snapshot;});
 const before=await read(),card=page.locator('#injurySalaryClaimsCard'),input=card.locator('input'),button=card.getByRole('button',{name:'Offer salary settlement'});
 const requested=await input.inputValue();
 await input.fill('0.001');await button.click();await expect(card.getByRole('status')).toContainText('up to two decimal places');
 expect(gameplaySnapshot(await read())).toEqual(gameplaySnapshot(before));
 if(worker)await captureClaimState(page,'invalid','#injurySalaryClaimsCard');
 await input.fill('0.01');await button.click();await expect(card.getByRole('status')).toContainText('Offer declined');
 const rejected=await read();
 for(const key of ['injurySalaryClaims','capLedger','players','retiredPlayers'])expect(rejected.league[key]).toEqual(before.league[key]);
 expect(rejected.rngStreams).toEqual(before.rngStreams);expect(rejected.rngSeed).toEqual(before.rngSeed);
 expect(gameplaySnapshot(rejected)).toEqual(gameplaySnapshot(before));
 if(worker)await captureClaimState(page,'counteroffer','#injurySalaryClaimsCard');
 await input.fill(requested);await button.click();await expect(card.locator('h4')).toContainText('Settled');
 const agreed=await read();expect(agreed.league.injurySalaryClaims[0].status).toBe('settled');
 expect(agreed.league.players.find(p=>p.id===player.id)).toEqual(before.league.players.find(p=>p.id===player.id));
 if(worker)await captureClaimState(page,'settled','#injurySalaryClaimsCard');
 await page.setViewportSize({width:1440,height:1000});
 await expect(page.locator('[data-testid="tab-settings"]')).toBeVisible();
 const slot=`claim-offer-${worker?'worker':'in-page'}`;await saveSlot(page,slot);
 await page.evaluate(async()=>{const {api}=await import('./lib/appState.js');await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2026,controlledTeamId:'BUF',mode:'play'}});const {loadState}=await import('./lib/gameFlow.js');await loadState();});
 expect((await read()).league.injurySalaryClaims).toBeUndefined();
 await page.locator('[data-testid="tab-settings"]').click();await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
 await page.locator('#saveSlotInput').fill(slot);await page.locator('#loadBtn').click();
 await expect.poll(async()=>(await read()).league.injurySalaryClaims).toEqual(agreed.league.injurySalaryClaims);
 await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=await read();expect(restored.league.injurySalaryClaims).toEqual(agreed.league.injurySalaryClaims);
 expect(restored.league.capLedger).toEqual(agreed.league.capLedger);
 expect(restored.league.players.find(p=>p.id===player.id)).toEqual(agreed.league.players.find(p=>p.id===player.id));
});
