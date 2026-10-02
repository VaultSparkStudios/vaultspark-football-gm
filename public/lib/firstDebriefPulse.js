import { closeModal, openModal } from "./modalManager.js";
import { franchiseStorageKey } from "./franchiseScope.js";
import {
  buildLocalPlaytestExport,
  buildLocalPlaytestReceipt,
  saveLocalPlaytestReceipt
} from "./playtestReceipts.js";

export const FIRST_DEBRIEF_PULSE_STORAGE_PREFIX = "vsfgm:first-debrief-pulse:v1";
export const FIRST_DEBRIEF_PULSE_STATES = Object.freeze({
  ANSWERED: "answered",
  DECLINED: "declined"
});

// Optional feedback remains dismissible when browser storage is unavailable.
// This fallback lasts for this page only; it does not claim durable persistence.
const pageStates = new WeakMap();
const unavailableStorageStates = new Map();

function resolvePulseStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function pulsePageStates(storage) {
  if (!storage || (typeof storage !== "object" && typeof storage !== "function")) return unavailableStorageStates;
  if (!pageStates.has(storage)) pageStates.set(storage, new Map());
  return pageStates.get(storage);
}



export function firstDebriefPulseStorageKey(dashboard = {}) {
  return franchiseStorageKey(FIRST_DEBRIEF_PULSE_STORAGE_PREFIX, dashboard);
}

