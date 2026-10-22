import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';
import {declareStandardElevation,settleStandardElevationGame,standardElevationGame} from '../src/domain/standardElevations.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} preserves explicit admitted calendar through annual command and named restoration`,async({page})=>{
 test.setTimeout(180000);
 const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF'}),league=session.league;
 const player=league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
 const playerId=player.id,game=standardElevationGame({year:2026,week:18,homeTeamId:'BUF',awayTeamId:'MIA'});
 expect(declareStandardElevation({league,player,teamId:'BUF',game,capSpace:1e8}).ok).toBe(true);
 settleStandardElevationGame({league,result:{...game,winnerId:'BUF'}});
 applyInjury(player,{type:'Controlled qualifying injury',weeksRemaining:3},{gameId:game.gameId});
 const final=canonicalFootballGame({year:2026,homeTeamId:'BUF',awayTeamId:'MIA',seasonType:'playoffs',label:'super-bowl',round:'super-bowl'});
 league.gameArchive.push({...final,homeScore:21,awayScore:14,winnerId:'BUF'});session.phase='offseason';session.currentWeek=19;
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 const result=await page.evaluate(async snapshot=>{
  // Explicit alternative domain mode in the built artifact. This is not a
  // claim that automatic production annual dispatch has adopted it.
  const {advancePreRolloverMedicalCalendar}=await import('./src/domain/preRolloverMedicalCalendar.js');
  advancePreRolloverMedicalCalendar(snapshot.league,{completedYear:2026,preserveAdmittedRights:true,getTeamModifiers:()=>({extraRecoveryWeeks:0})});
  const {api}=await import('./lib/appState.js');
  await api('/api/snapshot/import',{method:'POST',body:{snapshot}});
  await api('/api/advance-week',{method:'POST',body:{count:1}});
  await (await import('./lib/gameFlow.js')).loadState();
  return (await api('/api/snapshot/export')).snapshot;
 },session.toSnapshot());
 const retained=result.league.players.find(p=>p.id===playerId);
 expect(retained.injury).toBeNull();expect(retained.elevationInjuryPay.payroll.map(r=>r.week)).toEqual([24,25,26]);
 expect(result.league.injurySalaryClaims?.length||0).toBe(0);expect(result.league.admittedInjuryContinuations).toHaveLength(1);
 if(await page.locator('#closeSeasonReviewBtn').isVisible())await page.locator('#closeSeasonReviewBtn').click();
 await expect(page.locator('#seasonReviewModal')).not.toBeVisible();
 const slot=`admitted-source-year-${worker?'worker':'in-page'}`;await saveSlot(page,slot);
 await page.evaluate(async()=>{
  const {api}=await import('./lib/appState.js');
  await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2026,controlledTeamId:'MIA',mode:'play'}});
  await (await import('./lib/gameFlow.js')).loadState();
 });
 expect((await readClient(page,'/api/state')).controlledTeamId).toBe('MIA');
 await page.locator('[data-testid="tab-settings"]').click();await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
 await page.locator('#saveSlotInput').fill(slot);await page.locator('#loadBtn').click();
 await expect.poll(async()=>(await readClient(page,'/api/state')).controlledTeamId).toBe('BUF');
 await expect(page.locator('#statusChip')).toContainText('Ready');await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=(await readClient(page,'/api/snapshot/export')).snapshot;
 expect(restored.league.players.find(p=>p.id===playerId).elevationInjuryPay).toEqual(retained.elevationInjuryPay);
 expect(restored.league.admittedInjuryContinuations).toEqual(result.league.admittedInjuryContinuations);
 expect(restored.league.injurySalaryClaims?.length||0).toBe(0);
 const manifest=JSON.parse(await fs.readFile('static/deploy-manifest.json','utf8'));
 await fs.mkdir('.cache/admitted-source-year-client',{recursive:true});
 await fs.writeFile(`.cache/admitted-source-year-client/${worker?'worker':'in-page'}.json`,JSON.stringify({worker,playerId,artifactDigest:manifest.artifactFingerprint.digest,
  explicitBuiltCalendarMode:true,actualAnnualAfterRecovery:true,namedSaveReplacementLoadReload:true,payrollWeeks:[24,25,26],admittedRightPreserved:true,claimsCreated:0,liveAnnualPolicyChanged:false},null,2)+'\n');
});
