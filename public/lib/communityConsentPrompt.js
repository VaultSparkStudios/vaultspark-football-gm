/**
 * Offers the Community Stats choice once inside the game, after the player has
 * finished a season and closed its review. It is a quiet card on the Overview,
 * never a blocking dialog. Showing it is remembered immediately, so it appears
 * at most once per browser whether it is answered, dismissed or ignored, and it
 * never appears for someone who already made the choice on the website.
 */

import { browserStorage } from "./browserStorage.js";
import { hasOpenModal } from "./modalManager.js";
import { COMMUNITY_CONSENT_KEY, COMMUNITY_SHARING_SUMMARY, setCommunityParticipation } from "./communityTelemetry.js";

export const COMMUNITY_OFFER_KEY = "fa:community-offer:v1";

export function shouldOfferCommunityChoice({ dashboard = {}, storage = browserStorage(), modalOpen = false } = {}) {
  if (!(Number(dashboard?.seasonsSimulated) >= 1) || modalOpen) return false;
  // Without working storage the dismissal could not be remembered, so the
  // offer is never made: asking twice is worse than not asking.
  try {
    return Boolean(storage) && !storage.getItem(COMMUNITY_OFFER_KEY) && !storage.getItem(COMMUNITY_CONSENT_KEY);
  } catch { return false; }
}

export function maybeOfferCommunityChoice({
  dashboard = {},
  storage = browserStorage(),
  documentRef = globalThis.document,
  setParticipation = setCommunityParticipation
} = {}) {
  const host = documentRef?.getElementById?.("overviewTab");
  if (!host?.classList?.contains("active") || documentRef.getElementById("communityOfferCard")) return false;
  if (!shouldOfferCommunityChoice({ dashboard, storage, modalOpen: hasOpenModal() })) return false;
  try {
    storage.setItem(COMMUNITY_OFFER_KEY, "offered");
    if (storage.getItem(COMMUNITY_OFFER_KEY) !== "offered") return false;
  } catch { return false; }

  const card = documentRef.createElement("aside");
  card.id = "communityOfferCard";
  card.className = "contextual-evidence-prompt";
  card.setAttribute("role", "region");
  card.setAttribute("aria-labelledby", "communityOfferTitle");
  card.innerHTML = `
    <div class="contextual-evidence-head"><span>Community Stats</span><button type="button" data-community-offer="dismiss" aria-label="Dismiss">×</button></div>
    <h2 id="communityOfferTitle">One season down. Want to add yours to the community numbers?</h2>
    <p>${COMMUNITY_SHARING_SUMMARY} It is off unless you turn it on, and you can turn it off again at any time. <a href="./privacy.html#community-stats-privacy" target="_blank" rel="noopener">What is shared</a></p>
    <p data-community-offer-status role="status"></p>
    <div class="contextual-evidence-actions"><button type="button" data-community-offer="dismiss">No thanks</button><button type="button" class="btn btn-primary" data-community-offer="share">Share anonymous game stats</button></div>`;
  card.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-community-offer]");
    if (!button) return;
    if (button.dataset.communityOffer !== "share") { card.remove(); return; }
    button.disabled = true;
    let participating = false;
    try { participating = (await setParticipation(true)).participating === true; } catch { participating = false; }
    card.querySelector("[data-community-offer-status]").textContent = participating
      ? "Sharing is on. You can turn it off at any time on the Community Stats page."
      : "Sharing could not be turned on, so it stays off. You can try again on the Community Stats page.";
    card.querySelector(".contextual-evidence-actions").innerHTML = '<a href="./stats.html" target="_blank" rel="noopener">Community Stats page</a><button type="button" data-community-offer="dismiss">Close</button>';
  });
  host.prepend(card);
  return true;
}
