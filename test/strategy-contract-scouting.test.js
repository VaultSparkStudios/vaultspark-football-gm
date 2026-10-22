import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { applyFifthYearOption, normalizeContract } from "../src/domain/contracts.js";

test("trade valuation blocks highly unbalanced trades", () => {
  const session = createSession({ seed: 77, startYear: 2026, controlledTeamId: "BUF" });
  const bufRoster = session.getRoster("BUF").slice().sort((a, b) => b.overall - a.overall);
  const result = session.tradePlayers({
    teamA: "BUF",
    teamB: "MIA",
    teamAPlayerIds: [bufRoster[0].id],
    teamBPlayerIds: []
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /valuation/i);
});

test("franchise tag and fifth-year option endpoints apply contract changes", () => {
  const session = createSession({ seed: 78, startYear: 2026, controlledTeamId: "BUF" });

  const tagCandidate = session.league.players.find((p) => p.teamId === "BUF" && p.status === "active");
  tagCandidate.contract.yearsRemaining = 1;
  const tagResult = session.applyFranchiseTagToPlayer({
    teamId: "BUF",
    playerId: tagCandidate.id
  });
  assert.equal(tagResult.ok, true);
  assert.equal(tagResult.contract.yearsRemaining, 1);
  assert.equal(tagResult.contract.franchiseTagYear, 2026);

  const optionCandidate = session.league.players.find((p) => p.teamId === "BUF" && p.status === "active");
  optionCandidate.experience = 4;
  optionCandidate.contract.yearsRemaining = 1;
  const beforeOption=structuredClone(optionCandidate.contract);
  const original=normalizeContract(beforeOption);
  const projected=applyFifthYearOption(original);
  const capBefore=session.getTeamCapSummary('BUF');
  const shortfall=projected.capHit-original.capHit-capBefore.capSpace;
  assert.ok(shortfall>0,'the tagged fixture must exercise the cap refusal');
  const refused=session.applyFifthYearOptionToPlayer({teamId:'BUF',playerId:optionCandidate.id});
  assert.equal(refused.ok,false);
  assert.match(refused.error,/cap space/i);
  assert.deepEqual(optionCandidate.contract,beforeOption,'refusal cannot mutate the contract');
  // Explicit synthetic authority funds exactly the option delta; no production
  // cap limit or fiscal guard is relaxed to make the endpoint test pass.
  session.league.teamCapOverride.BUF+=shortfall;
  const optionResult = session.applyFifthYearOptionToPlayer({
    teamId: "BUF",
    playerId: optionCandidate.id
  });
  assert.equal(optionResult.ok, true);
  assert.equal(optionResult.contract.optionYear, true);
  assert.ok(optionResult.contract.yearsRemaining >= 2);
  assert.equal(session.getTeamCapSummary('BUF').capSpace,0);
});

test("scouting flow supports points allocation and board lock", () => {
  const session = createSession({ seed: 79, startYear: 2026, controlledTeamId: "BUF" });
  session.prepareDraft();

  const board = session.getScoutingBoard({ teamId: "BUF", limit: 20 });
  assert.equal(board.active, true);
  assert.ok(board.points >= 40);
  assert.ok(board.prospects.length > 0);

  const target = board.prospects[0].playerId;
  const spend = session.allocateScoutingPoints({ teamId: "BUF", playerId: target, points: 10 });
  assert.equal(spend.ok, true);
  assert.equal(typeof spend.scoutedOverall, "number");
  assert.ok(spend.pointsRemaining < board.points);

  const lock = session.lockDraftBoard({
    teamId: "BUF",
    playerIds: board.prospects.slice(0, 5).map((p) => p.playerId)
  });
  assert.equal(lock.ok, true);
  assert.equal(lock.locked, true);
  assert.equal(lock.board.length, 5);
});
