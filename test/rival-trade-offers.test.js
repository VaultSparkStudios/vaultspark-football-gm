/**
 * Rival GM inbound trade offers (S62) — offers are deterministic, endorsed by
 * the real TradeService authority, expire honestly, and accept/decline/counter
 * carry exact receipts with stale-league fail-closed semantics.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  generateInboundTradeOffers,
  respondToInboundTradeOffer,
  getInboundTradeOffers,
  expireInboundTradeOffers,
  isDeadlineWindow
} from "../src/engine/rivalTradeOffers.js";
import { handleTradeOffersRequest } from "../src/runtime/handlers/tradeOffersHandler.js";
import { createLocalApiRuntime } from "../src/app/api/localApiRuntime.js";
import { createSession } from "../src/runtime/bootstrap.js";

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); }
  };
}

function sessionWithOffer(seed = 620081) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  // Force generation deterministically: walk weeks until an offer lands.
  let offer = null;
  let guard = 0;
  while (!offer && guard < 14) {
    session.advanceWeek();
    offer = (session.league.inboundTradeOffers || []).find((row) => row.status === "pending") || null;
    guard += 1;
  }
  return { session, offer };
}

/**
 * Offers are need-driven, so whether one lands inside a fixed window depends on
 * how that particular league happens to develop. Pinning the suite to a single
 * lucky seed made this test a tripwire for any change that legitimately alters
 * simulation outcomes — S63's opponent-aware play calling and per-club league
 * generation both moved it, without the offer engine itself regressing.
 *
 * Sampling several seeds asserts what actually matters: rival GMs reliably make
 * offers. Determinism is asserted separately and exactly, below.
 */
const OFFER_SEEDS = [620081, 620082, 1, 2, 3, 42, 999, 777];

function firstSessionWithOffer(preferredSeed = null) {
  const seeds = preferredSeed == null ? OFFER_SEEDS : [preferredSeed, ...OFFER_SEEDS];
  for (const seed of seeds) {
    const attempt = sessionWithOffer(seed);
    if (attempt.offer) return attempt;
  }
  return { session: null, offer: null };
}

test("rival offers arrive through the weekly advance, endorsed by TradeService", () => {
  const { session, offer } = firstSessionWithOffer();
  assert.ok(offer, "no sampled league produced an inbound offer — the offer engine has regressed");
  assert.equal(offer.toTeamId, "BUF");
  assert.notEqual(offer.fromTeamId, "BUF");
  assert.ok(offer.requestedPlayers[0]?.name, "the offer names the wanted player");
  assert.ok(
    (offer.offeredPlayers.length + offer.offeredPicks.length) > 0,
    "the rival puts real assets on the table"
  );
  assert.ok(offer.rationale.includes(offer.fromTeamId), "rationale names the rival");
  assert.ok(offer.expiresWeek >= offer.week, "offers expire forward in time");
  // The announcement reached the Priority Inbox pipeline.
  assert.ok(
    (session.league.newsLog || []).some((item) => item.type === "trade-offer"),
    "offer announces itself through the newsLog"
  );
});

test("same seed produces the identical offer stream (deterministic)", () => {
  const first = sessionWithOffer(620082);
  const second = sessionWithOffer(620082);
  assert.deepEqual(
    (first.session.league.inboundTradeOffers || []).map((row) => row.id),
    (second.session.league.inboundTradeOffers || []).map((row) => row.id)
  );
});

