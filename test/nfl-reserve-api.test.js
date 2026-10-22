import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalApiRuntime } from '../src/app/api/localApiRuntime.js';

test('roster API preserves boolean option validation and exposes actual reserve return prerequisites', async () => {
  const data = new Map();
  const storage = { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(String(key), String(value)), removeItem: key => data.delete(key) };
  const runtime = createLocalApiRuntime({ storage, scheduler: fn => fn() });
  const created = await runtime.request('/api/new-league', { method: 'POST', body: { seed: 20260306, startYear: 2026, controlledTeamId: 'BUF' } });
  assert.equal(created.status, 200);
  const exported = await runtime.request('/api/snapshot/export');
  const snapshot = exported.payload.snapshot;
  const player = snapshot.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'active' && p.position === 'WR');
  player.injury = { origin: 'football', weeksRemaining: 6, type: 'recorded-api-fixture' };
  assert.equal((await runtime.request('/api/snapshot/import', { method: 'POST', body: { snapshot } })).status, 200);
  const baseline = (await runtime.request('/api/snapshot/export')).payload.snapshot;
  const normalizedPlayer = structuredClone(baseline.league.players.find(p => p.id === player.id));
  const body = { teamId: 'BUF', playerId: player.id, designation: 'ir' };
  for (const options of [{ active: 'false' }, { beginPractice: 'true' }, { returnEligible: 'false' }, { returnEligible: null }]) {
    const refused = await runtime.request('/api/roster/designation', { method: 'POST', body: { ...body, ...options } });
    assert.equal(refused.status, 400);
    assert.equal(refused.payload.reasonCode, 'RESERVE_OPTIONS_INVALID');
    const state = (await runtime.request('/api/snapshot/export')).payload.snapshot;
    assert.deepEqual(state.league.players.find(p => p.id === player.id), normalizedPlayer);
    assert.equal(state.rngSeed, baseline.rngSeed);
    assert.deepEqual(state.rngStreams, baseline.rngStreams);
  }
  const placed = await runtime.request('/api/roster/designation', { method: 'POST', body });
  assert.equal(placed.status, 200);
  const dto = placed.payload.roster.find(p => p.id === player.id);
  assert.equal(dto.rosterSlot, 'reserve');
  assert.equal(dto.reserveStatus.gamesMissed, 0);
  assert.equal(dto.reserveStatus.practice.ok, false);
  assert.equal(dto.reserveStatus.activation.ok, false);
  const blocked = await runtime.request('/api/roster/designation', { method: 'POST', body: { ...body, active: false, beginPractice: true } });
  assert.equal(blocked.payload.reasonCode, 'RESERVE_GAMES_REQUIRED');
});
