import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonSchedule } from '../src/engine/schedule.js';
import { createLeagueBase } from '../src/domain/teamFactory.js';
import { RNG } from '../src/utils/rng.js';
import { validateSchedule } from '../src/sport/competitionContract.js';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';

test('new 2026 schedules keep every bye inside the published window and play Thanksgiving week', () => {
  const league = createLeagueBase(2026);
  for (const seed of [52031, 20260306, 8113, 5150, 1, 2, 3, 4, 5, 6]) {
    const schedule = buildSeasonSchedule({ league, year: 2026, rng: new RNG(seed) });
    assert.deepEqual(validateSchedule(schedule, { teamIds: league.teams.map(t=>t.id), gamesPerTeam:17, weeks:18 }), []);
    assert.equal(schedule.flatMap(w=>w.games).length, 272);
    for (const week of schedule) assert.ok(league.teams.length-week.games.length*2<=6, `week ${week.week} has too many byes`);
    assert.ok(schedule.at(-1).games.every(g=> {
      const home=league.teams.find(t=>t.id===g.homeTeamId), away=league.teams.find(t=>t.id===g.awayTeamId);
      return home.conference===away.conference && home.division===away.division;
    }), 'every finale matchup must be divisional');
    for (const team of league.teams) {
      const byes = schedule.filter(w=>!w.games.some(g=>g.homeTeamId===team.id||g.awayTeamId===team.id)).map(w=>w.week);
      assert.equal(byes.length, 1);
      assert.ok(byes[0]>=5 && byes[0]<=14 && byes[0]!==12, `${seed}/${team.id}: bye ${byes}`);
    }
  }
});

test('saved schedules remain authoritative even with a historical opening bye', () => {
  const session=createSession({seed:52031,startYear:2026,controlledTeamId:'BUF'});
  const bye=session.seasonSchedule.find(w=>!w.games.some(g=>g.homeTeamId==='BUF'||g.awayTeamId==='BUF'));
  // Exchange complete week blocks to represent an older opening-bye schedule,
  // retaining every matchup and a conflict-free seventeen-game season.
  const opening=session.seasonSchedule[0];
  [opening.games,bye.games]=[bye.games,opening.games];
  assert.deepEqual(validateSchedule(session.seasonSchedule,{teamIds:session.league.teams.map(t=>t.id),gamesPerTeam:17,weeks:18}),[]);
  const snapshot=JSON.parse(JSON.stringify(session.toSnapshot()));
  const restored=createSessionFromSnapshot(snapshot);
  assert.deepEqual(restored.seasonSchedule,snapshot.seasonSchedule);
  assert.equal(restored.rng.seed,session.rng.seed);
  assert.ok(!restored.seasonSchedule[0].games.some(g=>g.homeTeamId==='BUF'||g.awayTeamId==='BUF'));
});
