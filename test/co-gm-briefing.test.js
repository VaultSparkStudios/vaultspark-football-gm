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