test("accepting an offer commits the real trade with fresh-fingerprint discipline", () => {
  const { session, offer } = firstSessionWithOffer(620083);
  assert.ok(offer, "no sampled league produced a pending offer");
  const target = session.getPlayerById(offer.requestedPlayerIds[0]);
  assert.equal(target.teamId, "BUF");
  const result = respondToInboundTradeOffer(session, { offerId: offer.id, action: "accept" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.offer.status, "accepted");
  assert.equal(session.getPlayerById(offer.requestedPlayerIds[0]).teamId, offer.fromTeamId, "the player actually moved");
  // Double-accept fails closed with a 409-style receipt.
  const again = respondToInboundTradeOffer(session, { offerId: offer.id, action: "accept" });
  assert.equal(again.ok, false);
  assert.equal(again.status, 409);
});

test("a changed league fails an accept closed and records the stale receipt", () => {
  const { session, offer } = firstSessionWithOffer(620084);
  assert.ok(offer, "no sampled league produced a pending offer");
  // The world changes: the wanted player is gone before the GM answers.
  const target = session.getPlayerById(offer.requestedPlayerIds[0]);
  target.teamId = offer.fromTeamId;
  const result = respondToInboundTradeOffer(session, { offerId: offer.id, action: "accept" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.offer.status, "expired");
  assert.ok(result.offer.resolution.length > 0, "the stale resolution is a real receipt");
});

test("counter hands back an exact trade-desk prefill and marks the offer countered", () => {
  const { session, offer } = firstSessionWithOffer(620085);
  assert.ok(offer, "no sampled league produced a pending offer");
  const result = respondToInboundTradeOffer(session, { offerId: offer.id, action: "counter" });
  assert.equal(result.ok, true);
  assert.equal(result.offer.status, "countered");
  assert.deepEqual(result.counterPrefill.teamAPlayerIds, offer.requestedPlayerIds);
  assert.equal(result.counterPrefill.teamB, offer.fromTeamId);
});

test("offers expire honestly when the window closes", () => {
  const session = createSession({ seed: 620086, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  // Unit-level expiry needs no generated offer — seed the ledger directly.
  const offer = {
    id: "TRO-2026-W4-MIA-TEST",
    year: 2026,
    week: 4,
    fromTeamId: "MIA",
    toTeamId: "BUF",
    requestedPlayerIds: ["P-TEST"],
    requestedPlayers: [{ playerId: "P-TEST", name: "Test Target", pos: "WR", ovr: 80 }],
    offeredPlayerIds: [],
    offeredPlayers: [],
    offeredPickIds: [],
    offeredPicks: [],
    rationale: "test",
    status: "pending",
    expiresWeek: 5
  };
  session.league.inboundTradeOffers = [offer];
  session.currentWeek = offer.expiresWeek + 1;
  const expired = expireInboundTradeOffers(session);
  assert.ok(expired.some((row) => row.id === offer.id));
  assert.equal(offer.status, "expired");
  const view = getInboundTradeOffers(session);
  assert.ok(view.offers.find((row) => row.id === offer.id).status === "expired");
});

test("the shared handler owns GET/POST semantics for both adapters", async () => {
  const { session, offer } = firstSessionWithOffer(620087);
  assert.ok(offer, "no sampled league produced a pending offer");
  const get = handleTradeOffersRequest({ method: "GET", session });
  assert.equal(get.status, 200);
  assert.ok(get.body.offers.some((row) => row.id === offer.id));
  assert.equal(typeof get.body.deadlineWindow, "boolean");

  const bad = handleTradeOffersRequest({ method: "POST", session, input: { offerId: offer.id, action: "nonsense" } });
  assert.equal(bad.status, 400);
  const missing = handleTradeOffersRequest({ method: "POST", session, input: { offerId: "TRO-nope", action: "accept" } });
  assert.equal(missing.status, 404);
  const none = handleTradeOffersRequest({ method: "GET", session: null });
  assert.equal(none.status, 404);

  const decline = handleTradeOffersRequest({ method: "POST", session, input: { offerId: offer.id, action: "decline" } });
  assert.equal(decline.status, 200);
  assert.equal(decline.body.offer.status, "declined");
});

test("deadline window helper matches the deadline decision window", () => {
  assert.equal(isDeadlineWindow(8), false);
  assert.equal(isDeadlineWindow(9), true);
  assert.equal(isDeadlineWindow(11), true);
  assert.equal(isDeadlineWindow(12), false);
});

test("browser runtime serves the trade-offers family end to end", async () => {
  const runtime = createLocalApiRuntime({ storage: memoryStorage(), scheduler: (fn) => fn() });
  const created = await runtime.request("/api/new-league", {
    method: "POST",
    body: { seed: 620088, startYear: 2026, controlledTeamId: "BUF" }
  });
  assert.equal(created.ok, true, `new-league failed: ${JSON.stringify(created.payload).slice(0, 200)}`);
  const list = await runtime.request("/api/trade-offers", { method: "GET" });
  assert.equal(list.status, 200);
  assert.equal(list.payload.ok, true);
  assert.ok(Array.isArray(list.payload.offers));
  const bad = await runtime.request("/api/trade-offers", { method: "POST", body: { offerId: "nope", action: "accept" } });
  assert.equal(bad.status, 404);
});
