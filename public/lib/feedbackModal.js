/**
 * The in-game feedback form. Loaded only when a player opens it (the Feedback
 * button, "Tell the Commissioner", or "Send this to the team" on a prompt).
 * Nothing leaves the device until Send is pressed, and what is sent is spelled
 * out on the form. Layout reuses the check-in dialog styles in styles.css; the
 * production style policy does not allow injected style sheets.
 */

import { state } from "./appState.js";
import { escapeHtml } from "./appCore.js";
import { openModal, closeModal } from "./modalManager.js";
import { FEEDBACK_CATEGORIES, FEEDBACK_MESSAGE_LIMIT, cleanFeedbackMessage } from "./communityFeedbackContract.js";
import { FEEDBACK_EMAIL, buildFeedbackContext, sendFeedback } from "./feedbackTransport.js";

export const FEEDBACK_DISCUSS_URL = "https://github.com/VaultSparkStudios/vaultspark-football-gm/discussions/new?category=feedback";
export const FEEDBACK_SENT_LINE = "Sent with your note: the kind of note, your message, your rating if you give one, and: screen, season and week, app version, screen size and theme. Nothing else. Your save and any names in it stay on this device.";

const CATEGORY_LABELS = Object.freeze({ bug: "Bug", idea: "Idea", confusing: "Confusing", praise: "Praise" });
const RATING_LABELS = Object.freeze({ clarity: "Clarity", agency: "Agency", pace: "Pace", returnIntent: "Another session" });

// An unsent note survives Cancel or Escape for as long as the page is open.
let draft = { category: "bug", message: "", rating: null };

/** Turn a prompt's ratings and note into the text the player will see and can edit before sending. */
export function describePromptNote({ note = "", ratings = {}, moment = "" } = {}) {
  const scores = Object.entries(RATING_LABELS)
    .filter(([key]) => Number(ratings[key]) >= 1 && Number(ratings[key]) <= 5)
    .map(([key, text]) => `${text} ${Number(ratings[key])}/5`);
  const lines = [String(note || "").trim(), scores.length ? `My ratings: ${scores.join(", ")}.` : "", moment ? `About: ${String(moment).replace(/-/g, " ")}.` : ""];
  return cleanFeedbackMessage(lines.filter(Boolean).join("\n\n"));
}

export function feedbackFailureMessage(reason) {
  if (reason === "offline") return "You appear to be offline, so your note was not sent. Your text is still here.";
  if (reason === "http-429") return "Too many notes were sent from this connection in a short time, so this one was not sent. Your text is still here.";
  if (reason === "invalid") return "Write a short message first.";
  return "Could not send your note. Your text is still here.";
}

function pressedButtons(name, entries, selected) {
  return entries.map(([value, text]) => `<button type="button" class="btn${String(selected) === String(value) ? " btn-primary" : ""}" data-feedback-${name}="${escapeHtml(value)}" aria-pressed="${String(selected) === String(value)}">${escapeHtml(text)}</button>`).join("");
}

function formMarkup({ category, message }) {
  return `<form class="first-debrief-card" id="feedbackForm" novalidate>
    <div class="first-debrief-kicker">Feedback</div>
    <h2 id="feedbackModalTitle">Tell the Commissioner</h2>
    <p class="first-debrief-lede">Found a bug? Have an idea? Send a short note straight to the team. No account needed.</p>
    <div role="group" aria-labelledby="feedbackCategoryLabel" class="first-debrief-note">
      <span id="feedbackCategoryLabel">What kind of note is it?</span>
      <div class="row compact" style="flex-wrap:wrap;gap:8px">${pressedButtons("category", Object.entries(CATEGORY_LABELS), category)}</div>
    </div>
    <label class="first-debrief-note" for="feedbackMessage">Your message
      <textarea id="feedbackMessage" name="message" rows="5" maxlength="${FEEDBACK_MESSAGE_LIMIT}" required aria-describedby="feedbackSentLine">${escapeHtml(message)}</textarea>
    </label>
    <div role="group" aria-labelledby="feedbackRatingLabel" class="first-debrief-note">
      <span id="feedbackRatingLabel">How is the game so far? 1 is poor, 5 is great (optional)</span>
      <div class="row compact" style="flex-wrap:wrap;gap:8px">${pressedButtons("rating", [1, 2, 3, 4, 5].map((value) => [value, String(value)]), draft.rating)}</div>
    </div>
    <p class="first-debrief-privacy" id="feedbackSentLine">${escapeHtml(FEEDBACK_SENT_LINE)}</p>
    <p class="first-debrief-error" id="feedbackStatus" role="alert"></p>
    <div class="first-debrief-actions" id="feedbackFallback" style="display:none">
      <button type="button" class="btn" id="feedbackCopy">Copy message</button>
      <a class="btn" href="mailto:${FEEDBACK_EMAIL}">Email ${FEEDBACK_EMAIL}</a>
    </div>
    <div class="first-debrief-actions">
      <a href="${FEEDBACK_DISCUSS_URL}" target="_blank" rel="noopener">Discuss on GitHub</a>
      <button type="button" class="btn" id="feedbackCancel">Cancel</button>
      <button type="submit" class="btn btn-primary" id="feedbackSend">Send</button>
    </div>
  </form>`;
}

