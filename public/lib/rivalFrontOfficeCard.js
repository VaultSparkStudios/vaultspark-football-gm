import { escapeHtml } from "./appCore.js";

/**
 * The face on the other side of a negotiation.
 *
 * One presenter, so a rival front office reads identically wherever you meet
 * it. The card is descriptive by construction — a name, two stable tendencies,
 * and what this club actually remembers about dealing with you. It never states
 * or implies acceptance odds, leverage, or a relationship score, because the
 * engine has none of those and inventing a number here would be a forecast the
 * simulation cannot honour.
 */
export function renderRivalFrontOffice(frontOffice, { compact = false } = {}) {
  if (!frontOffice?.gmName) return "";
  const traits = (frontOffice.traits || [])
    .map((trait) => `<span class="front-office-trait">${escapeHtml(trait)}</span>`)
    .join("");
  const dealings = Number(frontOffice.dealings || 0);
  // "No history" is information too — it tells you this is a cold call.
  const history = dealings
    ? `<p class="front-office-line">${escapeHtml(frontOffice.line)}</p>`
    : `<p class="front-office-line front-office-line--cold">No history with your front office yet.</p>`;
  const ledger = compact || !frontOffice.recentDealings?.length
    ? ""
    : `<ul class="front-office-ledger">${frontOffice.recentDealings
        .slice()
        .reverse()
        .map((entry) => `<li><span>${escapeHtml(entry.year ?? "—")}</span>${escapeHtml(entry.summary)}</li>`)
        .join("")}</ul>`;

  return `<div class="front-office-card${compact ? " front-office-card--compact" : ""}" data-front-office="${escapeHtml(frontOffice.teamId)}">
      <div class="front-office-head">
        <span class="front-office-role">General Manager</span>
        <strong class="front-office-name">${escapeHtml(frontOffice.gmName)}</strong>
        <span class="front-office-style">${escapeHtml(frontOffice.style || "balanced")}</span>
      </div>
      <div class="front-office-traits">${traits}</div>
      ${history}
      ${ledger}
    </div>`;
}
