import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOnClockTradeReview, renderOnClockTradeReview } from "../public/lib/onClockTradeMarketPanel.js";
import test from "node:test";

import { createSession } from "../src/runtime/bootstrap.js";

function onClockSession(seed = 8102) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "offseason";
  const draft = session.prepareDraft();
  const controlledIndex = draft.order.indexOf("BUF");
  assert.ok(controlledIndex >= 0);
  draft.currentPick = controlledIndex + 1;
  return { session, draft };
}

test("on-clock market is deterministic, bounded, and sourced from rival need plus owned picks", () => {
  const first = onClockSession(8102).session.getOnClockTradeMarket();
  const second = onClockSession(8102).session.getOnClockTradeMarket();
  assert.deepEqual(second, first);
  assert.equal(first.active, true);
  assert.ok(first.offers.length > 0 && first.offers.length <= 3);
  for (const offer of first.offers) {
    assert.equal(offer.fingerprint, first.fingerprint);
    assert.notEqual(offer.teamId, "BUF");
    assert.ok(offer.targetPosition);
    assert.ok(offer.incomingPicks.length > 0);
    assert.ok(offer.incomingPicks.every((pick) => pick.year > offer.livePick.year));
  }
});

test("offer decline is non-mutating and stale board fingerprints fail closed", () => {
  const { session, draft } = onClockSession(8103);
  const market = session.getOnClockTradeMarket();
  const offer = market.offers[0];
  const before = JSON.stringify({ order: draft.order, slots: draft.slots, picks: session.league.draftPicks });
  const declined = session.resolveOnClockTrade({ offerId: offer.id, expectedFingerprint: market.fingerprint, action: "decline" });
  assert.equal(declined.ok, true);
  assert.equal(declined.accepted, false);
  assert.equal(declined.market.offers.some((entry) => entry.id === offer.id), false);
  assert.equal(JSON.stringify({ order: draft.order, slots: draft.slots, picks: session.league.draftPicks }), before);

  const fresh = session.getOnClockTradeMarket();
  const another = fresh.offers[0];
  session.ensureScoutingTeamState("BUF").board = [draft.available[0].id];
  const stale = session.resolveOnClockTrade({ offerId: another.id, expectedFingerprint: fresh.fingerprint, action: "accept" });
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 409);
  assert.equal(stale.reasonCode, "stale-on-clock-offer");
});

test("live-pick Accept and Counter require an exact irreversible review before mutation", () => {
  const { session } = onClockSession(8105);
  const market = session.getOnClockTradeMarket();
  const offer = market.offers[0];
  const review = buildOnClockTradeReview({ action: "accept", offer, marketFingerprint: market.fingerprint });
  assert.equal(review.offerId, offer.id);
  assert.equal(review.fingerprint, market.fingerprint);
  assert.match(review.boundary, /transfers pick ownership.*cannot be undone/i);
  assert.match(review.evidenceBoundary, /not acceptance odds/i);
  assert.match(renderOnClockTradeReview(review), /id="onClockTradeReviewTitle"/);

  const counter = buildOnClockTradeReview({ action: "counter", offer, marketFingerprint: market.fingerprint });
  assert.match(counter.boundary, /If the rival accepts.*if declined, no asset moves/i);
  assert.equal(buildOnClockTradeReview({ action: "decline", offer, marketFingerprint: market.fingerprint }), null);

  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  assert.match(app, /await confirmOnClockTradeAction/);
  assert.match(app, /if \(!review\).*selection remains yours/s);
  assert.match(html, /id="onClockTradeReviewModal"[^>]+aria-modal="true"/);
});

test("accept atomically transfers assets, consumes the slot once, and pauses at the next controlled pick", () => {
  const { session, draft } = onClockSession(8104);
  const market = session.getOnClockTradeMarket();
  const offer = market.offers[0];
  const livePickNumber = draft.currentPick;
  const availableBefore = new Set(draft.available.map((prospect) => prospect.id));

  const result = session.resolveOnClockTrade({ offerId: offer.id, expectedFingerprint: market.fingerprint, action: "accept" });
  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.recipientSelection.pick, livePickNumber);
  assert.equal(result.recipientSelection.teamId, offer.teamId);
  assert.equal(session.getDraftPickById(market.livePickId).ownerTeamId, offer.teamId);
  assert.ok(offer.incomingPicks.every((pick) => session.getDraftPickById(pick.id).ownerTeamId === "BUF"));
  assert.equal(draft.selections.filter((selection) => selection.pick === livePickNumber).length, 1);
  assert.equal(availableBefore.has(result.recipientSelection.playerId), true);
  assert.equal(draft.available.some((prospect) => prospect.id === result.recipientSelection.playerId), false);
  assert.equal(session.getDraftPickById(market.livePickId).consumed, true);
  assert.equal(draft.completed || session.getDraftAuthority().controlledTeamOnClock, true);
  assert.equal(session.getTransactionLog({ type: "draft-trade", limit: 5 })[0].details.fingerprint, market.fingerprint);
});