function thanksMarkup() {
  return `<div class="first-debrief-card first-debrief-confirmation">
    <div class="first-debrief-kicker">Feedback</div>
    <h2 id="feedbackModalTitle">Thanks. Your note was sent.</h2>
    <p class="first-debrief-lede" role="status">It went straight to the team. Notes are kept for 30 days and then deleted.</p>
    <div class="first-debrief-actions"><button type="button" class="btn btn-primary" id="feedbackDone">Done</button></div>
  </div>`;
}

/**
 * @param {object} [options]
 * @param {string} [options.category] preselected kind of note
 * @param {string} [options.message] starting text (replaces an unsent draft)
 * @param {HTMLElement} [options.panel] a prompt panel to read a note and ratings from
 * @param {string} [options.moment] what the prompt was about
 * @param {Function} [options.send] transport, replaceable in tests
 * @returns {HTMLElement|null} the dialog element
 */
export function openFeedbackModal({ category = null, message = null, panel = null, moment = "", send = sendFeedback, clipboard = globalThis.navigator?.clipboard } = {}) {
  if (typeof document === "undefined" || !document.body) return null;
  const existing = document.getElementById("feedbackModal");
  if (existing) return existing;

  if (panel) {
    const rating = (name) => panel.querySelector(`[data-context-rating="${name}"]`)?.value;
    message = describePromptNote({
      note: panel.querySelector("[data-context-note]")?.value,
      ratings: { clarity: rating("clarity"), agency: rating("agency"), pace: rating("pace"), returnIntent: rating("returnIntent") },
      moment
    });
    category = category || "praise";
  }
  if (message != null) draft = { ...draft, message: cleanFeedbackMessage(message) };
  if (FEEDBACK_CATEGORIES.includes(category)) draft = { ...draft, category };

  const overlay = document.createElement("div");
  overlay.id = "feedbackModal";
  overlay.className = "first-debrief-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "feedbackModalTitle");
  overlay.innerHTML = formMarkup(draft);
  document.body.append(overlay);

  const form = overlay.querySelector("#feedbackForm");
  const text = overlay.querySelector("#feedbackMessage");
  const status = overlay.querySelector("#feedbackStatus");
  const sendButton = overlay.querySelector("#feedbackSend");
  let sending = false;

  const close = () => {
    if (text?.isConnected) draft = { ...draft, message: text.value };
    closeModal(overlay);
    overlay.remove();
  };

  overlay.addEventListener("click", (event) => {
    const choice = event.target.closest?.("[data-feedback-category], [data-feedback-rating]");
    if (!choice) return;
    const isRating = choice.hasAttribute("data-feedback-rating");
    const value = isRating ? Number(choice.dataset.feedbackRating) : choice.dataset.feedbackCategory;
    // A rating can be cleared by pressing it again; a kind of note is always set.
    if (isRating) draft = { ...draft, rating: draft.rating === value ? null : value };
    else draft = { ...draft, category: value };
    const selected = isRating ? draft.rating : draft.category;
    overlay.querySelectorAll(isRating ? "[data-feedback-rating]" : "[data-feedback-category]").forEach((button) => {
      const on = String(isRating ? button.dataset.feedbackRating : button.dataset.feedbackCategory) === String(selected);
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("btn-primary", on);
    });
  });

  overlay.querySelector("#feedbackCancel")?.addEventListener("click", close);
  overlay.querySelector("#feedbackCopy")?.addEventListener("click", async () => {
    try {
      if (typeof clipboard?.writeText !== "function") throw new Error("Clipboard unavailable.");
      await clipboard.writeText(text.value);
      status.textContent = `Message copied. You can paste it into an email to ${FEEDBACK_EMAIL}.`;
    } catch {
      status.textContent = `Copy was not available. Select your message and copy it, then email ${FEEDBACK_EMAIL}.`;
      text.focus();
      text.select?.();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const message = cleanFeedbackMessage(text.value);
    if (!message) {
      status.textContent = feedbackFailureMessage("invalid");
      text.focus();
      return;
    }
    sending = true;
    sendButton.disabled = true;
    sendButton.textContent = "Sending…";
    status.textContent = "";
    let result;
    try {
      result = await send({
        category: draft.category,
        message,
        rating: draft.rating,
        context: buildFeedbackContext({ dashboard: state.dashboard, activeTab: state.activeTab })
      });
    } catch {
      result = { ok: false, reason: "unavailable" };
    }
    sending = false;
    if (!overlay.isConnected) {
      // Closed while sending: a sent note must not come back as a draft.
      if (result?.ok) draft = { category: "bug", message: "", rating: null };
      return;
    }
    if (result?.ok) {
      draft = { category: "bug", message: "", rating: null };
      panel?.querySelector?.('[data-context-action="dismiss"]')?.click();
      closeModal(overlay);
      overlay.innerHTML = thanksMarkup();
      const finish = () => { closeModal(overlay); overlay.remove(); };
      overlay.querySelector("#feedbackDone")?.addEventListener("click", finish);
      openModal(overlay, { onClose: finish });
      return;
    }
    sendButton.disabled = false;
    sendButton.textContent = "Send";
    status.textContent = feedbackFailureMessage(result?.reason);
    overlay.querySelector("#feedbackFallback").style.display = "";
    // Disabling the pressed button dropped focus out of the dialog, which
    // would leave Escape and Tab with nothing to act on.
    sendButton.focus({ preventScroll: true });
  });

  openModal(overlay, { onClose: close });
  text.focus({ preventScroll: true });
  return overlay;
}
