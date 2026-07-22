import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildMobileDecisionDeck } from "../public/lib/mobileLoop.js";

test("mobile GM selection is staged visibly before the weekly command", () => {
  const decision = {
    id: "trade-deadline",
    label: "Deadline posture",
    prompt: "Choose the franchise posture.",
    options: [
      { id: "buy", label: "Buy", effect: "Add talent" },
      { id: "hold", label: "Hold", effect: "Stay the course" }
    ]
  };
  const deck = buildMobileDecisionDeck({
    dashboard: { phase: "regular-season", currentWeek: 9, controlledTeamId: "BUF" },
    pendingDecision: decision,
    pendingChoice: { decisionId: decision.id, choiceId: "hold" }
  });
  assert.equal(deck[0].selectedChoiceId, "hold");
  assert.equal(deck[0].kicker, "Weekly plan staged");
  assert.match(deck[0].detail, /Commit Plan & Advance/);
});

test("selecting a mobile GM choice cannot mutate or advance the league", () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("async function submitMobileGmDecisionChoice");
  const end = source.indexOf("async function collectWeeklyCommandIntent");
  const stageBlock = start >= 0 && end > start ? source.slice(start, end) : "";
  assert.match(stageBlock, /state\.mobilePendingDecisionChoice = \{ \.\.\.choice \}/);
  assert.doesNotMatch(stageBlock, /api\(/);
  assert.match(stageBlock, /GM choice staged/);
});

test("desktop and mobile converge on one weekly command coordinator", () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(source, /async function advanceOneWeek\(\{ gmDecisionChoice = null \} = \{\}\)/);
  assert.match(source, /weeklyTacticOverride/);
  assert.match(source, /body\.gmDecisionChoice = gmDecisionChoice/);
  assert.match(source, /\(\) => advanceOneWeek\(\)/);
  assert.match(source, /advanceOneWeek\(\{ gmDecisionChoice: state\.mobilePendingDecisionChoice \}\)/);
});
