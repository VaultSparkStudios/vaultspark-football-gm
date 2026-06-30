import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMobileDecisionDeck } from "../public/lib/mobileLoop.js";

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


test("app shell imports and wires the mobile loop overlay", () => {
  const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appSource, /from "\.\/lib\/mobileLoop\.js"/);
  assert.match(appSource, /function syncMobileLoopOverlay\(\)/);
  assert.match(appSource, /setMobileModeEnabled\(e\.target\.checked\)/);
  assert.doesNotMatch(appSource, /typeof setMobileModeEnabled/);
  assert.doesNotMatch(appSource, /typeof initMobileLoop/);
  assert.match(appSource, /checkAndPruneRewindStorage\(\);\s*syncMobileLoopOverlay\(\);/s);
});


test("player history archive has an empty-season fallback for selected players", () => {
  const historySource = fs.readFileSync(new URL("../public/lib/tabHistory.js", import.meta.url), "utf8");
  const flowSource = fs.readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");

  assert.match(historySource, /No logged seasons yet/);
  assert.match(historySource, /<article class=\"history-card\">/);
  assert.match(flowSource, /No logged seasons for this filter/);
});
