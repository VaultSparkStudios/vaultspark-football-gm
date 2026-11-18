/**
 * careerCommand.js — the one handler behind POST /api/career, shared verbatim
 * by both adapters so the browser runtime and the server cannot drift.
 *
 * Authority ("may this player do that right now") is decided before this runs,
 * at the command boundary in franchiseAuthority.js. This function only parses
 * the request and performs the action.
 */
export function runCareerCommand(session, body = {}) {
  const action = String(body?.action || "").trim().toLowerCase();
  if (action === "resign") {
    const result = session.resignAsGm();
    return result.ok ? result : { ...result, status: 409 };
  }
  if (action === "take-job") {
    if (!body?.teamId) return { ok: false, status: 400, reasonCode: "career-team-required", error: "Choose a club to join." };
    const result = session.takeJobOffer(String(body.teamId).toUpperCase());
    return result.ok ? result : { ...result, status: 409 };
  }
  return { ok: false, status: 400, reasonCode: "career-unknown-action", error: "Choose to resign or to take a job." };
}
