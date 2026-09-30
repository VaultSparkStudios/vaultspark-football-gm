import test from "node:test";
import assert from "node:assert/strict";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import {
  evaluateObjectives,
  finalizeFirstSeasonContract,
  hasFirstSeasonSigningEvidence,
  readContractState,
  renderFirstSeasonContract
} from "../public/lib/firstSeasonContract.js";

let pristine;
function fixture() {
  pristine ||= JSON.stringify(createSession({ seed: 620093, startYear: 2026, controlledTeamId: "BUF", mode: "stat" }).toSnapshot());
  return createSessionFromSnapshot(JSON.parse(pristine));
}

function release(session, teamId, premium = false) {
  const player = session.league.players.find((row) => row.teamId === teamId && row.status === "active" &&
    (row.rosterSlot || "active") === "active" && (!premium || row.overall >= 74));
  assert.ok(player, `${teamId} has a rostered player for the fixture`);
  const result = session.releasePlayer({ teamId, playerId: player.id, toWaivers: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(player.teamId, "FA");
  return player;
}

function offer(session, player, { teamId = "BUF", salary = 2_000_000, initiator = "player" } = {}) {
  const result = session.submitFreeAgencyOffer({ teamId, playerId: player.id, years: 3, salary, initiator });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.offer;
}

function memoryStorage() {
  const rows = new Map();
  return {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)),
    rows
  };
}

function contractDocument() {
  const elements = {
    firstSeasonContract: { hidden: true, dataset: {} },
    firstSeasonContractList: { innerHTML: "" },
    firstSeasonContractProgress: { textContent: "" }
  };
  return { elements, getElementById: (id) => elements[id] };
}

const signingObjective = (dashboard, state = { marks: {} }) =>
  evaluateObjectives(dashboard, state).find((row) => row.id === "sign-starter");

test("a winning player bid credits the contract only after its authoritative signing, and rendering persists it once", () => {
  const session = fixture();
  release(session, "BUF");
  const player = release(session, "NYJ", true);
  const bid = offer(session, player);
  assert.equal(bid.origin, "player");
  assert.equal(bid.submittedYear, 2026);
  const storage = memoryStorage();
  const documentRef = contractDocument();
  const pending = session.getDashboardState();
  assert.deepEqual(pending.firstSeasonEvidence.playerFreeAgentSignings, []);
  assert.equal(hasFirstSeasonSigningEvidence(pending), false);
  renderFirstSeasonContract({ dashboard: pending, storage, documentRef });
  assert.equal(readContractState(pending, storage).marks["sign-starter"], undefined);

  assert.equal(session.processFreeAgencyMarket().signed, 1);
  assert.equal(player.teamId, "BUF");
  const signed = session.getDashboardState();
  const transaction = session.getTransactionLog({ type: "fa-signing", playerId: player.id })[0];
  assert.equal(transaction.details.origin, "player");
  assert.equal(transaction.details.offerId, bid.id);
  assert.equal(transaction.details.submittedYear, 2026);
  assert.deepEqual(signed.firstSeasonEvidence.playerFreeAgentSignings, [{
    transactionId: transaction.id, offerId: bid.id, playerId: player.id,
    teamId: "BUF", year: 2026, origin: "player"
  }]);
  assert.equal(signingObjective(signed).done, true);
  renderFirstSeasonContract({ dashboard: signed, storage, documentRef });
  assert.equal(readContractState(signed, storage).marks["sign-starter"], true);
  assert.match(documentRef.elements.firstSeasonContractList.innerHTML, /data-objective="sign-starter" data-done="true"/);
  const saved = [...storage.rows];
  renderFirstSeasonContract({ dashboard: signed, storage, documentRef });
  assert.deepEqual([...storage.rows], saved, "refresh neither invents a new event nor rewrites completed progress");
});

test("being outbid produces no player signing evidence, even though a real rival signing occurs", () => {
  const session = fixture();
  const player = release(session, "NYJ", true);
  offer(session, player, { salary: 900_000 });
  const rival = session.league.teams.find((team) => team.id !== "BUF" && team.strategyProfile !== "rebuild" &&
    session.getTeamCapSummary(team.id).capSpace > 15_000_000);
  assert.ok(rival);
  offer(session, player, { teamId: rival.id, salary: 12_000_000, initiator: "cpu" });
  assert.equal(session.processFreeAgencyMarket().signed, 1);
  assert.equal(player.teamId, rival.id, "the fixture's stronger rival bid wins");
  assert.equal(session.getTransactionLog({ type: "fa-signing", playerId: player.id })[0].details.origin, "cpu");
  const dashboard = session.getDashboardState();
  assert.deepEqual(dashboard.firstSeasonEvidence.playerFreeAgentSignings, []);
  assert.equal(signingObjective(dashboard).done, false);
});

test("a CPU-origin or legacy offer cannot become a player action merely because the controlled team wins", () => {
  for (const origin of ["cpu", "legacy"]) {
    const session = fixture();
    release(session, "BUF");
    const player = release(session, "NYJ", true);
    const bid = offer(session, player, { initiator: "cpu" });
    if (origin === "legacy") {
      delete bid.origin;
      delete bid.submittedYear;
    }
    assert.equal(session.processFreeAgencyMarket().signed, 1);
    assert.equal(player.teamId, "BUF");
    const transaction = session.getTransactionLog({ type: "fa-signing", playerId: player.id })[0];
    assert.equal(transaction.details.origin, origin === "legacy" ? "unknown" : "cpu");
    const dashboard = session.getDashboardState();
    assert.deepEqual(dashboard.firstSeasonEvidence.playerFreeAgentSignings, []);
    assert.equal(hasFirstSeasonSigningEvidence(dashboard), false);
    const storage = memoryStorage();
    renderFirstSeasonContract({ dashboard, storage, documentRef: contractDocument() });
    assert.equal(readContractState(dashboard, storage).marks["sign-starter"], undefined);
  }
});

