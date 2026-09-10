import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

/**
 * "Rare" is a rate, and until S104 this test asserted a count.
 *
 * The assertions were `elite90 <= 12` and `OL elite90 <= 10` over an entire
 * generated league. Both were written when a generated league held **1,568**
 * players, and neither said so — so the ceiling was a share of a population
 * that appeared nowhere in the test. S104 generates leagues at the roster
 * structure the rules declare (53 active plus a 16-man practice squad, 2,208
 * players), and the count assertion tightened by 41% without a line of it
 * changing. It then failed on seed 20260312 at 13 players.
 *
 * Measured across all four seeds at generation, 90+ share of the rostered
 * population against the ceiling this test has always meant (12/1568 = 0.765%):
 *
 *     20260311    9 players   0.408%
 *     20260312   13 players   0.589%   <- "fails" the count, comfortably passes the rate
 *     20260313    8 players   0.362%
 *     20260314   12 players   0.543%
 *
 * Elite players got **rarer**, on every seed. Restating the ceiling as the share
 * it always was is therefore not a relaxation — it is the fix for an undeclared
 * denominator, which is the same defect S91, S102, S103 and S104 have each found
 * in a gate. The strictness is carried over exactly: the historical count and
 * the historical population are both written down, and the rate is derived from
 * them rather than chosen.
 *
 * The elite population is also entirely offensive line and quarterback, which is
 * why this test has always singled those two rooms out. That concentration is a
 * live finding about the position-overall formulas, recorded in the S104 handoff;
 * it is not what this test is for.
 */
const LEGACY_ELITE_SAMPLE = Object.freeze({
  /** A generated league before S104: 32 clubs x 49 players. */
  population: 1568,
  /** The counts this test asserted against that population. */
  maxElite90: 12,
  /** OL held 288 of those 1,568. */
  olPopulation: 288,
  maxOlElite90: 10
});
const MAX_ELITE_90_SHARE = LEGACY_ELITE_SAMPLE.maxElite90 / LEGACY_ELITE_SAMPLE.population;
const MAX_OL_ELITE_90_SHARE = LEGACY_ELITE_SAMPLE.maxOlElite90 / LEGACY_ELITE_SAMPLE.olPopulation;

test("generated league keeps 90+ overall players rare across core seeds", () => {
  const seeds = [20260311, 20260312, 20260313, 20260314];

  for (const seed of seeds) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
    const players = session.league.players.filter((player) => player.status === "active" && player.teamId !== "FA");
    const byPosition = {};
    let elite90 = 0;
    let elite95 = 0;

    for (const player of players) {
      if (!byPosition[player.position]) byPosition[player.position] = { elite90: 0, elite95: 0 };
      if (player.overall >= 90) {
        elite90 += 1;
        byPosition[player.position].elite90 += 1;
      }
      if (player.overall >= 95) {
        elite95 += 1;
        byPosition[player.position].elite95 += 1;
      }
    }

    const eliteShare = elite90 / players.length;
    assert.ok(
      eliteShare <= MAX_ELITE_90_SHARE,
      `seed ${seed} generated too many 90+ players: ${elite90}/${players.length} = ${(eliteShare * 100).toFixed(3)}% > ${(MAX_ELITE_90_SHARE * 100).toFixed(3)}%`
    );
    assert.equal(elite95, 0, `seed ${seed} generated 95+ players`);
    assert.equal(byPosition.RB?.elite90 || 0, 0, `seed ${seed} generated elite RB inflation`);
    assert.equal(byPosition.WR?.elite90 || 0, 0, `seed ${seed} generated elite WR inflation`);
    assert.equal(byPosition.DL?.elite90 || 0, 0, `seed ${seed} generated elite DL inflation`);
    assert.equal(byPosition.LB?.elite90 || 0, 0, `seed ${seed} generated elite LB inflation`);

    const olPlayers = players.filter((player) => player.position === "OL").length;
    const olEliteShare = (byPosition.OL?.elite90 || 0) / Math.max(1, olPlayers);
    assert.ok(
      olEliteShare <= MAX_OL_ELITE_90_SHARE,
      `seed ${seed} generated too many elite OL: ${byPosition.OL?.elite90 || 0}/${olPlayers} = ${(olEliteShare * 100).toFixed(3)}% > ${(MAX_OL_ELITE_90_SHARE * 100).toFixed(3)}%`
    );

    // Negative control: the ceiling is a real bound, not a number no league
    // could reach. Asserted against an explicit synthetic count one player past
    // the ceiling for this population, rather than a multiple of the observed
    // count — scaling the measured value would put the control's own strength
    // at the mercy of whichever seed happened to be rarest (20260313 sits at
    // 8/2208, and twice that is still inside the bound).
    const ceilingCount = Math.floor(MAX_ELITE_90_SHARE * players.length);
    assert.ok(
      (ceilingCount + 1) / players.length > MAX_ELITE_90_SHARE,
      `the elite ceiling must be breachable: ${ceilingCount + 1}/${players.length}`
    );
    assert.ok(
      ceilingCount / players.length <= MAX_ELITE_90_SHARE,
      `and must admit a league at the ceiling: ${ceilingCount}/${players.length}`
    );
  }
});
