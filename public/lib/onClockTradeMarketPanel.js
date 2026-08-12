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
