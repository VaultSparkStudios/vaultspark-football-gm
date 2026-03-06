import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { GAME_NAME } from "./config.js";
import { createSession, createSessionFromSnapshot } from "./runtime/bootstrap.js";
import {
  deleteSaveSlot,
  listBackupSlots,
  listSaveSlots,
  loadSessionFromSlot,
  saveRollingBackup,
  saveSessionToSlot
} from "./runtime/saveStore.js";
import { getPersistenceDescriptor } from "./runtime/persistence.js";

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.resolve("public");

let session = createSession();
const CURRENT_YEAR = new Date().getFullYear();
const serverMetrics = {
  startedAt: Date.now(),
  requests: 0,
  apiRequests: 0,
  routeHits: {},
  routeTiming: {}
};
const simJobs = new Map();

function writeAutoBackup(reason) {
  return saveRollingBackup(session.toSnapshot(), {
    reason,
    year: session.currentYear,
    week: session.currentWeek,
    phase: session.phase,
    maxBackups: 60
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function toInt(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function assertFields(body, fields = []) {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body." };
  for (const field of fields) {
    if (body[field] == null || body[field] === "") {
      return { ok: false, error: `${field} is required.` };
    }
  }
  return { ok: true };
}

function trackRouteMetric(route, durationMs) {
  serverMetrics.routeHits[route] = (serverMetrics.routeHits[route] || 0) + 1;
  const timing = serverMetrics.routeTiming[route] || { count: 0, totalMs: 0, avgMs: 0 };
  timing.count += 1;
  timing.totalMs += durationMs;
  timing.avgMs = Number((timing.totalMs / timing.count).toFixed(2));
  serverMetrics.routeTiming[route] = timing;
}

function staticContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === "/" ? "/index.html" : reqPath;
  const resolved = path.resolve(PUBLIC_DIR, `.${safePath}`);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    sendText(res, 404, "Not Found");
    return;
  }
  const content = fs.readFileSync(resolved);
  sendText(res, 200, content, staticContentType(resolved));
}

function runSimulationJob(jobId) {
  const job = simJobs.get(jobId);
  if (!job || job.status === "cancelled" || job.status === "completed" || job.status === "failed") return;
  job.status = "running";
  const batchSize = Math.min(4, Math.max(1, Math.floor(job.totalSeasons / 25) || 1));
  const started = Date.now();
  try {
    for (let i = 0; i < batchSize && job.completedSeasons < job.totalSeasons; i += 1) {
      const summary = session.simulateOneSeason({ runOffseasonAfter: true });
      job.results.push(summary);
      job.completedSeasons += 1;
    }
    job.progress = Number(((job.completedSeasons / Math.max(1, job.totalSeasons)) * 100).toFixed(2));
    job.updatedAt = Date.now();
    if (job.completedSeasons >= job.totalSeasons) {
      job.status = "completed";
      writeAutoBackup("job-sim");
      return;
    }
    setTimeout(() => runSimulationJob(jobId), 0);
  } catch (error) {
    job.status = "failed";
    job.error = error?.message || "Simulation job failed.";
  } finally {
    trackRouteMetric("background-job-sim", Date.now() - started);
  }
}

function createSimulationJob(totalSeasons) {
  const id = `JOB-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const job = {
    id,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalSeasons,
    completedSeasons: 0,
    progress: 0,
    results: []
  };
  simJobs.set(id, job);
  setTimeout(() => runSimulationJob(id), 0);
  return job;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/setup/init") {
    const dashboard = session.getDashboardState();
    sendJson(res, 200, {
      ok: true,
      currentYear: CURRENT_YEAR,
      saves: listSaveSlots(),
      backups: listBackupSlots(),
      activeLeague: {
        phase: session.phase,
        currentYear: session.currentYear,
        currentWeek: session.currentWeek,
        seasonsSimulated: session.seasonsSimulated,
        controlledTeamId: session.controlledTeamId
      },
      teams: dashboard.teams
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, session.getDashboardState());
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/new-league") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    session = createSession({
      seed: toInt(body.seed) || Date.now(),
      startYear: toInt(body.startYear) || CURRENT_YEAR,
      mode: body.mode === "play" ? "play" : "drive",
      pfrPath: body.pfrPath || null,
      realismProfilePath: body.realismProfilePath || null,
      careerRealismProfilePath: body.careerRealismProfilePath || null,
      controlledTeamId: body.controlledTeamId || "BUF"
    });
    session.updateLeagueSettings({
      eraProfile: body.eraProfile || "modern",
      enableOwnerMode: toBool(body.enableOwnerMode, true),
      enableNarratives: toBool(body.enableNarratives, true),
      enableCompPicks: toBool(body.enableCompPicks, true),
      enableChemistry: toBool(body.enableChemistry, true)
    });
    writeAutoBackup("new-league");
    sendJson(res, 200, { ok: true, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/control-team") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId) {
      sendJson(res, 400, { ok: false, error: "teamId is required." });
      return true;
    }
    const teamId = session.setControlledTeam(String(body.teamId).toUpperCase());
    sendJson(res, 200, { ok: true, teamId, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/advance-season") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const count = Math.max(1, Math.min(100, toInt(body.count) || 1));
    const results = session.simulateSeasons(count, { runOffseasonAfterLast: true });
    writeAutoBackup("season-sim");
    sendJson(res, 200, { ok: true, count, results, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/advance-week") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const count = Math.max(1, Math.min(40, toInt(body.count) || 1));
    const results = [];
    for (let i = 0; i < count; i += 1) results.push(session.advanceWeek());
    const last = results[results.length - 1];
    if (last?.phase === "offseason") writeAutoBackup("offseason-checkpoint");
    else writeAutoBackup("week");
    sendJson(res, 200, { ok: true, count, results, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/roster") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    const position = url.searchParams.get("position");
    const minOverall = toInt(url.searchParams.get("minOverall"));
    const minAge = toInt(url.searchParams.get("minAge"));
    const maxAge = toInt(url.searchParams.get("maxAge"));
    let roster = session.getRoster(teamId);
    if (position) roster = roster.filter((row) => row.pos === position);
    if (minOverall != null) roster = roster.filter((row) => (row.overall || 0) >= minOverall);
    if (minAge != null) roster = roster.filter((row) => (row.age || 0) >= minAge);
    if (maxAge != null) roster = roster.filter((row) => (row.age || 100) <= maxAge);
    sendJson(res, 200, { ok: true, teamId, roster, cap: session.getTeamCapSummary(teamId) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/roster/designation") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId || !body.designation) {
      sendJson(res, 400, { ok: false, error: "teamId, playerId, designation required." });
      return true;
    }
    const result = session.setPlayerDesignation({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      designation: String(body.designation),
      active: body.active !== false
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      roster: session.getRoster(String(body.teamId).toUpperCase()),
      state: session.getDashboardState()
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/free-agents") {
    const position = url.searchParams.get("position");
    const limit = toInt(url.searchParams.get("limit")) || 200;
    const minOverall = toInt(url.searchParams.get("minOverall"));
    const minAge = toInt(url.searchParams.get("minAge"));
    const maxAge = toInt(url.searchParams.get("maxAge"));
    sendJson(res, 200, { ok: true, freeAgents: session.getFreeAgents({ position, limit, minOverall, minAge, maxAge }) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/retired") {
    const position = url.searchParams.get("position");
    const limit = toInt(url.searchParams.get("limit")) || 250;
    const minOverall = toInt(url.searchParams.get("minOverall"));
    const minAge = toInt(url.searchParams.get("minAge"));
    const maxAge = toInt(url.searchParams.get("maxAge"));
    sendJson(res, 200, {
      ok: true,
      retired: session.getRetiredPlayers({ position, limit, minOverall, minAge, maxAge })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/free-agency/market") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    const limit = toInt(url.searchParams.get("limit")) || 60;
    sendJson(res, 200, { ok: true, market: session.getFreeAgencyMarket({ teamId, limit }) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/free-agency/offer") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const teamId = String(body.teamId).toUpperCase();
    const result = session.submitFreeAgencyOffer({
      teamId,
      playerId: String(body.playerId),
      years: toInt(body.years) || 2,
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      market: session.getFreeAgencyMarket({ teamId }),
      state: session.getDashboardState()
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/sign") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId are required." });
      return true;
    }
    const result = session.signFreeAgent({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId)
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: session.getDashboardState(),
      roster: session.getRoster(String(body.teamId).toUpperCase())
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/retirement/override") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "playerId is required." });
      return true;
    }
    const result = session.overrideRetirement({
      playerId: String(body.playerId),
      teamId: body.teamId ? String(body.teamId).toUpperCase() : session.controlledTeamId,
      minWinningPct: toNumber(body.minWinningPct),
      forceSign: toBool(body.forceSign, true)
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: session.getDashboardState(),
      retired: session.getRetiredPlayers({ limit: 250 })
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/release") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId are required." });
      return true;
    }
    const result = session.releasePlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      june1: body.june1 === true,
      toWaivers: body.toWaivers !== false
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: session.getDashboardState(),
      roster: session.getRoster(String(body.teamId).toUpperCase())
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/practice-squad") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId are required." });
      return true;
    }
    const result = session.setPracticeSquad({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      moveToPractice: body.moveToPractice !== false
    });
    sendJson(res, result.ok ? 200 : 400, {
      ...result,
      state: session.getDashboardState(),
      roster: session.getRoster(String(body.teamId).toUpperCase())
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/depth-chart") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    sendJson(res, 200, {
      ok: true,
      teamId,
      depthChart: session.getDepthChart(teamId),
      snapShare: session.getDepthChartSnapShare(teamId)
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/depth-chart") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.position || !Array.isArray(body.playerIds)) {
      sendJson(res, 400, { ok: false, error: "teamId, position, playerIds[] required." });
      return true;
    }
    const result = session.setDepthChart({
      teamId: String(body.teamId).toUpperCase(),
      position: String(body.position).toUpperCase(),
      playerIds: body.playerIds.map((id) => String(id))
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/waiver-claim") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = session.claimWaiver({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId)
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/trade") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamA || !body.teamB) {
      sendJson(res, 400, { ok: false, error: "teamA and teamB required." });
      return true;
    }
    const result = session.tradePlayers({
      teamA: String(body.teamA).toUpperCase(),
      teamB: String(body.teamB).toUpperCase(),
      teamAPlayerIds: (body.teamAPlayerIds || []).map((id) => String(id)),
      teamBPlayerIds: (body.teamBPlayerIds || []).map((id) => String(id)),
      teamAPickIds: (body.teamAPickIds || []).map((id) => String(id)),
      teamBPickIds: (body.teamBPickIds || []).map((id) => String(id))
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/trade/evaluate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamA || !body.teamB) {
      sendJson(res, 400, { ok: false, error: "teamA and teamB required." });
      return true;
    }
    const result = session.evaluateTradePackage({
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
      picks: session.getDraftPickAssets(teamId ? String(teamId).toUpperCase() : null, { year })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/contracts/expiring") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, teamId, players: session.listExpiringContracts(teamId) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/contracts/negotiations") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, teamId, targets: session.listNegotiationTargets(teamId) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/resign") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = session.resignPlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      years: toInt(body.years) || 3,
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/restructure") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = session.restructurePlayerContract({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId)
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/franchise-tag") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = session.applyFranchiseTagToPlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/fifth-year-option") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = session.applyFifthYearOptionToPlayer({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/contracts/negotiate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.teamId || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "teamId and playerId required." });
      return true;
    }
    const result = session.negotiateAndSign({
      teamId: String(body.teamId).toUpperCase(),
      playerId: String(body.playerId),
      years: toInt(body.years),
      salary: body.salary != null ? Number(body.salary) : null
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/draft") {
    sendJson(res, 200, { ok: true, draft: session.getDraftState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/schedule") {
    const week = toInt(url.searchParams.get("week")) || session.currentWeek;
    sendJson(res, 200, { ok: true, schedule: session.getScheduleWeek(week) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/calendar") {
    const year = toInt(url.searchParams.get("year")) || session.currentYear;
    sendJson(res, 200, { ok: true, calendar: session.getSeasonCalendar(year) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/player") {
    const playerId = url.searchParams.get("playerId");
    if (!playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const profile = session.getPlayerProfile(String(playerId));
    if (!profile) {
      sendJson(res, 404, { ok: false, error: "Player not found." });
      return true;
    }
    sendJson(res, 200, { ok: true, profile });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/transactions") {
    const team = url.searchParams.get("team");
    const type = url.searchParams.get("type");
    const year = toInt(url.searchParams.get("year"));
    const limit = Math.max(1, Math.min(2000, toInt(url.searchParams.get("limit")) || 250));
    sendJson(res, 200, {
      ok: true,
      transactions: session.getTransactionLog({
        limit,
        team: team || null,
        type: type || null,
        year
      })
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/draft/prepare") {
    const draft = session.prepareDraft();
    sendJson(res, 200, { ok: true, draft, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/scouting") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    const limit = Math.max(10, Math.min(300, toInt(url.searchParams.get("limit")) || 120));
    sendJson(res, 200, { ok: true, scouting: session.getScoutingBoard({ teamId, limit }) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/scouting/allocate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const result = session.allocateScoutingPoints({
      teamId: String(body.teamId || session.controlledTeamId).toUpperCase(),
      playerId: String(body.playerId),
      points: toInt(body.points) || 10
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/scouting/lock-board") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !Array.isArray(body.playerIds)) {
      sendJson(res, 400, { ok: false, error: "playerIds[] required." });
      return true;
    }
    const result = session.lockDraftBoard({
      teamId: String(body.teamId || session.controlledTeamId).toUpperCase(),
      playerIds: body.playerIds.map((id) => String(id))
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/draft/user-pick") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const result = session.draftUserPick({ playerId: String(body.playerId) });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/draft/cpu") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const result = session.runCpuDraft({
      picks: Math.max(1, Math.min(224, toInt(body.picks) || 224)),
      untilUserPick: body.untilUserPick !== false
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tables/player-season") {
    const category = url.searchParams.get("category") || "passing";
    const year = toInt(url.searchParams.get("year"));
    const position = url.searchParams.get("position");
    const team = url.searchParams.get("team");
    const rows = session.getTables({
      table: "playerSeason",
      category,
      filters: { year, position, team }
    });
    sendJson(res, 200, { ok: true, category, rows });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tables/player-career") {
    const category = url.searchParams.get("category") || "passing";
    const position = url.searchParams.get("position");
    const team = url.searchParams.get("team");
    const rows = session.getTables({
      table: "playerCareer",
      category,
      filters: { position, team }
    });
    sendJson(res, 200, { ok: true, category, rows });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tables/team-season") {
    const year = toInt(url.searchParams.get("year"));
    const team = url.searchParams.get("team");
    const conference = url.searchParams.get("conference");
    const division = url.searchParams.get("division");
    const rows = session.getTables({
      table: "teamSeason",
      filters: { year, team, conference, division }
    });
    sendJson(res, 200, { ok: true, rows });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/records") {
    sendJson(res, 200, { ok: true, records: session.statBook.getRecords() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/champions") {
    sendJson(res, 200, { ok: true, champions: session.league.champions });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/calibration") {
    sendJson(res, 200, {
      ok: true,
      profile: session.realismProfile,
      latestReport: session.lastCalibrationReport
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/staff") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    const staff = session.getStaff(teamId);
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
    const result = session.updateStaff({
      teamId: String(body.teamId).toUpperCase(),
      role: String(body.role),
      name: body.name || null,
      playcalling: body.playcalling,
      development: body.development,
      discipline: body.discipline,
      yearsRemaining: body.yearsRemaining
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, { ok: true, settings: session.getLeagueSettings() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const settings = session.updateLeagueSettings(body);
    sendJson(res, 200, { ok: true, settings, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/offseason/pipeline") {
    sendJson(res, 200, { ok: true, pipeline: session.getOffseasonPipeline() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/offseason/advance") {
    const result = session.advanceOffseasonPipeline();
    sendJson(res, 200, { ok: true, pipeline: result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/owner") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    const owner = session.getOwnerState(teamId);
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
    const result = session.updateOwnerState({
      teamId,
      ticketPrice: toNumber(body.ticketPrice),
      staffBudget: toNumber(body.staffBudget),
      training: toNumber(body.training),
      rehab: toNumber(body.rehab),
      analytics: toNumber(body.analytics)
    });
    sendJson(res, result.ok ? 200 : 400, { ...result, state: session.getDashboardState() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const limit = Math.max(1, Math.min(3000, toInt(url.searchParams.get("limit")) || 250));
    const year = toInt(url.searchParams.get("year"));
    const type = url.searchParams.get("type");
    sendJson(res, 200, { ok: true, events: session.getEventLog({ limit, year, type: type || null }) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/warehouse") {
    const year = toInt(url.searchParams.get("year")) || session.currentYear;
    const teamId = url.searchParams.get("team");
    sendJson(res, 200, {
      ok: true,
      snapshot: session.getWarehouseSnapshot({ year, teamId: teamId ? String(teamId).toUpperCase() : null })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/calibration/jobs") {
    const limit = toInt(url.searchParams.get("limit")) || 40;
    sendJson(res, 200, { ok: true, jobs: session.listCalibrationJobs(limit) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/calibration/jobs") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const year = toInt(body.year) || session.currentYear;
    const samples = toInt(body.samples) || 20;
    const label = body.label ? String(body.label) : "manual";
    const job = session.runAutoCalibrationJob({ year, samples, label });
    sendJson(res, 200, { ok: true, job });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/observability") {
    sendJson(res, 200, {
      ok: true,
      runtime: session.getObservability(),
      server: {
        ...serverMetrics,
        uptimeSeconds: Math.floor((Date.now() - serverMetrics.startedAt) / 1000)
      }
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/system/persistence") {
    sendJson(res, 200, { ok: true, persistence: getPersistenceDescriptor() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/jobs/simulate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const seasons = Math.max(1, Math.min(200, toInt(body.seasons) || 10));
    const job = createSimulationJob(seasons);
    sendJson(res, 202, { ok: true, job });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/jobs/simulate") {
    const id = url.searchParams.get("id");
    if (!id) {
      sendJson(res, 200, {
        ok: true,
        jobs: [...simJobs.values()]
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 30)
      });
      return true;
    }
    const job = simJobs.get(String(id));
    if (!job) {
      sendJson(res, 404, { ok: false, error: "Job not found." });
      return true;
    }
    sendJson(res, 200, { ok: true, job });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/compare/players") {
    const ids = (url.searchParams.get("ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 8);
    const profiles = ids
      .map((id) => session.getPlayerProfile(id))
      .filter(Boolean)
      .map((profile) => profile.player);
    sendJson(res, 200, { ok: true, players: profiles });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/news") {
    const year = toInt(url.searchParams.get("year"));
    const teamId = url.searchParams.get("team");
    const limit = Math.max(1, Math.min(500, toInt(url.searchParams.get("limit")) || 80));
    sendJson(res, 200, {
      ok: true,
      news: session.getNewsFeed({ limit, year, teamId: teamId ? String(teamId).toUpperCase() : null })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/analytics") {
    const year = toInt(url.searchParams.get("year")) || session.currentYear;
    const teamId = url.searchParams.get("team");
    sendJson(res, 200, {
      ok: true,
      analytics: session.getLeagueAnalytics({ year, teamId: teamId ? String(teamId).toUpperCase() : null })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/qa/season") {
    const year = toInt(url.searchParams.get("year")) || session.currentYear;
    sendJson(res, 200, { ok: true, report: session.getQaReport(year) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/realism/verify") {
    const seasons = toInt(url.searchParams.get("seasons")) || 12;
    const report = session.runRealismVerification({ seasons });
    sendJson(res, 200, { ok: true, report });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/history/team") {
    const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
    sendJson(res, 200, { ok: true, history: session.getTeamHistory(teamId) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/history/player") {
    const playerId = url.searchParams.get("playerId");
    if (!playerId) {
      sendJson(res, 400, { ok: false, error: "playerId required." });
      return true;
    }
    const timeline = session.getPlayerTimeline(String(playerId));
    if (!timeline) {
      sendJson(res, 404, { ok: false, error: "Player not found." });
      return true;
    }
    sendJson(res, 200, { ok: true, timeline });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/saves") {
    sendJson(res, 200, { ok: true, slots: listSaveSlots() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/backups") {
    sendJson(res, 200, { ok: true, slots: listBackupSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/saves/save") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const saved = saveSessionToSlot(String(body.slot), session.toSnapshot());
    sendJson(res, 200, { ok: true, saved, slots: listSaveSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/saves/load") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const snapshot = loadSessionFromSlot(String(body.slot));
    if (!snapshot) {
      sendJson(res, 404, { ok: false, error: "Save slot not found." });
      return true;
    }
    session = createSessionFromSnapshot(snapshot);
    sendJson(res, 200, { ok: true, state: session.getDashboardState(), slots: listSaveSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/backups/load") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const snapshot = loadSessionFromSlot(String(body.slot));
    if (!snapshot) {
      sendJson(res, 404, { ok: false, error: "Backup slot not found." });
      return true;
    }
    session = createSessionFromSnapshot(snapshot);
    sendJson(res, 200, { ok: true, state: session.getDashboardState(), slots: listBackupSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/saves/delete") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const deleted = deleteSaveSlot(String(body.slot));
    sendJson(res, 200, { ok: true, deleted, slots: listSaveSlots() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/backups/delete") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!body || !body.slot) {
      sendJson(res, 400, { ok: false, error: "slot is required." });
      return true;
    }
    const deleted = deleteSaveSlot(String(body.slot));
    sendJson(res, 200, { ok: true, deleted, slots: listBackupSlots() });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  serverMetrics.requests += 1;
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      serverMetrics.apiRequests += 1;
      const handled = await handleApi(req, res, url);
      if (!handled) sendJson(res, 404, { ok: false, error: "Unknown API route." });
      trackRouteMetric(url.pathname, Date.now() - started);
      session.trackCounter("api-request");
      session.trackTiming(`api:${url.pathname}`, Date.now() - started);
      return;
    }
    serveStatic(url.pathname, res);
    trackRouteMetric(`static:${url.pathname}`, Date.now() - started);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Internal server error." });
    trackRouteMetric("error", Date.now() - started);
  }
});

server.listen(PORT, () => {
  console.log(`${GAME_NAME} running at http://localhost:${PORT}`);
});
