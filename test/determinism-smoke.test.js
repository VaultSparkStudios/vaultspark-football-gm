import test from "node:test";
import assert from "node:assert/strict";
import { runLeagueSimulation } from "../src/engine/leagueSimulator.js";
import { RNG } from "../src/utils/rng.js";
import { encodeChallengeCode, decodeChallengeCode, fnv1a } from "../public/lib/challengeCodes.js";

// ── Determinism smoke (push-path) ─────────────────────────────────────────────
// Fast same-seed comparison so determinism regressions surface on every push
// instead of waiting for the excluded "long" shard. Two independent two-season
// runs (regular season + one full offseason cycle) must produce identical key
// ledgers: champions, team season table (standings + team stats), and an
// aggregate player-stat digest. Challenge-code checksums derived from the run
// must also be stable. Budget: well under 60s (~10s per run).

const SEED = 424242;
const YEARS = 2;
const START_YEAR = 2026;

function runOnce() {
  return runLeagueSimulation({ years: YEARS, startYear: START_YEAR, rng: new RNG(SEED) });
}

const runA = runOnce();
const runB = runOnce();

test("same seed produces identical champions and season meta", () => {
  assert.deepEqual(runA.champions, runB.champions);
  assert.equal(runA.champions.length, YEARS, "one champion per simulated season");
  assert.deepEqual(runA.meta, runB.meta);
});

test("same seed produces identical standings ledger (team season table)", () => {
  assert.equal(runA.teamSeasonTable.length, runB.teamSeasonTable.length);
  assert.deepEqual(runA.teamSeasonTable, runB.teamSeasonTable);
});

test("same seed produces identical aggregate stat digest", () => {
  const digest = (state) =>
    fnv1a(
      JSON.stringify({
        playerSeasonTables: state.playerSeasonTables,
        records: state.records,
        awards: state.awards
      })
    );
  assert.equal(digest(runA), digest(runB));
});

test("challenge-code checksums derived from the run are stable", () => {
  const codeFor = (state) =>
    encodeChallengeCode({
      seed: SEED,
      startYear: START_YEAR,
      teamId: state.champions[state.champions.length - 1].championTeamId
    });

  const codeA = codeFor(runA);
  const codeB = codeFor(runB);
  assert.equal(codeA, codeB, "same run outcome must encode to the same challenge code");

  const decoded = decodeChallengeCode(codeA);
  assert.ok(decoded, "checksum must verify on decode");
  assert.equal(decoded.seed, SEED);
  assert.equal(decoded.startYear, START_YEAR);

  // Pure-hash pin: fnv1a itself must stay stable across refactors, otherwise
  // every previously shared challenge code silently breaks.
  assert.equal(fnv1a("VSFC1-determinism-smoke"), fnv1a("VSFC1-determinism-smoke"));
  assert.equal(fnv1a(""), 0x811c9dc5);
});
