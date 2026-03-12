import { createBrowserSaveStore } from "../../adapters/persistence/browserSaveStore.js";
import { createPersistenceDescriptor } from "../../adapters/persistence/saveStoreShared.js";
import { getLeagueConfigCatalog, getLeagueConfigSummary, resolveLeagueSettings } from "../../config/leagueSetup.js";
import { createLeagueBase } from "../../domain/teamFactory.js";
import { GameSession } from "../../runtime/GameSession.js";
import { applyInitialLeagueSetup } from "../../runtime/applyLeagueSetup.js";
import { RNG } from "../../utils/rng.js";
import { RNGStreams } from "../../utils/rngStreams.js";

function jsonResponse(status, payload) {
  return { status, ok: status >= 200 && status < 300, payload };
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

function buildSession({
  seed = Date.now(),
  startYear = new Date().getFullYear(),
  mode = "drive",
  controlledTeamId = "BUF"
} = {}) {
  const rng = new RNG(seed);
  return new GameSession({
    rng,
    rngStreams: new RNGStreams(seed, RNG),
    startYear,
    mode,
    controlledTeamId
  });
}

function sessionFromSnapshot(snapshot) {
  return GameSession.fromSnapshot(snapshot, (seed) => new RNG(seed));
}

function toSetupTeamIdentity(team) {
  return {
    id: team.id,
    abbrev: team.abbrev || team.id,
    name: team.name,
    city: team.city || null,
    nickname: team.nickname || null,
    conference: team.conference,
    division: team.division
  };
}

export function createLocalApiRuntime({
  storage,
  now = () => Date.now(),
  currentYear = new Date().getFullYear(),
  scheduler = (fn) => setTimeout(fn, 0)
} = {}) {
  const saveStore = createBrowserSaveStore({
    storage,
    now: () => new Date(now()).toISOString()
  });
  const setupBootstrap = createLeagueBase(currentYear);
  const defaultSettings = resolveLeagueSettings();
  const defaultSetupState = {
    phase: "regular-season",
    currentYear,
    currentWeek: 1,
    seasonsSimulated: 0,
    mode: "drive",
    controlledTeamId: "BUF",
    controlledTeamName: null,
    controlledTeamAbbrev: null,
    teams: setupBootstrap.teams.map(toSetupTeamIdentity)
  };
  let session = null;
  const simJobs = new Map();
  const runtimeMetrics = {
    startedAt: now(),
    requests: 0,
    routeHits: {},
    routeTiming: {},
    lastAutoBackupWarning: null
  };

  function ensureSession() {
    if (!session) {
      session = buildSession({ startYear: currentYear });
    }
    return session;
  }

  function trackRouteMetric(route, durationMs) {
    runtimeMetrics.routeHits[route] = (runtimeMetrics.routeHits[route] || 0) + 1;
    const timing = runtimeMetrics.routeTiming[route] || { count: 0, totalMs: 0, avgMs: 0 };
    timing.count += 1;
    timing.totalMs += durationMs;
    timing.avgMs = Number((timing.totalMs / timing.count).toFixed(2));
    runtimeMetrics.routeTiming[route] = timing;
  }

  function writeAutoBackup(reason) {
    const activeSession = ensureSession();
    try {
      const saved = saveStore.saveRollingBackup(activeSession.toSnapshot(), {
        reason,
        year: activeSession.currentYear,
        week: activeSession.currentWeek,
        phase: activeSession.phase,
        maxBackups: 60
      });
      runtimeMetrics.lastAutoBackupWarning = null;
      return saved;
    } catch (error) {
      runtimeMetrics.lastAutoBackupWarning = error?.message || "Automatic browser backup failed.";
      console.warn("Auto-backup skipped:", runtimeMetrics.lastAutoBackupWarning);
      return null;
    }
  }

  function runSimulationJob(jobId) {
    const job = simJobs.get(jobId);
    if (!job || job.status === "cancelled" || job.status === "completed" || job.status === "failed") return;
    const activeSession = ensureSession();
    job.status = "running";
    const batchSize = Math.min(4, Math.max(1, Math.floor(job.totalSeasons / 25) || 1));
    const started = now();
    try {
      for (let i = 0; i < batchSize && job.completedSeasons < job.totalSeasons; i += 1) {
        const summary = activeSession.simulateOneSeason({ runOffseasonAfter: true });
        job.results.push(summary);
        job.completedSeasons += 1;
      }
      job.progress = Number(((job.completedSeasons / Math.max(1, job.totalSeasons)) * 100).toFixed(2));
      job.updatedAt = now();
      if (job.completedSeasons >= job.totalSeasons) {
        job.status = "completed";
        writeAutoBackup("job-sim");
        return;
      }
      scheduler(() => runSimulationJob(jobId));
    } catch (error) {
      job.status = "failed";
      job.error = error?.message || "Simulation job failed.";
    } finally {
      trackRouteMetric("background-job-sim", now() - started);
    }
  }

  function createSimulationJob(totalSeasons) {
    const id = `JOB-${now()}-${Math.floor(Math.random() * 1e6)}`;
    const job = {
      id,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      totalSeasons,
      completedSeasons: 0,
      progress: 0,
      results: []
    };
    simJobs.set(id, job);
    scheduler(() => runSimulationJob(id));
    return job;
  }

  async function request(path, { method = "GET", body = null } = {}) {
    const started = now();
    runtimeMetrics.requests += 1;
    const url = new URL(path, "http://local");
    const pathname = url.pathname;

    const finish = (response) => {
      trackRouteMetric(pathname, now() - started);
      if (session) {
        session.trackCounter("api-request");
        session.trackTiming(`api:${pathname}`, now() - started);
      }
      return response;
    };

    try {
      if (method === "GET" && pathname === "/api/setup/init") {
        const setupStarted = now();
        const activeSession = session;
        const setup = activeSession ? activeSession.getSetupState() : defaultSetupState;
        const setupStateMs = now() - setupStarted;
        const includeSaves = toBool(url.searchParams.get("includeSaves"), true);
        const includeBackups = toBool(url.searchParams.get("includeBackups"), false);
        const savesStarted = now();
        const saves = includeSaves ? saveStore.listSaveSlots() : [];
        const savesMs = includeSaves ? now() - savesStarted : 0;
        const backupsStarted = now();
        const backups = includeBackups ? saveStore.listBackupSlots() : [];
        const backupsMs = includeBackups ? now() - backupsStarted : 0;
        return finish(
          jsonResponse(200, {
            ok: true,
            currentYear,
            saves,
            savesDeferred: !includeSaves,
            backups,
            backupsDeferred: !includeBackups,
            activeLeague: activeSession
              ? {
                  phase: setup.phase,
                  currentYear: setup.currentYear,
                  currentWeek: setup.currentWeek,
                  seasonsSimulated: setup.seasonsSimulated,
                  mode: setup.mode,
                  controlledTeamId: setup.controlledTeamId,
                  controlledTeamName: setup.controlledTeamName,
                  controlledTeamAbbrev: setup.controlledTeamAbbrev,
                  configSummary: getLeagueConfigSummary(activeSession.getLeagueSettings())
                }
              : null,
            teams: setup.teams,
            settings: activeSession ? activeSession.getLeagueSettings() : defaultSettings,
            configCatalog: getLeagueConfigCatalog(),
            diagnostics: {
              setup: {
                runtime: "browser",
                bootstrapMode: activeSession ? "active-session" : "catalog-only",
                setupStateMs,
                savesMs,
                backupsMs,
                totalMs: now() - setupStarted,
                savesDeferred: !includeSaves,
                backupsDeferred: !includeBackups
              }
            }
          })
        );
      }

      ensureSession();

      if (method === "GET" && pathname === "/api/state") {
        return finish(jsonResponse(200, session.getDashboardState()));
      }

      if (method === "POST" && pathname === "/api/new-league") {
        if (body?.pfrPath || body?.realismProfilePath || body?.careerRealismProfilePath) {
          return finish(
            jsonResponse(400, {
              ok: false,
              error: "Client-only mode does not support filesystem PFR or realism profile paths."
            })
          );
        }
        session = buildSession({
          seed: toInt(body?.seed) || now(),
          startYear: toInt(body?.startYear) || currentYear,
          mode: body?.mode === "play" ? "play" : "drive",
          controlledTeamId: body?.controlledTeamId || "BUF"
        });
        session.league.settings = resolveLeagueSettings(
          {
            eraProfile: body?.eraProfile || "modern",
            franchiseArchetype: body?.franchiseArchetype || "balanced",
            rulesPreset: body?.rulesPreset || "standard",
            difficultyPreset: body?.difficultyPreset || "standard",
            challengeMode: body?.challengeMode || "open",
            enableOwnerMode: toBool(body?.enableOwnerMode, true),
            enableNarratives: toBool(body?.enableNarratives, true),
            enableCompPicks: toBool(body?.enableCompPicks, true),
            enableChemistry: toBool(body?.enableChemistry, true)
          },
          session.getLeagueSettings()
        );
        session.league.scouting.weeklyPoints = session.league.settings.scoutingWeeklyPoints;
        applyInitialLeagueSetup(session, session.controlledTeamId);
        writeAutoBackup("new-league");
        return finish(jsonResponse(200, { ok: true, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/control-team") {
        if (!body?.teamId) return finish(jsonResponse(400, { ok: false, error: "teamId is required." }));
        const teamId = session.setControlledTeam(String(body.teamId).toUpperCase());
        return finish(jsonResponse(200, { ok: true, teamId, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/advance-season") {
        const count = Math.max(1, Math.min(100, toInt(body?.count) || 1));
        const results = session.simulateSeasons(count, { runOffseasonAfterLast: true });
        writeAutoBackup("season-sim");
        return finish(jsonResponse(200, { ok: true, count, results, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/advance-week") {
        const count = Math.max(1, Math.min(40, toInt(body?.count) || 1));
        const results = [];
        for (let i = 0; i < count; i += 1) results.push(session.advanceWeek());
        writeAutoBackup(results[results.length - 1]?.phase === "offseason" ? "offseason-checkpoint" : "week");
        return finish(jsonResponse(200, { ok: true, count, results, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/roster") {
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
        return finish(jsonResponse(200, { ok: true, teamId, roster, cap: session.getTeamCapSummary(teamId) }));
      }

      if (method === "POST" && pathname === "/api/roster/designation") {
        if (!body?.teamId || !body?.playerId || !body?.designation) {
          return finish(jsonResponse(400, { ok: false, error: "teamId, playerId, designation required." }));
        }
        const result = session.setPlayerDesignation({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          designation: String(body.designation),
          active: body.active !== false
        });
        return finish(
          jsonResponse(result.ok ? 200 : 400, {
            ...result,
            roster: session.getRoster(String(body.teamId).toUpperCase()),
            state: session.getDashboardState()
          })
        );
      }

      if (method === "GET" && pathname === "/api/free-agents") {
        const position = url.searchParams.get("position");
        const limit = toInt(url.searchParams.get("limit")) || 200;
        const minOverall = toInt(url.searchParams.get("minOverall"));
        const minAge = toInt(url.searchParams.get("minAge"));
        const maxAge = toInt(url.searchParams.get("maxAge"));
        return finish(
          jsonResponse(200, {
            ok: true,
            freeAgents: session.getFreeAgents({ position, limit, minOverall, minAge, maxAge })
          })
        );
      }

      if (method === "GET" && pathname === "/api/retired") {
        const position = url.searchParams.get("position");
        const limit = toInt(url.searchParams.get("limit")) || 250;
        const minOverall = toInt(url.searchParams.get("minOverall"));
        const minAge = toInt(url.searchParams.get("minAge"));
        const maxAge = toInt(url.searchParams.get("maxAge"));
        return finish(
          jsonResponse(200, {
            ok: true,
            retired: session.getRetiredPlayers({ position, limit, minOverall, minAge, maxAge })
          })
        );
      }

      if (method === "GET" && pathname === "/api/players/search") {
        const query = url.searchParams.get("q") || "";
        const limit = toInt(url.searchParams.get("limit")) || 20;
        const includeRetired = url.searchParams.get("includeRetired") !== "0";
        return finish(
          jsonResponse(200, {
            ok: true,
            players: session.searchPlayers({ query, limit, includeRetired })
          })
        );
      }

      if (method === "GET" && pathname === "/api/free-agency/market") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        const limit = toInt(url.searchParams.get("limit")) || 60;
        return finish(jsonResponse(200, { ok: true, market: session.getFreeAgencyMarket({ teamId, limit }) }));
      }

      if (method === "POST" && pathname === "/api/free-agency/offer") {
        if (!body?.teamId || !body?.playerId) {
          return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        }
        const teamId = String(body.teamId).toUpperCase();
        const result = session.submitFreeAgencyOffer({
          teamId,
          playerId: String(body.playerId),
          years: toInt(body.years) || 2,
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(
          jsonResponse(result.ok ? 200 : 400, {
            ...result,
            market: session.getFreeAgencyMarket({ teamId }),
            state: session.getDashboardState()
          })
        );
      }

      if (method === "POST" && pathname === "/api/sign") {
        if (!body?.teamId || !body?.playerId) {
          return finish(jsonResponse(400, { ok: false, error: "teamId and playerId are required." }));
        }
        const result = session.signFreeAgent({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId)
        });
        return finish(
          jsonResponse(result.ok ? 200 : 400, {
            ...result,
            state: session.getDashboardState(),
            roster: session.getRoster(String(body.teamId).toUpperCase())
          })
        );
      }

      if (method === "POST" && pathname === "/api/retirement/override") {
        if (!body?.playerId) return finish(jsonResponse(400, { ok: false, error: "playerId is required." }));
        const result = session.overrideRetirement({
          playerId: String(body.playerId),
          teamId: body.teamId ? String(body.teamId).toUpperCase() : session.controlledTeamId,
          minWinningPct: toNumber(body.minWinningPct),
          forceSign: toBool(body.forceSign, true)
        });
        return finish(
          jsonResponse(result.ok ? 200 : 400, {
            ...result,
            state: session.getDashboardState(),
            retired: session.getRetiredPlayers({ limit: 250 })
          })
        );
      }

      if (method === "POST" && pathname === "/api/release") {
        if (!body?.teamId || !body?.playerId) {
          return finish(jsonResponse(400, { ok: false, error: "teamId and playerId are required." }));
        }
        const result = session.releasePlayer({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          june1: body.june1 === true,
          toWaivers: body.toWaivers !== false
        });
        return finish(
          jsonResponse(result.ok ? 200 : 400, {
            ...result,
            state: session.getDashboardState(),
            roster: session.getRoster(String(body.teamId).toUpperCase())
          })
        );
      }

      if (method === "POST" && pathname === "/api/practice-squad") {
        if (!body?.teamId || !body?.playerId) {
          return finish(jsonResponse(400, { ok: false, error: "teamId and playerId are required." }));
        }
        const result = session.setPracticeSquad({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          moveToPractice: body.moveToPractice !== false
        });
        return finish(
          jsonResponse(result.ok ? 200 : 400, {
            ...result,
            state: session.getDashboardState(),
            roster: session.getRoster(String(body.teamId).toUpperCase())
          })
        );
      }

      if (method === "GET" && pathname === "/api/depth-chart") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        return finish(
          jsonResponse(200, {
            ok: true,
            teamId,
            depthChart: session.getDepthChart(teamId),
            snapShare: session.getDepthChartSnapShare(teamId)
          })
        );
      }

      if (method === "POST" && pathname === "/api/depth-chart") {
        if (!body?.teamId || !body?.position || !Array.isArray(body.playerIds)) {
          return finish(jsonResponse(400, { ok: false, error: "teamId, position, playerIds[] required." }));
        }
        const result = session.setDepthChart({
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
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/waiver-claim") {
        if (!body?.teamId || !body?.playerId) {
          return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        }
        const result = session.claimWaiver({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId)
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/trade") {
        if (!body?.teamA || !body?.teamB) return finish(jsonResponse(400, { ok: false, error: "teamA and teamB required." }));
        const result = session.tradePlayers({
          teamA: String(body.teamA).toUpperCase(),
          teamB: String(body.teamB).toUpperCase(),
          teamAPlayerIds: (body.teamAPlayerIds || []).map((id) => String(id)),
          teamBPlayerIds: (body.teamBPlayerIds || []).map((id) => String(id)),
          teamAPickIds: (body.teamAPickIds || []).map((id) => String(id)),
          teamBPickIds: (body.teamBPickIds || []).map((id) => String(id))
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/trade/evaluate") {
        if (!body?.teamA || !body?.teamB) return finish(jsonResponse(400, { ok: false, error: "teamA and teamB required." }));
        const result = session.evaluateTradePackage({
          teamA: String(body.teamA).toUpperCase(),
          teamB: String(body.teamB).toUpperCase(),
          teamAPlayerIds: (body.teamAPlayerIds || []).map((id) => String(id)),
          teamBPlayerIds: (body.teamBPlayerIds || []).map((id) => String(id)),
          teamAPickIds: (body.teamAPickIds || []).map((id) => String(id)),
          teamBPickIds: (body.teamBPickIds || []).map((id) => String(id))
        });
        return finish(jsonResponse(result.ok ? 200 : 400, result));
      }

      if (method === "GET" && pathname === "/api/picks") {
        const teamId = url.searchParams.get("team");
        const year = toInt(url.searchParams.get("year"));
        return finish(
          jsonResponse(200, {
            ok: true,
            picks: session.getDraftPickAssets(teamId ? String(teamId).toUpperCase() : null, { year })
          })
        );
      }

      if (method === "GET" && pathname === "/api/contracts/expiring") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        return finish(jsonResponse(200, { ok: true, teamId, players: session.listExpiringContracts(teamId) }));
      }

      if (method === "GET" && pathname === "/api/contracts/negotiations") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        return finish(jsonResponse(200, { ok: true, teamId, targets: session.listNegotiationTargets(teamId) }));
      }

      if (method === "POST" && pathname === "/api/contracts/resign") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.resignPlayer({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          years: toInt(body.years) || 3,
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/contracts/restructure") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.restructurePlayerContract({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId)
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/contracts/franchise-tag") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.applyFranchiseTagToPlayer({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/contracts/fifth-year-option") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.applyFifthYearOptionToPlayer({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/contracts/negotiate") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.negotiateAndSign({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          years: toInt(body.years),
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/draft") {
        return finish(jsonResponse(200, { ok: true, draft: session.getDraftState() }));
      }

      if (method === "POST" && pathname === "/api/draft/prepare") {
        const draft = session.prepareDraft();
        return finish(jsonResponse(200, { ok: true, draft, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/draft/cpu") {
        const result = session.runCpuDraft({
          picks: Math.max(1, Math.min(224, toInt(body?.picks) || 224)),
          untilUserPick: body?.untilUserPick !== false
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/draft/user-pick") {
        if (!body?.playerId) return finish(jsonResponse(400, { ok: false, error: "playerId required." }));
        const result = session.draftUserPick({ playerId: String(body.playerId) });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/schedule") {
        const week = toInt(url.searchParams.get("week")) || session.currentWeek;
        return finish(jsonResponse(200, { ok: true, schedule: session.getScheduleWeek(week) }));
      }

      if (method === "GET" && pathname === "/api/boxscores") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        const limit = Math.max(1, Math.min(20, toInt(url.searchParams.get("limit")) || 8));
        return finish(jsonResponse(200, { ok: true, games: session.getRecentBoxScores(teamId, limit) }));
      }

      if (method === "GET" && pathname === "/api/boxscore") {
        const gameId = url.searchParams.get("gameId");
        if (!gameId) return finish(jsonResponse(400, { ok: false, error: "gameId is required." }));
        const boxScore = session.getBoxScore(gameId);
        return finish(
          jsonResponse(boxScore ? 200 : 404, boxScore ? { ok: true, boxScore } : { ok: false, error: "Game not found." })
        );
      }

      if (method === "GET" && pathname === "/api/calendar") {
        const year = toInt(url.searchParams.get("year")) || session.currentYear;
        return finish(jsonResponse(200, { ok: true, calendar: session.getSeasonCalendar(year) }));
      }

      if (method === "GET" && pathname === "/api/player") {
        const playerId = url.searchParams.get("playerId");
        if (!playerId) return finish(jsonResponse(400, { ok: false, error: "playerId required." }));
        const seasonType = url.searchParams.get("seasonType") || "regular";
        const profile = session.getPlayerProfile(String(playerId), { seasonType });
        if (!profile) return finish(jsonResponse(404, { ok: false, error: "Player not found." }));
        return finish(jsonResponse(200, { ok: true, profile }));
      }

      if (method === "GET" && pathname === "/api/transactions") {
        const team = url.searchParams.get("team");
        const type = url.searchParams.get("type");
        const year = toInt(url.searchParams.get("year"));
        const limit = Math.max(1, Math.min(2000, toInt(url.searchParams.get("limit")) || 250));
        return finish(
          jsonResponse(200, {
            ok: true,
            transactions: session.getTransactionLog({ limit, team: team || null, type: type || null, year })
          })
        );
      }

      if (method === "GET" && pathname === "/api/scouting") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        const limit = Math.max(10, Math.min(300, toInt(url.searchParams.get("limit")) || 120));
        return finish(jsonResponse(200, { ok: true, scouting: session.getScoutingBoard({ teamId, limit }) }));
      }

      if (method === "POST" && pathname === "/api/scouting/allocate") {
        if (!body?.playerId) return finish(jsonResponse(400, { ok: false, error: "playerId required." }));
        const result = session.allocateScoutingPoints({
          teamId: String(body.teamId || session.controlledTeamId).toUpperCase(),
          playerId: String(body.playerId),
          points: toInt(body.points) || 10
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "POST" && pathname === "/api/scouting/lock-board") {
        if (!Array.isArray(body?.playerIds)) return finish(jsonResponse(400, { ok: false, error: "playerIds[] required." }));
        const result = session.lockDraftBoard({
          teamId: String(body.teamId || session.controlledTeamId).toUpperCase(),
          playerIds: body.playerIds.map((id) => String(id))
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/tables/player-season") {
        const category = url.searchParams.get("category") || "passing";
        const year = toInt(url.searchParams.get("year"));
        const position = url.searchParams.get("position");
        const team = url.searchParams.get("team");
        const seasonType = url.searchParams.get("seasonType") || "regular";
        const rows = session.getTables({ table: "playerSeason", category, filters: { year, position, team, seasonType } });
        return finish(jsonResponse(200, { ok: true, category, rows }));
      }

      if (method === "GET" && pathname === "/api/tables/player-career") {
        const category = url.searchParams.get("category") || "passing";
        const position = url.searchParams.get("position");
        const team = url.searchParams.get("team");
        const seasonType = url.searchParams.get("seasonType") || "regular";
        const rows = session.getTables({ table: "playerCareer", category, filters: { position, team, seasonType } });
        return finish(jsonResponse(200, { ok: true, category, rows }));
      }

      if (method === "GET" && pathname === "/api/tables/team-season") {
        const year = toInt(url.searchParams.get("year"));
        const team = url.searchParams.get("team");
        const conference = url.searchParams.get("conference");
        const division = url.searchParams.get("division");
        const rows = session.getTables({ table: "teamSeason", filters: { year, team, conference, division } });
        return finish(jsonResponse(200, { ok: true, rows }));
      }

      if (method === "GET" && pathname === "/api/qa/season") {
        const year = toInt(url.searchParams.get("year")) || session.currentYear;
        return finish(jsonResponse(200, { ok: true, report: session.getQaReport(year) }));
      }

      if (method === "GET" && pathname === "/api/history/team") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        return finish(jsonResponse(200, { ok: true, history: session.getTeamHistory(teamId) }));
      }

      if (method === "GET" && pathname === "/api/history/player") {
        const playerId = url.searchParams.get("playerId");
        if (!playerId) return finish(jsonResponse(400, { ok: false, error: "playerId required." }));
        const seasonType = url.searchParams.get("seasonType") || "regular";
        const timeline = session.getPlayerTimeline(String(playerId), { seasonType });
        if (!timeline) return finish(jsonResponse(404, { ok: false, error: "Player not found." }));
        return finish(jsonResponse(200, { ok: true, timeline }));
      }

      if (method === "GET" && pathname === "/api/news") {
        const year = toInt(url.searchParams.get("year"));
        const teamId = url.searchParams.get("team");
        const limit = Math.max(1, Math.min(500, toInt(url.searchParams.get("limit")) || 80));
        return finish(
          jsonResponse(200, {
            ok: true,
            news: session.getNewsFeed({ limit, year, teamId: teamId ? String(teamId).toUpperCase() : null })
          })
        );
      }

      if (method === "GET" && pathname === "/api/events") {
        const limit = Math.max(1, Math.min(3000, toInt(url.searchParams.get("limit")) || 250));
        const year = toInt(url.searchParams.get("year"));
        const type = url.searchParams.get("type");
        return finish(jsonResponse(200, { ok: true, events: session.getEventLog({ limit, year, type: type || null }) }));
      }

      if (method === "GET" && pathname === "/api/warehouse") {
        const year = toInt(url.searchParams.get("year")) || session.currentYear;
        const teamId = url.searchParams.get("team");
        return finish(
          jsonResponse(200, {
            ok: true,
            snapshot: session.getWarehouseSnapshot({ year, teamId: teamId ? String(teamId).toUpperCase() : null })
          })
        );
      }

      if (method === "GET" && pathname === "/api/compare/players") {
        const ids = (url.searchParams.get("ids") || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 8);
        const players = ids
          .map((id) => session.getPlayerProfile(id))
          .filter(Boolean)
          .map((profile) => profile.player);
        return finish(jsonResponse(200, { ok: true, players }));
      }

      if (method === "GET" && pathname === "/api/analytics") {
        const year = toInt(url.searchParams.get("year")) || session.currentYear;
        const teamId = url.searchParams.get("team");
        return finish(
          jsonResponse(200, {
            ok: true,
            analytics: session.getLeagueAnalytics({ year, teamId: teamId ? String(teamId).toUpperCase() : null })
          })
        );
      }

      if (method === "GET" && pathname === "/api/settings") {
        return finish(jsonResponse(200, { ok: true, settings: session.getLeagueSettings() }));
      }

      if (method === "POST" && pathname === "/api/settings") {
        const settings = resolveLeagueSettings(body || {}, session.getLeagueSettings());
        session.league.settings = settings;
        session.league.scouting.weeklyPoints = settings.scoutingWeeklyPoints;
        return finish(jsonResponse(200, { ok: true, settings, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/staff") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        const staff = session.getStaff(teamId);
        if (!staff) return finish(jsonResponse(404, { ok: false, error: "Team not found." }));
        return finish(jsonResponse(200, { ok: true, staff }));
      }

      if (method === "POST" && pathname === "/api/staff") {
        if (!body?.teamId || !body?.role) return finish(jsonResponse(400, { ok: false, error: "teamId and role required." }));
        const result = session.updateStaff({
          teamId: String(body.teamId).toUpperCase(),
          role: String(body.role),
          name: body.name || null,
          playcalling: body.playcalling,
          development: body.development,
          discipline: body.discipline,
          yearsRemaining: body.yearsRemaining
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/owner") {
        const teamId = (url.searchParams.get("team") || session.controlledTeamId).toUpperCase();
        const owner = session.getOwnerState(teamId);
        if (!owner) return finish(jsonResponse(404, { ok: false, error: "Team not found." }));
        return finish(jsonResponse(200, { ok: true, owner }));
      }

      if (method === "POST" && pathname === "/api/owner") {
        const check = assertFields(body, ["teamId"]);
        if (!check.ok) return finish(jsonResponse(400, { ok: false, error: check.error }));
        const result = session.updateOwnerState({
          teamId: String(body.teamId).toUpperCase(),
          ticketPrice: toNumber(body.ticketPrice),
          staffBudget: toNumber(body.staffBudget),
          training: toNumber(body.training),
          rehab: toNumber(body.rehab),
          analytics: toNumber(body.analytics)
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/observability") {
        return finish(
          jsonResponse(200, {
            ok: true,
            runtime: session.getObservability(),
            server: {
              ...runtimeMetrics,
              uptimeSeconds: Math.floor((now() - runtimeMetrics.startedAt) / 1000)
            }
          })
        );
      }

      if (method === "GET" && pathname === "/api/system/persistence") {
        return finish(
          jsonResponse(200, {
            ok: true,
            persistence: createPersistenceDescriptor(
              "browser",
              true,
              "Browser-backed persistence is active via local storage save slots and rolling backups."
            )
          })
        );
      }

      if (method === "GET" && pathname === "/api/offseason/pipeline") {
        return finish(jsonResponse(200, { ok: true, pipeline: session.getOffseasonPipeline() }));
      }

      if (method === "POST" && pathname === "/api/offseason/advance") {
        const pipeline = session.advanceOffseasonPipeline();
        return finish(jsonResponse(200, { ok: true, pipeline, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/calibration/jobs") {
        const limit = toInt(url.searchParams.get("limit")) || 40;
        return finish(jsonResponse(200, { ok: true, jobs: session.listCalibrationJobs(limit) }));
      }

      if (method === "POST" && pathname === "/api/calibration/jobs") {
        const year = toInt(body?.year) || session.currentYear;
        const samples = toInt(body?.samples) || 20;
        const label = body?.label ? String(body.label) : "manual";
        return finish(jsonResponse(200, { ok: true, job: session.runAutoCalibrationJob({ year, samples, label }) }));
      }

      if (method === "GET" && pathname === "/api/jobs/simulate") {
        const id = url.searchParams.get("id");
        if (!id) return finish(jsonResponse(200, { ok: true, jobs: [...simJobs.values()].slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 30) }));
        const job = simJobs.get(String(id));
        if (!job) return finish(jsonResponse(404, { ok: false, error: "Job not found." }));
        return finish(jsonResponse(200, { ok: true, job }));
      }

      if (method === "POST" && pathname === "/api/jobs/simulate") {
        const seasons = Math.max(1, Math.min(200, toInt(body?.seasons) || 10));
        return finish(jsonResponse(202, { ok: true, job: createSimulationJob(seasons) }));
      }

      if (method === "GET" && pathname === "/api/records") {
        return finish(jsonResponse(200, { ok: true, records: session.statBook.getRecords() }));
      }

      if (method === "GET" && pathname === "/api/champions") {
        return finish(jsonResponse(200, { ok: true, champions: session.league.champions }));
      }

      if (method === "GET" && pathname === "/api/calibration") {
        return finish(jsonResponse(200, { ok: true, profile: session.realismProfile, latestReport: session.lastCalibrationReport }));
      }

      if (method === "GET" && pathname === "/api/realism/verify") {
        const seasons = toInt(url.searchParams.get("seasons")) || 12;
        return finish(jsonResponse(200, { ok: true, report: session.runRealismVerification({ seasons }) }));
      }

      if (method === "GET" && pathname === "/api/saves") {
        return finish(jsonResponse(200, { ok: true, slots: saveStore.listSaveSlots() }));
      }

      if (method === "GET" && pathname === "/api/snapshot/export") {
        return finish(
          jsonResponse(200, {
            ok: true,
            snapshot: session.toSnapshot(),
            fileName: `vsfgm-${session.currentYear}-w${session.currentWeek}-${session.controlledTeamId}.json`
          })
        );
      }

      if (method === "POST" && pathname === "/api/snapshot/import") {
        if (!body?.snapshot || typeof body.snapshot !== "object") {
          return finish(jsonResponse(400, { ok: false, error: "snapshot object is required." }));
        }
        session = sessionFromSnapshot(body.snapshot);
        writeAutoBackup("snapshot-import");
        return finish(jsonResponse(200, { ok: true, state: session.getDashboardState() }));
      }

      if (method === "GET" && pathname === "/api/backups") {
        return finish(jsonResponse(200, { ok: true, slots: saveStore.listBackupSlots() }));
      }

      if (method === "POST" && pathname === "/api/saves/save") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        const saved = saveStore.saveSessionToSlot(String(body.slot), session.toSnapshot());
        return finish(jsonResponse(200, { ok: true, saved, slots: saveStore.listSaveSlots() }));
      }

      if (method === "POST" && pathname === "/api/saves/load") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        const snapshot = saveStore.loadSessionFromSlot(String(body.slot));
        if (!snapshot) return finish(jsonResponse(404, { ok: false, error: "Save slot not found." }));
        session = sessionFromSnapshot(snapshot);
        return finish(jsonResponse(200, { ok: true, state: session.getDashboardState(), slots: saveStore.listSaveSlots() }));
      }

      if (method === "POST" && pathname === "/api/backups/load") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        const snapshot = saveStore.loadSessionFromSlot(String(body.slot));
        if (!snapshot) return finish(jsonResponse(404, { ok: false, error: "Backup slot not found." }));
        session = sessionFromSnapshot(snapshot);
        return finish(jsonResponse(200, { ok: true, state: session.getDashboardState(), slots: saveStore.listBackupSlots() }));
      }

      if (method === "POST" && pathname === "/api/saves/delete") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        return finish(jsonResponse(200, { ok: true, deleted: saveStore.deleteSaveSlot(String(body.slot)), slots: saveStore.listSaveSlots() }));
      }

      if (method === "POST" && pathname === "/api/backups/delete") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        return finish(jsonResponse(200, { ok: true, deleted: saveStore.deleteSaveSlot(String(body.slot)), slots: saveStore.listBackupSlots() }));
      }

      return finish(jsonResponse(501, { ok: false, error: `Client-only runtime not implemented for ${method} ${pathname}.` }));
    } catch (error) {
      return finish(jsonResponse(500, { ok: false, error: error?.message || "Internal runtime error." }));
    }
  }

  return {
    request,
    getSession: () => session,
    getSaveStore: () => saveStore,
    getPersistenceDescriptor: () =>
      createPersistenceDescriptor(
        "browser",
        true,
        "Browser-backed persistence is active via local storage save slots and rolling backups."
      ),
    createSimulationJob,
    listSimulationJobs: () => [...simJobs.values()].slice().sort((a, b) => b.createdAt - a.createdAt)
  };
}
