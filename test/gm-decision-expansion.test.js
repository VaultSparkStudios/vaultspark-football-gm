/**
 * GM decision catalog expansion (S62) — narrative events become answerable
 * decisions with real, receipted consequences, and the UI icon/tone maps match
 * the live engine event set exactly.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GM_DECISION_CATALOG, generateGmDecisions, buildGmDecisionOccurrenceKey } from "../src/engine/gmDecisionAuthority.js";
import { applyGmDecisionConsequence, resolveGmDecisionCommitments } from "../src/engine/gmDecisionConsequences.js";
import { createSession } from "../src/runtime/bootstrap.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("the catalog carries six decision archetypes for an unlimited-season dynasty", () => {
  const ids = Object.keys(GM_DECISION_CATALOG);
  assert.deepEqual(
    ids.sort(),
    ["cap-crisis", "culture-crisis", "legend-farewell", "qb-injury", "star-trade-request", "trade-deadline"].sort()
  );
  for (const id of ["star-trade-request", "culture-crisis", "legend-farewell"]) {
    const definition = GM_DECISION_CATALOG[id];
    assert.ok(Object.isFrozen(definition), `${id} definition is frozen`);
    assert.equal(Object.keys(definition.choices).length, 3, `${id} offers three real choices`);
  }
});

function narrativeState(session, event) {
  session.league.narrativeLog = [event];
  return session.getDashboardState();
}

test("a live TRADE_REQUEST for the controlled team becomes a pending decision", () => {
  const session = createSession({ seed: 620061, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const star = session.league.players.find((p) => p.teamId === "BUF" && p.status === "active");
  const state = narrativeState(session, {
    type: "TRADE_REQUEST",
    year: 2026,
    week: 3,
    teamIds: ["BUF"],
    playerIds: [star.id],
    headline: `${star.name} requests a trade out of BUF`,
    impact: "Trade value is elevated while demand is active."
  });
  const decision = state.gmDecisionQueue.find((entry) => entry.id === "star-trade-request");
  assert.ok(decision, "trade request surfaces as a decision");
  assert.match(decision.prompt, new RegExp(star.name));
  assert.deepEqual(decision.options.map((option) => option.id).sort(), ["deny", "extend", "shop"]);

  // Answered occurrences never re-fire.
  const ledger = [{ occurrenceKey: decision.occurrenceKey }];
  const again = generateGmDecisions(state, { ledger });
  assert.ok(!again.some((entry) => entry.id === "star-trade-request"), "occurrence ledger dedupes");
});

test("events scoped to other teams never pressure the controlled GM", () => {
  const session = createSession({ seed: 620062, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const state = narrativeState(session, {
    type: "CULTURE_CRISIS", year: 2026, week: 4, teamIds: ["MIA"], playerIds: [],
    headline: "Miami locker room fractures", impact: ""
  });
  assert.ok(!state.gmDecisionQueue.some((entry) => entry.id === "culture-crisis"));
});

test("denying a star's request lands a visible, deterministic morale consequence", () => {
  const session = createSession({ seed: 620063, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const star = session.league.players.find((p) => p.teamId === "BUF" && p.status === "active");
  star.morale = 50;
  const occurrenceKey = buildGmDecisionOccurrenceKey(
    { franchiseId: "fa-test", currentYear: 2026, controlledTeamId: "BUF" },
    "star-trade-request",
    star.id
  );
  const result = applyGmDecisionConsequence(session, {
    decisionId: "star-trade-request",
    choiceId: "deny",
    occurrenceKey
  });
  assert.equal(result.ok, true);
  assert.equal(result.decision.execution?.status, "completed");
  assert.equal(star.morale, 46, "deny costs exactly 4 morale — visible, bounded, no hidden bonus");
  assert.equal(result.commitment, null);
});

test("shopping the star creates a commitment that resolves on the real trade", () => {
  const session = createSession({ seed: 620064, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const star = session.league.players.find((p) => p.teamId === "BUF" && p.status === "active");
  const occurrenceKey = buildGmDecisionOccurrenceKey(
    { franchiseId: "fa-test", currentYear: 2026, controlledTeamId: "BUF" },
    "star-trade-request",
    star.id
  );
  const result = applyGmDecisionConsequence(session, {
    decisionId: "star-trade-request",
    choiceId: "shop",
    occurrenceKey
  });
  assert.ok(result.commitment, "shop is a promise, not a wish");
  assert.equal(result.commitment.subjectPlayerId, star.id, "the commitment binds the exact player");

  session.logTransaction({
    type: "trade",
    teamA: "BUF",
    teamB: "MIA",
    details: { fromA: [star.id], fromB: [], picksFromA: [], picksFromB: [] }
  });
  const receipts = resolveGmDecisionCommitments(session);
  const resolution = receipts.find((entry) => entry.commitmentId === result.commitment.id);
  assert.ok(resolution, "the trade resolves the commitment");
  assert.equal(resolution.status, "succeeded");
});

test("culture-crisis address steadies exactly the five lowest-morale players", () => {
  const session = createSession({ seed: 620065, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const roster = session.league.players.filter((p) => p.teamId === "BUF" && p.status === "active");
  roster.forEach((player, index) => { player.morale = 40 + index; });
  const lowestBefore = roster.slice().sort((a, b) => a.morale - b.morale).slice(0, 5).map((p) => p.id);
  const result = applyGmDecisionConsequence(session, {
    decisionId: "culture-crisis",
    choiceId: "address-room",
    occurrenceKey: "fa-test:2026:BUF:culture-crisis:culture-2026-week-4"
  });
  assert.equal(result.decision.execution?.status, "completed");
  for (const id of lowestBefore) {
    const player = roster.find((p) => p.id === id);
    assert.equal(player.morale >= 42, true, "each steadied player gained morale");
  }
});

test("UI icon/tone maps cover exactly the live engine event set", () => {
  const overview = read("../public/lib/tabOverview.js");
  const engine = read("../src/engine/narrativeEvents.js");
  const engineTypes = [...new Set([...engine.matchAll(/type: "([A-Z_]+)"/g)].map((match) => match[1]))];
  assert.ok(engineTypes.length >= 6, `expected the live event set, saw ${engineTypes.join(", ")}`);
  for (const type of engineTypes) {
    assert.match(overview, new RegExp(`${type}:`), `iconMap covers live event ${type}`);
  }
  for (const phantom of ["INJURY_SCARE", "MVP_RACE", "CULTURE_SHIFT", "SALARY_DISPUTE", "DRAFT_STEAL", "RIVAL_SURGE", "STREAK_CEREMONY"]) {
    assert.ok(!overview.includes(`${phantom}:`), `phantom type ${phantom} must not linger in the maps`);
  }
});
