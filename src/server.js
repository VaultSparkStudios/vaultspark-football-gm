import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { GAME_NAME } from "./config.js";
import { corsHeadersFor, resolveAllowedOrigins } from "./app/devCors.js";
import { recordWinPct } from "./stats/teamRecord.js";
import { createSession } from "./runtime/bootstrap.js";
import { saveRollingBackup } from "./runtime/saveStore.js";
import { authorizeCommand, TEAM_SCOPED_COMMANDS } from "./runtime/franchiseAuthority.js";
import {
  applySecurityHeaders,
  isPathInsideBaseDir,
  readRequestBody,
  resolveClientAddress,
  stopOversizeUpload
} from "./server/httpHardening.js";
import { handleLeagueRoutes } from "./server/routes/league.js";
import { handleRosterRoutes } from "./server/routes/roster.js";
import { handleFreeAgencyRoutes } from "./server/routes/freeAgency.js";
import { handleTradesRoutes } from "./server/routes/trades.js";
import { handleContractsRoutes } from "./server/routes/contracts.js";
import { handleDraftRoutes } from "./server/routes/draft.js";
import { handleStatsRoutes } from "./server/routes/stats.js";
import { handleFranchiseOfficeRoutes } from "./server/routes/franchiseOffice.js";
import { handleSavesRoutes } from "./server/routes/saves.js";
import { handleCommissionerRoutes } from "./server/routes/commissioner.js";
import { handleDiagnosticsRoutes } from "./server/routes/diagnostics.js";

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.resolve("public");
const SRC_DIR = path.resolve("src");
// Fail-closed: an empty configuration allows the local dev origins only (S109).
const ALLOWED_ORIGINS = resolveAllowedOrigins(process.env);

let session = null;
let sessionReady = false;

function ensureSession() {
  if (!sessionReady) {
    session = createSession();
    sessionReady = true;
  }
  return session;
}

const CURRENT_YEAR = new Date().getFullYear();
const serverMetrics = {
  startedAt: Date.now(),
  requests: 0,
  apiRequests: 0,
  routeHits: {},
  routeTiming: {}
};
const simJobs = new Map();
let serverLobby = null;
let serverSpeedrunChallenge = null;
let serverSpeedrunLeaderboard = [];
let serverRewindSequence = 0;
let serverRewindSnapshots = [];
const serverRewindStates = new Map();

function takeServerRewindSnapshot(trigger = "manual", label = "Manual snapshot") {
  const id = [
    "server-rw",
    ++serverRewindSequence,
    session.currentYear,
    session.currentWeek
  ].join("-");
  const meta = {
    id,
    trigger,
    label,
    year: session.currentYear,
    week: session.currentWeek,
    phase: session.phase,
    createdAt: new Date().toISOString()
  };
  serverRewindStates.set(id, session.toSnapshot());
  serverRewindSnapshots.unshift(meta);
  while (serverRewindSnapshots.length > 10) {
    const removed = serverRewindSnapshots.pop();
    serverRewindStates.delete(removed.id);
  }
  return meta;
}

function commissionerIntentSessionAdapter() {
  return {
    call: async (action, params = {}) => {
      if (action === "propose-trade") {
        return session.tradePlayers({
          teamA: String(params.teamA || "").toUpperCase(),
          teamB: String(params.teamB || "").toUpperCase(),
          teamAPlayerIds: (params.teamAPlayerIds || []).map(String),
          teamBPlayerIds: (params.teamBPlayerIds || []).map(String),
          teamAPickIds: (params.teamAPickIds || []).map(String),
          teamBPickIds: (params.teamBPickIds || []).map(String)
        });
      }
      if (action === "sign-free-agent") {
        return session.signFreeAgent({
          teamId: String(params.teamId || "").toUpperCase(),
          playerId: String(params.playerId || "")
        });
      }
      if (action === "release-player") {
        return session.releasePlayer({
          teamId: String(params.teamId || "").toUpperCase(),
          playerId: String(params.playerId || ""),
          june1: params.june1 === true,
          toWaivers: params.toWaivers !== false
        });
      }
      if (action === "update-depth-chart") {
        return session.setDepthChart({
          teamId: String(params.teamId || "").toUpperCase(),
          position: String(params.position || "").toUpperCase(),
          playerIds: (params.playerIds || []).map(String),
          snapShares: params.snapShares || null
        });
      }
      if (action === "restructure-contract") {
        return session.restructurePlayerContract({
          teamId: String(params.teamId || "").toUpperCase(),
          playerId: String(params.playerId || "")
        });
      }
      return { ok: false, error: "Unknown commissioner intent action: " + action };
    }
  };
}

// ── Rate limiter (fixed 60s window counter, 50 req/min per client) ──────────
// The client key is the socket peer; forwarding headers are honoured only when
// VSFGM_TRUST_PROXY is set (see resolveClientAddress).
// VSFGM_RATE_LIMIT_PER_MIN overrides the per-minute budget. UI test harnesses
// poll far faster than a human and self-throttle into 429s — see CI run
// 26991314776, where Playwright tripped the limit the first time the UI suite
// ever executed in Actions. Production default stays 50.
let _jobIdSeq = 0;
const SIM_JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes
const rateBuckets = new Map();
const RATE_LIMIT_PER_MIN = Number(process.env.VSFGM_RATE_LIMIT_PER_MIN) > 0
  ? Number(process.env.VSFGM_RATE_LIMIT_PER_MIN)
  : 50;

