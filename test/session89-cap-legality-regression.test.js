/**
 * Session 89 — multi-season cap and roster legality regression.
 *
 * This is the test that would have caught the defect. It is slow by nature and
 * lives in the `long` shard, because the failure it guards is distributional:
 * nothing is wrong in season 1, and by season 7 the league is unrecoverable.
 *
 * Measured on the pre-S89 engine at this exact seed, clubs over the $255M cap by
 * season ran 0, 0, 1, 2, 10, 27, 30 — and stayed at 31 of 32 for every remaining
 * season out to season 20, with the median club $89M over the cap and the worst
 * $226M over. The league also grew from 1,568 to 2,919 players because rosters
 * had no upper bound. Both properties are now enforced every offseason.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { NFL_STRUCTURE, ROSTER_STRUCTURE } from "../src/config.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

const SEASONS = 8;
const SEED = 20260817;
const ROSTER_LIMIT = ROSTER_STRUCTURE.activeLimit + ROSTER_STRUCTURE.practiceLimit;

test("the salary cap keeps binding, and rosters stay bounded, across many simulated seasons", { timeout: 900_000 }, () => {
  const session = new GameSession({ rng: new RNG(SEED), startYear: 2026, mode: "drive" });
  const report = [];

  for (let index = 0; index < SEASONS; index += 1) {
    // Every season runs its offseason, including the last, so compliance is
    // always the most recent thing to have touched the league before we measure.
    session.simulateOneSeason({ runOffseasonAfter: true });
    const league = session.league;

    const illegal = [];
    const oversized = [];
    for (const team of league.teams) {
      const roster = league.players.filter((p) => p.teamId === team.id && p.status === "active");
      const ledger = league.capLedger?.[team.id] || {};
      const capForYear = (league.teamCapOverride?.[team.id] || NFL_STRUCTURE.salaryCap) + Number(ledger.rollover || 0);
      const used = roster.reduce((sum, p) => sum + Number(p.contract?.capHit || 0), 0);
      const space = capForYear - used - Number(ledger.deadCapCurrentYear || 0);
      if (space < 0) illegal.push(`${team.id} ${Math.round(space / 1e6)}M`);
      if (roster.length > ROSTER_LIMIT) oversized.push(`${team.id} ${roster.length}`);
    }

    report.push({ year: session.currentYear, illegal: illegal.length, oversized: oversized.length });
    assert.deepEqual(illegal, [], `season ${session.currentYear}: clubs over the salary cap after the offseason`);
    assert.deepEqual(oversized, [], `season ${session.currentYear}: clubs above the declared roster limit`);
  }

  // Guard the guard: a run that silently stopped simulating would pass every
  // assertion above by vacuity.
  assert.equal(report.length, SEASONS, "every season must have been measured");
  assert.ok(
    session.league.players.filter((p) => p.teamId && p.teamId !== "FA").length > 32 * ROSTER_STRUCTURE.activeLimit * 0.8,
    "the league must still be populated — an empty league would trivially satisfy legality"
  );
});
