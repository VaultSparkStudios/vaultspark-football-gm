import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceEligibilityGroup, validatePracticeSquadAddition, selectEligiblePracticeSquad } from '../src/domain/practiceSquadEligibility.js';
import { createSession } from '../src/runtime/bootstrap.js';
import { assignFieldableActiveRoster, enforceRosterAndCapCompliance, normalizeRosterSlots } from '../src/engine/capCompliance.js';
import { FIELDABLE_DEPTH } from '../src/config.js';

const player = (id, accruedSeasons, activeGames) => ({ id, accruedSeasons, experience: accruedSeasons,
  serviceHistory: { loneAccruedSeasonActiveGames: activeGames } });
// Replace fictional generation history with this fixture's declared history.
const setAccrued = (player, seasons) => { delete player.serviceLedger; player.accruedSeasons = seasons; };

test('eligibility repair preserves an incoming room ceiling when veteran surplus cannot fit', () => {
  const roster = Array.from({ length: 10 }, (_, i) => ({ ...player(`QB${i}`, 8), position: 'QB', overall: 99 - i }));
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    if (position === 'QB') continue;
    for (let i = 0; i < band.max; i++) roster.push({ ...player(`${position}${i}`, 0), position, overall: 80 - i });
  }
  assert.equal(roster.length, 66);
  const baseline = assignFieldableActiveRoster(roster);
  const repaired = assignFieldableActiveRoster(roster, { practiceSettings: {} });
  assert.equal(baseline.countByPosition.QB, 3);
  assert.equal(repaired.countByPosition.QB, 3);
  assert.equal(repaired.active.length, 53);
  for (const [position, band] of Object.entries(FIELDABLE_DEPTH)) {
    assert.ok(repaired.countByPosition[position] >= band.min);
    assert.ok(repaired.countByPosition[position] <= band.max);
  }
  assert.ok(selectEligiblePracticeSquad(roster.filter(p => !repaired.activeIds.has(p.id))).rejected.length > 0,
    'unrepairable surplus remains available for the existing release or controlled-overflow authority');
});

test('fresh generated leagues begin with eligible practice squads without test-time recoding', () => {
  for (const seed of [117, 90210, 49002]) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: 'BUF' });
    for (const team of session.league.teams) {
      const squad = session.league.players.filter(p => p.teamId === team.id && p.rosterSlot === 'practice');
      assert.equal(squad.length, 16);
      assert.equal(selectEligiblePracticeSquad(squad, session.getLeagueSettings()).rejected.length, 0, `${seed}/${team.id} generated ineligible squad`);
    }
  }
});

test('NFL practice groups retain lone-season active-list boundary and disclosed service fallback', () => {
  assert.equal(practiceEligibilityGroup(player('R', 0)).group, 'inexperienced');
  assert.equal(practiceEligibilityGroup(player('R', 1, 8)).group, 'inexperienced');
  assert.equal(practiceEligibilityGroup(player('R', 1, 9)).group, 'restricted');
  assert.equal(practiceEligibilityGroup(player('R', 1)).group, 'restricted');
  assert.equal(practiceEligibilityGroup(player('R', 2)).group, 'restricted');
  assert.equal(practiceEligibilityGroup(player('R', 3)).group, 'unrestricted');
  const fallback = practiceEligibilityGroup({ id: 'old', experience: 4 });
  assert.equal(fallback.provenance, 'experience-proxy-not-service-history');
  assert.equal(fallback.group, 'unrestricted');
});

test('six unrestricted and ten combined experienced limits coexist with sixteen total slots', () => {
  const veterans = Array.from({ length: 6 }, (_, i) => player(`V${i}`, 5));
  assert.equal(validatePracticeSquadAddition({ players: veterans, player: player('V7', 7) }).reasonCode, 'PRACTICE_VETERAN_LIMIT');
  const experienced = [...veterans, ...Array.from({ length: 4 }, (_, i) => player(`E${i}`, 2))];
  assert.equal(validatePracticeSquadAddition({ players: experienced, player: player('E5', 1, 9) }).reasonCode, 'PRACTICE_EXPERIENCED_LIMIT');
  const full = [...experienced, ...Array.from({ length: 6 }, (_, i) => player(`R${i}`, 0))];
  assert.equal(selectEligiblePracticeSquad(full).selected.length, 16);
  assert.equal(validatePracticeSquadAddition({ players: full, player: player('R7', 0) }).reasonCode, 'PRACTICE_SQUAD_FULL');
  assert.equal(validatePracticeSquadAddition({ players: full, player: full[0] }).ok, true);
  assert.equal(validatePracticeSquadAddition({ players: [], player: player('Y', 1), settings: { practiceSquadExperienceLimit: 0 } }).ok, false);
  assert.equal(validatePracticeSquadAddition({ players: [], player: player('Y', 4), settings: { rulesPreset: 'sandbox', practiceSquadExperienceLimit: 4 } }).ok, true);
});

