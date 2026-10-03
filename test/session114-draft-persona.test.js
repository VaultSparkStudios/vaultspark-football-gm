import test from "node:test";
import assert from "node:assert/strict";
import { DRAFT_PERSONA_TILT, draftPersonaTilt } from "../src/engine/aiTeamStrategy.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

const raw = { overall: 60, potential: 80 };
const ready = { overall: 72, potential: 74 };

test("Moneyball fronts pay for headroom and Win-Now fronts pay for readiness", () => {
  assert.ok(draftPersonaTilt(raw, "Moneyball") > draftPersonaTilt(ready, "Moneyball"));
  assert.ok(draftPersonaTilt(raw, "Win-Now") < draftPersonaTilt(ready, "Win-Now"));
  assert.equal(draftPersonaTilt(raw, null), 0, "your own delegated picks are untouched");
  assert.equal(draftPersonaTilt(raw, "Unknown"), 0, "an unknown archetype is neutral");
  assert.equal(draftPersonaTilt({ overall: 75, potential: 70 }, "Moneyball"), 0, "no negative headroom bonus");
});

test("the tilt stays smaller than one roster-need step so need still leads", () => {
  const largest = Math.max(...Object.values(DRAFT_PERSONA_TILT).map(Math.abs));
  // A 20-point headroom gap is far above a typical draft class; need boosts are 13 per missing player.
  assert.ok(largest * 20 <= 13, `largest tilt ${largest} x 20 must not outweigh one need step`);
});

// The tilt is a pure score term (no rng call by construction); this pins seed determinism.
test("persona drafting stays deterministic for a seed", () => {
  const draw = () => {
    const session = new GameSession({ rng: new RNG(9114), startYear: 2026, controlledTeamId: "BUF" });
    session.simulateSeasons(1);
    return session.rng.int(0, 1_000_000);
  };
  assert.equal(draw(), draw(), "same seed, same stream position after a full season and draft");
});
