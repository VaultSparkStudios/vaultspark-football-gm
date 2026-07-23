import test from "node:test";
import assert from "node:assert/strict";
import { buildFranchiseCommandStack, hasBlockingFranchiseCommand } from "../public/lib/franchiseCommandCenter.js";
import { buildMobileDecisionDeck } from "../public/lib/mobileLoop.js";

test("controlled draft agency outranks every optional franchise command", () => {
  const input = {
    dashboard: {
      controlledTeamId: "BUF",
      phase: "offseason",
      currentWeek: 1,
      draft: { available: [{ id: "p1" }], controlledTeamOnClock: true, userActionRequired: true },
      injuryReport: [],
      rosterNeeds: [{ pos: "WR" }],
      cap: { capSpace: 5_000_000 }
    },
    newsRows: [{ headline: "League news" }]
  };
  const cards = buildFranchiseCommandStack(input);
  assert.equal(cards[0].title, "You are on the clock");
  assert.equal(cards[0].lane, "Now");
  assert.equal(cards[0].blocking, true);
  assert.equal(cards.at(-1).action, "blocked");
  assert.equal(hasBlockingFranchiseCommand(cards), true);
});

test("a pending GM decision becomes nonblocking only after an explicit staged choice", () => {
  const pendingDecision = {
    id: "decision-1",
    label: "Owner call",
    options: [{ id: "buy", label: "Buy" }]
  };
  const before = buildFranchiseCommandStack({ dashboard: {}, pendingDecision });
  assert.equal(before[0].blocking, true);
  const after = buildFranchiseCommandStack({
    dashboard: {},
    pendingDecision,
    pendingChoice: { choiceId: "buy" }
  });
  assert.equal(after[0].blocking, false);
  assert.equal(after.at(-1).action, "advance-week");
});

test("desktop and mobile consume the same ranked command authority", () => {
  const input = {
    dashboard: {
      controlledTeamId: "BUF",
      phase: "regular-season",
      currentWeek: 9,
      cap: { capSpace: -2_000_000 },
      injuryReport: [{ teamId: "BUF" }],
      rosterNeeds: [{ pos: "OT" }]
    },
    newsRows: []
  };
  assert.deepEqual(buildMobileDecisionDeck(input), buildFranchiseCommandStack(input));
});
