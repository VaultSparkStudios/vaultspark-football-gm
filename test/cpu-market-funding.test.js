import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/runtime/bootstrap.js';

function fixture({ controlledTeamId = 'BUF' } = {}) {
  const session = createSession({ seed: 20260817, startYear: 2026, controlledTeamId });
  session.phase = 'offseason';
  const players = session.league.players.filter(p => p.teamId === 'MIA' && p.rosterSlot !== 'practice').slice(0, 2);
  for (const p of players) { p.teamId = 'FA'; p.overall = 90; }
  session.rebuildLookupIndexes();
  session.league.capLedger.CIN.rollover = 0;
  function fund(room) {
    const summary = session.getTeamCapSummary('CIN');
    session.league.teamCapOverride.CIN = summary.usedCap + summary.deadCap + room;
  }
  function bid(player, initiator = 'cpu') {
    const result = session.submitFreeAgencyOffer({ teamId: 'CIN', playerId: player.id, years: 1, salary: 10_000_000, initiator });
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  return { session, players, fund, bid };
}

test('CPU market resolution preserves rookie funding, including restored offers without origin', () => {
  for (const legacy of [false, true]) {
    const f = fixture(); f.fund(11_000_000); f.bid(f.players[0]);
    if (legacy) delete f.session.league.freeAgencyMarket.offers[0].origin;
    const rngBefore = f.session.rng.seed;
    const ledgerBefore = structuredClone(f.session.league.capLedger.CIN);
    assert.equal(f.session.processFreeAgencyMarket().signed, 0);
    assert.equal(f.players[0].teamId, 'FA');
    assert.notEqual(f.session.rng.seed, rngBefore, 'the ordinary contract quote still consumes its existing random draw');
    assert.deepEqual(f.session.league.capLedger.CIN, ledgerBefore, 'planning does not add a cap charge');
  }
});

test('multiple affordable bids cannot each spend the same remaining rookie budget', () => {
  const f = fixture();
  f.fund(f.session.getCpuRosterSpendingPlan('CIN').reserved + 11_000_000);
  f.players.forEach(p => f.bid(p));
  assert.equal(f.session.processFreeAgencyMarket().signed, 1);
  assert.equal(f.players.filter(p => p.teamId === 'CIN').length, 1);
  assert.ok(f.session.getTeamCapSummary('CIN').capSpace >= f.session.getCpuRosterSpendingPlan('CIN').reserved);
});

test('a GM bid retains spending authority and in-season CPU bids do not reserve next-year rookies', () => {
  for (const mode of ['gm', 'regular-season']) {
    const f = fixture({ controlledTeamId: mode === 'gm' ? 'CIN' : 'BUF' });
    if (mode === 'regular-season') f.session.phase = mode;
    f.fund(11_000_000); f.bid(f.players[0], mode === 'gm' ? 'player' : 'cpu');
    assert.equal(f.session.processFreeAgencyMarket().signed, 1);
    assert.equal(f.players[0].teamId, 'CIN');
  }
});

test('completed drafts release rookie planning room and partial boards reserve only remaining selections', () => {
  const f = fixture();
  const slots = f.session.buildDraftOrder(2027).slots;
  const cin = slots.find(slot => slot.teamId === 'CIN');
  f.session.league.pendingDraft = { year: 2027, completed: false, currentPick: 2,
    slots: [cin, { ...cin, round: 7, compensatory: true }] };
  const partial = f.session.getCpuRosterSpendingPlan('CIN').rookieReserve;
  assert.ok(partial > 0);
  f.session.league.pendingDraft.completed = true;
  assert.equal(f.session.getCpuRosterSpendingPlan('CIN').rookieReserve, 0);
  f.fund(11_000_000); f.bid(f.players[0]);
  assert.equal(f.session.processFreeAgencyMarket().signed, 1);
});
