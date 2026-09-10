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

/**
 * S102 — `withinTradeWindow` exists because a pending offer and an *actionable*
 * offer stopped being the same thing.
 *
 * S101 made the trade deadline a real rule enforced at the shared command seam,
 * but this helper still walked up to 14 weeks looking for any pending offer.
 * Past the declared deadline the accept path correctly refuses with
 * `trade-deadline-closed`, so the helper could hand a test that needs to commit
 * a trade an offer that can never be committed — a precondition the assertion
 * depends on and the fixture never established. It stayed hidden while offers
 * happened to land early, and surfaced in S102 when a `derivedRng` fix changed
 * how leagues develop, which is precisely the fragility the note below
 * describes. The deadline is read from the declared league setting rather than
 * hardcoded, so this cannot drift from the rule the engine applies.
 */
function sessionWithOffer(seed = 620081, { withinTradeWindow = false } = {}) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF", mode: "stat" });
  const deadlineWeek = Number(session.getLeagueSettings()?.tradeDeadlineWeek) || 0;
  // Force generation deterministically: walk weeks until an offer lands.
  let offer = null;
  let guard = 0;
  while (!offer && guard < 14) {
    session.advanceWeek();
    const pending = (session.league.inboundTradeOffers || []).find((row) => row.status === "pending") || null;
    const actionable = !withinTradeWindow || !deadlineWeek || session.currentWeek <= deadlineWeek;
    if (pending && actionable) offer = pending;
    guard += 1;
    // Walking further cannot produce an offer this caller can act on.
    if (withinTradeWindow && deadlineWeek && session.currentWeek > deadlineWeek) break;
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

function firstSessionWithOffer(preferredSeed = null, options = {}) {
  const seeds = preferredSeed == null ? OFFER_SEEDS : [preferredSeed, ...OFFER_SEEDS];
  for (const seed of seeds) {
    const attempt = sessionWithOffer(seed, options);
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
  const { session, offer } = firstSessionWithOffer(620083, { withinTradeWindow: true });
  assert.ok(offer, "no sampled league produced a pending offer");
  // Pin the precondition this test depends on, rather than assuming the fixture
  // established it — that assumption is exactly what broke here in S102.
  assert.ok(
    session.currentWeek <= Number(session.getLeagueSettings().tradeDeadlineWeek),
    "the fixture must hand back an offer the trade window can actually accept"
  );
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

// NEGATIVE CONTROL — the un-windowed helper really does hand back an offer the
// deadline must refuse, so the option above is fixing a live condition rather
// than guarding a hypothetical one. If this ever stops reproducing, the seed's
// league has changed and `withinTradeWindow` needs re-justifying, not deleting.
//
// S103 — re-justified, exactly as that note prescribes. Seed 620083 used to
// surface its offer at week 13; it now surfaces at week 2, because this session
// gave each league its own identity (`src/domain/leagueIdentity.js`). Staff and
// owner profiles are derived from that identity, `applyStaffToCoaching` feeds
// them into `team.coaching`, and coaching drives how a league develops — so
// every freshly generated league from a given seed legitimately plays out
// differently now. That is the fix working, not the offer engine regressing:
// existing saves are untouched, because the profile builders preserve any value
// already stored. Seeds were re-scanned against the live engine and 620097
// surfaces its offer at week 12, one past the declared Week 11 deadline, which
// is the condition this control exists to reproduce. Note that the condition is
// genuinely seed-sensitive — of twenty seeds scanned, three reproduced it and
// two produced no offer inside fourteen weeks at all — so a future change that
// moves it again should re-scan rather than assume the engine broke.
//
// S104 — re-scanned again, for the second time, and for a legitimate reason of
// the same kind. 620097 now surfaces at week 7. This session generates leagues
// at the roster structure the rules declare (53 active plus a full 16-man
// practice squad, against a previous 49 with no practice squad), so every
// freshly generated league has 41% more players and a different roster shape,
// and rival front offices therefore reach different trade decisions on
// different weeks. Existing saves are untouched. Seeds 620081-620120 were
// re-scanned against the live engine: **620092 surfaces its offer at week 13,
// two past the declared Week 11 deadline** — the widest margin available, which
// is why it was chosen over 620094 and 620100 at week 12. The reproduction rate
// is unchanged at three seeds in forty, with eight producing no offer inside
// fourteen weeks, so this remains seed-sensitive and a future move should be
// re-scanned rather than treated as a regression.
test("negative control: without the window guard the fixture yields an unacceptable offer", () => {
  const { session, offer } = sessionWithOffer(620092);
  assert.ok(offer, "seed 620092 must still produce a pending offer at all");

  const deadlineWeek = Number(session.getLeagueSettings().tradeDeadlineWeek);
  assert.ok(
    session.currentWeek > deadlineWeek,
    `this seed is expected to surface its offer past the Week ${deadlineWeek} deadline (found at week ${session.currentWeek})`
  );

  const result = respondToInboundTradeOffer(session, { offerId: offer.id, action: "accept" });
  assert.equal(result.ok, false, "the deadline must refuse a trade committed after it closed");
  assert.equal(result.status, 409);
  assert.equal(result.reasonCode, "trade-deadline-closed");
});

test("a changed league fails an accept closed and records the stale receipt", () => {
  const { session, offer } = firstSessionWithOffer(620084, { withinTradeWindow: true });
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
