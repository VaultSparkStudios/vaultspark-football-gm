import test from "node:test";
import assert from "node:assert/strict";
import { buildMobileDecisionDeck, initMobileLoop, setMobileModeEnabled, initMobileNavDrawer } from "../public/lib/mobileLoop.js";

test("mobile decision deck prioritizes an active draft room", () => {
  const cards = buildMobileDecisionDeck({
    dashboard: {
      phase: "draft",
      controlledTeamId: "BUF",
      rosterNeeds: [{ pos: "WR" }],
      draft: { available: [{ id: "p1" }] },
      cap: { capSpace: 12_000_000 },
      injuryReport: []
    }
  });

  assert.equal(cards[0].kicker, "Draft room");
  assert.equal(cards[0].targetTab, "draftTab");
  assert.match(cards[0].detail, /WR/);
});

test("mobile decision deck flags cap and injury pressure before advancing", () => {
  const cards = buildMobileDecisionDeck({
    dashboard: {
      phase: "regular-season",
      controlledTeamId: "BUF",
      currentWeek: 4,
      cap: { capSpace: -2_500_000 },
      injuryReport: [
        { teamId: "BUF", playerId: "qb1" },
        { teamId: "MIA", playerId: "wr1" }
      ]
    }
  });

  assert.equal(cards[0].targetTab, "contractsTab");
  assert.equal(cards[0].tone, "danger");
  assert.equal(cards[1].targetTab, "rosterTab");
  assert.match(cards[1].detail, /1 controlled-team injury/);
});

test("mobile decision deck falls back to advance week when no pressure exists", () => {
  const cards = buildMobileDecisionDeck({
    dashboard: {
      phase: "regular-season",
      controlledTeamId: "BUF",
      currentWeek: 2,
      cap: { capSpace: 20_000_000 },
      injuryReport: []
    }
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].action, "advance-week");
  assert.equal(cards[0].tone, "primary");
});

test("initMobileLoop is exported from mobileLoop.js", () => {
  assert.equal(typeof initMobileLoop, "function");
});

test("setMobileModeEnabled is exported from mobileLoop.js", () => {
  assert.equal(typeof setMobileModeEnabled, "function");
});

test("initMobileNavDrawer is exported from mobileLoop.js", () => {
  assert.equal(typeof initMobileNavDrawer, "function");
});

test("initMobileNavDrawer is a no-op when DOM elements are absent", () => {
  assert.doesNotThrow(() => initMobileNavDrawer());
});
