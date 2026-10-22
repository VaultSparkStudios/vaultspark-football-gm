import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { createPostseasonState, nextPostseasonGame, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { standardElevationGame, declareStandardElevation, settleStandardElevationGame } from '../src/domain/standardElevations.js';
import { applyInjury } from '../src/engine/injurySystem.js';
import { regularElevationSalaryForSeason } from '../src/data/nflElevationSalary.js';
import { previewPostseasonGameRecovery, commitPostseasonInjuryAccrual } from '../src/domain/postseasonMedicalClock.js';

test('participating club retains the elapsed clearance-week adjustment after successful wildcard application', () => {
  const session = createSession({seed:117,startYear:2026,controlledTeamId:'BUF'});
  session.phase = 'postseason'; session.currentWeek = 19;
  session.postseasonState = createPostseasonState({league:session.league,year:2026});
  const next = nextPostseasonGame(session.postseasonState,session.league);
  const team = session.league.teams.find(row=>row.id===next.homeTeamId);
  team.staff.medicalDirector.discipline=72; team.owner.facilities.rehab=72;
  const player = session.league.players.find(row=>row.teamId===team.id && row.rosterSlot==='practice' && row.experience===0);
  assert.ok(player);
  const source = standardElevationGame({year:2026,week:18,homeTeamId:team.id,awayTeamId:'BUF'});
  assert.equal(declareStandardElevation({league:session.league,player,teamId:team.id,game:source,capSpace:1e8}).ok,true);
  settleStandardElevationGame({league:session.league,result:{...source,winnerId:team.id}});
  applyInjury(player,{type:'Out 1W',weeksRemaining:1},{gameId:source.gameId});
  const pensionBefore = structuredClone(player.pensionService);
  const payCents = regularElevationSalaryForSeason(2026,0,{rate:'injury-continuation-down'}).weeklyAmountCents;
  const receipts = [], beforePreview = JSON.stringify(session.toSnapshot());
  previewPostseasonGameRecovery({state:session.postseasonState,league:session.league,next,year:2026,
    onInjuryAccrualPreview:rows=>receipts.push(...rows)});
  assert.equal(JSON.stringify(session.toSnapshot()),beforePreview);
  simulateNextPostseasonGame({state:session.postseasonState,league:session.league,statBook:session.statBook,year:2026,rng:session.rng});
  assert.equal(player.injury,null);
  assert.equal(player.elevationInjuryPay.episodes[0].status,'recovered');
  const base = player.contract.postseasonPayLedger['2026:postseason:19'].amount*100;
  assert.equal(base,1375000);
  assert.deepEqual(player.elevationInjuryPay.payroll.map(row=>({week:row.week,gameId:row.gameId,teamId:row.teamId,payCents:row.payCents,practiceCents:row.practiceCents,additionalCents:row.additionalCents})),
    [{week:19,gameId:source.gameId,teamId:team.id,payCents,practiceCents:base,additionalCents:payCents-base}]);
  assert.deepEqual(player.pensionService,pensionBefore);
  const restored = createSessionFromSnapshot(session.toSnapshot());
  assert.deepEqual(restored.getPlayerById(player.id).elevationInjuryPay,player.elevationInjuryPay);
  const beforeRetry = JSON.stringify(restored.toSnapshot());
  assert.deepEqual(commitPostseasonInjuryAccrual({league:restored.league,year:2026,receipts}),{applied:0});
  assert.equal(JSON.stringify(restored.toSnapshot()),beforeRetry);
  const forged = structuredClone(receipts); forged[0].additionalCents++;
  assert.throws(()=>commitPostseasonInjuryAccrual({league:restored.league,year:2026,receipts:forged}), /Invalid postseason medical clock/);
  assert.equal(JSON.stringify(restored.toSnapshot()),beforeRetry);
});
