#!/usr/bin/env node
/**
 * golden-master.mjs — the byte-identity gate for the multi-sport extraction (S116).
 *
 * Every Phase 1 extraction step must leave football exactly as it was. This
 * plays fixed seeded leagues for three seasons in both simulation modes and
 * hashes each top-level piece of state separately (league collections, the
 * stat archive, season tables and the dashboard), so a mismatch names the
 * system that drifted instead of reporting one opaque hash.
 *
 *   node scripts/golden-master.mjs           check against the committed fixture
 *   node scripts/golden-master.mjs --write   regenerate it (intentional changes only)
 *   node scripts/golden-master.mjs --diff    print the sections that differ
 *
 * Fields that carry wall-clock time are excluded by name; everything else,
 * including box scores and play-by-play, is part of the identity.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HISTORICAL_GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.json");
// Each deliberate behavior change adopts a new versioned fixture and leaves the
// previous one byte-identical (test/football-golden-master.test.js holds them).
// S119: the passer rating scales before it clamps; only seasonTable.passing moved.
export const S118_GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.s118-v2.json");
// S131: regular-season injury recovery ticks after that week's games, so an
// injury costs the games its label states; every injury-dependent section moved.
export const S119_GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.s119-v3.json");
export const S131_GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.s131-v4.json");
// S132: rival clubs draft on their own scouted read instead of the true rating,
// and a general manager can be dismissed; everything after the first draft moved.
export const S132_V5_GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.s132-v5.json");
// S132 (second release): each GM season-history entry also records points for,
// points against and cap space, for the weekly challenge score. No simulation
// section moved; only the two sections that carry that history did.
export const S132_V6_GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.s132-v6.json");
// S132 (third release): engine-written text uses football words ("Play your
// first game", "The results are in"). Only sections that carry that text moved;
// every simulated number, roster, result and the next random draw are identical.
export const S132_V7_GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.s132-v7.json");
// S133: Frame Matters. A body measured against its position (league-measured
// centres) now edges pass blocking, pass rush, run fits, coverage, catch
// radius, broken tackles, fumbles and injuries; the combine reads the measured
// workout and its own derived stream, and the pro day reads the combine.
// Every simulated section moves from the first game.
export const GOLDEN_MASTER_FIXTURE = path.join(ROOT, "test", "fixtures", "football-golden-master.s133-v8.json");
export const GOLDEN_MASTER_SCENARIOS = Object.freeze([
  Object.freeze({ id: "drive-20260306-BUF", seed: 20260306, mode: "drive", controlledTeamId: "BUF", seasons: 3 }),
  Object.freeze({ id: "play-4113-CHI", seed: 4113, mode: "play", controlledTeamId: "CHI", seasons: 3 })
]);
// Wall-clock fields: they record when something happened on this machine, not what the simulation did.
export const VOLATILE_KEYS = new Set(["generatedAt", "createdAt", "updatedAt", "observedAt", "savedAt", "checkedAt", "timestamp", "wallClockMs", "durationMs", "elapsedMs",
  // Measured on this machine: event-log stamps, observability timings and their refresh time.
  "ts", "timings", "lastUpdated"]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      const next = value[key];
      if (typeof next === "function" || next === undefined) continue;
      out[key] = canonical(next);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

const digest = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

export async function computeGoldenMaster(root = ROOT) {
  const { GameSession } = await import(pathToFileURL(path.join(root, "src/runtime/GameSession.js")).href);
  const { RNG } = await import(pathToFileURL(path.join(root, "src/utils/rng.js")).href);
  const scenarios = {};
  for (const scenario of GOLDEN_MASTER_SCENARIOS) {
    const session = new GameSession({ rng: new RNG(scenario.seed), startYear: 2026, controlledTeamId: scenario.controlledTeamId, mode: scenario.mode });
    session.simulateSeasons(scenario.seasons);
    const sections = {};
    for (const [key, value] of Object.entries(session.league)) sections[`league.${key}`] = digest(value);
    sections["statBook.teamSeasonArchive"] = digest(session.statBook.teamSeasonArchive);
    for (const category of ["passing", "rushing", "receiving", "defense", "kicking", "punting"]) {
      sections[`seasonTable.${category}`] = digest(session.statBook.getPlayerSeasonTable(category, {}));
    }
    sections.dashboard = digest(session.getDashboardState());
    sections["session.position"] = digest({ year: session.currentYear, week: session.currentWeek, phase: session.phase, nextDraw: session.rng.int(0, 2 ** 30) });
    scenarios[scenario.id] = {
      summary: { year: session.currentYear, phase: session.phase, champions: (session.league.champions || []).map((row) => row.championTeamId || row.teamId) },
      sections
    };
  }
  return { schemaVersion: 1, scenarios };
}

export function diffGoldenMaster(expected, actual) {
  const differences = [];
  // A removed fixture scenario must not silently stop verifying that seeded
  // career. Compare both scenario sets before comparing their sections.
  for (const id of Object.keys(actual.scenarios || {})) {
    if (!Object.hasOwn(expected.scenarios || {}, id)) differences.push(`${id}: unexpected scenario`);
  }
  for (const [id, scenario] of Object.entries(expected.scenarios || {})) {
    const got = actual.scenarios?.[id];
    if (!got) { differences.push(`${id}: scenario missing`); continue; }
    const keys = new Set([...Object.keys(scenario.sections), ...Object.keys(got.sections)]);
    for (const key of [...keys].sort()) {
      if (scenario.sections[key] !== got.sections[key]) differences.push(`${id}: ${key} ${scenario.sections[key] ? "changed" : "added"}${got.sections[key] ? "" : " (removed)"}`);
    }
  }
  return differences;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actual = await computeGoldenMaster();
  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(GOLDEN_MASTER_FIXTURE), { recursive: true });
    fs.writeFileSync(GOLDEN_MASTER_FIXTURE, `${JSON.stringify(actual, null, 2)}\n`);
    console.log(`golden master written: ${Object.keys(actual.scenarios).length} scenarios`);
  } else {
    const expected = JSON.parse(fs.readFileSync(GOLDEN_MASTER_FIXTURE, "utf8"));
    const differences = diffGoldenMaster(expected, actual);
    if (differences.length) {
      console.error(`golden master: ${differences.length} section(s) differ\n${differences.map((d) => `  - ${d}`).join("\n")}`);
      process.exit(1);
    }
    console.log(`golden master: identical (${Object.keys(actual.scenarios).length} scenarios)`);
  }
}
