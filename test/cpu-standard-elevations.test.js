import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/runtime/bootstrap.js';
import { previewCpuStandardElevations, applyCpuStandardElevations } from '../src/engine/cpuStandardElevations.js';
import { standardElevationGame, settleStandardElevationGame, validateSnapshotStandardElevations } from '../src/domain/standardElevations.js';
import { capUsedByTeam } from '../src/engine/capCompliance.js';
import { simulateRegularSeasonWeek } from '../src/engine/weeklySimulator.js';
import { createPostseasonState, nextPostseasonGame, simulateNextPostseasonGame } from '../src/engine/seasonSimulator.js';
import { buildPracticeContract } from '../src/domain/practiceContracts.js';

function fixture() {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  const matchup = session.seasonSchedule[0].games.find(game => [game.homeTeamId, game.awayTeamId].includes('BUF'));
  const cpu = [matchup.homeTeamId, matchup.awayTeamId].find(id => id !== 'BUF');
  const player = session.league.players.find(row => row.teamId === cpu && row.rosterSlot === 'practice' && row.experience === 0);
  for (const row of session.league.players.filter(row => row.teamId === cpu && row.rosterSlot === 'active' && row.position === player.position))
    row.injury = { type: 'Out 9W', weeksRemaining: 9 };
  const game = standardElevationGame({ ...matchup, year: 2026, week: 1 });
  return { session, cpu, player, game, context: { league: session.league, games: [game], excludeTeamIds: ['BUF'] } };
}

test('pure CPU plans fill unavailable positional depth and respect controlled franchise authority', () => {
  const { session, cpu, player, context } = fixture();
  const before = JSON.stringify(session.toSnapshot());
  const first = previewCpuStandardElevations(context), second = previewCpuStandardElevations(context);
  assert.deepEqual(first.choices, second.choices);
  assert.ok(first.choices.some(row => row.playerId === player.id));
  assert.ok(first.choices.every(row => row.teamId === cpu));
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  const contract = structuredClone(player.contract);
  const chosen = applyCpuStandardElevations(context);
  assert.deepEqual(chosen, first.choices);
  assert.deepEqual(player.contract, contract); assert.equal(player.rosterSlot, 'practice');
  assert.deepEqual(applyCpuStandardElevations(context), []);
  validateSnapshotStandardElevations({ league: session.league });
});

test('shared cap reservations bound CPU choices cumulatively and refusal does not alter a save', () => {
  const { session, cpu, context } = fixture();
  session.league.teamCapOverride ||= {};
  session.league.teamCapOverride[cpu] = capUsedByTeam(session.league, cpu);
  const before = JSON.stringify(session.toSnapshot());
  assert.deepEqual(applyCpuStandardElevations(context), []);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  session.league.teamCapOverride[cpu] += 40_000;
  const choices = applyCpuStandardElevations(context);
  assert.ok(choices.length <= 1);
  assert.ok(choices.length > 0);
  validateSnapshotStandardElevations({ league: session.league });
});

test('CPU honours three regular uses and carries no invented reset into a fourth game', () => {
  const { session, player, game, context } = fixture();
  const chosen = applyCpuStandardElevations(context).find(row => row.playerId === player.id);
  assert.ok(chosen);
  settleStandardElevationGame({ league: session.league, result: { ...game, winnerId: game.homeTeamId } });
  for (const week of [2, 3]) {
    const next = standardElevationGame({ ...game, week });
    assert.ok(applyCpuStandardElevations({ ...context, games: [next] }).some(row => row.playerId === player.id));
    settleStandardElevationGame({ league: session.league, result: { ...next, winnerId: game.homeTeamId } });
  }
  assert.ok(!applyCpuStandardElevations({ ...context, games: [standardElevationGame({ ...game, week: 4 })] })
    .some(row => row.playerId === player.id));
  assert.equal(player.standardElevations.games.length, 3);
  assert.deepEqual(player.standardElevations.cycles, {});
});

test('injured or suspended practice players and clubs without scheduled games receive no declaration', () => {
  const { session, cpu, context } = fixture();
  for (const player of session.league.players.filter(row => row.teamId === cpu && row.rosterSlot === 'practice'))
    player.suspensionWeeks = 2;
  assert.deepEqual(applyCpuStandardElevations(context), []);
  const other = session.league.teams.find(team => !context.games.some(game => [game.homeTeamId, game.awayTeamId].includes(team.id)));
  assert.ok(session.league.players.filter(row => row.teamId === other.id).every(row => !row.standardElevations));
});

test('actual weekly engine applies and settles CPU declarations without touching user declarations', () => {
  const { session, player, game } = fixture();
  const contract = structuredClone(player.contract);
  const result = simulateRegularSeasonWeek({ league: session.league, statBook: session.statBook, year: 2026,
    weekBlock: { week: 1, games: [game] }, rng: session.rng, excludeElevationTeamIds: ['BUF'] });
  assert.ok(result.cpuElevations.some(row => row.playerId === player.id));
  assert.equal(player.standardElevations.games[0].status, 'reverted');
  assert.equal(player.rosterSlot, 'practice');
  assert.equal(player.contract.weeklySalary, contract.weeklySalary);
  const side = result.games[0].homeTeamId === player.teamId ? 'home' : 'away';
  assert.ok(result.games[0].boxScore.gameDayRosters[side].playerIds.includes(player.id));
  validateSnapshotStandardElevations({ league: session.league });
});