function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > 60_000) {
    bucket = { count: 0, windowStart: now };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  // Prune stale buckets when map grows large
  if (rateBuckets.size > 2000) {
    for (const [k, v] of rateBuckets) {
      if (now - v.windowStart > 120_000) rateBuckets.delete(k);
    }
  }
  return bucket.count <= RATE_LIMIT_PER_MIN;
}

// S86 [audit #7] — shared exclusivity predicate; the client runtime carries the
// same one so both runtimes answer a duplicate launch identically.
function activeSimulationJob() {
  for (const job of simJobs.values()) {
    if (job.status === "queued" || job.status === "running") return job;
  }
  return null;
}

function pruneSimJobs() {
  const now = Date.now();
  for (const [id, job] of simJobs) {
    const fetched = job.fetchedAt && (now - job.fetchedAt > SIM_JOB_TTL_MS);
    const stale = now - job.createdAt > SIM_JOB_TTL_MS * 3;
    if (fetched || stale) simJobs.delete(id);
  }
}

function validateParam(value, { type, min, max, allow } = {}) {
  if (value == null) return true; // optional
  if (type === "int") {
    const n = Number(value);
    if (!Number.isInteger(n)) return false;
    if (min != null && n < min) return false;
    if (max != null && n > max) return false;
  }
  if (type === "string" && allow) {
    if (!allow.includes(String(value))) return false;
  }
  return true;
}


function generateSeasonArcs(sess) {
  try {
    const d = typeof sess.getDashboardState === "function" ? sess.getDashboardState() : {};
    const team = d.controlledTeam || {};
    const standings = d.latestStandings || [];
    const myRow = standings.find((r) => r.team === (team.abbrev || team.id)) || {};
    const winPct = recordWinPct(myRow);
    const arcs = [];
    const qb = (team.roster || []).find((p) => p.position === "QB");
    if (qb) {
      const isRookie = (qb.age || 25) <= 23;
      const isVet = (qb.age || 25) >= 33;
      arcs.push({
        id: "qb-arc", type: "QB_JOURNEY", icon: "🏈",
        title: isRookie ? `Can ${qb.name} handle the pressure?` : isVet ? `Is ${qb.name}'s window closing?` : `Can ${qb.name} take the next step?`,
        status: winPct >= 0.5 ? "on-track" : "at-risk", resolved: null
      });
    }
    arcs.push({
      id: "playoff-arc", type: "PLAYOFF_HUNT", icon: "🏆",
      title: winPct >= 0.6 ? "Can you hold the division lead?" : winPct <= 0.35 ? "Is the season already lost?" : "Can you sneak into the playoffs?",
      status: winPct >= 0.5 ? "on-track" : "at-risk", resolved: null
    });
    const topNeed = (d.rosterNeeds || []).slice().sort((a, b) => a.delta - b.delta)[0];
    if (topNeed) {
      arcs.push({
        id: "roster-arc", type: "ROSTER_QUESTION", icon: "🔧",
        title: `Will your ${topNeed.position} room hold up all season?`,
        status: Math.abs(topNeed.delta) > 2 ? "at-risk" : "on-track", resolved: null
      });
    }
    return arcs;
  } catch {
    return [];
  }
}

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

function applyCorsHeaders(req, res) {
  const headers = corsHeadersFor(req.headers.origin, ALLOWED_ORIGINS);
  if (!headers) return;
  for (const [name, value] of headers) res.setHeader(name, value);
}

// readRequestBody (read-once, byte-bounded, 413 on overflow) lives in
// ./server/httpHardening.js so it can be tested without booting the server.

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
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === "/" ? "/index.html" : reqPath;
  const moduleRoot = safePath.startsWith("/src/")
    ? { baseDir: SRC_DIR, prefix: "/src" }
    : safePath.startsWith("/public/")
      ? { baseDir: PUBLIC_DIR, prefix: "/public" }
      : { baseDir: PUBLIC_DIR, prefix: "" };
  const { baseDir } = moduleRoot;
  const relativePath = moduleRoot.prefix ? safePath.slice(moduleRoot.prefix.length) : safePath;
  const resolved = path.resolve(baseDir, `.${relativePath}`);
  if (!isPathInsideBaseDir(resolved, baseDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    sendText(res, 404, "Not Found");
    return;
  }
  let content = fs.readFileSync(resolved);
  // Source HTML declares the client-only deployed truth; a live dev server is
  // the one environment where the server runtime genuinely exists, so it
  // rewrites the runtime metas the same way the Pages build does.
  if (resolved.endsWith(".html")) {
    content = content
      .toString("utf8")
      .replace(/<meta name="vsfgm-runtime-default" content="[^"]*" \/>/, '<meta name="vsfgm-runtime-default" content="server" />')
      .replace(/<meta name="vsfgm-server-available" content="[^"]*" \/>/, '<meta name="vsfgm-server-available" content="true" />');
  }
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
  const id = `JOB-${Date.now()}-${(++_jobIdSeq).toString(36).padStart(4, "0")}`;
  const job = {
    id,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + SIM_JOB_TTL_MS * 3,
    fetchedAt: null,
    totalSeasons,
    completedSeasons: 0,
    progress: 0,
    results: []
  };
  simJobs.set(id, job);
  setTimeout(() => runSimulationJob(id), 0);
  return job;
}