export function getFirstDebriefPulseState(dashboard = {}, storage) {
  storage = resolvePulseStorage(storage);
  const key = firstDebriefPulseStorageKey(dashboard);
  const pageState = pulsePageStates(storage).get(key);
  if (pageState) return pageState;
  try {
    const value = storage?.getItem?.(key);
    return Object.values(FIRST_DEBRIEF_PULSE_STATES).includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function setFirstDebriefPulseState(dashboard = {}, value, storage) {
  if (!Object.values(FIRST_DEBRIEF_PULSE_STATES).includes(value)) {
    throw new Error("First-debrief pulse state must be answered or declined.");
  }
  storage = resolvePulseStorage(storage);
  const key = firstDebriefPulseStorageKey(dashboard);
  pulsePageStates(storage).set(key, value);
  try { storage?.setItem?.(key, value); } catch { /* Suppressed for this page only. */ }
  return value;
}

export function shouldPromptFirstDebriefPulse(dashboard = {}, storage) {
  return Boolean(dashboard?.controlledTeamId) && getFirstDebriefPulseState(dashboard, storage) === null;
}

function ratingOptions() {
  return [
    '<option value="">Choose</option>',
    '<option value="1">1 — Low</option>',
    '<option value="2">2</option>',
    '<option value="3">3 — Mixed</option>',
    '<option value="4">4</option>',
    '<option value="5">5 — High</option>'
  ].join("");
}

function pulseMarkup() {
  const options = ratingOptions();
  return `
    <section class="first-debrief-card" role="document" aria-labelledby="firstDebriefTitle" aria-describedby="firstDebriefPrivacy">
      <div class="first-debrief-kicker">Private playtest check-in</div>
      <h2 id="firstDebriefTitle">How did that first week feel?</h2>
      <p class="first-debrief-lede">Rate the decision loop you just completed. This takes about 20 seconds.</p>
      <form id="firstDebriefForm">
        <div class="first-debrief-rating-grid">
          <label>Clarity<select name="clarity" required>${options}</select></label>
          <label>Agency<select name="agency" required>${options}</select></label>
          <label>Pace<select name="pace" required>${options}</select></label>
          <label>Return intent<select name="returnIntent" required>${options}</select></label>
        </div>
        <label class="first-debrief-note">One thing you would change (optional)
          <textarea name="note" rows="3" maxlength="280" placeholder="What felt unclear, slow, or especially satisfying?"></textarea>
        </label>
        <p id="firstDebriefPrivacy" class="first-debrief-privacy">Stored only in this browser. Nothing is sent automatically, and no save data or personal identifier is included.</p>
        <p id="firstDebriefError" class="first-debrief-error" role="alert" aria-live="polite"></p>
        <div class="first-debrief-actions">
          <button class="btn btn-primary" type="submit">Save private check-in</button>
          <button class="btn btn-secondary" id="firstDebriefDecline" type="button">Not now</button>
        </div>
      </form>
    </section>`;
}

function contextFromDashboard(dashboard = {}) {
  return {
    year: dashboard.currentYear,
    week: dashboard.currentWeek,
    phase: dashboard.phase,
    teamId: dashboard.controlledTeamId,
    openingContractStatus: dashboard.openingContractProgress?.status || "not-observed",
    evidenceMoment: "first-weekly-debrief"
  };
}

function confirmationMarkup() {
  return `
    <section class="first-debrief-card first-debrief-confirmation" role="document" aria-labelledby="firstDebriefSavedTitle">
      <div class="first-debrief-kicker">Check-in saved on this device</div>
      <h2 id="firstDebriefSavedTitle">Thanks — the check-in stays yours.</h2>
      <p class="first-debrief-lede">Copy it only if you want to share it with the studio.</p>
      <p id="firstDebriefCopyStatus" class="first-debrief-privacy" aria-live="polite">Nothing has been sent.</p>
      <div class="first-debrief-actions">
        <button class="btn btn-primary" id="firstDebriefCopy" type="button">Copy check-in</button>
        <button class="btn btn-secondary" id="firstDebriefDone" type="button">Done</button>
      </div>
    </section>`;
}

export function maybePromptFirstDebriefPulse({
  dashboard = {},
  storage,
  clipboard = globalThis.navigator?.clipboard,
  focusTarget = null
} = {}) {
  storage = resolvePulseStorage(storage);
  if (typeof document === "undefined" || !document.body || !shouldPromptFirstDebriefPulse(dashboard, storage)) {
    return false;
  }
  if (document.getElementById("firstDebriefPulse")) return false;

  const overlay = document.createElement("div");
  overlay.id = "firstDebriefPulse";
  overlay.className = "first-debrief-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = pulseMarkup();
  document.body.append(overlay);

  let resolved = false;
  let receipt = null;
  const returnFocus = focusTarget || document.getElementById("advanceWeekBtn");
  const dismiss = ({ declined = false } = {}) => {
    if (declined && !resolved) {
      setFirstDebriefPulseState(dashboard, FIRST_DEBRIEF_PULSE_STATES.DECLINED, storage);
      resolved = true;
    }
    closeModal(overlay);
    overlay.remove();
    if (returnFocus?.isConnected && !returnFocus.disabled && typeof returnFocus.focus === "function") {
      returnFocus.focus({ preventScroll: true });
    }
  };

  const form = overlay.querySelector("#firstDebriefForm");
  const error = overlay.querySelector("#firstDebriefError");
  overlay.querySelector("#firstDebriefDecline")?.addEventListener("click", () => dismiss({ declined: true }));
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      receipt = buildLocalPlaytestReceipt({
        clarity: data.get("clarity"),
        agency: data.get("agency"),
        pace: data.get("pace"),
        returnIntent: data.get("returnIntent"),
        note: data.get("note")
      }, contextFromDashboard(dashboard));
      if (typeof storage?.setItem !== "function") throw new Error("Browser storage is unavailable. This check-in was not saved.");
      saveLocalPlaytestReceipt(receipt, storage);
      setFirstDebriefPulseState(dashboard, FIRST_DEBRIEF_PULSE_STATES.ANSWERED, storage);
      resolved = true;
      closeModal(overlay);
      overlay.innerHTML = confirmationMarkup();
      overlay.querySelector("#firstDebriefDone")?.addEventListener("click", () => dismiss());
      overlay.querySelector("#firstDebriefCopy")?.addEventListener("click", async () => {
        const status = overlay.querySelector("#firstDebriefCopyStatus");
        try {
          if (typeof clipboard?.writeText !== "function") throw new Error("Clipboard unavailable.");
          await clipboard.writeText(JSON.stringify(buildLocalPlaytestExport([receipt]), null, 2));
          if (status) status.textContent = "Check-in copied. Sharing it is up to you.";
        } catch {
          if (status) status.textContent = "Copy was unavailable. Your check-in is still saved on this device.";
        }
      });
      openModal(overlay, { onClose: () => dismiss() });
    } catch (caught) {
      if (error) error.textContent = caught?.message || "Choose a rating for all four questions.";
    }
  });

  openModal(overlay, { onClose: () => dismiss({ declined: true }) });
  return true;
}
