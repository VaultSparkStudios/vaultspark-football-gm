import { readRequestBody } from "../httpHardening.js";

// Contracts and the salary cap.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleContractsRoutes(req, res, url, ctx) {
  const { parseJsonBody, sendJson, toInt } = ctx;

  if (req.method === "GET" && url.pathname === "/api/contracts/expiring") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, teamId, players: ctx.session.listExpiringContracts(teamId) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/contracts/negotiations") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, teamId, targets: ctx.session.listNegotiationTargets(teamId) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/resign") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = ctx.session.resignPlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      years: toInt(body.years) || 3,
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/restructure") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = ctx.session.restructurePlayerContract({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId)
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/franchise-tag") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = ctx.session.applyFranchiseTagToPlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/fifth-year-option") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = ctx.session.applyFifthYearOptionToPlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/negotiate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = ctx.session.negotiateAndSign({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      years: toInt(body.years),
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  return false;
}