test("offer origin survives save restore and team switches without relabeling CPU or player intent", () => {
  const session = fixture();
  release(session, "BUF");
  release(session, "MIA");
  const player = release(session, "NYJ", true);
  const cpuPlayer = release(session, "NE", true);
  const mine = offer(session, player);
  const theirs = offer(session, cpuPlayer, { teamId: "MIA", initiator: "cpu" });
  const restored = createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  const restoredOffers = restored.league.freeAgencyMarket.offers;
  assert.equal(restoredOffers.find((row) => row.id === mine.id).origin, "player");
  assert.equal(restoredOffers.find((row) => row.id === mine.id).submittedYear, 2026);
  assert.equal(restoredOffers.find((row) => row.id === theirs.id).origin, "cpu");
  restored.setControlledTeam("MIA");
  assert.equal(restored.processFreeAgencyMarket().signed, 2);
  const otherClub = restored.getDashboardState();
  assert.deepEqual(otherClub.firstSeasonEvidence.playerFreeAgentSignings, []);
  assert.equal(signingObjective(otherClub).done, false);
  restored.setControlledTeam("BUF");
  const originalClub = restored.getDashboardState();
  assert.equal(originalClub.firstSeasonEvidence.playerFreeAgentSignings[0].offerId, mine.id);
  assert.equal(signingObjective(originalClub).done, true);
  const storage = memoryStorage();
  renderFirstSeasonContract({ dashboard: originalClub, storage, documentRef: contractDocument() });
  renderFirstSeasonContract({ dashboard: otherClub, storage, documentRef: contractDocument() });
  assert.equal(readContractState(originalClub, storage).marks["sign-starter"], true);
  assert.equal(readContractState(otherClub, storage).marks["sign-starter"], undefined,
    "the first-season action remains scoped to the club where the player made it");
});

test("later-year bids and a first-year offer settled later cannot backfill the first-season objective", () => {
  for (const submittedLate of [false, true]) {
    const session = fixture();
    release(session, "BUF");
    const player = release(session, "NYJ", true);
    if (submittedLate) session.currentYear = 2027;
    const bid = offer(session, player);
    session.currentYear = 2027;
    session.seasonsSimulated = 1;
    assert.equal(session.processFreeAgencyMarket().signed, 1);
    const transaction = session.getTransactionLog({ type: "fa-signing", playerId: player.id })[0];
    assert.equal(transaction.details.submittedYear, submittedLate ? 2027 : 2026);
    assert.equal(transaction.details.offerId, bid.id);
    const dashboard = session.getDashboardState();
    assert.deepEqual(dashboard.firstSeasonEvidence.playerFreeAgentSignings, []);
    assert.equal(hasFirstSeasonSigningEvidence(dashboard, { startYear: 2026 }), false);
    assert.equal(signingObjective(dashboard, { startYear: 2026, marks: {} }).done, false);
  }
});

test("a finalized first-season result cannot gain a signing mark from later evidence", () => {
  const session = fixture();
  release(session, "BUF");
  const player = release(session, "NYJ", true);
  const storage = memoryStorage();
  const documentRef = contractDocument();
  const atClose = { ...session.getDashboardState(), phase: "season-awards", seasonAwardsStage: { year: 2026 } };
  renderFirstSeasonContract({ dashboard: atClose, storage, documentRef });
  const finalized = finalizeFirstSeasonContract(atClose, storage);
  assert.equal(finalized.rows.find((row) => row.id === "sign-starter").done, false);
  const saved = [...storage.rows];
  offer(session, player);
  assert.equal(session.processFreeAgencyMarket().signed, 1);
  const after = session.getDashboardState();
  assert.equal(hasFirstSeasonSigningEvidence(after), true, "a real signing now exists, so the frozen-receipt guard is exercised");
  assert.equal(hasFirstSeasonSigningEvidence(after, readContractState(after, storage)), false);
  const rendered = renderFirstSeasonContract({ dashboard: after, storage, documentRef });
  assert.equal(rendered.summary.rows.find((row) => row.id === "sign-starter").done, false);
  assert.deepEqual([...storage.rows], saved);
  assert.deepEqual(readContractState(after, storage).finalized, finalized);
});

test("incomplete, foreign and later-season evidence cannot manufacture a signing objective", () => {
  const row = { transactionId: "TX-2026-1", offerId: "OFF-2026-1-BUF-p", teamId: "BUF", year: 2026, origin: "player" };
  const dashboard = {
    controlledTeamId: "BUF", startYear: 2026, currentYear: 2026,
    firstSeasonEvidence: { year: 2026, playerFreeAgentSignings: [row] }
  };
  assert.equal(hasFirstSeasonSigningEvidence(dashboard), true);
  for (const patch of [
    { transactionId: null }, { offerId: null }, { origin: "cpu" }, { origin: "unknown" },
    { teamId: "MIA" }, { year: 2027 }
  ]) {
    assert.equal(hasFirstSeasonSigningEvidence({ ...dashboard,
      firstSeasonEvidence: { year: 2026, playerFreeAgentSignings: [{ ...row, ...patch }] }
    }), false, JSON.stringify(patch));
  }
  assert.equal(hasFirstSeasonSigningEvidence({ ...dashboard, currentYear: 2027 }), false);
  assert.equal(hasFirstSeasonSigningEvidence({ ...dashboard, firstSeasonEvidence: null }), false);
});
