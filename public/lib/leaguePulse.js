// League Pulse, the browser side. Players see it as the "Gridiron Census"; "League Pulse" is already the in-game power rankings screen. Anonymous league-wide totals, on by default
// with a one-click opt-out (S133).
//
// What makes it anonymous: a pulse is a bag of counters with no identifier,
// sent without credentials, and nothing is written to this browser for it. The
// one stored value is the player's own "off" choice. Counters live in memory
// and are sent when the page is hidden or closed, or after a season finishes.
// Browsers that send Global Privacy Control or Do Not Track are treated as off.
//
// Detailed Community Stats (per-browser receipts, error reports, the weekly
// challenge board) remain a separate opt-in in communityTelemetry.js.

import { LEAGUE_PULSE_METRICS, LEAGUE_PULSE_SCHEMA_VERSION, normalizeLeaguePulse } from "./leaguePulseContract.js";
import { observeBackgroundTask } from "./clientDiagnostics.js";

export const LEAGUE_PULSE_PREFERENCE_KEY = "fa:league-pulse:v1";
export const LEAGUE_PULSE_ENDPOINT = "https://api-franchise-architect-football.vaultsparkstudios.com/community/v1/pulse";
export const LEAGUE_PULSE_SUMMARY = "Anonymous league totals (games, seasons, titles, Hall of Famers and time played) are counted with no ID and nothing stored in your browser. You can turn this off at any time.";

const ACTIVE_TICK_MS = 15_000;
const MINUTE_ROUND = 5;

let pending = {};
let activeMs = 0;
let activeTimer = null;
let installed = false;

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** True when the browser asks sites not to track it. */
export function browserPrivacySignal() {
  const nav = globalThis.navigator;
  if (!nav) return false;
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack ?? globalThis.doNotTrack ?? nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}

/** The player's own choice: "on", "off", or "default" when never touched. */
export function getLeaguePulsePreference() {
  try {
    const value = storage()?.getItem(LEAGUE_PULSE_PREFERENCE_KEY);
    return value === "off" || value === "on" ? value : "default";
  } catch { return "default"; }
}

export function isLeaguePulseEnabled() {
  // Only a real page counts. Node (tests, the engine's own scripts, a worker)
  // has no window or document and must never post to the live service.
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const preference = getLeaguePulsePreference();
  if (preference === "off") return false;
  // An explicit "on" is the player overriding their browser's signal for this site.
  if (preference === "on") return true;
  return !browserPrivacySignal();
}

export function setLeaguePulse(enabled) {
  try { storage()?.setItem(LEAGUE_PULSE_PREFERENCE_KEY, enabled ? "on" : "off"); } catch { /* the choice still applies to this visit */ }
  if (!enabled) { pending = {}; activeMs = 0; }
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("fa:league-pulse", { detail: { enabled: Boolean(enabled) } }));
  }
  return isLeaguePulseEnabled();
}

export function pulseEndpoint() {
  const meta = typeof document !== "undefined" ? document.querySelector('meta[name="fa-community-api"]')?.content?.trim() : "";
  return meta ? `${meta.replace(/\/+$/, "")}/pulse` : LEAGUE_PULSE_ENDPOINT;
}

/** Add to a counter, never past its per-pulse cap. Ignored while off. */
export function countPulse(metric, amount = 1) {
  if (!isLeaguePulseEnabled() || !Object.hasOwn(LEAGUE_PULSE_METRICS, metric)) return false;
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (!value) return false;
  pending[metric] = Math.min(LEAGUE_PULSE_METRICS[metric], Number(pending[metric] || 0) + value);
  return true;
}

export function pendingLeaguePulse() {
  return { ...pending, ...(activeMinutes() ? { activeMinutes: activeMinutes() } : {}) };
}

function activeMinutes() {
  return Math.min(LEAGUE_PULSE_METRICS.activeMinutes, Math.floor(activeMs / 60_000 / MINUTE_ROUND) * MINUTE_ROUND);
}

