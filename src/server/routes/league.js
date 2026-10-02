import { getLeagueConfigCatalog, getLeagueConfigSummary, resolveLeagueSettings } from "../../config/leagueSetup.js";
import { createSession } from "../../runtime/bootstrap.js";
import { applyInitialLeagueSetup } from "../../runtime/applyLeagueSetup.js";
import { listBackupSlots, listSaveSlots } from "../../runtime/saveStore.js";
import { executeAdvanceWeekTransaction } from "../../runtime/advanceWeekCommand.js";
import { handleFranchiseMomentRequest } from "../../runtime/handlers/franchiseMomentHandler.js";
import { readRequestBody } from "../httpHardening.js";

// League setup, season flow and the shared calendar.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleLeagueRoutes(req, res, url, ctx) {
  const { CURRENT_YEAR, generateSeasonArcs, parseJsonBody, sendJson, toBool, toInt, writeAutoBackup } = ctx;

  if (req.method === "GET" && url.pathname === "/api/setup/init") {
    const setupStarted = Date.now();
    const setup = ctx.session.getSetupState();
    const setupStateMs = Date.now() - setupStarted;
    const includeSaves = toBool(url.searchParams.get("includeSaves"), true);
    const includeBackups = toBool(url.searchParams.get("includeBackups"), false);
    const savesStarted = Date.now();
    const saves = includeSaves ? listSaveSlots() : [];
    const savesMs = includeSaves ? Date.now() - savesStarted : 0;
    const backupsStarted = Date.now();
    const backups = includeBackups ? listBackupSlots() : [];
    const backupsMs = includeBackups ? Date.now() - backupsStarted : 0;
    sendJson(res, 200, {
      ok: true,
      currentYear: CURRENT_YEAR,
      saves,
      savesDeferred: !includeSaves,
      backups,
      backupsDeferred: !includeBackups,
      activeLeague: {
        phase: setup.phase,
        currentYear: setup.currentYear,
        currentWeek: setup.currentWeek,
        seasonsSimulated: setup.seasonsSimulated,
        mode: setup.mode,
        controlledTeamId: setup.controlledTeamId,
        controlledTeamName: setup.controlledTeamName,
        controlledTeamAbbrev: setup.controlledTeamAbbrev,
        configSummary: getLeagueConfigSummary(ctx.session.getLeagueSettings())
      },
      teams: setup.teams,
      settings: ctx.session.getLeagueSettings(),
      configCatalog: getLeagueConfigCatalog(),
      diagnostics: {
        setup: {
          runtime: "server",
          setupStateMs,
          savesMs,
          backupsMs,
          totalMs: Date.now() - setupStarted,
          savesDeferred: !includeSaves,
          backupsDeferred: !includeBackups
        }
      }
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, ctx.session.getDashboardState());
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/onboarding/start-scenario") {
    const body = parseJsonBody(await readRequestBody(req));
    const result = ctx.session.applyStartScenario(body);
    const status = result.ok
      ? 200
      : (result.reasonCode === "START_SCENARIO_ALREADY_APPLIED" ? 409 : 400);
    if (result.ok && !result.idempotent) writeAutoBackup("opening-contract");
    sendJson(res, status, {
      ...result,
      state: ctx.session.getDashboardState()
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/new-league") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    ctx.session = createSession({
      seed: toInt(body.seed) || Date.now(),
      startYear: toInt(body.startYear) || CURRENT_YEAR,
      mode: body.mode === "play" ? "play" : "drive",
      pfrPath: body.pfrPath || null,
      realismProfilePath: body.realismProfilePath || null,
      careerRealismProfilePath: body.careerRealismProfilePath || null,
      controlledTeamId: body.controlledTeamId || "BUF"
    });
    ctx.session.league.settings = resolveLeagueSettings(
      {
        eraProfile: body.eraProfile || "modern",
        franchiseArchetype: body.franchiseArchetype || "balanced",
        rulesPreset: body.rulesPreset || "standard",
        difficultyPreset: body.difficultyPreset || "standard",
        challengeMode: body.challengeMode || "open",
        enableOwnerMode: toBool(body.enableOwnerMode, true),
        enableNarratives: toBool(body.enableNarratives, true),
        enableCompPicks: toBool(body.enableCompPicks, true),
        enableChemistry: toBool(body.enableChemistry, true)
      },
      ctx.session.getLeagueSettings()
    );
    ctx.session.league.scouting.weeklyPoints = ctx.session.league.settings.scoutingWeeklyPoints;
    applyInitialLeagueSetup(ctx.session, ctx.session.controlledTeamId);
    writeAutoBackup("new-league");
    sendJson(res, 200, { ok: true, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/control-team") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId) {
      sendJson(res, 400, { ok: false, error: "teamId is required." });
      return true;
    }
    const teamId = ctx.session.setControlledTeam(String(body.teamId).toUpperCase());
    sendJson(res, 200, { ok: true, teamId, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/advance-season") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const count = Math.max(1, Math.min(100, toInt(body.count) || 1));
    const results = ctx.session.simulateSeasons(count, { runOffseasonAfterLast: true });
    writeAutoBackup("season-sim");
    sendJson(res, 200, { ok: true, count, results, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/advance-week") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const outcome = executeAdvanceWeekTransaction(ctx.session, body);
    if (!outcome.ok) {
      sendJson(res, outcome.status || 400, outcome);
      return true;
    }
    const { committedSession, ...responseOutcome } = outcome;
    ctx.session = committedSession;
    const last = responseOutcome.results[responseOutcome.results.length - 1];
    if (last?.phase === "offseason") writeAutoBackup("offseason-checkpoint");
    else writeAutoBackup("week");
    sendJson(res, 200, { ...responseOutcome, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/schedule") {
    const week = toInt(url.searchParams.get("week")) || ctx.session.currentWeek;
    sendJson(res, 200, { ok: true, schedule: ctx.session.getScheduleWeek(week) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/boxscores") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    const limit = Math.max(1, Math.min(20, toInt(url.searchParams.get("limit")) || 8));
    sendJson(res, 200, { ok: true, games: ctx.session.getRecentBoxScores(teamId, limit) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/boxscore") {
    const gameId = url.searchParams.get("gameId");
    if (!gameId) {
      sendJson(res, 400, { ok: false, error: "gameId is required." });
      return true;
    }
    const boxScore = ctx.session.getBoxScore(gameId);
    sendJson(res, boxScore ? 200 : 404, boxScore ? { ok: true, boxScore } : { ok: false, error: "Game not found." });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/what-if-replay") {
    const teamId = (url.searchParams.get("team") || ctx.session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, replay: ctx.session.getWhatIfReplay({ teamId }) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/calendar") {
    const year = toInt(url.searchParams.get("year")) || ctx.session.currentYear;
    sendJson(res, 200, { ok: true, calendar: ctx.session.getSeasonCalendar(year) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, { ok: true, settings: ctx.session.getLeagueSettings() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const settings = ctx.session.updateLeagueSettings(body);
    sendJson(res, 200, { ok: true, settings, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/offseason/pipeline") {
    sendJson(res, 200, { ok: true, pipeline: ctx.session.getOffseasonPipeline() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/offseason/advance") {
    const result = ctx.session.advanceOffseasonPipeline();
    sendJson(res, 200, { ok: true, pipeline: result, state: ctx.session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const limit = Math.max(1, Math.min(3000, toInt(url.searchParams.get("limit")) || 250));
    const year = toInt(url.searchParams.get("year"));
    const type = url.searchParams.get("type");
    sendJson(res, 200, { ok: true, events: ctx.session.getEventLog({ limit, year, type: type || null }) });
    return true;
  }

  // ── Season Narrative Arcs ──────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/season-arcs") {
    sendJson(res, 200, { ok: true, arcs: generateSeasonArcs(ctx.session) });
    return true;
  }

  // ── Time Capsule (preseason predictions + receipts) ────────────────────────
  if (req.method === "GET" && url.pathname === "/api/time-capsule") {
    sendJson(res, 200, {
      ok: true,
      capsule: ctx.session.league.timeCapsule || null,
      ledger: ctx.session.league.timeCapsuleLedger || []
    });
    return true;
  }

  // ── GM Decision Queue ──────────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/gm-decision") {
    sendJson(res, 200, { ok: true, decisions: ctx.session.getDashboardState().gmDecisionQueue || [] });
    return true;
  }

  // ── Franchise Moment — shared drama authority (S62) ────────────────────────
  if (req.method === "GET" && url.pathname === "/api/franchise-moment") {
    const response = handleFranchiseMomentRequest({ session: ctx.session, teamId: url.searchParams.get("team") });
    sendJson(res, response.status, response.body);
    return true;
  }

  return false;
}
