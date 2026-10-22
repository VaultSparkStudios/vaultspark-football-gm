import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';

test('regular season opens an upcoming scouting class without opening the draft clock', () => {
  const session = createSession({ seed: 117801, startYear: 2026, controlledTeamId: 'BUF' });
  const board = session.getScoutingBoard();
  assert.equal(board.active, true);
  assert.ok(board.prospects.length > 0);
  assert.equal(session.league.pendingDraft.year, 2027);
  assert.equal(session.getDraftState(), null);
  assert.equal(session.getDraftAuthority(), null);
  assert.equal(session.getOnClockTradeMarket().active, false);
  const before = JSON.stringify(session.toSnapshot());
  assert.equal(session.runCpuDraft({ untilUserPick: false }).ok, false);
  assert.equal(session.draftUserPick({ playerId: board.prospects[0].playerId }).ok, false);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  assert.equal(session.allocateScoutingPoints({ playerId: board.prospects[0].playerId, points: 10 }).ok, true);
  assert.equal(session.getScoutingBoard({ teamId: 'MIA' }).prospects[0].scoutedOverall, null);
});

test('offseason preparation keeps the scouted class, investment and locked board through compressed restore', async () => {
  const session = createSession({ seed: 117802, startYear: 2026, controlledTeamId: 'BUF' });
  const id = session.getScoutingBoard().prospects[0]?.playerId;
  assert.ok(id, 'regular-season prospect must exist');
  assert.equal(session.allocateScoutingPoints({ playerId: id, points: 35 }).ok, true);
  assert.equal(session.lockDraftBoard({ playerIds: [id] }).ok, true);
  const prospects = structuredClone(session.league.pendingDraft.available);
  const state = structuredClone(session.ensureScoutingTeamState('BUF'));
  const restored = createSessionFromSnapshot(await decodeSnapshot(await encodeSnapshot(session.toSnapshot())));
  restored.phase = 'season-awards';
  restored.advanceSeasonAwardsPhase();
  assert.deepEqual(restored.league.pendingDraft.available, prospects);
  assert.deepEqual(restored.ensureScoutingTeamState('BUF'), state);
  assert.ok(restored.getDraftState());
  const before = JSON.stringify(restored.toSnapshot());
  restored.prepareDraft();
  assert.equal(JSON.stringify(restored.toSnapshot()), before, 'repeated preparation cannot reroll or reset scouting');
});

test('next season archives completed selections and opens a distinct class, clearing only stale private reads', () => {
  const session = createSession({ seed: 117803, startYear: 2026, controlledTeamId: 'BUF' });
  const draft = session.prepareDraft();
  const id = draft.available[0].id;
  session.allocateScoutingPoints({ playerId: id, points: 10 });
  session.lockDraftBoard({ playerIds: [id] });
  const receipt = { pick: 1, playerId: id, teamId: 'BUF', player: draft.available[0].name, pos: draft.available[0].position };
  draft.completed = true; draft.selections = [receipt];
  session.startSeason(2027);
  assert.equal(session.league.pendingDraft.year, 2028);
  assert.ok(!session.league.pendingDraft.available.some(p => p.id === id));
  assert.deepEqual(session.league.draftHistory[0].selections, [receipt]);
  const state = session.ensureScoutingTeamState('BUF');
  assert.equal(state.locked, false);
  assert.deepEqual(state.board, []);
  assert.equal(state.evaluations[id], undefined);
  assert.ok(state.weeklyReports.length > 0, 'historical scouting journal remains');
});

test('same-year historical and started boards preserve selections and never generate replacements', () => {
  for (const legacy of [true, false]) {
    const session = createSession({ seed: 117804, startYear: 2026, controlledTeamId: 'BUF' });
    const draft = session.prepareDraft();
    if (legacy) delete draft.cohort;
    session.runCpuDraft({ picks: 1, untilUserPick: false });
    const before = JSON.stringify(session.toSnapshot());
    assert.equal(session.prepareDraft(), draft);
    assert.equal(JSON.stringify(session.toSnapshot()), before);
  }
});

