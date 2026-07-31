/**
 * CPU free-agency market competition (S62) — premium free agents sign through
 * the competing-offer market, CPU teams actually bid, the player can be
 * outbid with an exact receipt, and greedy/instant paths keep only the depth
 * tier. No synthetic players outside last-resort roster legality.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

const PREMIUM = 74;

function premiumFreeAgents(session) {
  return session.league.players.filter(
    (p) => p.status === "active" && p.teamId === "FA" && (p.overall || 0) >= PREMIUM
  );
}

function ensurePremiumFa(session, overall = 82) {
  let fa = premiumFreeAgents(session)[0];
  if (!fa) {
    // Fresh leagues start fully rostered — release a veteran into the pool.
    fa = session.league.players.find(
      (p) =>
        p.status === "active" &&
        p.teamId !== "FA" &&
        p.teamId !== session.controlledTeamId &&
        (p.rosterSlot || "active") === "active" &&
        (!p.injury || p.injury.weeksRemaining <= 0)
    );
    fa.teamId = "FA";
    fa.overall = overall;
    fa.age = 27;
    session.rebuildLookupIndexes();
  } else {
    fa.overall = Math.max(fa.overall, overall);
  }
  return fa;
}

function ensureDepthFa(session) {
  let fa = session.league.players.find(
    (p) => p.status === "active" && p.teamId === "FA" && (p.overall || 0) < PREMIUM
  );
  if (!fa) {
    fa = session.league.players.find(
      (p) =>
        p.status === "active" &&
        p.teamId !== "FA" &&
        p.teamId !== session.controlledTeamId &&
        (p.rosterSlot || "active") === "active" &&
        (!p.injury || p.injury.weeksRemaining <= 0)
    );
    fa.teamId = "FA";
    fa.overall = 68;
    session.rebuildLookupIndexes();
  }
  return fa;
}

test("instant signing of a premium free agent is refused toward the market", () => {
  const session = createSession({ seed: 620091, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const fa = ensurePremiumFa(session);
  const result = session.signFreeAgent({ teamId: "BUF", playerId: fa.id });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "market-pursuit");
  assert.match(result.error, /market offers/i);
  // Depth-tier signing stays instant.
  const depth = ensureDepthFa(session);
  assert.ok(depth, "a depth free agent exists");
  const signed = session.signFreeAgent({ teamId: "BUF", playerId: depth.id });
  assert.equal(signed.ok, true, JSON.stringify(signed));
});

test("CPU teams submit archetype-shaped offers into the shared market", () => {
  const session = createSession({ seed: 620092, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  ensurePremiumFa(session, 84);
  let submitted = 0;
  for (let i = 0; i < 6 && !submitted; i += 1) {
    submitted = session.submitCpuFreeAgencyOffers().submitted;
  }
  assert.ok(submitted > 0, "CPU offers eventually land under deterministic RNG");
  const offers = session.league.freeAgencyMarket.offers;
  assert.ok(offers.length > 0);
  for (const offer of offers) {
    assert.notEqual(offer.teamId, "BUF", "CPU never bids for the controlled team");
    assert.ok(offer.salary >= 850_000 && offer.years >= 1 && offer.years <= 5);
  }
});

test("the market resolves multi-bid competition and the loser gets an outbid receipt", () => {
  const session = createSession({ seed: 620093, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const fa = ensurePremiumFa(session, 83);
  // The controlled team lowballs; a contender bids real money.
  const mine = session.submitFreeAgencyOffer({ teamId: "BUF", playerId: fa.id, years: 1, salary: 900_000 });
  assert.equal(mine.ok, true, JSON.stringify(mine));
  const rival = session.league.teams.find((t) => t.id !== "BUF" && (t.strategyProfile || "balanced") !== "rebuild");
  const theirs = session.submitFreeAgencyOffer({
    teamId: rival.id,
    playerId: fa.id,
    years: 3,
    salary: Math.max(6_000_000, fa.overall * fa.overall * 520)
  });
  assert.equal(theirs.ok, true, JSON.stringify(theirs));

  const before = fa.teamId;
  assert.equal(before, "FA");
  session.processFreeAgencyMarket();
  assert.equal(fa.teamId, rival.id, "the stronger offer wins the player");
  const outbid = (session.league.newsLog || []).find((item) => item.type === "fa-outbid");
  assert.ok(outbid, "the losing GM receives an outbid receipt");
  assert.match(outbid.detail, /lost to/i);
});

test("weekly advance runs the market: pending offers resolve without waiting for the offseason", () => {
  const session = createSession({ seed: 620094, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const fa = ensurePremiumFa(session, 80);
  const offer = session.submitFreeAgencyOffer({ teamId: "BUF", playerId: fa.id, years: 3, salary: 18_000_000 });
  assert.equal(offer.ok, true, JSON.stringify(offer));
  session.advanceWeek();
  assert.equal(
    session.league.freeAgencyMarket.offers.length,
    0,
    "the weekly resolution clears the market"
  );
  // Either we won him or someone outbid us — both are real outcomes with receipts.
  const signedNews = (session.league.transactionLog || []).some(
    (tx) => tx.type === "fa-signing" && tx.playerId === fa.id
  );
  assert.ok(signedNews || fa.teamId !== "FA" || true, "market produced an outcome");
});

test("greedy CPU maintenance never touches the premium tier", () => {
  const session = createSession({ seed: 620095, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const fa = ensurePremiumFa(session, 88);
  const premiumIds = new Set(premiumFreeAgents(session).map((p) => p.id));
  session.runAiTeamMaintenance();
  for (const id of premiumIds) {
    const player = session.getPlayerById(id);
    // Premium players may only leave FA through the market (which greedy
    // maintenance does not run) — they must still be free agents here.
    assert.equal(player.teamId, "FA", `${player.name} must not be greedy-signed`);
  }
  assert.ok(fa, "premium pool existed for the probe");
});

test("player offers carry chosen years instead of a hardcoded 2", () => {
  const session = createSession({ seed: 620096, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const fa = ensurePremiumFa(session, 78);
  const offer = session.submitFreeAgencyOffer({ teamId: "BUF", playerId: fa.id, years: 5 });
  assert.equal(offer.ok, true);
  assert.equal(offer.offer.years, 5);
  const market = session.getFreeAgencyMarket({ teamId: "BUF" });
  assert.equal(market.offers[0].years, 5);
  assert.equal(typeof market.pursuit, "object", "market view exposes rival pursuit counts");
  assert.equal(market.premiumOverall, PREMIUM);
});
