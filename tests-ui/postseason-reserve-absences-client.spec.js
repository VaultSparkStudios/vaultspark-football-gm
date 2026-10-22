import {test,expect} from '@playwright/test';
import {createSession} from '../src/runtime/bootstrap.js';
import {createPostseasonState,nextPostseasonGame} from '../src/engine/seasonSimulator.js';
import {transitionReserveList} from '../src/domain/reserveLists.js';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} records actual playoff reserve absence and preserves proof through save/import refusal`,async({page})=>{
  const session=createSession({seed:117,startYear:2026,controlledTeamId:'BUF',mode:'play'});
  session.phase='postseason';session.currentWeek=19;session.league.settings.allowInjuries=false;
  session.postseasonState=createPostseasonState({league:session.league,year:2026});
  const next=nextPostseasonGame(session.postseasonState,session.league);session.controlledTeamId=next.homeTeamId;
  const player=session.league.players.find(row=>row.teamId===next.homeTeamId&&row.rosterSlot==='active');
  player.injury={type:'Out 8W',weeksRemaining:8};
  expect(transitionReserveList(session.league,player,{year:2026,week:19,phase:'postseason'},{designation:'ir',active:true}).ok).toBe(true);
  await configureClient(page,worker);
  await createClientLeague(page,host.origin,{seed:117,year:2026,team:next.homeTeamId,mode:'play'});
  await assertRuntime(page,worker);
  const imported=await page.evaluate(async snapshot=>{
    const {createApiClient}=await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/snapshot/import',{method:'POST',body:{snapshot}});
  },session.toSnapshot());expect(imported.ok).toBe(true);
  await saveSlot(page,'reserve-playoff-before');await page.reload();await waitGameReady(page);
  const state=await readClient(page,'/api/state'),decision=state.gmDecisionQueue?.[0];
  const advanced=await page.evaluate(async({state,decision})=>{
    const {createApiClient}=await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/advance-week',{method:'POST',body:{count:1,weeklyTacticOverride:'run-heavy',
      ...(decision?{gmDecisionChoice:{decisionId:decision.id,choiceId:decision.options[0].id,occurrenceKey:decision.occurrenceKey,week:state.currentWeek}}:{})}});
  },{state,decision});expect(advanced.ok,JSON.stringify(advanced)).toBe(true);
  const check=async()=>{
    const snapshot=(await readClient(page,'/api/snapshot/export')).snapshot;
    const saved=snapshot.league.players.find(row=>row.id===player.id);
    expect(saved.rosterSlot).toBe('reserve');expect(saved.reserveStatus.gamesMissed.length).toBeGreaterThan(0);
    const first=snapshot.league.reserveGameHistory.find(row=>row.playerIds.includes(player.id));
    expect(first.game.week).toBe(0);expect(first.game.round).toBe('wildcard');
    expect(first.game.homeTeamId).toBe(next.homeTeamId);expect(first.game.awayTeamId).toBe(next.awayTeamId);
    expect(first.key).toBe(`2026:playoffs:19:${next.homeTeamId}:${next.awayTeamId}`);
    expect(saved.reserveStatus.gamesMissed).toContain(first.key);return snapshot;
  };
  await check();await page.reload();await waitGameReady(page);
  if(await page.locator('#closeSeasonReviewBtn').isVisible())await page.locator('#closeSeasonReviewBtn').click();
  if(await page.locator('#firstDebriefDecline').isVisible())await page.locator('#firstDebriefDecline').click();
  await saveSlot(page,'reserve-playoff-after');await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
  const before=await check(),bad=structuredClone(before);bad.league.reserveGameHistory[0].game.gameId='invented';
  const refused=await page.evaluate(async snapshot=>{
    const {createApiClient}=await import('./lib/api/createApiClient.js');
    try { return await createApiClient()('/api/snapshot/import',{method:'POST',body:{snapshot}}); }
    catch(error) { return error.payload; }
  },bad);expect(refused.ok).toBe(false);expect(refused.reasonCode).toBe('RESERVE_RECEIPT_INVALID');
  const after=await check();delete before.league.observability;delete after.league.observability;expect(after).toEqual(before);
});
