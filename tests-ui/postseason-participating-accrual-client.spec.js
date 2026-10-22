import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {createSession} from '../src/runtime/bootstrap.js';
import {createPostseasonState,nextPostseasonGame} from '../src/engine/seasonSimulator.js';
import {standardElevationGame,declareStandardElevation,settleStandardElevationGame} from '../src/domain/standardElevations.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {expandSnapshotPensionService} from '../src/runtime/pensionServiceSnapshot.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';

let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
for(const worker of [true,false]) test(`built ${worker?'worker':'in-page'} pays participating clearance interval and restores named save`,async({page})=>{
  test.setTimeout(150000);
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF',mode:'play'});
  session.phase='postseason';session.currentWeek=19;
  session.postseasonState=createPostseasonState({league:session.league,year:2026});
  const next=nextPostseasonGame(session.postseasonState,session.league);
  session.controlledTeamId=next.homeTeamId;
  const team=session.league.teams.find(row=>row.id===next.homeTeamId);
  team.staff.medicalDirector.discipline=72;team.owner.facilities.rehab=72;
  const player=session.league.players.find(row=>row.teamId===team.id&&row.rosterSlot==='practice'&&row.experience===0);
  const source=standardElevationGame({year:2026,week:18,homeTeamId:team.id,awayTeamId:'BUF'});
  expect(declareStandardElevation({league:session.league,player,teamId:team.id,game:source,capSpace:1e8}).ok).toBe(true);
  settleStandardElevationGame({league:session.league,result:{...source,winnerId:team.id}});
  applyInjury(player,{type:'Out 1W',weeksRemaining:1},{gameId:source.gameId});
  const pension=structuredClone(player.pensionService);
  await configureClient(page,worker);
  await createClientLeague(page,host.origin,{seed:117,year:2026,team:team.id,mode:'play'});
  await assertRuntime(page,worker);
  await page.evaluate(async snapshot=>{
    const {api}=await import('./lib/appState.js');
    await api('/api/snapshot/import',{method:'POST',body:{snapshot}});
    await (await import('./lib/gameFlow.js')).loadState();
  },session.toSnapshot());
  const state=await readClient(page,'/api/state'),decision=state.gmDecisionQueue?.[0];
  const advanced=await page.evaluate(async({state,decision})=>{
    const {api}=await import('./lib/appState.js');
    return api('/api/advance-week',{method:'POST',body:{count:1,weeklyTacticOverride:'run-heavy',
      ...(decision?{gmDecisionChoice:{decisionId:decision.id,choiceId:decision.options[0].id,occurrenceKey:decision.occurrenceKey,week:state.currentWeek}}:{})}});
  },{state,decision});
  expect(advanced.ok,JSON.stringify(advanced)).toBe(true);
  const check=async()=>{
    const {snapshot}=await readClient(page,'/api/snapshot/export');
    const saved=expandSnapshotPensionService(snapshot).league.players.find(row=>row.id===player.id);
    expect(saved.injury).toBeNull();
    expect(saved.elevationInjuryPay.episodes[0].status).toBe('recovered');
    expect(saved.elevationInjuryPay.payroll).toHaveLength(1);
    expect(saved.elevationInjuryPay.payroll[0]).toMatchObject({gameId:source.gameId,teamId:team.id,year:2026,week:19,payCents:2861111,practiceCents:1375000,additionalCents:1486111,capChargeCents:0});
    expect(saved.pensionService).toEqual(pension);
    expect(saved.contract.postseasonPayLedger['2026:postseason:19'].amount).toBe(13750);
    return saved.elevationInjuryPay;
  };
  await check();await saveSlot(page,'participating-accrual');
  await page.evaluate(async()=>{
    const {api}=await import('./lib/appState.js');
    await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2026,controlledTeamId:'BUF',mode:'play'}});
    await (await import('./lib/gameFlow.js')).loadState();
  });
  await page.locator('[data-testid="tab-settings"]').click();
  await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
  await page.locator('#saveSlotInput').fill('participating-accrual');await page.locator('#loadBtn').click();
  await expect.poll(async()=>(await readClient(page,'/api/state')).controlledTeamId).toBe(team.id);
  await check();await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
  const evidence=await check();
  const manifest=JSON.parse(await fs.readFile('static/deploy-manifest.json'));
  await fs.mkdir('.cache/participating-accrual-browser',{recursive:true});
  await fs.writeFile(`.cache/participating-accrual-browser/${worker?'worker':'in-page'}.json`,JSON.stringify({worker,artifactDigest:manifest.artifactFingerprint.digest,actualWildcardAdvance:true,namedSaveReplacementLoadReload:true,evidence,scope:'Controlled settled week18 source and one-week injury; actual built wildcard round, not a natural full season'},null,2));
});
