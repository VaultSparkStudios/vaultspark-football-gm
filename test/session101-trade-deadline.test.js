import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { tradeWindow } from "../public/lib/tradeWindow.js";
import { navigateToExactSurface } from "../public/lib/exactSurfaceNavigation.js";

// ── S101 · the trade deadline is a rule, not copy ─────────────────────────────
//
// Three surfaces advertised three different deadline windows (weeks 8-10, 9-11,
// and a W12 GM mandate) for a rule the engine never enforced: `TradeService`
// had no week or phase check anywhere, so the identical trade was still legal in
// Week 17 and in the playoffs. The deadline is now declared once in league
// settings and enforced at the shared command seam, which is what makes the
// player-facing copy true — and makes CPU front offices obey it too.

const TEAM_A = "BUF";
const TEAM_B = "NE";

function sessionAt(phase, currentWeek) {
  const session = createSession({ seed: 31337, startYear: 2025, mode: "drive", controlledTeamId: TEAM_A });
  session.phase = phase;
  session.currentWeek = currentWeek;
  return session;
}

function anyTradeInput(session) {
  const from = (teamId) => session.league.players.find((player) => player.teamId === teamId && player.status === "active");
  return {
    teamA: TEAM_A,
    teamB: TEAM_B,
    teamAPlayerIds: [from(TEAM_A).id],
    teamBPlayerIds: [from(TEAM_B).id],
    teamAPickIds: [],
    teamBPickIds: []
  };
}

test("a trade committed after the deadline is refused at the command seam", () => {
  const session = sessionAt("regular-season", 14);
  const deadlineWeek = session.league.settings.tradeDeadlineWeek;
  assert.ok(Number.isFinite(deadlineWeek), "the league must declare a deadline week");
  assert.ok(14 > deadlineWeek);

  const result = session.services.trades.commit(anyTradeInput(session));

  assert.equal(result.ok, false, "the engine must enforce the deadline the UI advertises");
  assert.equal(result.reasonCode, "trade-deadline-closed");
  assert.equal(result.status, 409);
  assert.match(String(result.error), new RegExp(`Week ${deadlineWeek}`));
});

test("the postseason trade window is closed", () => {
  const session = sessionAt("postseason", 1);
  const result = session.services.trades.commit(anyTradeInput(session));
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "trade-deadline-closed");
});

test("a trade on the deadline week itself is still allowed", () => {
  const session = sessionAt("regular-season", 1);
  session.currentWeek = session.league.settings.tradeDeadlineWeek;

  const result = session.services.trades.commit(anyTradeInput(session));
  // It may still be refused on value/roster grounds — what must NOT happen is a
  // deadline refusal on the last legal week.
  assert.notEqual(result.reasonCode, "trade-deadline-closed");
});

test("the enforced rule and the advertised window come from the same declaration", () => {
  const session = sessionAt("regular-season", 12);
  const deadlineWeek = session.league.settings.tradeDeadlineWeek;

  const closedForEngine = session.services.trades.commit(anyTradeInput(session)).reasonCode === "trade-deadline-closed";
  const surface = tradeWindow({ phase: "regular-season", currentWeek: 12, settings: { tradeDeadlineWeek: deadlineWeek } });

  assert.equal(closedForEngine, true);
  assert.equal(surface.open, false, "the surface must agree with the rule the engine enforced");
});

test("a surface with no declared deadline claims no window", () => {
  const surface = tradeWindow({ phase: "regular-season", currentWeek: 12, settings: {} });
  assert.equal(surface.declared, false);
  assert.equal(surface.closing, false, "an undeclared rule must never be advertised as closing");
});

// ── navigation must not certify a destination the player never reached ────────

function fakeElement({ id = null, hidden = false, panelId = null } = {}) {
  const panel = panelId
    ? { id: panelId, hidden: false, classList: { contains: (name) => name === "tab-panel" }, parentElement: null }
    : null;
  const focus = { called: false };
  return {
    element: {
      id,
      hidden,
      classList: { contains: () => false },
      parentElement: panel,
      scrollIntoView() {},
      hasAttribute: () => true,
      setAttribute() {},
      focus() { focus.called = true; }
    },
    focus
  };
}

test("a target living in another tab is reported as unreached, not focused", async () => {
  const { element, focus } = fakeElement({ id: "tradeDeadlineFrenzy", panelId: "overviewTab" });
  const announced = [];

  const result = await navigateToExactSurface(
    { targetTab: "transactionsTab", targetId: "tradeDeadlineFrenzy" },
    {
      activateTab: () => {},
      documentRef: { getElementById: () => element },
      windowRef: {},
      announce: (message) => announced.push(message),
      missingMessage: "That surface is not available right now."
    }
  );

  assert.equal(result.focused, false, "focus cannot land in a display:none tab, so it must not be reported as landed");
  assert.equal(result.reason, "target-not-in-tab");
  assert.equal(focus.called, false);
  assert.deepEqual(announced, ["That surface is not available right now."], "the honest branch must announce");
});

test("a hidden target is reported as unreached", async () => {
  const { element } = fakeElement({ id: "tradeDeadlineFrenzy", hidden: true, panelId: "overviewTab" });
  const result = await navigateToExactSurface(
    { targetTab: "overviewTab", targetId: "tradeDeadlineFrenzy" },
    { activateTab: () => {}, documentRef: { getElementById: () => element }, windowRef: {} }
  );
  assert.equal(result.focused, false);
});

test("a target in the activated tab is still focused normally", async () => {
  const { element, focus } = fakeElement({ id: "depthTable", panelId: "rosterTab" });
  const result = await navigateToExactSurface(
    { targetTab: "rosterTab", targetId: "depthTable" },
    { activateTab: () => {}, documentRef: { getElementById: () => element }, windowRef: {} }
  );

  assert.equal(result.focused, true);
  assert.equal(result.reason, "focused");
  assert.equal(focus.called, true);
});