// ── API route modules (src/server/routes/*.js) ─────────────────────────────
// Each module owns one domain and returns true when it handled the request.
// Route keys are exact method+path pairs and none is registered twice (pinned by
// test/server-route-split.test.js), so at most one module can match a request
// and the first-match dispatch below answers exactly as the single handleApi did.
const API_ROUTE_HANDLERS = Object.freeze([
  handleLeagueRoutes,
  handleRosterRoutes,
  handleFreeAgencyRoutes,
  handleTradesRoutes,
  handleContractsRoutes,
  handleDraftRoutes,
  handleStatsRoutes,
  handleFranchiseOfficeRoutes,
  handleSavesRoutes,
  handleCommissionerRoutes,
  handleDiagnosticsRoutes
]);

// The explicit context every route module receives. Mutable server state is
// exposed through accessors so modules always read (and write) the current
// value — a new league, a load or a rewind replaces `session` here.
const routeContext = {
  get session() { return session; },
  set session(value) { session = value; },
  get serverLobby() { return serverLobby; },
  set serverLobby(value) { serverLobby = value; },
  get serverSpeedrunChallenge() { return serverSpeedrunChallenge; },
  set serverSpeedrunChallenge(value) { serverSpeedrunChallenge = value; },
  get serverSpeedrunLeaderboard() { return serverSpeedrunLeaderboard; },
  set serverSpeedrunLeaderboard(value) { serverSpeedrunLeaderboard = value; },
  get serverRewindSnapshots() { return serverRewindSnapshots; },
  set serverRewindSnapshots(value) { serverRewindSnapshots = value; },
  CURRENT_YEAR,
  activeSimulationJob,
  assertFields,
  commissionerIntentSessionAdapter,
  createSimulationJob,
  generateSeasonArcs,
  parseJsonBody,
  sendJson,
  serverMetrics,
  serverRewindStates,
  simJobs,
  takeServerRewindSnapshot,
  toBool,
  toInt,
  toNumber,
  writeAutoBackup
};

async function handleApi(req, res, url) {
  ensureSession();

  // ── Franchise authority boundary (S63) ──────────────────────────────────────
  // One seam, checked before any mutating route body is acted on, shared verbatim
  // with src/app/api/localApiRuntime.js so the two adapters cannot drift. The body
  // is buffered on the request, so each route's own readRequestBody call is
  // unaffected.
  if (req.method === "POST" && TEAM_SCOPED_COMMANDS[url.pathname]) {
    const authorityDenial = authorizeCommand({
      session,
      route: url.pathname,
      body: parseJsonBody(await readRequestBody(req)),
      lobby: serverLobby
    });
    if (authorityDenial) {
      sendJson(res, authorityDenial.status, authorityDenial.payload);
      return true;
    }
  }

  for (const handleRoutes of API_ROUTE_HANDLERS) {
    if (await handleRoutes(req, res, url, routeContext)) return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  serverMetrics.requests += 1;
  try {
    applySecurityHeaders(res);
    applyCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      serverMetrics.apiRequests += 1;
      // Rate limiting — exempt health/static, apply to all API calls
      const clientIp = resolveClientAddress(req);
      if (!checkRateLimit(clientIp)) {
        sendJson(res, 429, { ok: false, error: "Too many requests. Please wait a moment." });
        return;
      }
      // Periodic sim-job TTL pruning (every 50 API requests)
      if (serverMetrics.apiRequests % 50 === 0) pruneSimJobs();
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
    // Deliberate client errors (e.g. 413 from readRequestBody) carry `expose`;
    // anything else is logged here and answered generically so runtime
    // internals never reach the client.
    const exposed = error?.expose === true && Number(error.status) >= 400 && Number(error.status) < 500;
    if (!exposed) console.error(`[server] ${req.method} ${req.url} failed:`, error);
    if (!res.headersSent) {
      if (exposed) {
        sendJson(res, Number(error.status), { ok: false, error: error.message });
      } else {
        sendJson(res, 500, { ok: false, error: "Internal server error." });
      }
    } else if (!res.writableEnded) {
      res.end();
    }
    // An oversized upload may still be streaming: stop it once the 413 is flushed.
    if (error?.code === "BODY_TOO_LARGE") stopOversizeUpload(req, res);
    trackRouteMetric("error", Date.now() - started);
  }
});

server.listen(PORT, () => {
  console.log(`${GAME_NAME} running at http://localhost:${PORT}`);
  console.log(`CORS allows: ${[...ALLOWED_ORIGINS].join(", ")}`);
});