/**
 * Send what has been counted and start again from zero. Uses a keepalive fetch
 * with a plain-text body, which is a simple CORS request: no preflight, no
 * cookies, no credentials.
 */
export function flushLeaguePulse({ fetchImpl = globalThis.fetch } = {}) {
  if (!isLeaguePulseEnabled()) { pending = {}; return null; }
  const counts = pendingLeaguePulse();
  const payload = { schemaVersion: LEAGUE_PULSE_SCHEMA_VERSION, counts };
  if (!normalizeLeaguePulse(payload) || typeof fetchImpl !== "function") return null;
  pending = {};
  activeMs -= counts.activeMinutes ? counts.activeMinutes * 60_000 : 0;
  // A lost pulse is a smaller total, never a retry or a stored copy. The
  // failure is still observed (on the telemetry surface, which is never
  // itself reported), so a broken endpoint is visible rather than silent.
  observeBackgroundTask(
    () => Promise.resolve(fetchImpl(pulseEndpoint(), {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload)
    })),
    { surface: "community-telemetry", operation: "league-pulse-send", authorityKey: "league-pulse", severity: "degraded" }
  );
  return payload;
}

/**
 * Turn game receipts into counters. Reads only the coarse events the game
 * already derives (see extractCommunityEvents.js) and two fields of the
 * advance-week response; never a name, a save or a player.
 */
export function observePulseReceipt({ events = [], path = "", response = {} } = {}) {
  if (!isLeaguePulseEnabled()) return false;
  // A season's end and a new franchise are sent at once: setup happens on the
  // landing page, which navigates away before any hide listener could run.
  let flushNow = false;
  for (const row of events) {
    const m = row?.metrics || {};
    if (row?.type === "league_started") { countPulse("leagueCreated"); flushNow = true; }
    else if (row?.type === "weeks_managed") {
      countPulse("gamesPlayed", m.weeks);
      countPulse("seasonsCompleted", m.seasonsCompleted);
      countPulse("championships", m.championships);
      if (Number(m.seasonsCompleted) > 0) flushNow = true;
    }
    else if (row?.type === "draft_pick") countPulse("playersDrafted");
    else if (row?.type === "trade_completed") countPulse("tradesMade");
    else if (row?.type === "free_agent_signed") countPulse("freeAgentsSigned");
  }
  if (String(path).split("?")[0].replace(/\/+$/, "") === "/api/advance-week") {
    if (response?.franchiseOpeningWeek === true) countPulse("firstWeekPlayed");
    countPulse("hallOfFamers", response?.clubHallOfFameInductions);
  }
  if (flushNow) flushLeaguePulse();
  return true;
}

function tickActive() {
  if (typeof document === "undefined" || document.visibilityState === "visible") activeMs += ACTIVE_TICK_MS;
}

/**
 * Start counting on the game page. `returning` is whether this browser already
 * had a franchise saved when the page opened (game state, not an identifier).
 */
export function installLeaguePulse({ returning = false } = {}) {
  if (installed || typeof window === "undefined") return false;
  installed = true;
  if (countPulse("gameLoaded") && returning) countPulse("returningLoad");
  activeTimer = setInterval(tickActive, ACTIVE_TICK_MS);
  activeTimer?.unref?.();
  const flushOnHide = () => { if (document.visibilityState === "hidden") flushLeaguePulse(); };
  document.addEventListener("visibilitychange", flushOnHide);
  window.addEventListener("pagehide", () => flushLeaguePulse());
  return true;
}

/** Test seam: forget everything counted in this module. */
export function resetLeaguePulseForTests() {
  pending = {};
  activeMs = 0;
  installed = false;
  if (activeTimer) clearInterval(activeTimer);
  activeTimer = null;
}

/** Test seam: pretend the page was visible for this long. */
export function addActiveTimeForTests(ms) { activeMs += Math.max(0, Number(ms) || 0); }
