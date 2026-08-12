import { escapeHtml } from "./appCore.js";

export function renderOnClockTradeMarket(market) {
  return `
    <section class="on-clock-market" aria-labelledby="onClockMarketTitle">
      <div class="on-clock-market-head">
        <div>
          <div class="brand-kicker">Live Pick Market</div>
          <h4 id="onClockMarketTitle">Trade the selection before you draft</h4>
        </div>
        <span>${escapeHtml(`${market.offers?.length || 0} verified offer${market.offers?.length === 1 ? "" : "s"}`)}</span>
      </div>
      ${market.offers?.length ? `<div class="on-clock-offer-grid">${market.offers.map((offer) => `
        <article class="on-clock-offer-card">
          <div class="on-clock-offer-title"><strong>${escapeHtml(offer.teamName)}</strong><span>Targets ${escapeHtml(offer.targetPosition)}</span></div>
          <div class="small">${escapeHtml(offer.rationale)}</div>
          <div class="on-clock-pick-list" aria-label="Picks offered">
            ${offer.incomingPicks.map((pick) => `<span>${escapeHtml(`${pick.year} R${pick.round}`)}</span>`).join("")}
          </div>
          <div class="small">Disclosed value: ${escapeHtml(offer.incomingValue)} in / ${escapeHtml(offer.livePick.value)} out (${offer.valueDelta >= 0 ? "+" : ""}${escapeHtml(offer.valueDelta)})</div>
          <div class="on-clock-offer-actions">
            <button type="button" data-on-clock-action="accept" data-offer-id="${escapeHtml(offer.id)}" data-offer-fingerprint="${escapeHtml(offer.fingerprint)}">Accept</button>
            <button type="button" class="secondary" data-on-clock-action="counter" data-offer-id="${escapeHtml(offer.id)}" data-offer-fingerprint="${escapeHtml(offer.fingerprint)}" ${offer.counterAvailable ? "" : "disabled"}>Counter + pick</button>
            <button type="button" class="secondary" data-on-clock-action="decline" data-offer-id="${escapeHtml(offer.id)}" data-offer-fingerprint="${escapeHtml(offer.fingerprint)}">Decline</button>
          </div>
        </article>`).join("")}</div>` : `<div class="narrative-empty">No rival has enough eligible future capital for this live slot.</div>`}
    </section>`;
}

export function buildOnClockTradeReview({ action, offer, marketFingerprint } = {}) {
  const normalizedAction = String(action || "").toLowerCase();
  if (!["accept", "counter"].includes(normalizedAction) || !offer?.id || !marketFingerprint) return null;
  const incomingPicks = (offer.incomingPicks || []).map((pick) => ({
    id: pick.id || null,
    label: `${pick.year} Round ${pick.round}`
  }));
  return Object.freeze({
    schemaVersion: "1.0",
    action: normalizedAction,
    offerId: offer.id,
    fingerprint: marketFingerprint,
    rival: offer.teamName || offer.teamId || "Rival franchise",
    targetPosition: offer.targetPosition || "best available player",
    outgoing: offer.livePick ? `${offer.livePick.year} Round ${offer.livePick.round}` : "the live selection",
    incomingPicks,
    incomingValue: Number(offer.incomingValue || 0),
    outgoingValue: Number(offer.livePick?.value || 0),
    valueDelta: Number(offer.valueDelta || 0),
    counterAddsPick: normalizedAction === "counter",
    boundary: normalizedAction === "counter"
      ? "Confirm sends one bounded counter. If the rival accepts, pick ownership transfers and the rival immediately consumes the live slot; if declined, no asset moves."
      : "Confirm transfers pick ownership and the rival immediately consumes the live slot. This cannot be undone from the Draft War Room.",
    evidenceBoundary: "Disclosed values explain the offer; they are not acceptance odds, urgency, or a forecast. The board fingerprint must still match at commit."
  });
}

export function renderOnClockTradeReview(review) {
  if (!review) return "";
  return `
    <div class="brand-kicker">Irreversible draft authority</div>
    <h3 id="onClockTradeReviewTitle">Review ${escapeHtml(review.action === "counter" ? "counter" : "trade")} before commitment</h3>
    <div class="on-clock-trade-review-grid">
      <section><span>You send</span><strong>${escapeHtml(review.outgoing)}</strong><small>Live selection · disclosed value ${escapeHtml(review.outgoingValue)}</small></section>
      <section><span>${escapeHtml(review.rival)} sends</span><strong>${review.incomingPicks.map((pick) => escapeHtml(pick.label)).join(" + ")}</strong><small>Disclosed value ${escapeHtml(review.incomingValue)} · delta ${review.valueDelta >= 0 ? "+" : ""}${escapeHtml(review.valueDelta)}</small></section>
      <section><span>Rival target</span><strong>${escapeHtml(review.targetPosition)}</strong><small>Source-derived roster need; no acceptance probability is claimed.</small></section>
    </div>
    <p id="onClockTradeReviewBoundary" class="on-clock-trade-boundary"><strong>Commit boundary:</strong> ${escapeHtml(review.boundary)}</p>
    <p class="small">${escapeHtml(review.evidenceBoundary)}</p>`;
}
