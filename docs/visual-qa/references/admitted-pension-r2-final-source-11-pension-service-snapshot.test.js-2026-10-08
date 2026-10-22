import test from 'node:test';
import assert from 'node:assert/strict';
import { compactSnapshotPensionService, expandSnapshotPensionService } from '../src/runtime/pensionServiceSnapshot.js';
import { generatedPensionService } from '../src/domain/pensionService.js';
import { createSession, createSessionFromSnapshot } from '../src/runtime/bootstrap.js';
import { inspectSnapshotCompatibility } from '../src/runtime/snapshotMigration.js';
import { encodeSnapshot, decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';

test('interned histories round-trip exactly across active, retired and unsigned cohorts without sharing restored state', () => {
  const state = generatedPensionService(4);
  const player = id => ({ id, pensionService: structuredClone(state) });
  const raw = { league: { players: [player('a'), player('b')], retiredPlayers: [player('c')], pendingDraft: { available: [player('d')] } } };
  const before = JSON.stringify(raw), compact = compactSnapshotPensionService(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(compact.pensionServiceStorage.dictionary.length, 1);
  assert.equal(compactSnapshotPensionService(compact), compact);
  const expanded = expandSnapshotPensionService(compact);
  assert.deepEqual(expanded, raw);
  expanded.league.players[0].pensionService.baseline.seasons = 99;
  assert.equal(expanded.league.players[1].pensionService.baseline.seasons, 4);
  assert.equal(compact.pensionServiceStorage.dictionary[0].baseline.seasons, 4);
});

test('actual saves restore pension ledgers from current dictionary and raw legacy representations', async () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  session.advanceWeek();
  const snapshot = session.toSnapshot(), raw = expandSnapshotPensionService(snapshot), seed = session.rng.seed;
  for (const saved of [raw, await decodeSnapshot(await encodeSnapshot(snapshot))]) {
    const restored = createSessionFromSnapshot(saved);
    assert.deepEqual(restored.league.players.map(p => p.pensionService), session.league.players.map(p => p.pensionService));
    assert.equal(restored.rng.seed, seed);
  }
});

test('malformed dictionary markers and references refuse both restore seams without mutating input', () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  for (const kind of ['version', 'out-of-range', 'negative', 'object-reference']) {
    const saved = session.toSnapshot();
    if (kind === 'version') saved.pensionServiceStorage.version = 'future-unsupported';
    else saved.league.players[0].pensionService = kind === 'out-of-range' ? saved.pensionServiceStorage.dictionary.length
      : kind === 'negative' ? -1 : generatedPensionService(0);
    const before = JSON.stringify(saved);
    assert.equal(inspectSnapshotCompatibility(saved).reasonCode, 'SNAPSHOT_PENSION_STORAGE_INVALID', kind);
    assert.throws(() => createSessionFromSnapshot(saved), error => error.reasonCode === 'SNAPSHOT_PENSION_STORAGE_INVALID', kind);
    assert.equal(JSON.stringify(saved), before);
  }
});
