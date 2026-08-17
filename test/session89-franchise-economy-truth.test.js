/**
 * Session 89 — franchise economy truth.
 *
 * Every assertion here fails on the pre-S89 engine. The defects these cover were
 * invisible to code review and only appeared when the engine was run for many
 * seasons: the salary cap stopped binding entirely (30 of 32 clubs illegal by
 * season 7, median club $89M over a $255M cap by season 20), rosters had no
 * upper bound at all, and the declared $45M salary ceiling could not be reached
 * by any player at any rating.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { CONTRACT_RULES, NFL_STRUCTURE, ROSTER_STRUCTURE } from "../src/config.js";
import { marketSalaryForOverall } from "../src/domain/contracts.js";
import {
  capSpaceForTeam,
  enforceRosterAndCapCompliance,
  normalizeRosterSlots,
  releaseRanking,
  releaseToFreeAgency
} from "../src/engine/capCompliance.js";

// ── fixture ────────────────────────────────────────────────────────────────────

function contract({ capHit, signingBonus = 0, deadCapRemaining = 0, capYears = 4 }) {
  return { capHit, signingBonus, deadCapRemaining, capYears, yearsRemaining: capYears, salary: capHit };
}

function player(id, overall, capHitM, extra = {}) {
  return {
    id,
    name: id,
    teamId: "AAA",
    status: "active",
    rosterSlot: "active",
    overall,
    position: "WR",
    contract: contract({ capHit: capHitM * 1e6, ...extra })
  };
}

function league(players, { teams = ["AAA"], capLedger = {} } = {}) {
  return { teams: teams.map((id) => ({ id })), players, capLedger };
}

// ── the declared salary ceiling must be reachable ──────────────────────────────

test("the declared salary ceiling is a real bound the market curve can actually reach", () => {
  // Pre-S89 this was 45_000_000 while the curve maxed out at 43_320_000, so the
  // clamp in marketSalaryForOverall was dead code and the constant was fiction.
  // Binding the constant to the curve is what stops it drifting back out of reach.
  const topOfMarket = marketSalaryForOverall(100);
  assert.equal(
    CONTRACT_RULES.maxSalary,
    topOfMarket,
    "CONTRACT_RULES.maxSalary must equal what the curve pays a perfect 100 overall"
  );
  // Ratings are clamped to 0-100, so nothing can price above the declared ceiling.
  for (const overall of [100, 101, 130, 9999]) {
    assert.ok(
      marketSalaryForOverall(overall) <= CONTRACT_RULES.maxSalary,
      `${overall} overall must not price above the declared ceiling`
    );
  }
  assert.ok(marketSalaryForOverall(99) < CONTRACT_RULES.maxSalary, "the ceiling must still be the top of a real curve");
});

// ── release ranking ───────────────────────────────────────────────────────────

test("release ranking cuts the worst value per dollar, not simply the worst or the dearest player", () => {
  const overpaidVeteran = player("overpaid", 70, 20); // 3.5 overall per $M
  const cheapDepth = player("depth", 60, 1); //           60.0 overall per $M
  const star = player("star", 95, 15); //                  6.3 overall per $M
  const order = releaseRanking([cheapDepth, star, overpaidVeteran]);
  assert.equal(order[0].id, "overpaid", "the overpaid veteran is the first cut");
  assert.equal(order.at(-1).id, "depth", "cheap depth is the last cut, despite being the worst player");
});

test("release ranking is deterministic when value density ties", () => {
  const a = player("zzz", 80, 10);
  const b = player("aaa", 80, 10);
  assert.deepEqual(releaseRanking([a, b]).map((p) => p.id), ["aaa", "zzz"]);
});

// ── releasing is not free, and always makes the current year better ────────────

test("a release sheds base salary this year and pushes the remaining guarantee to next year", () => {
  const p = player("cut", 80, 12, { signingBonus: 8e6, deadCapRemaining: 10e6, capYears: 4 });
  const L = league([p]);
  const before = capSpaceForTeam(L, "AAA");
  releaseToFreeAgency(L, p, { reason: "cap" });

  assert.equal(p.teamId, "FA", "a released player enters the free-agent pool");
  assert.equal(p.status, "active", "a released player is employable, just unemployed");

  const ledger = L.capLedger.AAA;
  // This year carries only the already-prorated bonus (8M / 4 = 2M).
  assert.equal(ledger.deadCapCurrentYear, 2e6);
  assert.equal(ledger.deadCapNextYear, 8e6, "the rest of the guarantee accelerates into next year");

  // The whole point: the current year must improve, or compliance cannot converge.
  // Charging the full deadCapRemaining against this year (the first S89 attempt)
  // made releases net-negative and left 31 of 32 clubs illegal.
  assert.ok(capSpaceForTeam(L, "AAA") > before, "releasing must free current-year cap space");
  assert.equal(capSpaceForTeam(L, "AAA") - before, 10e6, "the saving is exactly the base salary");
});

// ── compliance ────────────────────────────────────────────────────────────────

test("an over-cap club is trimmed back under the cap", () => {
  // A trimmable club: 55 solid players at $3M plus 5 badly overpaid ones at $20M
  // is $265M against a $255M cap, and shedding the overpaid tail reaches legality
  // without cutting below a fieldable roster.
  const players = [
    ...Array.from({ length: 55 }, (_, i) => player(`ok${String(i).padStart(2, "0")}`, 78, 3)),
    ...Array.from({ length: 5 }, (_, i) => player(`bad${i}`, 68, 20))
  ];
  const L = league(players);
  assert.ok(capSpaceForTeam(L, "AAA") < 0, "fixture must start illegal");

  const { released, stillOverCap } = enforceRosterAndCapCompliance(L);
  assert.ok(released.length > 0, "compliance must actually release someone");
  assert.deepEqual(stillOverCap, [], "no club may remain over the cap");
  assert.ok(capSpaceForTeam(L, "AAA") >= 0, "the club must end the offseason legal");
  assert.ok(
    L.players.filter((p) => p.teamId === "FA").length === released.length,
    "every released player must land in the free-agent pool, not vanish"
  );
});

test("compliance never cuts the controlled franchise — that decision belongs to the GM", () => {
  const players = Array.from({ length: 60 }, (_, i) => player(`p${String(i).padStart(2, "0")}`, 70, 6));
  const L = league(players);
  const { released, stillOverCap } = enforceRosterAndCapCompliance(L, { excludeTeamIds: ["AAA"] });
  assert.equal(released.length, 0, "an excluded club is never trimmed");
  assert.deepEqual(stillOverCap, [], "an excluded club is not reported as a compliance failure either");
  assert.ok(capSpaceForTeam(L, "AAA") < 0, "the GM's club stays illegal and visible, rather than being laundered legal");
});

test("compliance will not cut a club below a fieldable active roster", () => {
  // Every contract is ruinous, so no amount of trimming can reach legality.
  const players = Array.from({ length: 55 }, (_, i) => player(`p${String(i).padStart(2, "0")}`, 70, 40));
  const L = league(players);
  const { stillOverCap } = enforceRosterAndCapCompliance(L);
  const remaining = L.players.filter((p) => p.teamId === "AAA").length;
  assert.ok(remaining >= ROSTER_STRUCTURE.activeLimit, "a club may never be cut below a fieldable team");
  assert.deepEqual(stillOverCap, ["AAA"], "a genuinely trapped club is reported, not silently accepted");
});

// ── roster structure ──────────────────────────────────────────────────────────

test("the declared roster structure is an actual upper bound", () => {
  const limit = ROSTER_STRUCTURE.activeLimit + ROSTER_STRUCTURE.practiceLimit;
  // Pre-S89 there was no bound at all: normalizeRosterSlots labelled the top 53
  // active and every remaining player practice, forever, so clubs accumulated
  // players until retirement and the league grew 1,568 -> 2,919 in 20 seasons.
  const players = Array.from({ length: 140 }, (_, i) => player(`p${String(i).padStart(3, "0")}`, 60 + (i % 30), 0.85));
  const L = league(players);
  enforceRosterAndCapCompliance(L);
  const kept = L.players.filter((p) => p.teamId === "AAA");
  assert.equal(kept.length, limit, `a club may hold at most ${limit} players`);
  assert.equal(L.players.filter((p) => p.teamId === "FA").length, 140 - limit, "the surplus is released, not deleted");

  normalizeRosterSlots(L);
  assert.equal(kept.filter((p) => p.rosterSlot === "active").length, ROSTER_STRUCTURE.activeLimit);
  assert.equal(kept.filter((p) => p.rosterSlot === "practice").length, ROSTER_STRUCTURE.practiceLimit);
});

test("roster truncation keeps the best players", () => {
  const players = Array.from({ length: 100 }, (_, i) => player(`p${String(i).padStart(3, "0")}`, i, 0.85));
  const L = league(players);
  enforceRosterAndCapCompliance(L);
  const kept = L.players.filter((p) => p.teamId === "AAA").map((p) => p.overall);
  const cut = L.players.filter((p) => p.teamId === "FA").map((p) => p.overall);
  assert.ok(Math.min(...kept) > Math.max(...cut), "every kept player must outrank every cut player");
});

test("the salary cap is the league cap plus rollover minus dead money, and honours per-team overrides", () => {
  const L = league([player("solo", 80, 10)], { capLedger: { AAA: { rollover: 5e6, deadCapCurrentYear: 2e6 } } });
  assert.equal(capSpaceForTeam(L, "AAA"), NFL_STRUCTURE.salaryCap + 5e6 - 10e6 - 2e6);
  L.teamCapOverride = { AAA: 100e6 };
  assert.equal(capSpaceForTeam(L, "AAA"), 100e6 + 5e6 - 10e6 - 2e6);
});
