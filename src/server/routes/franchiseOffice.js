import { handleArchitectThesisRequest } from "../../runtime/handlers/architectThesisHandler.js";
import { readRequestBody } from "../httpHardening.js";

// Owner, staff, facilities, coaching market, press room and front-office identity.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleFranchiseOfficeRoutes(req, res, url, ctx) {
  const { assertFields, parseJsonBody, sendJson, toNumber } = ctx;

  if (req.method === "GET" && url.pathname === "/api/staff") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const staff = ctx.session.getStaff(teamId);
    if (!staff) {
      sendJson(res, 404, { ok: false, error: "Team not found." });
      return true;
    }
    sendJson(res, 200, { ok: true, staff });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/staff") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.role) {
      sendJson(res, 400, { ok: false, error: "teamId and role required." });
      return true;
    }
    const result = ctx.session.updateStaff({
      teamId: String(body.teamId).toUpperCase(),
      role: String(body.role),
      name: body.name || null,
      playcalling: body.playcalling,
      development: body.development,
      discipline: body.discipline,
      yearsRemaining: body.yearsRemaining
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/owner") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const owner = ctx.session.getOwnerState(teamId);
    if (!owner) {
      sendJson(res, 404, { ok: false, error: "Team not found." });
      return true;
    }
    sendJson(res, 200, { ok: true, owner });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/owner") {
    const body = parseJsonBody(await readRequestBody(req));
    const check = assertFields(body, ["teamId"]);
    if (!check.ok) {
      sendJson(res, 400, { ok: false, error: check.error });
      return true;
    }
    const teamId = String(body.teamId).toUpperCase();
    const result = ctx.session.updateOwnerState({
      teamId,
      ticketPrice: toNumber(body.ticketPrice),
      staffBudget: toNumber(body.staffBudget),
      training: toNumber(body.training),
      rehab: toNumber(body.rehab),
      analytics: toNumber(body.analytics)
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/facilities") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const market = ctx.session.getFacilitiesMarket(teamId);
    sendJson(res, market.ok ? 200 : 404, market);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/facilities/invest") {
    const body = parseJsonBody(await readRequestBody(req));
    const check = assertFields(body, ["teamId", "facility"]);
    if (!check.ok) {
      sendJson(res, 400, { ok: false, error: check.error });
      return true;
    }
    const result = ctx.session.investInFacility({
      teamId: String(body.teamId).toUpperCase(),
      facility: String(body.facility),
      points: toNumber(body.points) ?? 1
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/architect-thesis") {
    const response = handleArchitectThesisRequest({
      method: "GET",
      session: ctx.session,
      projectState: (activeSession) => activeSession.getDashboardState()
    });
    sendJson(res, response.status, response.body);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/architect-thesis") {
    const input = parseJsonBody(await readRequestBody(req));
    const response = handleArchitectThesisRequest({
      method: "POST",
      session: ctx.session,
      input,
      projectState: (activeSession) => activeSession.getDashboardState()
    });
    sendJson(res, response.status, response.body);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/brand-identity") {
    const body = parseJsonBody(await readRequestBody(req));
    const teamId = String(body?.teamId || ctx.session.controlledTeamId || "").toUpperCase();
    if (!teamId) {
      sendJson(res, 400, { ok: false, error: "teamId required." });
      return true;
    }
    const team = (ctx.session.league.teams || []).find((entry) => entry.id === teamId);
    if (!team) {
      sendJson(res, 404, { ok: false, error: "Team " + teamId + " not found." });
      return true;
    }
    const colorFields = ["primaryColor", "secondaryColor"];
    for (const field of colorFields) {
      if (body?.[field] && !/^#[0-9a-f]{6}$/i.test(String(body[field]))) {
        sendJson(res, 400, { ok: false, error: field + " must be a six-digit hex color." });
        return true;
      }
    }
    team.brandOverride = { ...(team.brandOverride || {}) };
    if (body?.customName) team.brandOverride.name = String(body.customName).slice(0, 30);
    if (body?.customCity) team.brandOverride.city = String(body.customCity).slice(0, 24);
    if (body?.customAbbrev) team.brandOverride.abbrev = String(body.customAbbrev).toUpperCase().slice(0, 3);
    if (body?.primaryColor) team.brandOverride.primary = String(body.primaryColor);
    if (body?.secondaryColor) team.brandOverride.secondary = String(body.secondaryColor);
    team.brandOverrideActive = true;
    sendJson(res, 200, {
      ok: true,
      teamId,
      brandOverride: team.brandOverride,
      state: ctx.session.getDashboardState()
    });
    return true;
  }

  // ── Coaching market — hire people, not numbers (S63) ───────────────────────
  if (req.method === "GET" && url.pathname === "/api/coaching-market") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const role = url.searchParams.get("role") || "headCoach";
    const market = ctx.session.getCoachingMarket({ teamId, role });
    sendJson(res, market.ok ? 200 : 400, market);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/coaching-market") {
    const body = parseJsonBody(await readRequestBody(req));
    const check = assertFields(body, ["teamId", "role", "action"]);
    if (!check.ok) {
      sendJson(res, 400, { ok: false, error: check.error });
      return true;
    }
    const teamId = String(body.teamId).toUpperCase();
    const role = String(body.role);
    const result =
      String(body.action) === "fire"
        ? ctx.session.fireCoach({ teamId, role })
        : ctx.session.hireCoach({ teamId, role, candidateId: String(body.candidateId || "") });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      market: ctx.session.getCoachingMarket({ teamId, role }),
      state: ctx.session.getDashboardState()
    });
    return true;
  }

  // ── Press room — the GM answers the question (S63) ─────────────────────────
  if (req.method === "GET" && url.pathname === "/api/press-conference") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, ...ctx.session.getPressRoom(teamId) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/press-conference") {
    const body = parseJsonBody(await readRequestBody(req));
    const check = assertFields(body, ["teamId", "responseId"]);
    if (!check.ok) {
      sendJson(res, 400, { ok: false, error: check.error });
      return true;
    }
    const result = ctx.session.answerPressQuestion({
      teamId: String(body.teamId).toUpperCase(),
      responseId: String(body.responseId),
      questionId: body.questionId ? String(body.questionId) : null
    });
    sendJson(res, result.ok ? 200 : result.reasonCode === "press-stale-question" ? 409 : 400, {
      ...result,
      pressRoom: ctx.session.getPressRoom(),
      state: ctx.session.getDashboardState()
    });
    return true;
  }

  return false;
}
