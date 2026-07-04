import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMobileDecisionDeck, buildMobilePressureStack } from "../public/lib/mobileLoop.js";

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
test("mobile pressure stack surfaces owner mandate, fan pulse, cap, and injuries", () => {
  const cards = buildMobilePressureStack({
    dashboard: {
      phase: "regular-season",
      controlledTeamId: "BUF",
      currentWeek: 4,
      controlledTeam: {
        owner: {
          expectation: {
            mandate: "playoffs-or-bust",
            ultimatum: { active: true, weeksLeft: 2, consequence: "front-office changes" }
          }
        }
      },
      fanSentiment: { approval: 42, trend: "falling", label: "Restless", reasons: ["QB injuries"] },
      cap: { capSpace: -1_200_000 },
      injuryReport: [{ teamId: "BUF" }, { teamId: "BUF" }, { teamId: "MIA" }]
    }
  });

  assert.deepEqual(cards.map((card) => card.kicker), [
    "Owner mandate",
    "Fan pulse",
    "Cap pressure",
    "Trainer report"
  ]);
  assert.equal(cards[0].tone, "danger");
  assert.equal(cards[1].targetTab, "overviewTab");
  assert.equal(cards[2].targetTab, "contractsTab");
  assert.match(cards[3].title, /2 controlled-team injuries/);
});

test("mobile pressure stack elevates deadline window and stays useful without urgent pressure", () => {
  const deadlineCards = buildMobilePressureStack({
    dashboard: {
      phase: "regular-season",
      controlledTeamId: "BUF",
      currentWeek: 10,
      controlledTeam: {},
      cap: { capSpace: 15_000_000 },
      rosterNeeds: [{ pos: "CB" }],
      injuryReport: []
    }
  });

  assert.equal(deadlineCards[0].kicker, "Deadline window");
  assert.equal(deadlineCards[0].targetTab, "transactionsTab");
  assert.match(deadlineCards[0].detail, /CB/);

  const calmCards = buildMobilePressureStack({
    dashboard: {
      phase: "regular-season",
      controlledTeamId: "BUF",
      currentWeek: 2,
      controlledTeam: {},
      cap: { capSpace: 20_000_000 },
      injuryReport: []
    }
  });

  assert.equal(calmCards[0].kicker, "Franchise state");
  assert.equal(calmCards[0].tone, "positive");
});
test("mobile decision deck prioritizes a pending GM decision before generic pressure", () => {
  const cards = buildMobileDecisionDeck({
    dashboard: {
      phase: "regular-season",
      controlledTeamId: "BUF",
      currentWeek: 10,
      cap: { capSpace: 15_000_000 },
      injuryReport: []
    },
    pendingDecision: {
      id: "trade-deadline",
      type: "TRADE_DEADLINE",
      prompt: "Trade deadline closes soon. Buy, sell, or hold?",
      options: [{ id: "buy" }, { id: "sell" }, { id: "hold" }]
    }
  });

  assert.equal(cards[0].kicker, "GM decision");
  assert.equal(cards[0].action, "choose-gm-decision");
  assert.equal(cards[0].tone, "danger");
  assert.equal(cards[0].decisionId, "trade-deadline");
  assert.deepEqual(cards[0].choices.map((choice) => choice.id), ["buy", "sell", "hold"]);
  assert.match(cards[0].detail, /Trade deadline closes soon/);
});

test("mobile overlay refreshes pending GM decisions from the app shell", () => {
  const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const stateSource = fs.readFileSync(new URL("../public/lib/appState.js", import.meta.url), "utf8");

  assert.match(stateSource, /mobilePendingDecision: null/);
  assert.match(appSource, /function mobileDecisionSnapshotKey\(\)/);
  assert.match(appSource, /const decisionSnapshotKey = mobileDecisionSnapshotKey\(\)/);
  assert.match(appSource, /api\("\/api\/gm-decision"\)/);
  assert.match(appSource, /decisionSnapshotKey !== mobileDecisionSnapshotKey\(\)/);
  assert.match(appSource, /state\.mobilePendingDecision = data\?\.decisions\?\.\[0\] \|\| null/);
  assert.match(appSource, /renderMobileOverlay\(state, advanceFromMobile\)/);
});

test("mobile overlay clears stale pending decisions when refresh fails", () => {
  const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appSource, /\.catch\(\(\) => \{\s*if \(decisionSnapshotKey !== mobileDecisionSnapshotKey\(\)\) return;\s*state\.mobilePendingDecision = null;\s*if \(isMobileModeEnabled\(\)\) renderMobileOverlay\(state, advanceFromMobile\);/s);
});

test("mobile GM decision choices are rendered and submitted through the app shell", () => {
  const mobileSource = fs.readFileSync(new URL("../public/lib/mobileLoop.js", import.meta.url), "utf8");
  const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(mobileSource, /ml-decision-option-btn/);
  assert.match(mobileSource, /vsfgm:mobile-gm-decision-choice/);
  assert.match(mobileSource, /vsfgm:mobile-decision/);
  assert.match(appSource, /vsfgm:mobile-decision/);
  assert.match(appSource, /event\.detail\?\.action !== "choose-gm-decision"/);
  assert.match(appSource, /checkAndShowGmDecision\(\)\s*\.then\(\(choice\) =>/);
  assert.match(appSource, /submitMobileGmDecisionChoice/);
  assert.match(appSource, /gmDecisionChoice: choice/);
  assert.match(appSource, /Recording mobile GM decision/);
});


test("mobile overlay uses attribute escaping for generated data attributes", () => {
  const mobileSource = fs.readFileSync(new URL("../public/lib/mobileLoop.js", import.meta.url), "utf8");

  assert.match(mobileSource, /function _escAttr\(s\)/);
  assert.match(mobileSource, /replace\(\/"\/g, "&quot;"\)\.replace\(\/'\/g, "&#39;"\)/);
  assert.match(mobileSource, /data-target-tab="\$\{_escAttr\(item\.targetTab/);
  assert.match(mobileSource, /data-action="\$\{_escAttr\(card\.action\)\}"/);
});
