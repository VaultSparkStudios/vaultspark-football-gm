// The Gridiron Census (internally "League Pulse") on the game page: start counting, wire the Settings switch and
// show one short notice the first time, so the default is never a secret.
// Loaded lazily after boot so it costs the boot graph nothing.

import {
  browserPrivacySignal,
  getLeaguePulsePreference,
  installLeaguePulse,
  isLeaguePulseEnabled,
  setLeaguePulse
} from "./leaguePulse.js";

const NOTICE_KEY = "fa:league-pulse-notice:v1";

function noticeSeen() {
  try { return localStorage.getItem(NOTICE_KEY) === "1"; } catch { return true; }
}

function markNoticeSeen() {
  try { localStorage.setItem(NOTICE_KEY, "1"); } catch { /* nothing to remember it in */ }
}

/** Pure: whether the first-visit notice should appear. */
export function shouldShowPulseNotice({ seen, preference, privacySignal }) {
  return seen !== true && preference === "default" && privacySignal !== true;
}

function bindSwitch(doc) {
  const input = doc.getElementById("leaguePulseInput");
  if (!input || input.dataset.bound === "1") return;
  input.dataset.bound = "1";
  input.checked = isLeaguePulseEnabled();
  input.addEventListener("change", () => { input.checked = setLeaguePulse(input.checked); });
  globalThis.addEventListener?.("fa:league-pulse", (event) => { input.checked = Boolean(event.detail?.enabled) && isLeaguePulseEnabled(); });
}

export function showPulseNotice(host = globalThis.document?.getElementById("overviewTab")) {
  if (!host || host.ownerDocument.getElementById("leaguePulseNotice")) return false;
  if (!shouldShowPulseNotice({ seen: noticeSeen(), preference: getLeaguePulsePreference(), privacySignal: browserPrivacySignal() })) return false;
  const doc = host.ownerDocument;
  const notice = doc.createElement("div");
  notice.id = "leaguePulseNotice";
  notice.className = "install-hint league-pulse-notice";
  notice.setAttribute("role", "status");
  const text = doc.createElement("span");
  text.textContent = "Your games count toward the Gridiron Census: anonymous totals of games, seasons, titles and Hall of Famers across every franchise. No ID, nothing stored about you.";
  const ok = doc.createElement("button");
  ok.type = "button";
  ok.className = "install-hint-go";
  ok.textContent = "Sounds good";
  ok.addEventListener("click", () => { markNoticeSeen(); notice.remove(); });
  const off = doc.createElement("button");
  off.type = "button";
  off.className = "install-hint-dismiss";
  off.textContent = "Turn it off";
  off.addEventListener("click", () => { setLeaguePulse(false); markNoticeSeen(); notice.remove(); });
  notice.append(text, ok, off);
  host.prepend(notice);
  return true;
}

export function startLeaguePulse({ returning = false } = {}) {
  const doc = globalThis.document;
  if (!doc) return false;
  bindSwitch(doc);
  installLeaguePulse({ returning });
  showPulseNotice();
  return true;
}
