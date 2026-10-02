import { clampQueryInt, readRequestBody } from "../httpHardening.js";

// Roster, depth chart, player cards and roster moves.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleRosterRoutes(req, res, url, ctx) {
  const { assertFields, parseJsonBody, sendJson, toBool, toInt, toNumber } = ctx;

  if (req.method === "GET" && url.pathname === "/api/roster") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const position = url.searchParams.get("position");
    const minOverall = toInt(url.searchParams.get("minOverall"));
    const minAge = toInt(url.searchParams.get("minAge"));
    const maxAge = toInt(url.searchParams.get("maxAge"));
    let roster = ctx.session.getRoster(teamId);
    if (position) roster = roster.filter((row) => row.pos === position);
    if (minOverall != null) roster = roster.filter((row) => (row.overall || 0) >= minOverall);
    if (minAge != null) roster = roster.filter((row) => (row.age || 0) >= minAge);
    if (maxAge != null) roster = roster.filter((row) => (row.age || 100) <= maxAge);
    sendJson(res, 200, {
      ok: true,
      teamId,
      roster,
      windowMap: ctx.session.getRosterWindowMap(teamId),
      cap: ctx.session.getTeamCapSummary(teamId)
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/roster/designation") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId || !body.designation) {
      sendJson(res, 400, { ok: false, error: "teamId, playerId, designation required." });
      return true;
    }
    const result = ctx.session.setPlayerDesignation({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      designation: String(body.designation),
      active: body.active !== false
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      roster: ctx.session.getRoster(String(body.teamId).toUpperCase()),
      state: ctx.session.getDashboardState()
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/retired") {
    const position = url.searchParams.get("position");
    const limit = clampQueryInt(url.searchParams.get("limit"), { min: 1, max: 1000, fallback: 250 });
    const minOverall = toInt(url.searchParams.get("minOverall"));
    const minAge = toInt(url.searchParams.get("minAge"));
    const maxAge = toInt(url.searchParams.get("maxAge"));
    sendJson(res, 200, {
      ok: true,
      retired: ctx.session.getRetiredPlayers({ position, limit, minOverall, minAge, maxAge })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/players/search") {
    const query = url.searchParams.get("q") || "";
    const limit = clampQueryInt(url.searchParams.get("limit"), { min: 1, max: 100, fallback: 20 });
    const includeRetired = url.searchParams.get("includeRetired") !== "0";
    sendJson(res, 200, {
      ok: true,
      players: ctx.session.searchPlayers({ query, limit, includeRetired })
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/retirement/override") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "playerId is required." });
      return true;
    }
    const result = ctx.session.overrideRetirement({
      playerId: String(body.playerId),
      teamId: body.teamId ? String(body.teamId).toUpperCase() : ctx.session.controlledTeamId,
      minWinningPct: toNumber(body.minWinningPct),
      forceSign: toBool(body.forceSign, true)
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: ctx.session.getDashboardState(),
      retired: ctx.session.getRetiredPlayers({ limit: 250 })
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/release") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId are required." });
      return true;
    }
    const result = ctx.session.releasePlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      june1: body.june1 === true,
      toWaivers: body.toWaivers !== false
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: ctx.session.getDashboardState(),
      roster: ctx.session.getRoster(String(body.teamId).toUpperCase())
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/practice-squad") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId are required." });
      return true;
    }
    const result = ctx.session.setPracticeSquad({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      moveToPractice: body.moveToPractice !== false
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: ctx.session.getDashboardState(),
      roster: ctx.session.getRoster(String(body.teamId).toUpperCase())
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/depth-chart") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    sendJson(res, 200, {
      ok: true,
      teamId,
      depthChart: ctx.session.getDepthChart(teamId),
      snapShare: ctx.session.getDepthChartSnapShare(teamId)
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/depth-chart") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.position || !Array.isArray(body.playerIds)) {
      sendJson(res, 400, { ok: false, error: "teamId, position, playerIds[] required." });
      return true;
    }
    const result = ctx.session.setDepthChart({
      teamId: String(body.teamId).toUpperCase(),
      position: String(body.position).toUpperCase(),
      playerIds: body.playerIds.map((id) => String(id)),
      snapShares:
        body.snapShares && typeof body.snapShares === "object" && !Array.isArray(body.snapShares)
          ? Object.fromEntries(
              Object.entries(body.snapShares).map(([playerId, share]) => [String(playerId), Number(share)])
            )
          : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/waiver-claim") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = ctx.session.claimWaiver({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId)
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/player") {
    const playerId = url.searchParams.get("playerId");
    if (!playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const seasonType = url.searchParams.get("seasonType") || "regular";
    const profile = ctx.session.getPlayerProfile(String(playerId), { seasonType });
    if (!profile) {
      sendJson(res, 404, { ok: false, error: "Player not found." });
      return true;
    }
    sendJson(res, 200, { ok: true, profile });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/injuries/rehab-plan") {
    const body = parseJsonBody(await readRequestBody(req));
    const check = assertFields(body, ["teamId", "playerId", "plan"]);
    if (!check.ok) {
      sendJson(res, 400, { ok: false, error: check.error });
      return true;
    }
    const result = ctx.session.setRehabPlan({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      plan: String(body.plan)
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/compare/players") {
    const ids = (url.searchParams.get("ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 8);
    const profiles = ids
      .map((id) => ctx.session.getPlayerProfile(id))
      .filter(Boolean)
      .map((profile) => profile.player);
    sendJson(res, 200, { ok: true, players: profiles });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/mentorship") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId || "").toUpperCase();
    sendJson(res, 200, ctx.session.getMentorshipState(teamId));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/mentorship") {
    const body = parseJsonBody(await readRequestBody(req)) || {};
    const action = String(body.action || "");
    const result = action === "assign"
      ? ctx.session.assignMentorship(body)
      : action === "clear"
        ? ctx.session.clearMentorship(body)
        : { ok: false, status: 400, error: "action must be assign or clear." };
    sendJson(res, result.ok ? 200 : (result.status || 400), {
      ...result,
      state: result.state || ctx.session.getMentorshipState(body.teamId)
    });
    return true;
  }

  return false;
}