test('restoring a legacy regular season with no upcoming board repairs it once', () => {
  const session = createSession({ seed: 117805, startYear: 2026, controlledTeamId: 'BUF' });
  const snapshot = structuredClone(session.toSnapshot());
  snapshot.league.pendingDraft = null;
  const restored = createSessionFromSnapshot(snapshot);
  assert.equal(restored.getScoutingBoard().active, true);
  assert.equal(restored.league.pendingDraft.year, 2027);
  const next = createSessionFromSnapshot(structuredClone(restored.toSnapshot()));
  assert.deepEqual(next.league.pendingDraft, restored.league.pendingDraft);
  assert.equal(next.rng.seed, restored.rng.seed);
});

test('existing legacy classes keep frozen selections but gain no in-season clock authority', () => {
  for (const frozen of [false, true]) {
    const session = createSession({ seed: 117806, startYear: 2026, controlledTeamId: 'BUF' });
    session.prepareDraft();
    if (frozen) session.runCpuDraft({ picks: 1, untilUserPick: false });
    const snapshot = structuredClone(session.toSnapshot());
    delete snapshot.league.pendingDraft.scoutingOnly;
    // Compare restored live players with live authority, not compact storage
    // buckets/references introduced by the versioned snapshot encoders.
    const original = structuredClone(session.league.pendingDraft);
    const restored = createSessionFromSnapshot(snapshot);
    assert.deepEqual(restored.league.pendingDraft.available, original.available);
    assert.deepEqual(restored.league.pendingDraft.selections, original.selections);
    assert.equal(restored.getDraftAuthority(), null);
    assert.equal(restored.runCpuDraft({ picks: 1, untilUserPick: false }).ok, false);
    assert.equal(restored.getScoutingBoard().active, true);
  }
  const session = createSession({ seed: 117807, startYear: 2026, controlledTeamId: 'BUF' });
  session.prepareDraft();
  session.prepareDraft({ scoutingOnly: true });
  assert.equal(session.runCpuDraft({ picks: 1, untilUserPick: false }).ok, false);
});

test('direct legacy offseason entry opens the preserved class at the draft calendar stage', () => {
  const session = createSession({ seed: 117808, startYear: 2026, controlledTeamId: 'BUF' });
  const ids = session.league.pendingDraft.available.map(p => p.id);
  session.phase = 'offseason';
  session.resetOffseasonPipeline(session.currentYear);
  for (let guard=0; session.getOffseasonPipeline().stage!=='draft' && guard<12; guard++) session.advanceWeek();
  assert.equal(session.getOffseasonPipeline().stage, 'draft');
  assert.ok(session.getDraftAuthority());
  assert.deepEqual(session.league.pendingDraft.available.map(p => p.id), ids);
  assert.equal(session.runCpuDraft({ picks: 1, untilUserPick: false }).ok, true);
});

test('same-year completed draft archives once without replacing its class or private scouting', () => {
  const session=createSession({seed:117809,startYear:2026,controlledTeamId:'BUF'});
  const draft=session.prepareDraft(),prospect=draft.available[0];
  session.allocateScoutingPoints({playerId:prospect.id,points:10});
  session.lockDraftBoard({playerIds:[prospect.id]});
  draft.completed=true;
  draft.selections=[{pick:1,round:1,teamId:'BUF',playerId:prospect.id,player:prospect.name,pos:prospect.position}];
  const scouting=structuredClone(session.ensureScoutingTeamState('BUF')),rng=session.rng.seed;
  assert.equal(session.prepareDraft(),draft);
  assert.deepEqual(session.league.draftHistory[0].selections,draft.selections);
  assert.deepEqual(session.ensureScoutingTeamState('BUF'),scouting);
  assert.equal(session.rng.seed,rng);
  const after=JSON.stringify(session.toSnapshot());
  session.prepareDraft();
  assert.equal(session.league.draftHistory.length,1);
  assert.equal(JSON.stringify(session.toSnapshot()),after);
  const restored=createSessionFromSnapshot(structuredClone(session.toSnapshot()));
  assert.equal(restored.getDashboardState().draftHistory[0].selections[0].playerId,prospect.id);
});
