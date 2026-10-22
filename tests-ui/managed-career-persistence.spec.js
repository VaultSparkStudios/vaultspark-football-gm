import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodeSnapshot } from '../src/adapters/persistence/snapshotCodec.js';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { resolvePlayerMeasurements } from '../src/domain/playerMeasurements.js';
import { startStaticClientHost, configureClient, createClientLeague, assertRuntime, readClient, waitGameReady } from './helpers/static-client.js';

// Run with a source-bound actual managed-career input. Generating a substitute
// league here would not prove restoration of the user's 20–30-season career.
const inputFile = process.env.MANAGED_CAREER_INPUT;
// This test transfers a frozen fixture through a Playwright route. The game's
// service worker must not intercept that test-only URL before the route does.
test.use({ serviceWorkers: 'block' });
test.skip(!inputFile, 'Requires the actual managed-career save/report input; run separately with MANAGED_CAREER_INPUT.');
let host, snapshot, encoded, input, expected, output;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pool = league => [...league.players, ...league.retiredPlayers, ...(league.pendingDraft?.available || [])];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function personRecords(players) {
  return players.map(player => ({
    id: player.id,
    profile: Object.fromEntries(Object.entries(player.profile || {}).filter(([key]) => key.endsWith('Recipe') || key === 'grooming' || key === 'identity')),
    physical: Object.fromEntries(['heightInches', 'weightLbs', 'armLengthInches', 'wingspanInches', 'handSizeInches', 'handLengthInches', 'measurements', 'physicalState'].filter(key => Object.hasOwn(player, key)).map(key => [key, player[key]])),
    resolvedAppearance: playerAppearance(player),
    resolvedFrame: playerFrame(player),
    resolvedMeasurements: resolvePlayerMeasurements(player)
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

test.beforeAll(async () => {
  test.setTimeout(300000);
  if (!inputFile) return;
  input = JSON.parse(await fs.readFile(inputFile));
  const bytes = await fs.readFile(input.saveFile);
  expect(sha(bytes)).toBe(input.saveSha256);
  expect(sha(await fs.readFile(input.reportFile))).toBe(input.reportSha256);
  encoded = bytes.toString();
  snapshot = await decodeSnapshot(encoded);
  expect(snapshot.league.history.length).toBeGreaterThanOrEqual(20);
  expect(snapshot.league.history.length).toBeLessThanOrEqual(30);
  expect(snapshot.league.history.length).toBe(input.completedSeasonsInSavedHistory);
  const players = pool(snapshot.league);
  expect(new Set(players.map(player => player.id)).size).toBe(players.length);
  expected = { people: players.length, personSha256: sha(JSON.stringify(canonical(personRecords(players)))) };
  output = path.resolve(process.env.MANAGED_CAREER_OUTPUT || '.cache/managed-career-browser');
  expect(output.startsWith(`${process.cwd()}${path.sep}`)).toBe(true);
  await fs.mkdir(output, { recursive: true });
  host = await startStaticClientHost();
});
test.afterAll(async () => { await host?.close(); });

for (const worker of [true, false]) test(`actual managed career restores measurements, appearance and history after named load/reload in built ${worker ? 'worker' : 'in-page'} client`, async ({ page }) => {
  test.setTimeout(300000);
  const degradation = [];
  page.on('console', message => { if (message.text().includes('High-capacity save store degraded')) degradation.push(message.text()); });
  await configureClient(page, worker);
  await createClientLeague(page, host.origin, { seed: 117, year: 2026, team: 'BUF', mode: 'play' });
  await assertRuntime(page, worker);
  await page.route('**/__managed-save', route => route.fulfill({ contentType: 'text/plain', body: encoded }));
  await page.evaluate(async () => {
    const response = await fetch('/__managed-save');
    if (!response.ok) throw Error(`Frozen save transfer failed: ${response.status}`);
    const { decodeSnapshot } = await import('/src/adapters/persistence/snapshotCodec.js');
    const snapshot = await decodeSnapshot(await response.text());
    const { api } = await import('./lib/appState.js');
    await api('/api/snapshot/import', { method: 'POST', body: { snapshot } });
    await (await import('./lib/gameFlow.js')).loadState();
  });
  const slot = `managed-${snapshot.league.history.length}-${worker ? 'worker' : 'in-page'}`;
  await page.locator('[data-testid="tab-settings"]').click();
  await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('#saveSlotInput').fill(slot);
  await page.locator('#saveBtn').click();
  await expect.poll(async () => {
    const status = await page.locator('#statusChip').innerText();
    if (/^Error:/.test(status)) throw Error(status);
    return (await readClient(page, '/api/saves')).slots.some(save => save.slot === slot);
  }, { timeout: 120000 }).toBe(true);
  await expect(page.locator('#statusChip')).toContainText('Ready', { timeout: 120000 });
  expect(await page.evaluate(slot => JSON.parse(localStorage.getItem(`vsfgm:meta:${slot}`)).store, slot)).toBe('idb');
  const replacementYear = await page.evaluate(async () => {
    const { api } = await import('./lib/appState.js');
    await api('/api/new-league', { method: 'POST', body: { seed: 118, startYear: 2026, controlledTeamId: 'BUF', mode: 'play' } });
    await (await import('./lib/gameFlow.js')).loadState();
    return (await api('/api/state')).currentYear;
  });
  expect(replacementYear).toBe(2026);
  await page.locator('[data-testid="tab-settings"]').click();
  await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('#saveSlotInput').fill(slot);
  await page.locator('#loadBtn').click();
  await expect.poll(async () => (await readClient(page, '/api/state')).currentYear, { timeout: 120000 }).toBe(snapshot.currentYear);
  await page.reload();
  await waitGameReady(page);
  await assertRuntime(page, worker);
  const evidence = await page.evaluate(async () => {
    const { api } = await import('./lib/appState.js');
    const { snapshot } = await api('/api/snapshot/export');
    const { playerAppearance, playerFrame } = await import('/src/domain/playerIdentity.js');
    const { resolvePlayerMeasurements } = await import('/src/domain/playerMeasurements.js');
    const players = [...snapshot.league.players, ...snapshot.league.retiredPlayers, ...(snapshot.league.pendingDraft?.available || [])];
    function canonical(value) {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
      return value;
    }
    const records = players.map(player => ({
      id: player.id,
      profile: Object.fromEntries(Object.entries(player.profile || {}).filter(([key]) => key.endsWith('Recipe') || key === 'grooming' || key === 'identity')),
      physical: Object.fromEntries(['heightInches', 'weightLbs', 'armLengthInches', 'wingspanInches', 'handSizeInches', 'handLengthInches', 'measurements', 'physicalState'].filter(key => Object.hasOwn(player, key)).map(key => [key, player[key]])),
      resolvedAppearance: playerAppearance(player),
      resolvedFrame: playerFrame(player),
      resolvedMeasurements: resolvePlayerMeasurements(player)
    })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(records))));
    return { year: snapshot.currentYear, historyYears: snapshot.league.history.map(row => row.year), people: players.length,
      personSha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
  });
  expect(evidence.year).toBe(snapshot.currentYear);
  expect(evidence.historyYears).toEqual(snapshot.league.history.map(row => row.year));
  expect(evidence.people).toBe(expected.people);
  expect(evidence.personSha256).toBe(expected.personSha256);
  expect(degradation).toEqual([]);
  await fs.writeFile(path.join(output, `${worker ? 'worker' : 'in-page'}-receipt.json`), JSON.stringify({
    kind: 'actual-built-managed-career-persistence', inputFile, saveSha256: input.saveSha256, worker,
    namedSlotLoadedAfterReplacement: true, explicitIndexedDbNamedSlot: true, evidence,
    limits: ['One actual seeded 20–30-season checkpoint; not every feature or rulebook case', 'All persisted person recipes, supplied measurement records and resolved appearance/frame/measurement outputs checked; history years checked, not every league collection', 'Pixel naturalism and empirical calibration are separate acceptance checks']
  }, null, 2) + '\n');
});
