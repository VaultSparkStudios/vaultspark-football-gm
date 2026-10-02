import { scoutedDraftResult } from "../../runtime/GameSession.js";
import { runLeagueCombine, getCombineSummary } from "../../engine/draftCombine.js";
import { readRequestBody } from "../httpHardening.js";

// Draft, scouting and the combine.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleDraftRoutes(req, res, url, ctx) {
  const { parseJsonBody, sendJson, toInt } = ctx;

  if (req.method === "GET" && url.pathname === "/api/draft") {
    sendJson(res, 200, { ok: true, draft: ctx.session.getDraftState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/draft/prepare") {
    // S108 — every draft response carries the scout's view of the class, never
    // the truth; see scoutedProspectView.
    const draft = scoutedDraftResult(ctx.session.prepareDraft());
    sendJson(res, 200, { ok: true, draft, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/scouting") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const limit = Math.max(10, Math.min(300, toInt(url.searchParams.get("limit")) || 120));
    sendJson(res, 200, { ok: true, scouting: ctx.session.getScoutingBoard({ teamId, limit }) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/scouting/allocate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const result = ctx.session.allocateScoutingPoints({
      teamId: String(body.teamId || ctx.session.controlledTeamId).toUpperCase(),
      playerId: String(body.playerId),
      points: toInt(body.points) || 10
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/scouting/lock-board") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !Array.isArray(body.playerIds)) {
      sendJson(res, 400, { ok: false, error: "playerIds[] required." });
      return true;
    }
    const result = ctx.session.lockDraftBoard({
      teamId: String(body.teamId || ctx.session.controlledTeamId).toUpperCase(),
      playerIds: body.playerIds.map((id) => String(id))
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/draft/user-pick") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const result = scoutedDraftResult(ctx.session.draftUserPick({ playerId: String(body.playerId) }));
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/draft/on-clock-trade") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.offerId || !body.expectedFingerprint) {
      sendJson(res, 400, { ok: false, error: "offerId and expectedFingerprint required." });
      return true;
    }
    const result = ctx.session.resolveOnClockTrade({
      offerId: String(body.offerId),
      expectedFingerprint: String(body.expectedFingerprint),
      action: String(body.action || "accept")
    });
    sendJson(res, result.ok ? 200 : (result.status || 400), { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/draft/cpu") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const result = scoutedDraftResult(
      ctx.session.runCpuDraft({
        picks: Math.max(1, Math.min(224, toInt(body.picks) || 224)),
        untilUserPick: body.untilUserPick !== false
      })
    );
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/combine/run") {
    const draftClass = ctx.session.league.pendingDraft?.available || ctx.session.league.draftClass || [];
    if (!draftClass.length) {
      sendJson(res, 400, { ok: false, error: "No draft class available." });
      return true;
    }
    const results = runLeagueCombine(draftClass, ctx.session.rng);
    ctx.session.league.combineResults = results;
    sendJson(res, 200, { ok: true, results, count: results.length });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/combine/results") {
    const draftClass = ctx.session.league.pendingDraft?.available || ctx.session.league.draftClass || [];
    const boardIds = ctx.session.controlledTeamId
      ? ctx.session.ensureScoutingTeamState(ctx.session.controlledTeamId).board || []
      : [];
    const summary = getCombineSummary(draftClass, boardIds);
    sendJson(res, 200, { ok: true, summary, hasResults: summary.length > 0 });
    return true;
  }

  return false;
}
