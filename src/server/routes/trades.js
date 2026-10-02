import { handleTradeOffersRequest } from "../../runtime/handlers/tradeOffersHandler.js";
import { readRequestBody } from "../httpHardening.js";

// Trades, trade evaluation, draft-pick inventory and AI trade offers.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleTradesRoutes(req, res, url, ctx) {
  const { parseJsonBody, sendJson, toInt } = ctx;

  if (req.method === "POST" && url.pathname === "/api/trade") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamA || !body.teamB) {
      sendJson(res, 400, { ok: false, error: "teamA and teamB required." });
      return true;
    }
    const result = ctx.session.tradePlayers({
      teamA: String(body.teamA).toUpperCase(),
      teamB: String(body.teamB).toUpperCase(),
      teamAPlayerIds: (body.teamAPlayerIds || []).map((id) => String(id)),
      teamBPlayerIds: (body.teamBPlayerIds || []).map((id) => String(id)),
      teamAPickIds: (body.teamAPickIds || []).map((id) => String(id)),
      teamBPickIds: (body.teamBPickIds || []).map((id) => String(id)),
      expectedPlanFingerprint: body.expectedPlanFingerprint
    });
    sendJson(res, result.ok ? 200 : (result.status || 400), { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/trade/evaluate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamA || !body.teamB) {
      sendJson(res, 400, { ok: false, error: "teamA and teamB required." });
      return true;
    }
    const result = ctx.session.evaluateTradePackage({
      teamA: String(body.teamA).toUpperCase(),
      teamB: String(body.teamB).toUpperCase(),
      teamAPlayerIds: (body.teamAPlayerIds || []).map((id) => String(id)),
      teamBPlayerIds: (body.teamBPlayerIds || []).map((id) => String(id)),
      teamAPickIds: (body.teamAPickIds || []).map((id) => String(id)),
      teamBPickIds: (body.teamBPickIds || []).map((id) => String(id))
    });
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/picks") {
    const teamId = url.searchParams.get("team");
    const year = toInt(url.searchParams.get("year"));
    sendJson(res, 200, {
      ok: true,
      picks: ctx.session.getDraftPickAssets(teamId ? String(teamId).toUpperCase() : null, { year })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/trade-offers") {
    const response = handleTradeOffersRequest({ method: "GET", session: ctx.session });
    sendJson(res, response.status, response.body);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/trade-offers") {
    const input = parseJsonBody(await readRequestBody(req));
    const response = handleTradeOffersRequest({ method: "POST", session: ctx.session, input });
    sendJson(res, response.status, response.body);
    return true;
  }

  return false;
}
