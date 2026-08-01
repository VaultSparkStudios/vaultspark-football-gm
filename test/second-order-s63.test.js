import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { derivedStaffRng, staffSeedKey } from "../src/engine/staffGeneration.js";
import { derivedRng, fnv1a } from "../src/utils/rng.js";
import { buildFranchiseEconomics } from "../src/domain/teamFactory.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

const CORE_ROLES = ["headCoach", "offensiveCoordinator", "defensiveCoordinator"];

function createMemoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(String(k), String(v)); },
    removeItem(k) { data.delete(String(k)); }
  };
}

async function browserLeague(seed = 6363) {
  const runtime = createLocalApiRuntime({
    storage: createMemoryStorage(),
    now: (() => { let t = 0; return () => 1_700_000_000_000 + t++; })(),
    scheduler: (fn) => fn()
  });
  await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed, startYear: 2026, controlledTeamId: "BUF", mode: "play", eraProfile: "modern" }
  });
  return runtime;
}

// ── The derived source ────────────────────────────────────────────────────────

test("the derived source is RNG-shaped and honours its bounds", () => {
  const rng = derivedStaffRng("seed-a");
  for (let i = 0; i < 200; i += 1) {
    const value = rng.int(62, 93);
    assert.ok(Number.isInteger(value) && value >= 62 && value <= 93);
  }
  assert.equal(derivedStaffRng("x").int(5, 5), 5, "a degenerate range returns the single value");
  assert.equal(derivedStaffRng("x").pick([]), undefined, "an empty pick is undefined, not a throw");
  assert.ok(["a", "b", "c"].includes(derivedStaffRng("x").pick(["a", "b", "c"])));
});

test("successive draws differ, and the whole sequence replays from the key", () => {
  const take = (key) => {
    const rng = derivedStaffRng(key);
    return Array.from({ length: 8 }, () => rng.int(0, 999));
  };
  const first = take("seed-a");
  assert.deepEqual(take("seed-a"), first, "same key, same sequence");
  assert.notDeepEqual(take("seed-b"), first, "different key, different sequence");
  assert.ok(new Set(first).size > 1, "successive draws must not be constant");
});

test("seed keys are stable and team-specific", () => {
  const league = { leagueId: "L1", currentYear: 2026 };
  assert.equal(staffSeedKey(league, "BUF"), staffSeedKey(league, "BUF"));
  assert.notEqual(staffSeedKey(league, "BUF"), staffSeedKey(league, "NYJ"));
  assert.ok(staffSeedKey({}, "BUF").length > 0, "a league with no identity still yields a key");
});

// ── The bug itself ────────────────────────────────────────────────────────────

test("a browser league no longer gives all 32 teams identical coaching staff", async () => {
  const runtime = await browserLeague();
  const league = runtime.getSession().league;

  const playcalling = new Set();
  const years = new Set();
  const tendencies = new Set();
  for (const team of league.teams) {
    tendencies.add(team.staff.tendencyKey);
    for (const role of CORE_ROLES) {
      playcalling.add(team.staff[role].playcalling);
      years.add(team.staff[role].yearsRemaining);
    }
  }

  assert.ok(playcalling.size > 10, `coaching ability must vary across the league, saw ${playcalling.size} values`);
  assert.ok(tendencies.size > 1, "the league must not share a single tendency archetype");
  assert.ok(
    new Set(league.teams.map((team) => team.coaching?.offense)).size > 5,
    "team.coaching must actually differ — it feeds play calling, development and discipline"
  );
});

test("yearsRemaining is back inside its own domain", async () => {
  const runtime = await browserLeague();
  for (const team of runtime.getSession().league.teams) {
    for (const role of CORE_ROLES) {
      const years = team.staff[role].yearsRemaining;
      assert.ok(years >= 1 && years <= 7, `${team.id} ${role} yearsRemaining ${years} is outside 1-7`);
    }
  }
});

test("ratings stay inside the generator's documented band", async () => {
  const runtime = await browserLeague();
  for (const team of runtime.getSession().league.teams) {
    for (const role of CORE_ROLES) {
      for (const key of ["playcalling", "development", "discipline"]) {
        const value = team.staff[role][key];
        assert.ok(value >= 62 && value <= 93, `${team.id} ${role} ${key}=${value} outside 62-93`);
      }
    }
  }
});

test("staff generation is deterministic across two identical leagues", async () => {
  const read = (runtime) =>
    runtime.getSession().league.teams.map((team) =>
      CORE_ROLES.map((role) => `${team.id}:${role}:${team.staff[role].playcalling}:${team.staff[role].yearsRemaining}`).join("|")
    );
  assert.deepEqual(read(await browserLeague(6363)), read(await browserLeague(6363)));
});

test("the normalizer still draws no session RNG, so replays cannot desync", () => {
  const source = readFileSync(new URL("../src/runtime/GameSession.js", import.meta.url), "utf8");
  const line = source.split(/\r?\n/).find((row) => row.includes("buildStaffProfile(derivedStaffRng"));
  assert.ok(line, "the normalizer must use the derived source");
  assert.ok(!/this\.rng/.test(line), "and must not reach for the session RNG stream");

  const ownerLine = source.split(/\r?\n/).find((row) => row.includes("buildOwnerProfile(derivedStaffRng"));
  assert.ok(ownerLine, "the owner rebuild must use the derived source too");
  assert.ok(!/this\.rng/.test(ownerLine));

  // The comments deliberately quote the old stub to record what changed, so
  // strip them before asserting the stub is gone from the executable path.
  const executable = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((row) => !row.trim().startsWith("//"))
    .join(" ");
  assert.ok(!/int: \(\) => 76/.test(executable), "the flat-76 stub must be gone from live code");
});

