import { deriveSessionGmArchetype } from "../../engine/gmArchetype.js";
import { initGmLegacy, getGmLegacySummary, buildGmReputationProfile } from "../../engine/gmLegacyScore.js";
import { initRivalries, getRivalryContext, getTeamRivalries } from "../../engine/rivalryDNA.js";
import { getFanSentiment, fanApprovalLabel } from "../../engine/fanSentiment.js";
import { buildPersonaIntel } from "../../engine/rivalGmPersona.js";
import { readRequestBody } from "../httpHardening.js";

// Stats tables, records, history, news and league identity.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleStatsRoutes(req, res, url, ctx) {
  const { assertFields, parseJsonBody, sendJson, toInt } = ctx;

  if (req.method === "GET" && url.pathname === "/api/transactions") {
    const team = url.searchParams.get("team");
    const type = url.searchParams.get("type");
    const year = toInt(url.searchParams.get("year"));
    const limit = Math.max(1, Math.min(2000, toInt(url.searchParams.get("limit")) || 250));
    sendJson(res, 200, {
      ok: true,
      transactions: ctx.session.getTransactionLog({
        limit,
        team: team || null,
        type: type || null,
        year
      })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tables/player-season") {
    const category = url.searchParams.get("category") || "passing";
    const year = toInt(url.searchParams.get("year"));
    const position = url.searchParams.get("position");
    const team = url.searchParams.get("team");
    const seasonType = url.searchParams.get("seasonType") || "regular";
    const rows = ctx.session.getTables({ table: "playerSeason", category, filters: { year, position, team, seasonType } });
    sendJson(res, 200, { ok: true, category, rows });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tables/player-career") {
    const category = url.searchParams.get("category") || "passing";
    const position = url.searchParams.get("position");
    const team = url.searchParams.get("team");
    const seasonType = url.searchParams.get("seasonType") || "regular";
    const rows = ctx.session.getTables({ table: "playerCareer", category, filters: { position, team, seasonType } });
    sendJson(res, 200, { ok: true, category, rows });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tables/team-season") {
    const year = toInt(url.searchParams.get("year"));
    const team = url.searchParams.get("team");
    const conference = url.searchParams.get("conference");
    const division = url.searchParams.get("division");
    const rows = ctx.session.getTables({
      table: "teamSeason",
      filters: { year, team, conference, division }
    });
    sendJson(res, 200, { ok: true, rows });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/records") {
    sendJson(res, 200, { ok: true, records: ctx.session.statBook.getRecords() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/champions") {
    sendJson(res, 200, { ok: true, champions: ctx.session.league.champions });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/news") {
    const year = toInt(url.searchParams.get("year"));
    const teamId = url.searchParams.get("team");
    const limit = Math.max(1, Math.min(500, toInt(url.searchParams.get("limit")) || 80));
    sendJson(res, 200, {
      ok: true,
      news: ctx.session.getNewsFeed({ limit, year, teamId: teamId ? String(teamId).toUpperCase() : null })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/analytics") {
    const year = toInt(url.searchParams.get("year")) || ctx.session.currentYear;
    const teamId = url.searchParams.get("team");
    sendJson(res, 200, {
      ok: true,
      analytics: ctx.session.getLeagueAnalytics({ year, teamId: teamId ? String(teamId).toUpperCase() : null })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/history/team") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, history: ctx.session.getTeamHistory(teamId) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/history/player") {
    const playerId = url.searchParams.get("playerId");
    if (!playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const seasonType = url.searchParams.get("seasonType") || "regular";
    const timeline = ctx.session.getPlayerTimeline(String(playerId), { seasonType });
    if (!timeline) {
      sendJson(res, 404, { ok: false, error: "Player not found." });
      return true;
    }
    sendJson(res, 200, { ok: true, timeline });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/history/retire-jersey") {
    const body = parseJsonBody(await readRequestBody(req));
    const check = assertFields(body, ["teamId", "playerId"]);
    if (!check.ok) {
      sendJson(res, 400, { ok: false, error: check.error });
      return true;
    }
    const result = ctx.session.retireJerseyNumber({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId)
    });
    sendJson(res, result.ok ? 200 : 400, result.ok ? { ok: true, result } : result);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/gm-legacy") {
    initGmLegacy(ctx.session.league);
    sendJson(res, 200, {
      ok: true,
      legacy: {
        ...getGmLegacySummary(ctx.session.league, ctx.session.controlledTeamId),
        reputation: buildGmReputationProfile(ctx.session.league.gmLegacy)
      },
      raw: ctx.session.league.gmLegacy
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/rivalry") {
    initRivalries(ctx.session.league);
    const teamA = url.searchParams.get("teamA");
    const teamB = url.searchParams.get("teamB");
    if (teamA && teamB) {
      sendJson(res, 200, { ok: true, rivalry: getRivalryContext(ctx.session.league, teamA, teamB) });
      return true;
    }
    const teamId = teamA || ctx.session.controlledTeamId;
    sendJson(res, 200, { ok: true, rivalries: getTeamRivalries(ctx.session.league, teamId) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/fan-sentiment") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId || "").toUpperCase();
    if (!teamId) {
      sendJson(res, 400, { ok: false, error: "team required." });
      return true;
    }
    const fanSentiment = getFanSentiment(ctx.session.league, teamId);
    sendJson(res, 200, {
      ok: true,
      teamId,
      fanSentiment: {
        ...fanSentiment,
        label: fanApprovalLabel(fanSentiment.approval)
      }
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/stat-leaders") {
    const year = toInt(url.searchParams.get("year")) || ctx.session.currentYear;
    const passing = ctx.session.statBook.getPlayerSeasonTable("passing", { year })
      .sort((left, right) => (right.yds || 0) - (left.yds || 0)).slice(0, 3);
    const rushing = ctx.session.statBook.getPlayerSeasonTable("rushing", { year })
      .sort((left, right) => (right.yds || 0) - (left.yds || 0)).slice(0, 3);
    const defense = ctx.session.statBook.getPlayerSeasonTable("defense", { year })
      .sort((left, right) =>
        ((right.sacks || 0) + (right.int || 0) * 1.5)
        - ((left.sacks || 0) + (left.int || 0) * 1.5)
      ).slice(0, 3);
    sendJson(res, 200, { ok: true, year, leaders: { passing, rushing, defense } });
    return true;
  }

  // ── Franchise Records Board ────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/records/franchise") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, records: ctx.session.statBook.getRecords(), teamId });
    return true;
  }

  // ── AI Team GM Archetypes ──────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/team-archetypes") {
    const scopedTeamId = (url.searchParams.get("team") || "").toUpperCase();
    const teams = scopedTeamId
      ? (ctx.session.league.teams || []).filter((t) => t.id === scopedTeamId)
      : (ctx.session.league.teams || []);
    const archetypes = teams.map((t) => ({
      teamId: t.id,
      name: [t.city, t.nickname].filter(Boolean).join(" ") || t.name || t.id,
      abbrev: t.abbrev || t.id,
      ovr: t.overallRating || 75,
      archetype: deriveSessionGmArchetype(ctx.session, t),
      gm: buildPersonaIntel(ctx.session.league, t.id)
    }));
    sendJson(res, 200, { ok: true, archetypes });
    return true;
  }

  return false;
}
