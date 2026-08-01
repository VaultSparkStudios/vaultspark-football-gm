/**
 * pressRoomPanel.js — the podium, on screen (S63).
 *
 * Renders the pending post-game question and the GM's own record of what they
 * said. Everything shown here is source-derived from the dashboard's `pressRoom`
 * payload, which the runtime builds from league state — this module invents no
 * consequence copy of its own, so what the player is promised is exactly what
 * the engine applies.
 *
 * When there is no open question the card states the last thing the GM said
 * rather than disappearing, because a promise that is still owed is precisely
 * the thing a player needs to see before they advance the week.
 */

import { escapeHtml } from "./appCore.js";

const CARD_ID = "pressRoomCard";

function el() {
  return document.getElementById(CARD_ID);
}

function renderReceipt(receipt) {
  if (!receipt) return "";
  const owed = receipt.promised
    ? `<span class="press-promise-flag">Promise on the record — next week settles it.</span>`
    : "";
  return `
    <div class="press-room-last">
      <div class="press-room-last-head">Week ${escapeHtml(String(receipt.week))} podium · ${escapeHtml(receipt.label || "")}</div>
      <blockquote class="press-room-quote">${escapeHtml(receipt.quote || "")}</blockquote>
      <div class="press-room-reasons">${escapeHtml((receipt.reasons || []).join(" · "))}</div>
      ${owed}
    </div>
  `;
}

/**
 * @param {object} pressRoom — dashboard.pressRoom: { pending, receipts }
 */
export function renderPressRoomPanel(pressRoom) {
  const node = el();
  if (!node) return;

  const pending = pressRoom?.pending || null;
  const [lastReceipt] = pressRoom?.receipts || [];

  if (!pending && !lastReceipt) {
    node.hidden = true;
    node.innerHTML = "";
    return;
  }

  if (!pending) {
    node.hidden = false;
    node.dataset.state = "answered";
    node.innerHTML = `
      <div class="press-room-kicker">Press Room</div>
      ${renderReceipt(lastReceipt)}
      <div class="press-room-note">No question on the table. The room reconvenes after the next game.</div>
    `;
    return;
  }

  const options = (pending.options || [])
    .map(
      (option) => `
        <button type="button" class="press-room-option" data-press-response="${escapeHtml(option.id)}"
                data-press-question="${escapeHtml(pending.id)}">
          <span class="press-option-label">${escapeHtml(option.label)}</span>
          <span class="press-option-preview">${escapeHtml(option.preview || "")}</span>
          <span class="press-option-consequence">${escapeHtml(option.consequence || "")}${
            option.promises ? " · puts your word on the record" : ""
          }</span>
        </button>
      `
    )
    .join("");

  node.hidden = false;
  node.dataset.state = "pending";
  node.innerHTML = `
    <div class="press-room-kicker">Press Room · Week ${escapeHtml(String(pending.week))}${
      pending.opponent ? ` vs ${escapeHtml(pending.opponent)}` : ""
    }${pending.score ? ` · ${escapeHtml(pending.score)}` : ""}</div>
    <p class="press-room-question">${escapeHtml(pending.question)}</p>
    <div class="press-room-options">${options}</div>
    <button type="button" class="press-room-skip" data-press-response="decline"
            data-press-question="${escapeHtml(pending.id)}">
      ${escapeHtml(pending.skip?.label || "Say nothing")}
      <span class="press-option-consequence">${escapeHtml(pending.skip?.consequence || "")}</span>
    </button>
    ${lastReceipt ? renderReceipt(lastReceipt) : ""}
  `;
}

/**
 * Wire the podium once. Delegated so re-renders never need re-binding.
 *
 * @param {(payload: {responseId: string, questionId: string}) => void} onAnswer
 */
export function initPressRoomPanel(onAnswer) {
  const node = el();
  if (!node || node.dataset.wired === "1") return;
  node.dataset.wired = "1";
  node.addEventListener("click", (event) => {
    const button = event.target.closest("[data-press-response]");
    if (!button) return;
    // Disable immediately: a double-answered podium would double-apply
    // consequences before the state round-trip completes.
    node.querySelectorAll("[data-press-response]").forEach((el) => { el.disabled = true; });
    onAnswer({
      responseId: button.dataset.pressResponse,
      questionId: button.dataset.pressQuestion || null
    });
  });
}
