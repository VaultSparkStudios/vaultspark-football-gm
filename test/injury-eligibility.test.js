/**
 * Injury eligibility — only players who actually dressed can be injured in a game.
 *
 * Regression for the S62 audit finding: in-game injury candidates were selected
 * with a teamId + status filter only, so practice-squad and game-day-inactive
 * players could be injured in games they never played. Candidate selection now
 * derives from the same dressed-roster authority that builds lineups
 * (getTeamPlayers: active slot, not IR/PUP/NFI, not game-day inactive, healthy).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

function undressedIds(league) {
  return new Set(
    league.players
      .filter(
        (p) =>
          p.status === "active" &&
          ((p.rosterSlot || "active") !== "active" || p.designations?.gameDayInactive === true)
      )
      .map((p) => p.id)
  );
}

test("practice-squad players are never injured in games they did not dress for", () => {
  const session = createSession({ seed: 620031, startYear: 2026, mode: "stat" });
  const league = session.league;
  // Force a violent league so dressed injuries certainly occur across the sample.
  league.settings = { ...(league.settings || {}), injuryRateMultiplier: 25 };

  // Demote a healthy, high-contact slice of every roster to the practice squad.
  const demoted = new Set();
  for (const team of league.teams) {
    const candidates = league.players.filter(
      (p) =>
        p.teamId === team.id &&
        p.status === "active" &&
        (p.rosterSlot || "active") === "active" &&
        (!p.injury || p.injury.weeksRemaining <= 0)
    );
    for (const player of candidates.slice(-6)) {
      player.rosterSlot = "practice";
      demoted.add(player.id);
    }
  }
  assert.ok(demoted.size >= 60, `expected a meaningful demoted sample, got ${demoted.size}`);

  const weeks = 3;
  for (let i = 0; i < weeks; i += 1) {
    const result = session.advanceWeek();
    assert.equal(result.ok, true);
  }

  const undressed = undressedIds(league);
  const injuredUndressed = league.players.filter(
    (p) => demoted.has(p.id) && undressed.has(p.id) && p.injury && p.injury.weeksRemaining > 0
  );
  assert.deepEqual(
    injuredUndressed.map((p) => `${p.name} (${p.rosterSlot})`),
    [],
    "no practice-squad player may acquire an in-game injury"
  );

  // Sanity: the multiplier is real — dressed players did get hurt in the sample.
  const injuredDressed = league.players.filter(
    (p) => !demoted.has(p.id) && p.injury && p.injury.weeksRemaining > 0
  );
  assert.ok(injuredDressed.length > 0, "dressed players should still be injured under a 25x multiplier");
});
