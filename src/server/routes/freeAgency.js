import { clampQueryInt, readRequestBody } from "../httpHardening.js";

// Free agency market, offers and signings.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleFreeAgencyRoutes(req, res, url, ctx) {
  const { parseJsonBody, sendJson, toInt } = ctx;

  if (req.method === "GET" && url.pathname === "/api/free-agents") {
    const position = url.searchParams.get("position");
    const limit = clampQueryInt(url.searchParams.get("limit"), { min: 1, max: 500, fallback: 200 });
    const minOverall = toInt(url.searchParams.get("minOverall"));
    const minAge = toInt(url.searchParams.get("minAge"));
    const maxAge = toInt(url.searchParams.get("maxAge"));
    sendJson(res, 200, { ok: true, freeAgents: ctx.session.getFreeAgents({ position, limit, minOverall, minAge, maxAge }) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/free-agency/market") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const limit = clampQueryInt(url.searchParams.get("limit"), { min: 5, max: 200, fallback: 60 });
    sendJson(res, 200, { ok: true, market: ctx.session.getFreeAgencyMarket({ teamId, limit }) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/free-agency/offer") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const teamId = String(body.teamId).toUpperCase();
    const result = ctx.session.submitFreeAgencyOffer({
      teamId,
      playerId: String(body.playerId),
      years: toInt(body.years) || 2,
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      market: ctx.session.getFreeAgencyMarket({ teamId }),
      state: ctx.session.getDashboardState()
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/sign") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId are required." });
      return true;
    }
    const result = ctx.session.signFreeAgent({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId)
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: ctx.session.getDashboardState(),
      roster: ctx.session.getRoster(String(body.teamId).toUpperCase())
    });
    return true;
  }

  return false;
}
