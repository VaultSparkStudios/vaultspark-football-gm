/**
 * Session 67 — the offseason is a calendar, and the draft honours the ledger.
 *
 * Each test here pins a defect that shipped and was invisible to the suite:
 * contracts that never expired, a free-agent pool that was empty at every
 * offseason stage, a draft that ignored pick ownership, compensatory picks that
 * could never be awarded, and an engine that signed players onto the controlled
 * franchise without a command.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/runtime/bootstrap.js";
import { advanceContractYear, normalizeContract } from "../src/domain/contracts.js";
import { expireContracts } from "../src/engine/offseasonSimulator.js";

const CANONICAL_STAGES = [
  "retirements",
  "coaching-carousel",
  "combine",
  "pro-days",
  "free-agency",
  "draft",
  "udfa",
  "camp-cuts",
  "complete"
];

function sessionAtOffseason({ seed = 4242, controlledTeamId = "BUF" } = {}) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId });
  session.simulateOneSeason({ runOffseasonAfter: false });
  let guard = 0;
  while (session.phase !== "offseason" && guard < 12) {
    session.advanceWeek();
    guard += 1;
  }
  assert.equal(session.phase, "offseason", "session should reach the offseason");
  return session;
}

function drivePipeline(session, { stopAt = null, limit = 16 } = {}) {
  const seen = [];
  for (let i = 0; i < limit; i += 1) {
    const pipeline = session.getOffseasonPipeline();
    if (pipeline.completed) break;
    if (stopAt && pipeline.stage === stopAt) break;
    if (pipeline.stage === "draft" && session.getDraftAuthority()?.userActionRequired) {
      session.runCpuDraft({ untilUserPick: false });
    }
    const before = pipeline.stage;
    const result = session.advanceOffseasonPipeline();
    seen.push({
      stage: before,
      freeAgents: session.league.players.filter((p) => p.status === "active" && p.teamId === "FA").length
    });
    if (result.completed) break;
  }
  return seen;
}

// ── Contract expiry ─────────────────────────────────────────────────────────

test("a contract with zero years remaining normalizes to zero, not one", () => {
  // `|| 1` resurrected every expired deal on read, so nothing ever ran out.
  assert.equal(normalizeContract({ yearsRemaining: 0, salary: 0 }).yearsRemaining, 0);
  assert.equal(normalizeContract({}).yearsRemaining, 1, "an absent field still defaults to one");
  assert.equal(normalizeContract({ yearsRemaining: 3 }).yearsRemaining, 3);
});

test("advancing the final year of a deal leaves it expired", () => {
  const expired = advanceContractYear({ yearsRemaining: 1, salary: 5_000_000 });
  assert.equal(expired.yearsRemaining, 0);
  assert.equal(expired.capHit, 0);
});

test("expireContracts moves the expiring class to free agency and remembers the club", () => {
  const session = sessionAtOffseason();
  const expiring = session.league.players.filter(
    (p) => p.status === "active" && p.teamId !== "FA" && normalizeContract(p.contract).yearsRemaining <= 1
  );
  assert.ok(expiring.length > 0, "a played season should leave expiring contracts");
  const sample = expiring[0];
  const formerTeam = sample.teamId;

  expireContracts(session.league);

  assert.equal(sample.teamId, "FA");
  assert.equal(sample.lastTeamId, formerTeam, "the incumbent club is recorded for retention and comp");
  const pool = session.league.players.filter((p) => p.status === "active" && p.teamId === "FA");
  assert.equal(pool.length, expiring.length);
});

// ── Calendar order ──────────────────────────────────────────────────────────

test("the offseason pipeline declares and walks the canonical calendar", () => {
  const session = sessionAtOffseason();
  assert.deepEqual(session.getOffseasonPipeline().stages, CANONICAL_STAGES);

  const walked = drivePipeline(session);
  const stages = walked.map((row) => row.stage);
  // free-agency holds for multiple waves, so compare the de-duplicated walk.
  const unique = stages.filter((stage, index) => stage !== stages[index - 1]);
  assert.deepEqual(unique, CANONICAL_STAGES.slice(0, -1));
});

test("free agents exist from the retirements stage onward, not after the draft", () => {
  const session = sessionAtOffseason();
  const walked = drivePipeline(session, { stopAt: "draft" });
  const retirements = walked.find((row) => row.stage === "retirements");
  assert.ok(retirements, "the retirements stage should have run");
  assert.ok(
    retirements.freeAgents > 0,
    `retirements must produce free agents (saw ${retirements.freeAgents})`
  );
  for (const row of walked) {
    assert.ok(row.freeAgents > 0, `${row.stage} should still see a market (saw ${row.freeAgents})`);
  }
});

test("the retirements stage actually retires and expires rather than only logging", () => {
  const session = sessionAtOffseason();
  const retiredBefore = session.league.retiredPlayers.length;
  const result = session.advanceOffseasonPipeline();
  assert.equal(result.stage, "coaching-carousel");
  assert.ok(session.league.retiredPlayers.length > retiredBefore, "players should retire here");
  assert.match(result.message, /contracts expired/);
});

test("the roster rollover is idempotent across a legacy resume", () => {
  const session = sessionAtOffseason();
  const first = session.runRosterYearRollover();
  assert.equal(first.alreadyRun, false);
  const ageSnapshot = session.league.players.slice(0, 40).map((p) => `${p.id}:${p.age}`);
  const second = session.runRosterYearRollover();
  assert.equal(second.alreadyRun, true, "a second call in the same offseason must be a no-op");
  assert.deepEqual(
    session.league.players.slice(0, 40).map((p) => `${p.id}:${p.age}`),
    ageSnapshot,
    "nobody should age twice"
  );
});

// ── Retention + market ──────────────────────────────────────────────────────

test("rival clubs re-sign their own, and the controlled franchise is left to the GM", () => {
  const session = sessionAtOffseason();
  session.runRosterYearRollover();
  const ownExpired = session.league.players.filter(
    (p) => p.status === "active" && p.teamId === "FA" && p.lastTeamId === "BUF"
  ).length;

  const retention = session.runRetentionWindow();
  assert.ok(retention.retained > 0, "some rival players should be kept");

  const ownStill = session.league.players.filter(
    (p) => p.status === "active" && p.teamId === "FA" && p.lastTeamId === "BUF"
  ).length;
  assert.equal(ownStill, ownExpired, "retention must never re-sign for the controlled team");

  const stillFree = session.league.players.filter((p) => p.status === "active" && p.teamId === "FA").length;
  assert.ok(stillFree > 0, "retention must not empty the market");
});

test("the free-agency window resolves in waves and holds for the GM between them", () => {
  const session = sessionAtOffseason();
  drivePipeline(session, { stopAt: "free-agency" });
  assert.equal(session.getOffseasonPipeline().stage, "free-agency");

  const first = session.advanceOffseasonPipeline();
  assert.equal(first.userActionRequired, true, "the GM gets the board between waves");
  assert.equal(first.blockingReason, "free-agency-open");
  assert.equal(session.getOffseasonPipeline().stage, "free-agency", "the stage holds");

  let guard = 0;
  while (session.getOffseasonPipeline().stage === "free-agency" && guard < 6) {
    session.advanceOffseasonPipeline();
    guard += 1;
  }
  assert.equal(session.getOffseasonPipeline().stage, "draft", "the window always closes");

  const signings = session.league.transactionLog.filter((tx) => tx.type === "fa-signing");
  assert.ok(signings.length > 0, "a real market produces real signings");
});

test("a premium free agent cannot be signed instantly while the window is open", () => {
  const session = sessionAtOffseason();
  drivePipeline(session, { stopAt: "free-agency" });
  session.advanceOffseasonPipeline();
  assert.equal(session.isFreeAgencyWindowOpen(), true);

  const premium = session.league.players
    .filter((p) => p.status === "active" && p.teamId === "FA" && (p.overall || 0) >= 74)
    .sort((a, b) => b.overall - a.overall)[0];
  assert.ok(premium, "the window should have premium names on the board");

  const result = session.signFreeAgent({ teamId: "BUF", playerId: premium.id });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "market-pursuit");
});

// ── Actor authority + receipts ──────────────────────────────────────────────

test("the offseason backstop never signs for the controlled franchise", () => {
  const session = sessionAtOffseason();
  drivePipeline(session, { stopAt: "udfa" });
  const before = new Set(session.getTeamPlayersById("BUF").map((p) => p.id));

  const backstop = session.runRosterLegalityBackstop();

  const added = session.getTeamPlayersById("BUF").filter((p) => !before.has(p.id));
  assert.deepEqual(added, [], "no player may join the GM's roster without a command");
  assert.ok(backstop.signings >= 0);
});

test("backstop signings are recorded rather than silently applied", () => {
  const session = sessionAtOffseason();
  drivePipeline(session, { stopAt: "udfa" });
  const before = session.league.transactionLog.length;
  const backstop = session.runRosterLegalityBackstop();
  if (backstop.signings > 0) {
    const rows = session.league.transactionLog
      .slice(before)
      .filter((tx) => tx.type === "roster-legality-signings");
    assert.ok(rows.length > 0, "the ledger must show who signed whom");
    const counted = rows.reduce((sum, row) => sum + row.details.count, 0);
    assert.equal(counted, backstop.signings, "the ledger must account for every signing");
  }
});

test("a controlled-team shortfall is surfaced instead of being filled", () => {
  const session = sessionAtOffseason();
  drivePipeline(session, { stopAt: "udfa" });
  const backstop = session.runRosterLegalityBackstop();
  if (backstop.shortfall) {
    assert.equal(backstop.shortfall.teamId, "BUF");
    assert.ok(backstop.shortfall.positions.length > 0);
    const inbox = (session.league.newsLog || []).find((row) => row.type === "roster-shortfall");
    assert.ok(inbox, "the GM must be told, in the inbox, what is missing");
  }
});

// ── Draft order from the pick ledger ────────────────────────────────────────

test("a traded first round pick actually moves the selection", () => {
  const session = createSession({ seed: 4242, startYear: 2026, controlledTeamId: "BUF" });
  session.ensureDraftPickAssets();
  const moved = session.league.draftPicks.filter((p) => p.originalTeamId === "BUF" && p.year === 2027);
  assert.ok(moved.length > 0);
  for (const pick of moved) pick.ownerTeamId = "MIA";

  session.simulateOneSeason({ runOffseasonAfter: false });
  let guard = 0;
  while (session.phase !== "offseason" && guard < 12) {
    session.advanceWeek();
    guard += 1;
  }
  drivePipeline(session, { stopAt: "draft" });
  session.refreshDraftOrder();

  const draft = session.league.pendingDraft;
  assert.equal(draft.orderSource, "pick-ledger");
  const buffOwn = draft.slots.filter((slot) => slot.teamId === "BUF" && !slot.compensatory);
  assert.deepEqual(buffOwn, [], "a club that traded every pick selects only what it was awarded");
  const acquired = draft.slots.filter((slot) => slot.acquired && slot.originalTeamId === "BUF");
  assert.equal(acquired.length, moved.length, "the acquiring club inherits every slot");
  for (const slot of acquired) assert.equal(slot.teamId, "MIA");
});

test("a club holding two first round picks selects twice in round one", () => {
  const session = createSession({ seed: 991, startYear: 2026, controlledTeamId: "BUF" });
  session.ensureDraftPickAssets();
  const target = session.league.draftPicks.find(
    (p) => p.year === 2027 && p.round === 1 && p.originalTeamId === "CHI"
  );
  assert.ok(target);
  target.ownerTeamId = "BUF";

  const { slots } = session.buildDraftOrder(2027);
  const firstRoundBuf = slots.filter((slot) => slot.round === 1 && slot.teamId === "BUF");
  assert.equal(firstRoundBuf.length, 2);
  assert.equal(firstRoundBuf.filter((slot) => slot.acquired).length, 1);
});

test("round one slot order follows the original club's finish", () => {
  const session = sessionAtOffseason();
  const { slots } = session.buildDraftOrder(session.currentYear + 1);
  const firstRound = slots.filter((slot) => slot.round === 1 && !slot.compensatory);
  const ordered = firstRound.map((slot) => slot.slot);
  assert.deepEqual(ordered, [...ordered].sort((a, b) => a - b), "slots must ascend within a round");
});

test("a save with no pick ledger still drafts, using the standings fallback", () => {
  const session = sessionAtOffseason();
  session.league.draftPicks = [];
  session.league.compensatoryPicks = [];
  const { slots, source } = session.buildDraftOrder(session.currentYear + 1);
  assert.equal(source, "standings-fallback");
  assert.equal(slots.length, 224, "seven rounds of thirty-two");
  assert.equal(new Set(slots.map((slot) => slot.teamId)).size, 32);
});

test("selections consume their pick and name where the pick came from", () => {
  const session = sessionAtOffseason();
  drivePipeline(session, { stopAt: "draft" });
  session.refreshDraftOrder();
  const draft = session.league.pendingDraft;
  const firstSlot = draft.slots[0];

  session.runCpuDraft({ picks: 1, untilUserPick: false });

  const selection = draft.selections[0];
  assert.equal(selection.teamId, firstSlot.teamId);
  assert.equal(selection.originalTeamId, firstSlot.originalTeamId);
  if (firstSlot.pickId) {
    assert.equal(session.getDraftPickById(firstSlot.pickId)?.consumed, true, "a used pick is spent");
  }
});

// ── Compensatory picks ──────────────────────────────────────────────────────

test("compensatory picks are awarded and reach the draft board", () => {
  const session = sessionAtOffseason();
  drivePipeline(session, { stopAt: "draft" });

  const comp = session.getCompensatoryPicks();
  assert.ok(comp.length > 0, "the formula must be able to award a pick at all");
  assert.ok(comp.length <= 32 * 4);
  for (const pick of comp) {
    assert.ok(Number.isFinite(pick.round));
    assert.match(pick.reason, /Net free-agency loss \d+/);
  }

  session.refreshDraftOrder();
  const slots = session.league.pendingDraft.slots.filter((slot) => slot.compensatory);
  assert.equal(slots.length, comp.length, "every award must be a selection, not decoration");
  assert.equal(session.league.pendingDraft.totalPicks, 224 + comp.length);
  for (const slot of slots) {
    const sameRound = session.league.pendingDraft.slots.filter((row) => row.round === slot.round);
    const last = sameRound[sameRound.length - 1];
    assert.equal(last.compensatory, true, "compensatory picks close out their round");
  }
});

test("the compensatory ledger can never be written a non-finite value", () => {
  const session = sessionAtOffseason();
  session.seedCompLedgerForUpcomingOffseason();
  const rows = Object.values(session.league.compFormulaLedger.losses).flat();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.ok(Number.isFinite(row.value), `loss row ${row.id} must carry a finite value`);
    assert.ok(row.value >= 50);
  }
});

// ── Pick asset hygiene ──────────────────────────────────────────────────────

test("elapsed and consumed picks are neither listed nor tradeable", () => {
  const session = sessionAtOffseason();
  session.ensureDraftPickAssets();
  const assets = session.getDraftPickAssets("BUF");
  assert.ok(assets.length > 0);
  for (const pick of assets) {
    assert.ok(pick.year > session.currentYear, `${pick.id} is for a draft that already happened`);
    assert.notEqual(pick.consumed, true);
  }

  const spent = session.league.draftPicks.find((p) => p.ownerTeamId === "BUF" && p.year > session.currentYear);
  spent.consumed = true;
  assert.equal(
    session.getDraftPickAssets("BUF").some((pick) => pick.id === spent.id),
    false,
    "a spent pick leaves the trade desk"
  );
  const trade = session.evaluateTradePackage({
    teamA: "BUF",
    teamB: "MIA",
    teamAPickIds: [spent.id],
    teamBPlayerIds: []
  });
  assert.equal(trade.ok, false);
  assert.equal(trade.reasonCode, "invalid-asset");
});

test("the pick ledger stays bounded across simulated seasons", () => {
  const session = createSession({ seed: 77, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateSeasons(3, { runOffseasonAfterLast: true });
  session.ensureDraftPickAssets();
  assert.ok(
    session.league.draftPicks.length <= 32 * 7 * 4,
    `the stored ledger must stay bounded (saw ${session.league.draftPicks.length} rows)`
  );
  const assets = session.getDraftPickAssets("BUF");
  assert.ok(assets.length > 0, "a club always owns future picks");
  assert.ok(
    assets.length <= 7 * 4,
    `a club should not accumulate elapsed picks (saw ${assets.length} across ${new Set(assets.map((p) => p.year)).size} years)`
  );
  for (const pick of assets) assert.ok(pick.year > session.currentYear);
});