test('real user practice moves preserve obligations and require release before a new veteran practice contract', () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  const practice = session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'practice');
  for (const p of practice) setAccrued(p, 0);
  const existing = practice[0];
  const before = JSON.stringify(session.toSnapshot());
  assert.equal(session.setPracticeSquad({ teamId: 'BUF', playerId: existing.id }).unchanged, true);
  assert.equal(JSON.stringify(session.toSnapshot()), before);
  session.releasePlayer({ teamId: 'BUF', playerId: existing.id, toWaivers: false });
  const veteran = session.league.players.find(p => p.teamId === 'BUF' && p.rosterSlot === 'active');
  setAccrued(veteran, 7);
  const contract = structuredClone(veteran.contract);
  const cap = session.getTeamCapSummary('BUF').capSpace;
  assert.equal(session.setPracticeSquad({ teamId: 'BUF', playerId: veteran.id }).reasonCode, 'PRACTICE_RELEASE_REQUIRED');
  assert.deepEqual(veteran.contract, contract, 'refused demotion must not forgive the existing financial obligation');
  assert.equal(session.getTeamCapSummary('BUF').capSpace, cap);
  assert.equal(veteran.rosterSlot,'active');
  veteran.overall=60;
  session.releasePlayer({teamId:'BUF',playerId:veteran.id,toWaivers:false});
  assert.equal(session.signFreeAgent({teamId:'BUF',playerId:veteran.id,rosterSlot:'practice'}).ok,true);
  assert.equal(veteran.contract.kind,'weekly-practice-contract-v1');
  assert.equal(veteran.contract.weeklySalary,18350);
});

test('shared compliance trims illegal veteran surplus without cutting the controlled club', () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  for (const p of session.league.players.filter(p => ['BUF', 'MIA'].includes(p.teamId))) setAccrued(p, 8);
  const controlled = session.league.players.filter(p => p.teamId === 'BUF').map(p => p.id);
  const receipt = enforceRosterAndCapCompliance(session.league, { excludeTeamIds: ['BUF'] });
  assert.ok(receipt.released.some(p => p.reason === 'practice-eligibility'));
  normalizeRosterSlots(session.league);
  const roster = session.league.players.filter(p => p.teamId === 'MIA' && p.status === 'active');
  assert.equal(roster.filter(p => p.rosterSlot === 'active').length, 53);
  assert.equal(roster.filter(p => p.rosterSlot === 'practice').length, 6);
  assert.deepEqual(session.league.players.filter(p => p.teamId === 'BUF').map(p => p.id), controlled);
  assert.equal(session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'practice').length, 6);
});

test('actual CPU maintenance uses group limits while leaving the controlled squad to its GM', () => {
  const session = createSession({ seed: 117, startYear: 2026, controlledTeamId: 'BUF' });
  for (const p of session.league.players.filter(p => ['BUF', 'MIA'].includes(p.teamId) && p.rosterSlot === 'practice')) setAccrued(p, 8);
  const controlled = session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'practice').map(p => p.id);
  session.runAiTeamMaintenance();
  const cpuPractice = session.league.players.filter(p => p.teamId === 'MIA' && p.rosterSlot === 'practice');
  assert.ok(cpuPractice.filter(p => practiceEligibilityGroup(p).group === 'unrestricted').length <= 6);
  assert.deepEqual(session.league.players.filter(p => p.teamId === 'BUF' && p.rosterSlot === 'practice').map(p => p.id), controlled);
  const restored = session.constructor.fromSnapshot(session.toSnapshot(), seed => new session.rng.constructor(seed));
  assert.ok(restored.league.players.filter(p => p.teamId === 'MIA' && p.rosterSlot === 'practice').every(p => p.accruedSeasons === 8));
});
