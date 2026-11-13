import test from "node:test";
import assert from "node:assert/strict";
import { buildCoGmBriefingPacket, coGmBriefingFilename, serializeCoGmBriefingPacket } from "../public/lib/coGmBriefing.js";

function dashboard() {
  return {
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", name: "Buffalo", record: "7-2", owner: { expectation: { mandate: "Win the division", trend: "rising", heat: 22 } } },
    currentYear: 2028,
    currentWeek: 9,
    phase: "regular-season",
    cap: { capSpace: 12_000_000 },
    rosterNeeds: [{ pos: "WR" }, { pos: "OT" }, { pos: "CB" }, { pos: "S" }, { pos: "RB" }],
    injuryReport: [{ teamId: "BUF" }, { teamId: "MIA" }],
    architectThesis: { focusPathId: "identity", revision: 2 },
    architectLedger: Array.from({ length: 5 }, (_, index) => ({
      id: `receipt-${index}`,
      teamId: "BUF",
      year: 2028,
      week: index + 1,
      intent: { tactic: { label: `Plan ${index}` } },
      outcome: { observed: `Result ${index}`, aligned: index % 2 === 0 }
    })),
    secretToken: "must-not-export"
  };
}

test("Co-GM packet is bounded to visible, decision-relevant authority", () => {
  const packet = buildCoGmBriefingPacket({ dashboard: dashboard(), newsRows: [{ headline: "Division race tightens" }] });
  assert.equal(packet.kind, "co-gm-briefing");
  assert.equal(packet.authority.teamId, "BUF");
  assert.equal(packet.pressure.controlledTeamInjuries, 1);
  assert.deepEqual(packet.pressure.rosterNeeds, ["WR", "OT", "CB", "S"]);
  assert.equal(packet.recentDecisionReceipts.length, 3);
  assert.equal(packet.recentDecisionReceipts[0].id, "receipt-4");
  assert.equal(packet.disclosure.bounded, true);
});

test("serialized Co-GM packet excludes raw save and secret-shaped source fields", () => {
  const serialized = serializeCoGmBriefingPacket(buildCoGmBriefingPacket({ dashboard: dashboard() }));
  assert.doesNotMatch(serialized, /must-not-export/);
  assert.doesNotMatch(serialized, /secretToken/);
  assert.match(serialized, /hidden simulation state/);
  assert.ok(serialized.length < 8000);
});

test("Co-GM filenames bind the visible franchise authority", () => {
  const packet = buildCoGmBriefingPacket({ dashboard: dashboard() });
  assert.equal(coGmBriefingFilename(packet), "co-gm-brief-buf-2028-w9.json");
});

test("unknown Co-GM numbers remain unknown while decimal zero remains a fact", () => {
  for (const unknown of [null, undefined, "", "  ", false, true, [], {}, "0x10", "Infinity"]) {
    const input = dashboard();
    input.currentYear = unknown; input.currentWeek = unknown;
    input.cap.capSpace = unknown; input.controlledTeam.owner.expectation.heat = unknown;
    input.architectThesis.revision = unknown;
    const packet = buildCoGmBriefingPacket({ dashboard: input });
    assert.equal(packet.authority.year, null);
    assert.equal(packet.authority.week, null);
    assert.equal(packet.pressure.capSpace, null);
    assert.equal(packet.pressure.ownerHeat, null);
    assert.equal(packet.architectThesis.revision, null);
    assert.equal(packet.currentCommand.action, "open-tab", "missing authority cannot assert advance-ready");
  }
  for (const zero of [0, "0", " 0.0 "]) {
    const input = dashboard(); input.currentWeek = zero; input.cap.capSpace = zero;
    assert.equal(buildCoGmBriefingPacket({ dashboard: input }).authority.week, 0);
    assert.equal(buildCoGmBriefingPacket({ dashboard: input }).pressure.capSpace, 0);
  }
});

