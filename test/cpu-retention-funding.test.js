import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/runtime/bootstrap.js';

function fixture({ room = 100_000_000, tradeAway = false } = {}) {
  const session = createSession({ seed: 20260817, startYear: 2026, controlledTeamId: 'BUF' });
  const candidate = session.league.players.find(p => p.teamId === 'CIN' && p.rosterSlot !== 'practice');
  candidate.teamId = 'FA';
  candidate.lastTeamId = 'CIN';
  for (const player of session.league.players) {
    if (player !== candidate && player.teamId === 'FA') player.lastTeamId = null;
  }
  if (tradeAway) {
    for (const pick of session.league.draftPicks) {
      if (pick.year === 2027 && pick.ownerTeamId === 'CIN') pick.ownerTeamId = 'BUF';
    }
  }
  session.league.capLedger.CIN.rollover = 0;
  const ledger = session.league.capLedger.CIN;
  const used = session.league.players.filter(p => p.status === 'active' && p.teamId === 'CIN')
    .reduce((sum, p) => sum + p.contract.capHit, 0);
  session.league.teamCapOverride.CIN = used + Number(ledger.deadCapCurrentYear || 0) + room;
  session.rebuildLookupIndexes();
  session.rng.chance = () => true;
  return { session, candidate };
}

test('retention reserves owned rookie obligations even when the veteran offer alone fits', () => {
  const funded = fixture();
  assert.equal(funded.session.runRetentionWindow().retained, 1);
  const offer = funded.candidate.contract.capHit;
  const tight = fixture({ room: offer + 1_000_000 });
  assert.equal(tight.session.runRetentionWindow().retained, 0);
  assert.equal(tight.candidate.teamId, 'FA');
  const traded = fixture({ room: offer + 1_000_000, tradeAway: true });
  assert.equal(traded.session.buildDraftOrder(2027).slots.filter(p => p.teamId === 'CIN').length, 0);
  assert.equal(traded.session.runRetentionWindow().retained, 1, 'the new owner funds traded picks');
  assert.equal(traded.candidate.contract.capHit, offer);
});

test('rookie spending quotes do not consume gameplay randomness or create cap obligations', () => {
  const owned = fixture();
  const traded = fixture({ tradeAway: true });
  const before = structuredClone(owned.session.league.capLedger.CIN);
  assert.equal(owned.session.runRetentionWindow().retained, 1);
  assert.equal(traded.session.runRetentionWindow().retained, 1);
  assert.equal(owned.session.rng.seed, traded.session.rng.seed);
  assert.deepEqual(owned.session.league.capLedger.CIN, before);
  assert.equal(owned.session.runRetentionWindow().alreadyRun, true);
});
