import test from "node:test";
import assert from "node:assert/strict";
import { compactSnapshotStats, expandSnapshotStats, STAT_STORAGE_FORMAT, LEGACY_STAT_STORAGE_FORMAT } from "../src/runtime/statSnapshot.js";
import { FOOTBALL_STAT_SCHEMA } from "../src/sport/football/statSchema.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";
import { inspectSnapshotCompatibility, migrateSnapshot } from "../src/runtime/snapshotMigration.js";

const json = value => JSON.parse(JSON.stringify(value));
const buckets = players => players.map(player => ({ id: player.id, seasonStats: player.seasonStats, careerStats: player.careerStats }));

test('v2 prospect statistics restore exactly while v1 raw prospect saves retain their decoder',()=>{
  const full=FOOTBALL_STAT_SCHEMA.zeroedSeasonStats();full.defense.sacks=.5;full.extension={marker:'retain Māori'};
  const prospects=[{id:'future',seasonStats:{2026:full},careerStats:FOOTBALL_STAT_SCHEMA.zeroedCareerStats()},
    {id:'partial',seasonStats:{2025:{passing:{yards:0},note:'not zero-filled'}},careerStats:null}];
  const input={league:{sportId:'football',players:[],pendingDraft:{year:2027,available:prospects,custom:'keep'}}};
  const before=json(input),packed=compactSnapshotStats(input);
  assert.equal(packed.statStorage,STAT_STORAGE_FORMAT);assert.equal(packed.league.pendingDraft.available[0].careerStats.mode,'zero');
  assert.deepEqual(expandSnapshotStats(json(packed)),before);assert.deepEqual(input,before);
  const legacy={...packed,statStorage:LEGACY_STAT_STORAGE_FORMAT,league:{...packed.league,pendingDraft:before.league.pendingDraft}};
  assert.deepEqual(expandSnapshotStats(json(legacy)),before);
});

test("typed stat encoding preserves full counters, splits, custom metadata and partial legacy buckets exactly", () => {
  const season = FOOTBALL_STAT_SCHEMA.zeroedSeasonStats();
  season.passing.yards = 314;
  season.defense.sacks = .5;
  season.passing.customZero = 0;
  season.meta = { teamId: "BUF", note: "diacritics: Māori", zero: 0 };
  season.extension = { mode: "zero", data: null };
  season.splits = { regular: FOOTBALL_STAT_SCHEMA.zeroedSeasonStats(), playoffs: FOOTBALL_STAT_SCHEMA.zeroedSeasonStats(), custom: { passing: { att: 0 }, exact: null } };
  season.splits.regular.passing.yards = 314;
  const career = FOOTBALL_STAT_SCHEMA.zeroedCareerStats();
  career.receiving.yards = 1000;
  const input = { schemaVersion: 3, league: { sportId: "football", players: [{ id: "one", seasonStats: { 2026: season }, careerStats: career },
    { id: "partial", seasonStats: { 2025: { passing: { att: 0 }, marker: "preserve partial" } }, careerStats: null }],
    retiredPlayers: [{ id: "retired", careerStats: career, seasonStats: { 2024: season } }] } };
  const before = json(input);
  const packed = compactSnapshotStats(input);
  assert.equal(packed.statStorage, STAT_STORAGE_FORMAT);
  assert.equal(packed.league.players[0].careerStats.mode, "zero");
  assert.equal(packed.league.players[1].seasonStats[2025].mode, "raw");
  assert.ok(JSON.stringify(packed).length < JSON.stringify(before).length * .55);
  assert.deepEqual(expandSnapshotStats(json(packed)), before);
  assert.deepEqual(input, before, "saving cannot modify live stats");
  assert.deepEqual(compactSnapshotStats(packed), packed);
  assert.deepEqual(expandSnapshotStats(before), before, "unencoded old saves are unchanged");
  assert.deepEqual(expandSnapshotStats(expandSnapshotStats(packed)), before);
  const otherSport = { ...input, league: { ...input.league, sportId: "test-sport" } };
  assert.equal(compactSnapshotStats(otherSport), otherSport, "football dictionary must not touch other sports");
});

test("unsupported or malformed stat encodings are rejected by snapshot preflight", () => {
  const snapshot = { schemaVersion: 3, rngSeed: 1, currentYear: 2026, currentWeek: 1, phase: "regular-season",
    league: { year: 2026, teams: [], players: [{ id: "p", careerStats: { mode: "zero", data: {} } }] }, statStorage: STAT_STORAGE_FORMAT };
  assert.equal(inspectSnapshotCompatibility(snapshot).ok, true);
  for (const broken of [
    { ...snapshot, statStorage: "unknown-future-stat-format" },
    { ...snapshot, league: { ...snapshot.league, sportId: "other" } },
    ...[{ mode: "future", data: {} }, { mode: "zero", data: { passing: null } }, { mode: "zero", data: { passing: { att: "0" } } },
      { mode: "zero", data: {}, ignoredFact: 99 }].map(careerStats => ({ ...snapshot, league: { ...snapshot.league, players: [{ id: "p", careerStats }] } }))
  ]) {
    const before = json(broken);
    const verdict = inspectSnapshotCompatibility(broken);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reasonCode, "SNAPSHOT_STAT_ENCODING_INVALID");
    assert.throws(() => migrateSnapshot(broken), error => error.reasonCode === verdict.reasonCode);
    assert.deepEqual(broken, before);
  }
});

test("played saves restore full statistics in both load seams and simulate the next week identically", () => {
  const session = createSession({ seed: 735, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  for (let week = 0; week < 3; week++) session.advanceWeek();
  const beforeStats = json(buckets(session.league.players));
  const snapshot = json(session.toSnapshot());
  const migrated = createSessionFromSnapshot(snapshot);
  const direct = GameSession.fromSnapshot(json(snapshot), seed => new RNG(seed));
  assert.deepEqual(buckets(migrated.league.players), beforeStats);
  assert.deepEqual(buckets(direct.league.players), beforeStats);
  assert.deepEqual(buckets(session.league.players), beforeStats);
  assert.deepEqual(migrated.league.gameArchive, session.league.gameArchive, "box scores and drive logs are untouched");
  assert.deepEqual(migrated.league.players.map(p => [p.profile, p.measurements, p.developmentOrigin]), session.league.players.map(p => [p.profile, p.measurements, p.developmentOrigin]));
  const originalWeek = session.advanceWeek();
  const resumedWeek = direct.advanceWeek();
  assert.deepEqual(json(resumedWeek), json(originalWeek));
  assert.deepEqual(buckets(direct.league.players), buckets(session.league.players));
  assert.equal(direct.rng.seed, session.rng.seed);
  assert.deepEqual(direct.rngStreams.toSnapshot(), session.rngStreams.toSnapshot());
  const legacy = { ...expandSnapshotStats(snapshot), schemaVersion: 2 };
  assert.deepEqual(buckets(createSessionFromSnapshot(legacy).league.players), beforeStats);
});
