import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

const create = () => createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
const packageFor = (overrides = {}) => ({
  teamA: "BUF", teamB: "MIA",
  teamAPlayerIds: [], teamBPlayerIds: [], teamAPickIds: [], teamBPickIds: [],
  ...overrides
});

function assertRefusedWithoutMutation(session, input, reasonCode) {
  const before = JSON.stringify(session.toSnapshot());
  const evaluation = session.evaluateTradePackage(input);
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.reasonCode, reasonCode);
  const result = session.tradePlayers(input);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, reasonCode);
  assert.equal(JSON.stringify(session.toSnapshot()), before, "refusal preserves all persisted league state, assets, logs and RNG");
  return evaluation;
}

test("a future first cannot be acquired for nothing or for a seventh-round pick", () => {
  const session = create();
  const first = session.getDraftPickAssets("MIA").find((pick) => pick.round === 1);
  const seventh = session.getDraftPickAssets("BUF").find((pick) => pick.round === 7 && pick.year === first.year);
  assert.ok(first && seventh);
  const free = packageFor({ teamBPickIds: [first.id] });
  const refused = assertRefusedWithoutMutation(session, free, "valuation-failed");
  assert.equal(refused.valuation.MIA.incomingValue, 0);
  assert.ok(refused.valuation.MIA.outgoingValue > 0, "the refused first has real value");
  assertRefusedWithoutMutation(session, { ...free, teamAPickIds: [seventh.id] }, "valuation-failed");
  assertRefusedWithoutMutation(session, packageFor({
    teamAPickIds: [session.getDraftPickAssets("BUF").find((pick) => pick.round === 1).id]
  }), "valuation-failed");
});

test("a balanced pick exchange remains legal and transfers each owned asset once", () => {
  const session = create();
  const a = session.getDraftPickAssets("BUF")[0];
  const b = session.getDraftPickAssets("MIA")[0];
  const input = packageFor({ teamAPickIds: [a.id], teamBPickIds: [b.id] });
  const evaluation = session.evaluateTradePackage(input);
  assert.equal(evaluation.ok, true, JSON.stringify(evaluation));
  const transactionsBefore = session.league.transactionLog.length;
  const streamBefore = session.rng.seed;
  const result = session.tradePlayers({ ...input, expectedPlanFingerprint: evaluation.plan.fingerprint });
  assert.equal(result.ok, true);
  assert.equal(session.getDraftPickById(a.id).ownerTeamId, "MIA");
  assert.equal(session.getDraftPickById(b.id).ownerTeamId, "BUF");
  assert.deepEqual(result.movedPicksA, [a.id]);
  assert.deepEqual(result.movedPicksB, [b.id]);
  assert.equal(session.league.transactionLog.length, transactionsBefore + 1);
  assert.equal(session.rng.seed, streamBefore);
});

test("a legal player swap cannot conceal uncompensated picks in either direction", () => {
  const session = create();
  const candidates = (teamId) => session.league.players.filter((player) => player.teamId === teamId && player.status === "active").slice(0, 6);
  let fairPlayers;
  for (const a of candidates("BUF")) {
    for (const b of candidates("MIA")) {
      const input = packageFor({ teamAPlayerIds: [a.id], teamBPlayerIds: [b.id] });
      if (session.evaluateTradePackage(input).ok) { fairPlayers = input; break; }
    }
    if (fairPlayers) break;
  }
  assert.ok(fairPlayers, "the fixture starts from a currently legal player exchange");
  for (const [teamId, pickField] of [["BUF", "teamAPickIds"], ["MIA", "teamBPickIds"]]) {
    const picks = session.getDraftPickAssets(teamId).map((pick) => pick.id);
    assert.ok(picks.length > 1);
    assertRefusedWithoutMutation(session, { ...fairPlayers, [pickField]: picks }, "valuation-failed");
  }
  assert.equal(session.tradePlayers(fairPlayers).ok, true, "removing the unpaid picks preserves the legal player trade");
});

test("the same pick or player cannot be counted repeatedly to inflate a package", () => {
  const session = create();
  const a = session.getDraftPickAssets("BUF").find((pick) => pick.round === 7);
  const b = session.getDraftPickAssets("MIA").find((pick) => pick.round === 1);
  const quote = session.evaluateTradePackage(packageFor({ teamAPickIds: [a.id], teamBPickIds: [b.id] }));
  assert.equal(quote.reasonCode, "valuation-failed");
  const copies = Math.ceil(quote.valuation.MIA.outgoingValue * (1 - quote.valuation.MIA.tolerance) / quote.valuation.MIA.incomingValue);
  assert.ok(copies > 1);
  assert.ok(quote.valuation.BUF.incomingValue >= quote.valuation.BUF.outgoingValue * copies * (1 - quote.valuation.BUF.tolerance),
    "repeating this seventh would make both full-package value checks pass without the ownership guard");
  assertRefusedWithoutMutation(session, packageFor({ teamAPickIds: Array(copies).fill(a.id), teamBPickIds: [b.id] }), "duplicate-asset");
  const player = session.league.players.find((entry) => entry.teamId === "BUF" && entry.status === "active");
  assertRefusedWithoutMutation(session, packageFor({ teamAPlayerIds: [player.id, player.id] }), "duplicate-asset");
});
