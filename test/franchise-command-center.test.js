import test from "node:test";
import assert from "node:assert/strict";
import { buildFranchiseCommandReceipt, buildFranchiseCommandStack, hasBlockingFranchiseCommand } from "../public/lib/franchiseCommandCenter.js";
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
  assert.equal(cards[0].targetId, "draftWarRoomPanel");
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

test("every open-tab command names the exact decision surface in its explanation receipt", () => {
  const input = {
    dashboard: {
      controlledTeamId: "BUF",
      phase: "regular-season",
      currentYear: 2026,
      currentWeek: 9,
      // S101: the deadline is a declared league rule, so the fixture carries the
      // settings the live state payload carries. Without it the surface must NOT
      // claim a window at all — asserted separately below.
      settings: { tradeDeadlineWeek: 11 },
      cap: { capSpace: -2_000_000 },
      injuryReport: [{ teamId: "BUF" }],
      rosterNeeds: [{ pos: "OT" }]
    },
    newsRows: []
  };
  const cards = buildFranchiseCommandStack(input).filter((card) => card.action === "open-tab");
  assert.deepEqual(cards.map(({ targetTab, targetId }) => ({ targetTab, targetId })), [
    { targetTab: "contractsTab", targetId: "contractsSpotlight" },
    { targetTab: "rosterTab", targetId: "depthTable" },
    // the deadline panel lives in the overview tab; pointing at transactionsTab
    // focused a display:none element and reported success (S101).
    { targetTab: "overviewTab", targetId: "tradeDeadlinePanel" }
  ]);
  const receipt = buildFranchiseCommandReceipt(input);
  assert.deepEqual(receipt.commands.filter((command) => command.action === "open-tab").map(({ targetTab, targetId }) => ({ targetTab, targetId })),
    cards.map(({ targetTab, targetId }) => ({ targetTab, targetId })));
});

test("a league that declares no trade deadline is never told a window is closing", () => {
  const cards = buildFranchiseCommandStack({
    dashboard: {
      controlledTeamId: "BUF",
      phase: "regular-season",
      currentYear: 2026,
      currentWeek: 9,
      settings: {},
      cap: { capSpace: 15_000_000 },
      injuryReport: [],
      rosterNeeds: [{ pos: "OT" }]
    },
    newsRows: []
  });

  assert.deepEqual(
    cards.filter((card) => card.kicker === "Deadline window"),
    [],
    "the UI must not advertise a deadline the league does not enforce"
  );
});

test("the deadline card follows the declared week rather than a hand-typed window", () => {
  const stackAt = (currentWeek, tradeDeadlineWeek) => buildFranchiseCommandStack({
    dashboard: {
      controlledTeamId: "BUF",
      phase: "regular-season",
      currentYear: 2026,
      currentWeek,
      settings: { tradeDeadlineWeek },
      cap: { capSpace: 15_000_000 },
      injuryReport: [],
      rosterNeeds: [{ pos: "OT" }]
    },
    newsRows: []
  }).some((card) => card.kicker === "Deadline window");

  assert.equal(stackAt(11, 11), true, "the deadline week itself is inside the window");
  assert.equal(stackAt(12, 11), false, "the window is closed once the deadline passes");
  assert.equal(stackAt(8, 11), false, "the window has not opened yet");
  // move the rule and the surface moves with it
  assert.equal(stackAt(14, 14), true);
  assert.equal(stackAt(12, 14), true);
  assert.equal(stackAt(15, 14), false);
});
