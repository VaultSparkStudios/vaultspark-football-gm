/**
 * Sends one feedback note to the team. This runs only when the player presses
 * Send. It does not need Community Stats sharing and does not use the Community
 * Stats browser identifier: each note gets a fresh random request identifier
 * that is never saved, so a note cannot be linked to game stats or to another
 * note.
 */

import { getCommunityBuildId, statsEndpoint } from "./communityTelemetry.js";
import { normalizeFeedback } from "./communityFeedbackContract.js";

export const FEEDBACK_EMAIL = "football@playfranchisearchitect.com";
const REQUEST_TIMEOUT_MS = 10_000;

function viewportClass(width) {
  const value = Number(width);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < 600 ? "phone" : value < 1024 ? "tablet" : "desktop";
}

/**
 * Everything that travels with a note besides the note itself: screen, season
 * and week, app version, screen size and theme. No names, no save data.
 */
export function buildFeedbackContext({ dashboard = {}, activeTab = null, width = globalThis.innerWidth, theme = globalThis.document?.documentElement?.dataset?.theme, build = null } = {}) {
  return {
    build: build || null,
    screen: activeTab || null,
    season: dashboard?.currentYear ?? null,
    week: dashboard?.currentWeek ?? null,
    viewport: viewportClass(width),
    theme: theme || null
  };
}

function oneOffIdentifier() {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  return `feedback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

async function post(fetchImpl, url, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      mode: "cors",
      credentials: "omit",
      signal: controller.signal
    });
  } finally { clearTimeout(timer); }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>} Never throws:
 * every failure (offline, an older service without this route, a limit, a
 * timeout) is reported as "could not send" so the caller can keep the text.
 */
export async function sendFeedback({ category, message, rating = null, context = {} } = {}, {
  fetchImpl = globalThis.fetch,
  endpoint = statsEndpoint,
  identifier = oneOffIdentifier,
  build = getCommunityBuildId
} = {}) {
  let feedback = normalizeFeedback({ category, message, rating, context });
  if (!feedback) return { ok: false, reason: "invalid" };
  if (typeof fetchImpl !== "function") return { ok: false, reason: "unavailable" };
  if (globalThis.navigator?.onLine === false) return { ok: false, reason: "offline" };
  try {
    if (!feedback.context.build) {
      const revision = await build();
      if (revision) feedback = normalizeFeedback({ ...feedback, context: { ...feedback.context, build: revision } });
    }
    const participantId = identifier();
    const issued = await post(fetchImpl, endpoint("capability"), { schemaVersion: "1.0", participantId, purpose: "feedback" });
    if (!issued.ok) return { ok: false, reason: `http-${issued.status}` };
    const capability = (await issued.json())?.capability;
    if (typeof capability !== "string" || !capability) return { ok: false, reason: "unavailable" };
    const sent = await post(fetchImpl, endpoint("feedback"), { schemaVersion: "1.0", participantId, capability, feedback });
    return sent.ok ? { ok: true } : { ok: false, reason: `http-${sent.status}` };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