test("damaged optional briefing collections preserve valid visible peers and disclosure", () => {
  const input = dashboard();
  input.injuryReport = [null, [], false, {}, { unrelated: "not-an-injury" }, { teamId: "BUF" }, { teamId: "MIA" }];
  input.rosterNeeds = [null, {}, false, { pos: "WR" }, "QB", { position: "OT" }, []];
  input.architectLedger = [null, [], {}, false, input.architectLedger[0], input.architectLedger[1]];
  const packet = buildCoGmBriefingPacket({ dashboard: input,
    newsRows: [null, {}, { headline: "Visible league news" }],
    pendingDecision: { id: "choice", options: [null, {}, { id: "keep", label: "Keep the plan" }] }
  });
  assert.equal(packet.pressure.controlledTeamInjuries, 1);
  assert.deepEqual(packet.pressure.rosterNeeds, ["WR", "QB", "OT"]);
  assert.equal(packet.recentDecisionReceipts.length, 2);
  assert.equal(packet.pressure.leagueHeadline, "Visible league news");
  assert.deepEqual(packet.currentCommand.choices, [{ id: "keep", label: "Keep the plan", effect: "" }]);
  assert.ok(!serializeCoGmBriefingPacket(packet).includes("not-an-injury"));
  assert.ok(!serializeCoGmBriefingPacket(packet).includes("[object Object]"));
  assert.deepEqual(packet.disclosure.excluded, ["save file", "full roster ratings", "credentials", "personal identifiers", "hidden simulation state"]);
});

test("non-array optional containers do not abort a bounded briefing", () => {
  const input = dashboard();
  input.injuryReport = { bad: true }; input.rosterNeeds = "bad"; input.architectLedger = 12;
  const packet = buildCoGmBriefingPacket({ dashboard: input, newsRows: false,
    pendingDecision: { id: "decision", options: "bad" } });
  assert.equal(packet.pressure.controlledTeamInjuries, 0);
  assert.deepEqual(packet.pressure.rosterNeeds, []);
  assert.deepEqual(packet.recentDecisionReceipts, []);
  assert.deepEqual(packet.currentCommand.choices, []);
});

test("decision identities cannot export nested undisclosed data", () => {
  for (const field of ["id", "occurrenceKey"]) {
    const decision = { id: "decision", occurrenceKey: "occurrence", options: [{ id: "keep" }] };
    decision[field] = { credential: "must-not-export" };
    const packet = buildCoGmBriefingPacket({ dashboard: dashboard(), pendingDecision: decision });
    const serialized = serializeCoGmBriefingPacket(packet);
    assert.ok(!serialized.includes("must-not-export"));
    assert.ok(!serialized.includes('"credential":'));
    assert.ok(packet.currentCommand.decisionId === null || typeof packet.currentCommand.decisionId === "string");
    assert.ok(packet.currentCommand.occurrenceKey === null || typeof packet.currentCommand.occurrenceKey === "string");
    assert.equal(packet.currentCommand.blocking, true, "unusable identity must not invent advance permission");
  }
});

test("only a choice matching the decision, occurrence and option makes it nonblocking", () => {
  const decision = { id: "decision", occurrenceKey: "occurrence", year: 2028, week: 9,
    options: [{ id: "keep", label: "Keep the plan" }] };
  const chosen = { decisionId: "decision", occurrenceKey: "occurrence", choiceId: "keep", year: 2028, week: 9 };
  for (const invalid of [{}, { choiceId: "keep" }, { ...chosen, choiceId: "missing" },
    { ...chosen, decisionId: "other" }, { ...chosen, occurrenceKey: "older" },
    { ...chosen, year: 2027 }, { ...chosen, week: 8 }, { ...chosen, week: null }]) {
    assert.equal(buildCoGmBriefingPacket({ dashboard: dashboard(), pendingDecision: decision, pendingChoice: invalid }).currentCommand.blocking, true);
  }
  const packet = buildCoGmBriefingPacket({ dashboard: dashboard(), pendingDecision: decision, pendingChoice: chosen });
  assert.equal(packet.currentCommand.blocking, false);
  assert.equal(packet.currentCommand.decisionId, "decision");
  assert.equal(packet.currentCommand.occurrenceKey, "occurrence");
});