test('postseason recovery and CPU declaration use the actual round before automatic settlement', () => {
  const { session } = fixture();
  const state = createPostseasonState({ league: session.league, year: 2026 });
  const next = nextPostseasonGame(state, session.league);
  const player = session.league.players.find(row => row.teamId === next.homeTeamId && row.rosterSlot === 'practice' && row.experience === 0);
  player.injury = { type: 'Out 1W', weeksRemaining: 1 };
  for (const row of session.league.players.filter(row => row.teamId === player.teamId && row.rosterSlot === 'active' && row.position === player.position))
    row.injury = { type: 'Out 9W', weeksRemaining: 9 };
  const result = simulateNextPostseasonGame({ state, league: session.league, statBook: session.statBook,
    year: 2026, rng: session.rng, excludeElevationTeamIds: [next.awayTeamId] });
  assert.equal(player.injury, null);
  assert.equal(player.standardElevations.games[0].game.gameId, result.game.gameId);
  assert.equal(player.standardElevations.games[0].status, 'reverted');
  assert.equal(player.standardElevations.games[0].capChargeCents, 0);
  validateSnapshotStandardElevations({ league: session.league });
});

test('two-game limit and deterministic equal-merit selection survive crowded eligible practice depth', () => {
  const { session, cpu, context } = fixture();
  for (const row of session.league.players.filter(row => row.teamId === cpu && row.rosterSlot === 'active')) row.injury = null;
  for (const row of session.league.players.filter(row => row.teamId === cpu && row.rosterSlot === 'active' && row.position === 'QB'))
    row.injury = { type: 'Out 9W', weeksRemaining: 9 };
  const candidates = session.league.players.filter(row => row.teamId === cpu && row.rosterSlot === 'practice').slice(0, 5);
  for (const player of candidates) { player.position = 'QB'; player.overall = 75; player.injury = null; player.suspensionWeeks = 0;
    player.contract = buildPracticeContract(player, { year: 2026 }); }
  const choices = applyCpuStandardElevations(context);
  assert.equal(choices.length, 2);
  assert.deepEqual(choices.map(row => row.playerId), candidates.map(row => row.id).sort((a,b)=>a.localeCompare(b)).slice(0,2));
  validateSnapshotStandardElevations({ league: session.league });
});

test('an unusable later matchup refuses the whole weekly plan before declarations or RNG change', () => {
  const { session, context } = fixture();
  const later = session.seasonSchedule[0].games.find(game => ![context.games[0].homeTeamId,context.games[0].awayTeamId].includes(game.homeTeamId)
    && ![context.games[0].homeTeamId,context.games[0].awayTeamId].includes(game.awayTeamId));
  for (const player of session.league.players.filter(row => row.teamId === later.homeTeamId))
    player.injury = { type: 'Out 9W', weeksRemaining: 9 };
  const before = JSON.stringify(session.toSnapshot());
  assert.throws(() => simulateRegularSeasonWeek({ league: session.league, statBook: session.statBook, year: 2026,
    weekBlock: {week:1,games:[context.games[0],later]}, rng:session.rng, excludeElevationTeamIds:['BUF'] }), /available game-day/);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
});

test('historical seasons do not receive a fictional modern elevation', () => {
  const { session, context } = fixture();
  const before=JSON.stringify(session.toSnapshot());
  assert.deepEqual(applyCpuStandardElevations({...context,games:context.games.map(game=>({...game,year:2004}))}),[]);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
});

test('session postseason readiness allows CPU healthy practice depth while preserving the controlled empty-club refusal', () => {
  const {session}=fixture(); session.phase='postseason'; session.currentWeek=19;
  session.postseasonState=createPostseasonState({league:session.league,year:2026});
  const next=nextPostseasonGame(session.postseasonState,session.league);
  session.controlledTeamId=next.awayTeamId;
  for(const player of session.league.players.filter(row=>row.teamId===next.homeTeamId&&row.rosterSlot==='active'))
    player.injury={type:'Out 9W',weeksRemaining:9};
  const before=JSON.stringify(session.toSnapshot());
  assert.equal(session.getAdvanceReadiness().ok,true);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
  session.controlledTeamId=next.homeTeamId;
  assert.equal(session.getAdvanceReadiness().ok,false);
});

test('known empty playoff CPU club with negative cap refuses before session mutation', () => {
  const {session}=fixture(); session.phase='postseason'; session.currentWeek=19;
  session.postseasonState=createPostseasonState({league:session.league,year:2026});
  const next=nextPostseasonGame(session.postseasonState,session.league);
  session.controlledTeamId=next.awayTeamId;
  const candidate=session.league.players.find(row=>row.teamId===next.homeTeamId&&row.rosterSlot==='practice');
  for(const player of session.league.players.filter(row=>row.teamId===next.homeTeamId))
    player.injury={type:'Out 9W',weeksRemaining:9};
  candidate.injury=null;
  session.league.teamCapOverride||={};
  session.league.teamCapOverride[next.homeTeamId]=capUsedByTeam(session.league,next.homeTeamId)-1;
  const before=JSON.stringify(session.toSnapshot());
  assert.equal(session.getAdvanceReadiness().ok,false);
  assert.equal(session.advanceWeek().ok,false);
  assert.equal(JSON.stringify(session.toSnapshot()),before);
});
