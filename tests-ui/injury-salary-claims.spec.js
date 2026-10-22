import {test,expect} from '@playwright/test';
import {createSession} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {fileElevationInjurySalaryClaim,settleElevationInjurySalaryClaim} from '../src/domain/injurySalaryClaims.js';
import {applyCapRollover} from '../src/engine/offseasonSimulator.js';
import {startStaticClientHost,configureClient,createClientLeague,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';

let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
// Controlled qualifying source, not the actual managed-career save. This
// exercises imported foundation records; user/CPU resolution commands remain open.
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} salary claim survives named-slot replacement and later-year credit import`,async({page})=>{
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const p=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 expect(declareStandardElevation({league,player:p,teamId:'BUF',game,capSpace:1e8}).ok).toBe(true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});
 applyInjury(p,{type:'Controlled qualifying long injury',weeksRemaining:12},{gameId:game.gameId});
 const baseCap=session.getTeamCapSummary('BUF').usedCap;
 fileElevationInjurySalaryClaim(league,{playerId:p.id,gameId:game.gameId,claimedCents:10000000});
 const snapshot=session.toSnapshot(),expectedClaim=structuredClone(league.injurySalaryClaims),originalPay=structuredClone(p.elevationInjuryPay);
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 await page.evaluate(async snapshot=>{const {api}=await import('./lib/appState.js');await api('/api/snapshot/import',{method:'POST',body:{snapshot}});const {loadState}=await import('./lib/gameFlow.js');await loadState();},snapshot);
 const read=()=>page.evaluate(async id=>{const {api}=await import('./lib/appState.js');const {snapshot}=await api('/api/snapshot/export');return {claims:snapshot.league.injurySalaryClaims,pay:snapshot.league.players.find(p=>p.id===id)?.elevationInjuryPay,cap:(await api('/api/roster?team=BUF')).cap};},p.id);
 expect((await read()).cap.usedCap).toBe(baseCap+40000);
 const slot=`injury-claim-${worker?'worker':'in-page'}`;await saveSlot(page,slot);
 await page.evaluate(async()=>{const {api}=await import('./lib/appState.js');await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2026,controlledTeamId:'BUF',mode:'play'}});const {loadState}=await import('./lib/gameFlow.js');await loadState();});
 expect((await read()).claims).toBeUndefined();
 await page.locator('[data-testid="tab-settings"]').click();await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
 await page.locator('#saveSlotInput').fill(slot);await page.locator('#loadBtn').click();await expect(page.locator('#statusChip')).toContainText('Ready');
 await expect.poll(async()=>(await read()).claims).toEqual(expectedClaim);
 await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=await read();expect(restored.claims).toEqual(expectedClaim);expect(restored.pay).toEqual(originalPay);expect(restored.cap.usedCap).toBe(baseCap+40000);
 applyCapRollover(league,{completedYear:2026});league.financialYear=2027;
 settleElevationInjurySalaryClaim(league,{claimId:expectedClaim[0].claimId,paidCents:1000000,clubAccepted:true,playerAccepted:true,statutoryRightsPreserved:true});
 const later=session.toSnapshot(),expectedCap=session.getTeamCapSummary('BUF');
 await page.evaluate(async snapshot=>{const {api}=await import('./lib/appState.js');await api('/api/snapshot/import',{method:'POST',body:{snapshot}});},later);
 expect((await read()).claims).toEqual(later.league.injurySalaryClaims);expect((await read()).cap).toEqual(expectedCap);
 const rejected=await page.evaluate(async snapshot=>{const {api}=await import('./lib/appState.js');snapshot.league.injurySalaryClaims[0].resolution.playerAccepted=false;try{await api('/api/snapshot/import',{method:'POST',body:{snapshot}});return null;}catch(error){return error.payload?.reasonCode||error.details?.reasonCode||error.reasonCode;}},later);
 expect(rejected).toBe('INJURY_SALARY_CLAIM_INVALID');
 expect((await read()).claims).toEqual(league.injurySalaryClaims);expect((await read()).pay).toEqual(originalPay);expect((await read()).cap).toEqual(expectedCap);
});