// ── Downstream: the coaching market gets a real league to draw from ───────────

test("varied staff gives the coaching market real coordinators to poach", async () => {
  const runtime = await browserLeague();
  const market = await runtime.request("/api/coaching-market?role=headCoach");
  assert.equal(market.status, 200);
  const promotions = market.payload.candidates.filter((c) => c.origin === "coordinator");
  assert.ok(
    promotions.length > 0,
    "with a flat-76 league no coordinator cleared the promotion bar, so the market was all strangers"
  );
  for (const row of promotions) {
    assert.ok(row.currentTeamId && row.currentTeamId !== "BUF");
    assert.ok(row.sourceRole);
  }
});

test("existing saves keep the staff they already had", () => {
  // buildStaffProfile preserves any value already present, so this change must
  // not rewrite a franchise someone is mid-way through.
  const session = new GameSession({ rng: new RNG(99), startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  const team = session.league.teams.find((entry) => entry.id === "BUF");
  team.staff.headCoach.playcalling = 51;
  team.staff.headCoach.name = "Preserved Coach";

  session.getDashboardState();

  assert.equal(team.staff.headCoach.playcalling, 51);
  assert.equal(team.staff.headCoach.name, "Preserved Coach");
});

// ── Owner economics: the same bug, wider blast radius ─────────────────────────

test("franchises are no longer born with byte-identical economics", async () => {
  const runtime = await browserLeague();
  const teams = runtime.getSession().league.teams;

  const spread = (read) => new Set(teams.map(read)).size;
  assert.ok(spread((t) => t.owner.marketSize) > 5, "big-market vs small-market must exist");
  assert.ok(spread((t) => t.owner.ticketPrice) > 5, "ticket price drives revenue and must vary");
  assert.ok(spread((t) => t.owner.staffBudget) > 5, "staff budget gates the coaching market");
  assert.ok(spread((t) => t.owner.cash) > 5);
  assert.ok(spread((t) => t.owner.facilities.training) > 5);
  assert.ok(spread((t) => t.owner.personality) > 1, "owner personality shapes the pressure loop");
});

test("differentiation adds spread without shifting league balance", () => {
  const ids = ["BUF", "NYJ", "MIA", "NE", "KC", "DEN", "LV", "LAC", "DAL", "PHI", "NYG", "WAS"];
  const rows = ids.map((id) => buildFranchiseEconomics(id));
  const mean = (read) => rows.reduce((sum, row) => sum + read(row), 0) / rows.length;

  // Each band is centred on the constant it replaced, so the league average
  // stays where the game was already balanced.
  assert.ok(Math.abs(mean((r) => r.marketSize) - 1) < 0.08, "market size must average about 1");
  assert.ok(Math.abs(mean((r) => r.ticketPrice) - 120) < 12, "ticket price must average about 120");
  assert.ok(Math.abs(mean((r) => r.staffBudget) - 28_000_000) < 3_000_000);
  assert.ok(Math.abs(mean((r) => r.facilities.training) - 72) < 5);
});

test("economics stay inside their declared bands", () => {
  for (const id of ["BUF", "NYJ", "MIA", "KC", "SF", "GB", "TB", "SEA"]) {
    const row = buildFranchiseEconomics(id);
    assert.ok(row.marketSize >= 0.82 && row.marketSize <= 1.24, `${id} marketSize ${row.marketSize}`);
    assert.ok(row.ticketPrice >= 96 && row.ticketPrice <= 148);
    assert.ok(row.staffBudget >= 22_000_000 && row.staffBudget <= 35_000_000);
    assert.ok(row.fanInterest >= 62 && row.fanInterest <= 80);
    for (const key of ["training", "rehab", "analytics"]) {
      assert.ok(row.facilities[key] >= 64 && row.facilities[key] <= 82);
    }
    assert.equal(row.finances.revenueYtd, 0);
  }
});

test("economics are derived from the team id, so they never drift", () => {
  assert.deepEqual(buildFranchiseEconomics("BUF"), buildFranchiseEconomics("BUF"));
  assert.notDeepEqual(buildFranchiseEconomics("BUF"), buildFranchiseEconomics("NYJ"));
});

// ── One derived source, shared by every surface ───────────────────────────────

test("the derived RNG lives in the shared utils layer, not duplicated per caller", () => {
  assert.equal(typeof derivedRng, "function");
  assert.equal(typeof fnv1a, "function");
  assert.equal(fnv1a("abc"), fnv1a("abc"));
  assert.notEqual(fnv1a("abc"), fnv1a("abd"));

  // staffGeneration must delegate rather than reimplement the hash.
  const staffSource = readFileSync(new URL("../src/engine/staffGeneration.js", import.meta.url), "utf8");
  assert.match(staffSource, /from "\.\.\/utils\/rng\.js"/);
  assert.ok(!/0x811c9dc5/.test(staffSource), "the hash must not be duplicated here");
});

test("the derived source covers the whole RNG surface its callers use", () => {
  const rng = derivedRng("cover");
  assert.equal(typeof rng.int(1, 5), "number");
  assert.equal(typeof rng.float(0, 1), "number");
  assert.equal(typeof rng.next(), "number");
  assert.equal(typeof rng.chance(0.5), "boolean");
  assert.ok(["a", "b"].includes(rng.pick(["a", "b"])));
  const floats = Array.from({ length: 20 }, () => derivedRng("f").float(0, 10));
  assert.ok(floats.every((value) => value >= 0 && value <= 10));
});
