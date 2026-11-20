/**
 * Posts a weekly challenge score to the shared board and reads the board back.
 *
 * Both run only while Community Stats sharing is on. With sharing off nothing
 * is built, stored or sent, and no request is made at all. A score travels
 * through the same sharing capability as game stats and is exactly
 * { week, objective, score }: no club, no names, no save data.
 */
import { capabilityMutation, getCommunityParticipation, participantId, statsEndpoint } from "./communityTelemetry.js";
import { challengeObjective, isChallengeWeekKey, normalizeChallengeScore } from "./weeklyChallengeScoreContract.js";

const REQUEST_TIMEOUT_MS = 10_000;
// What this browser has already posted, per browser identifier and week, so a
// score is posted once and not again on every page load. Remembered in this
// browser where storage allows; the service keeps the best either way.
const POSTED_KEY = "franchise-architect-challenge-posted:v1";
const posted = new Map();
// Posts under way, so two refreshes at the same moment share one request.
const inFlight = new Map();
function recallPosted() {
  if (posted.size) return;
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(POSTED_KEY) || "{}");
    for (const [key, score] of Object.entries(saved || {})) if (Number.isInteger(score)) posted.set(key, score);
  } catch { /* storage unavailable: this page still posts once */ }
}
function rememberPosted(key, score) {
  posted.set(key, score);
  try { globalThis.localStorage?.setItem(POSTED_KEY, JSON.stringify(Object.fromEntries([...posted].slice(-8)))); } catch { /* optional */ }
}

/**
 * @returns {Promise<{ status: "off" | "invalid" | "sent" | "already-sent" | "failed", reason?: string }>}
 * Never throws. "off" means sharing is off and nothing left the browser.
 */
export async function submitChallengeScore({ week, objective, score } = {}, { now = Date.now() } = {}) {
  if (!getCommunityParticipation()) return { status: "off" };
  const entry = normalizeChallengeScore({ week, objective, score }, { now });
  if (!entry) return { status: "invalid" };
  const browserId = participantId();
  if (!browserId) return { status: "off" };
  const key = `${browserId}:${entry.week}`;
  recallPosted();
  if (posted.get(key) >= entry.score) return { status: "already-sent" };
  if (typeof fetch !== "function" || globalThis.navigator?.onLine === false) return { status: "failed", reason: "offline" };
  const flightKey = `${key}:${entry.score}`;
  if (inFlight.has(flightKey)) return inFlight.get(flightKey);
  const admitted = () => getCommunityParticipation() && participantId() === browserId;
  const flight = (async () => {
    try {
      const { response } = await capabilityMutation("challenge/score", browserId, { schemaVersion: "1.0", participantId: browserId, entry }, {}, admitted);
      if (!response?.ok) return { status: "failed", reason: `http-${response?.status || "unknown"}` };
      rememberPosted(key, entry.score);
      return { status: "sent" };
    } catch {
      return { status: "failed", reason: "unavailable" };
    } finally { inFlight.delete(flightKey); }
  })();
  inFlight.set(flightKey, flight);
  return flight;
}

/**
 * The shared board for a week, or null when sharing is off or the board cannot
 * be reached. The request carries the week and nothing about this browser.
 */
export async function fetchChallengeBoard(week) {
  if (!getCommunityParticipation() || !isChallengeWeekKey(week) || typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(statsEndpoint(`challenge/board?week=${encodeURIComponent(week)}`), { mode: "cors", credentials: "omit", signal: controller.signal });
    if (!response.ok) return null;
    const board = await response.json();
    if (board?.week !== week || !challengeObjective(board.objective) || (board.status !== "live" && board.status !== "not-enough-scores")) return null;
    return board;
  } catch {
    return null;
  } finally { clearTimeout(timer); }
}
