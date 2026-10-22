import {test,expect} from '@playwright/test';
import {createSession} from '../src/runtime/bootstrap.js';
import {standardElevationGame,declareStandardElevation,settleStandardElevationGame} from '../src/domain/standardElevations.js';
import {recordPracticeWeekPay} from '../src/domain/practiceContracts.js';
import {applyInjury} from '../src/engine/injurySystem.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';

let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
const scenario={seed:117,year:2026,team:'BUF',mode:'play'};

for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} restores injury pay, team cap and release refusal`,async({page})=>{
  await configureClient(page,worker);await createClientLeague(page,host.origin,scenario);await assertRuntime(page,worker);
  // A controlled saved injury specimen, imported through the real career API.
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF',mode:'play'});
  session.currentWeek=2;session.phase='regular-season';
  const player=session.league.players.find(p=>p.teamId==='BUF'&&p.rosterSlot==='practice'&&p.experience===0&&!p.injury?.weeksRemaining&&!p.suspensionWeeks);
  const game=standardElevationGame({year:2026,week:1,homeTeamId:'BUF',awayTeamId:'MIA'});
  expect(declareStandardElevation({league:session.league,player,teamId:'BUF',game,capSpace:session.getTeamCapSummary('BUF').capSpace}).ok).toBe(true);
  settleStandardElevationGame({league:session.league,result:{...game,winnerId:'BUF'}});
  applyInjury(player,{type:'Out 4W',weeksRemaining:4},{gameId:game.gameId});
  recordPracticeWeekPay(session.league,{year:2026,week:2});
  const snapshot=session.toSnapshot(),expectedCap=session.getTeamCapSummary('BUF').usedCap;
  const imported=await page.evaluate(async snapshot=>{
    const {createApiClient}=await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/snapshot/import',{method:'POST',body:{snapshot}});
  },snapshot);
  expect(imported.ok).toBe(true);
  const check=async()=>{
    const exported=await readClient(page,'/api/snapshot/export');
    expect(exported.snapshot.league.players.find(p=>p.id===player.id).elevationInjuryPay).toEqual(player.elevationInjuryPay);
    expect((await readClient(page,'/api/roster?team=BUF')).cap.usedCap).toBe(expectedCap);
  };
  await check();await saveSlot(page,'elevation-injury-verified');
  await page.reload();await waitGameReady(page);await assertRuntime(page,worker);await check();
  const refusal=await page.evaluate(async id=>{
    const {createApiClient}=await import('./lib/api/createApiClient.js');
    try{return await createApiClient()('/api/release',{method:'POST',body:{teamId:'BUF',playerId:id}});}
    catch(error){return {status:error.status,reasonCode:error.payload?.reasonCode||error.details?.reasonCode||error.reasonCode};}
  },player.id);
  expect(refusal.reasonCode).toBe('ELEVATION_INJURY_SETTLEMENT_REQUIRED');await check();
});
