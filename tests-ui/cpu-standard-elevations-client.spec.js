import { test, expect } from '@playwright/test';
import { createSession } from '../src/runtime/bootstrap.js';
import {expandSnapshotIdentityMetadata} from '../src/runtime/identityMetadataSnapshot.js';
import { createPostseasonState, nextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { startStaticClientHost, configureClient, createClientLeague, readClient, assertRuntime, saveSlot, waitGameReady } from './helpers/static-client.js';

let host;
test.beforeAll(async () => { host = await startStaticClientHost(); });
test.afterAll(async () => { await host?.close(); });
for (const worker of [true, false]) test(`built ${worker ? 'worker' : 'in-page'} makes and settles CPU playoff elevation without replacing identity or practice terms`, async ({page}) => {
  const session = createSession({seed:117,startYear:2026,controlledTeamId:'BUF',mode:'play'});
  session.phase='postseason'; session.currentWeek=19; session.league.settings.allowInjuries=false;
  session.postseasonState=createPostseasonState({league:session.league,year:2026});
  const next=nextPostseasonGame(session.postseasonState,session.league);
  session.controlledTeamId=next.awayTeamId;
  const player=session.league.players.find(row=>row.teamId===next.homeTeamId&&row.rosterSlot==='practice'&&row.experience===0);
  for(const row of session.league.players.filter(row=>row.teamId===player.teamId&&row.rosterSlot==='active'&&row.position===player.position))
    row.injury={type:'Out 9W',weeksRemaining:9};
  player.injury={type:'Out 1W',weeksRemaining:1};
  const identity=structuredClone(player.profile), contract=structuredClone(player.contract);
  await configureClient(page,worker);
  await createClientLeague(page,host.origin,{seed:117,year:2026,team:next.awayTeamId,mode:'play'});
  await assertRuntime(page,worker);
  const imported=await page.evaluate(async snapshot=>{
    const {createApiClient}=await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/snapshot/import',{method:'POST',body:{snapshot}});
  },session.toSnapshot());
  expect(imported.ok).toBe(true);
  const before=(await readClient(page,'/api/snapshot/export')).snapshot;
  await readClient(page,'/api/state'); await readClient(page,'/api/state');
  const afterReads=(await readClient(page,'/api/snapshot/export')).snapshot;
  // API diagnostics deliberately count these reads. Compare every gameplay
  // and random-state field while excluding only that diagnostic record.
  delete before.league.observability; delete afterReads.league.observability;
  expect(afterReads).toEqual(before);
  await saveSlot(page,'cpu-elevation-before');
  await page.reload(); await waitGameReady(page); await assertRuntime(page,worker);
  const state=await readClient(page,'/api/state'),decision=state.gmDecisionQueue?.[0];
  const advanced=await page.evaluate(async ({state,decision})=>{
    const {createApiClient}=await import('./lib/api/createApiClient.js');
    return createApiClient()('/api/advance-week',{method:'POST',body:{count:1,weeklyTacticOverride:'run-heavy',
      ...(decision?{gmDecisionChoice:{decisionId:decision.id,choiceId:decision.options[0].id,occurrenceKey:decision.occurrenceKey,week:state.currentWeek}}:{})}});
  },{state,decision});
  expect(advanced.ok,JSON.stringify(advanced)).toBe(true);
  const check=async()=>{
    const snapshot=(await readClient(page,'/api/snapshot/export')).snapshot;
    const saved=expandSnapshotIdentityMetadata(snapshot).league.players.find(row=>row.id===player.id);
    expect(saved.profile).toEqual(identity); expect(saved.rosterSlot).toBe('practice');
    expect(saved.contract.weeklySalary).toBe(contract.weeklySalary); expect(saved.contract.year).toBe(2026);
    const elevation=saved.standardElevations.games.find(row=>row.game.round==='wildcard');
    expect(elevation).toMatchObject({teamId:player.teamId,status:'reverted',capChargeCents:0});
    expect(elevation.game.homeTeamId).toBe(next.homeTeamId); expect(elevation.game.awayTeamId).toBe(next.awayTeamId);
    expect(elevation.payCents).toBeGreaterThan(0);
  };
  await check(); await page.reload(); await waitGameReady(page);
  if(await page.locator('#closeSeasonReviewBtn').isVisible()) await page.locator('#closeSeasonReviewBtn').click();
  if(await page.locator('#firstDebriefDecline').isVisible()) await page.locator('#firstDebriefDecline').click();
  await saveSlot(page,'cpu-elevation-after');
  await page.reload(); await waitGameReady(page); await assertRuntime(page,worker); await check();
});
