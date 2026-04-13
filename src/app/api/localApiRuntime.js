import { createBrowserSaveStore } from "../../adapters/persistence/browserSaveStore.js";
import { createPersistenceDescriptor } from "../../adapters/persistence/saveStoreShared.js";
import { getLeagueConfigCatalog, getLeagueConfigSummary, resolveLeagueSettings } from "../../config/leagueSetup.js";
import { createLeagueBase } from "../../domain/teamFactory.js";
import { GameSession } from "../../runtime/GameSession.js";
import { applyInitialLeagueSetup } from "../../runtime/applyLeagueSetup.js";
import { RNG } from "../../utils/rng.js";
import { RNGStreams } from "../../utils/rngStreams.js";
import { initGmLegacy, computeGmLegacyScore, getGmPersonaArc } from "../../engine/gmLegacyScore.js";
import { initRivalries, getRivalryContext, getTeamRivalries } from "../../engine/rivalryDNA.js";
import { runLeagueCombine, getCombineSummary } from "../../engine/draftCombine.js";
import { evaluateTeamOffer, applyCompetingOffer, agentSummary } from "../../engine/playerAgentAI.js";
import { getCapAlerts } from "../../engine/capAlerts.js";
import {
  startChallenge, advanceChallengeSeason, checkChallengeComplete,
  formatLeaderboardEntry, parseLeaderboard, serializeLeaderboard, rankEntry
} from "../../engine/speedrunChallenge.js";
import { getFanSentiment, fanApprovalLabel } from "../../engine/fanSentiment.js";
import { getMentorshipStatus, getMentorshipHistory } from "../../engine/veteranMentorship.js";
import {
  createLobby, addPlayerToLobby, queueIntent, markPlayerReady,
  lockGate, openGate, applyIntents, recordAdvance, lobbyStatus,
  ADVANCE_GATE_STATUS
} from "../../runtime/multiplayerSession.js";

function jsonResponse(status, payload) {
  return { status, ok: status >= 200 && status < 300, payload };
}

// ── Augmented dashboard state ─────────────────────────────────────────────────
// Extends getDashboardState() with new world-state layers not yet in GameSession.

function getAugmentedState(session) {
  const base = session.getDashboardState();
  const league = session.league;
  const capSummary = session.controlledTeamId
    ? session.getTeamCapSummary(session.controlledTeamId)
    : null;
  const roster = session.controlledTeamId
    ? session.getRoster(session.controlledTeamId)
    : [];
  // Active injuries for controlled team
  const activeInjuries = roster
    .filter((p) => p.injuryStatus && p.injuryStatus !== "healthy" && p.injuryWeeksRemaining > 0)
    .map((p) => ({
      playerId: p.id || p.playerId,
      name: p.name,
      pos: p.position || p.pos,
      status: p.injuryStatus,
      weeksRemaining: p.injuryWeeksRemaining || 0,
      severity: p.injurySeverity || "minor"
    }));

  // Fan sentiment for controlled team
  const fanSentimentData = session.controlledTeamId
    ? (() => {
        const fs = getFanSentiment(league, session.controlledTeamId);
        return { ...fs, label: fanApprovalLabel(fs.approval) };
      })()
    : null;

  return {
    ...base,
    narrativeLog:   league?.narrativeLog  || [],
    newsLog:        league?.newsLog       || [],
    coachingTree:   league?.coachingTree  || null,
    gmLegacy:       league?.gmLegacy      ? {
      ...computeGmLegacyScore(league.gmLegacy),
      persona: getGmPersonaArc(league.gmLegacy)
    } : null,
    rivalries:      league?.rivalries     || {},
    combineResults: league?.combineResults || [],
    capAlerts:      getCapAlerts(capSummary, roster, session.currentYear),
    activeInjuries,
    fanSentiment:   fanSentimentData
  };
}

// ── Commissioner lobby (persisted via localStorage) ────────────────────────────
let _lobby = null;
const LOBBY_KEY = "vsfgm-commissioner-lobby-v1";

function _persistLobby() {
  try {
    if (_lobby) localStorage.setItem(LOBBY_KEY, JSON.stringify(_lobby));
    else localStorage.removeItem(LOBBY_KEY);
  } catch { /* quota exceeded — lobby still works in-memory */ }
}

function _loadPersistedLobby() {
  try {
    const s = localStorage.getItem(LOBBY_KEY);
    if (s) _lobby = JSON.parse(s);
  } catch { _lobby = null; }
}

_loadPersistedLobby();

// ── Speedrun Challenge (persisted via localStorage) ───────────────────────────
let _speedrunChallenge = null;
const SPEEDRUN_KEY = "vsfgm-speedrun-challenge-v1";
const SPEEDRUN_LB_KEY = "speedrunLeaderboard";

function _persistSpeedrun() {
  try {
    if (_speedrunChallenge) localStorage.setItem(SPEEDRUN_KEY, JSON.stringify(_speedrunChallenge));
    else localStorage.removeItem(SPEEDRUN_KEY);
  } catch { /* quota exceeded — state still works in-memory */ }
}

function _loadPersistedSpeedrun() {
  try {
    const s = localStorage.getItem(SPEEDRUN_KEY);
    if (s) _speedrunChallenge = JSON.parse(s);
  } catch { _speedrunChallenge = null; }
}

_loadPersistedSpeedrun();

// ── Rewind snapshot helpers ───────────────────────────────────────────────────

const REWIND_META_KEY = "vsfgm-rw-index";
const REWIND_STATE_PREFIX = "vsfgm:rw-state:";
const REWIND_MAX_SLOTS = 10;

function _rwGetMeta(storage) {
  try { return JSON.parse(storage.getItem(REWIND_META_KEY) || "[]"); } catch { return []; }
}

function _rwSetMeta(storage, meta) {
  storage.setItem(REWIND_META_KEY, JSON.stringify(meta));
}

function _rwPruneOldest(storage, meta) {
  while (meta.length >= REWIND_MAX_SLOTS) {
    const oldest = meta.pop();
    if (oldest?.id) storage.removeItem(REWIND_STATE_PREFIX + oldest.id);
  }
}

function _rwTakeSnapshot(storage, session, trigger, label) {
  const id = `${trigger}-y${session.currentYear}-w${session.currentWeek}-${Date.now()}`;
  const entry = {
    id, trigger, label,
    year: session.currentYear,
    week: session.currentWeek,
    phase: session.phase,
    createdAt: new Date().toISOString()
  };
  try {
    storage.setItem(REWIND_STATE_PREFIX + id, JSON.stringify(session.toSnapshot()));
    const meta = _rwGetMeta(storage);
    meta.unshift(entry);
    _rwPruneOldest(storage, meta);
    _rwSetMeta(storage, meta);
    return { ok: true, entry };
  } catch (e) {
    return { ok: false, error: e?.message || "Snapshot failed (storage quota?)" };
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

// ── Session-8 engagement helpers (mirrored from server.js) ───────────────────

function _deriveGmArchetype(team) {
  const roster = Array.isArray(team.roster) ? team.roster : [];
  const avgAge = roster.length ? roster.reduce((s, p) => s + (p.age || 26), 0) / roster.length : 27;
  const ovr = team.overallRating || 75;
  const capHit = team.capSummary?.activeCap || 0;
  if (avgAge < 25.5 && ovr < 79) return { label: "Moneyball", description: "Builds through analytics, cheap young talent, draft-first.", icon: "📊" };
  if (avgAge > 28 && ovr > 80) return { label: "Win-Now", description: "Aggressive veteran acquisitions, mortgages the future.", icon: "🔥" };
  if (capHit > 220_000_000) return { label: "Gut-Feel", description: "Pays for star names, trusts instinct over data.", icon: "🎲" };
  return { label: "Loyalty", description: "Extends core players, rewards homegrown talent.", icon: "🤝" };
}

function _generateSeasonArcs(sess) {
  try {
    const d = typeof sess.getDashboardState === "function" ? sess.getDashboardState() : {};
    const team = d.controlledTeam || {};
    const standings = d.latestStandings || [];
    const myRow = standings.find((r) => r.team === (team.abbrev || team.id)) || {};
    const wins = myRow.wins || 0;
    const losses = myRow.losses || 0;
    const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;
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

function _generateGmDecisions(augState) {
  try {
    const week = augState.currentWeek || 0;
    const phase = augState.phase || "";
    const decisions = [];
    if (phase === "regular-season" && week >= 9 && week <= 11) {
      const standings = augState.latestStandings || [];
      const team = augState.controlledTeam || {};
      const myRow = standings.find((r) => r.team === (team.abbrev || team.id)) || {};
      decisions.push({
        id: "trade-deadline", type: "TRADE_DEADLINE", week,
        prompt: `Trade deadline closes end of Week 11 (current: Week ${week}). Record: ${myRow.wins || 0}-${myRow.losses || 0}. What's your priority?`,
        options: [
          { id: "buy", label: "Buy — acquire veterans now", effect: "Trade picks for proven players. Win-now mode." },
          { id: "sell", label: "Sell — stock picks for the future", effect: "Trade veterans for draft capital. Long-term play." },
          { id: "hold", label: "Hold — stay the course", effect: "No major moves. Evaluate at Week 12." }
        ]
      });
    }
    const activeInjuries = augState.activeInjuries || [];
    const qbInjury = activeInjuries.find((p) => p.pos === "QB" && p.severity === "severe");
    if (qbInjury) {
      decisions.push({
        id: "qb-injury", type: "INJURY_CRISIS", week,
        prompt: `${qbInjury.name} is out ${qbInjury.weeksRemaining}+ weeks. How do you respond?`,
        options: [
          { id: "fa-qb", label: "Sign a veteran QB from free agency", effect: "Costs cap, provides experience and stability." },
          { id: "start-backup", label: "Start backup — develop for the future", effect: "Higher risk short-term, unlocks development." },
          { id: "trade-qb", label: "Trade for a QB upgrade", effect: "Costs picks. High risk, high reward." }
        ]
      });
    }
    const capAlerts = augState.capAlerts || [];
    const criticalCap = capAlerts.find((a) => a.severity === "critical");
    if (criticalCap) {
      decisions.push({
        id: "cap-crisis", type: "CAP_CRISIS", week,
        prompt: `Cap emergency: ${criticalCap.headline}. Time is running out to find relief.`,
        options: [
          { id: "restructure", label: "Restructure key contracts immediately", effect: "Saves cap now, adds dead cap later." },
          { id: "release", label: "Release a high-salary player", effect: "Immediate cap relief. Roster weakens." },
          { id: "wait", label: "Let it play out — monitor closely", effect: "Risk a cap violation. High stakes." }
        ]
      });
    }
    return decisions;
  } catch {
    return [];
  }
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
        return finish(jsonResponse(200, getAugmentedState(session)));
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
        return finish(jsonResponse(200, { ok: true, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/control-team") {
        if (!body?.teamId) return finish(jsonResponse(400, { ok: false, error: "teamId is required." }));
        const teamId = session.setControlledTeam(String(body.teamId).toUpperCase());
        return finish(jsonResponse(200, { ok: true, teamId, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/advance-season") {
        const count = Math.max(1, Math.min(100, toInt(body?.count) || 1));
        const results = session.simulateSeasons(count, { runOffseasonAfterLast: true });
        writeAutoBackup("season-sim");
        return finish(jsonResponse(200, { ok: true, count, results, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/advance-week") {
        const count = Math.max(1, Math.min(40, toInt(body?.count) || 1));
        // ── Pre-game tactical override (halftime adjustment) ─────────────────
        const tacticOverride = body?.weeklyTacticOverride;
        let prevWeeklyPlan = null;
        if (tacticOverride && session.controlledTeamId) {
          const team = session.league?.teams?.find((t) => t.id === session.controlledTeamId);
          if (team?.weeklyPlan) {
            prevWeeklyPlan = { ...team.weeklyPlan };
            const tacticMap = {
              "run-heavy":   { passLeanDelta: -0.15, aggressionDelta:  0.05, summary: "Ground game focus" },
              "pass-heavy":  { passLeanDelta:  0.15, aggressionDelta:  0.05, summary: "Air attack tempo" },
              "blitz-heavy": { passLeanDelta: -0.05, aggressionDelta:  0.20, summary: "Pressure package" },
              "prevent":     { passLeanDelta: -0.10, aggressionDelta: -0.15, summary: "Prevent defense" }
            };
            const mod = tacticMap[tacticOverride];
            if (mod) Object.assign(team.weeklyPlan, mod);
          }
        }
        const results = [];
        for (let i = 0; i < count; i += 1) {
          const prevPhase = session.phase;
          const prevWeek = session.currentWeek;
          const result = session.advanceWeek();
          // Pre-trade-deadline snapshot (week 9)
          if (result.week === 9) {
            _rwTakeSnapshot(storage, session, "pre-deadline", "Before Trade Deadline");
          }
          // Season-start snapshot (transition into regular-season week 1)
          if (prevPhase !== "regular-season" && session.phase === "regular-season" && session.currentWeek === 1) {
            _rwTakeSnapshot(storage, session, "season-start", `Season ${session.currentYear} Start`);
          }
          results.push(result);
        }
        // Restore original weekly plan after simulation
        if (prevWeeklyPlan && session.controlledTeamId) {
          const team = session.league?.teams?.find((t) => t.id === session.controlledTeamId);
          if (team) team.weeklyPlan = prevWeeklyPlan;
        }
        writeAutoBackup(results[results.length - 1]?.phase === "offseason" ? "offseason-checkpoint" : "week");
        return finish(jsonResponse(200, {
          ok: true, count, results,
          tacticApplied: tacticOverride || null,
          state: getAugmentedState(session)
        }));
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
            state: getAugmentedState(session)
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
            state: getAugmentedState(session)
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
            state: getAugmentedState(session),
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
            state: getAugmentedState(session),
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
            state: getAugmentedState(session),
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
            state: getAugmentedState(session),
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
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/waiver-claim") {
        if (!body?.teamId || !body?.playerId) {
          return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        }
        const result = session.claimWaiver({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId)
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/trade") {
        if (!body?.teamA || !body?.teamB) return finish(jsonResponse(400, { ok: false, error: "teamA and teamB required." }));
        _rwTakeSnapshot(storage, session, "pre-trade", `Before trade ${String(body.teamA).toUpperCase()} ↔ ${String(body.teamB).toUpperCase()}`);
        const result = session.tradePlayers({
          teamA: String(body.teamA).toUpperCase(),
          teamB: String(body.teamB).toUpperCase(),
          teamAPlayerIds: (body.teamAPlayerIds || []).map((id) => String(id)),
          teamBPlayerIds: (body.teamBPlayerIds || []).map((id) => String(id)),
          teamAPickIds: (body.teamAPickIds || []).map((id) => String(id)),
          teamBPickIds: (body.teamBPickIds || []).map((id) => String(id))
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
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
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/contracts/restructure") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.restructurePlayerContract({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId)
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/contracts/franchise-tag") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.applyFranchiseTagToPlayer({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/contracts/fifth-year-option") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.applyFifthYearOptionToPlayer({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/contracts/negotiate") {
        if (!body?.teamId || !body?.playerId) return finish(jsonResponse(400, { ok: false, error: "teamId and playerId required." }));
        const result = session.negotiateAndSign({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId),
          years: toInt(body.years),
          salary: body.salary != null ? Number(body.salary) : null
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "GET" && pathname === "/api/draft") {
        return finish(jsonResponse(200, { ok: true, draft: session.getDraftState() }));
      }

      if (method === "POST" && pathname === "/api/draft/prepare") {
        const draft = session.prepareDraft();
        return finish(jsonResponse(200, { ok: true, draft, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/draft/cpu") {
        const result = session.runCpuDraft({
          picks: Math.max(1, Math.min(224, toInt(body?.picks) || 224)),
          untilUserPick: body?.untilUserPick !== false
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/draft/user-pick") {
        if (!body?.playerId) return finish(jsonResponse(400, { ok: false, error: "playerId required." }));
        const result = session.draftUserPick({ playerId: String(body.playerId) });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
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
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
      }

      if (method === "POST" && pathname === "/api/scouting/lock-board") {
        if (!Array.isArray(body?.playerIds)) return finish(jsonResponse(400, { ok: false, error: "playerIds[] required." }));
        const result = session.lockDraftBoard({
          teamId: String(body.teamId || session.controlledTeamId).toUpperCase(),
          playerIds: body.playerIds.map((id) => String(id))
        });
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
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

      if (method === "POST" && pathname === "/api/history/retire-jersey") {
        if (!body?.teamId || !body?.playerId) {
          return finish(jsonResponse(400, { ok: false, error: "teamId and playerId are required." }));
        }
        const result = session.retireJerseyNumber({
          teamId: String(body.teamId).toUpperCase(),
          playerId: String(body.playerId)
        });
        return finish(jsonResponse(result.ok ? 200 : 400, result.ok ? { ok: true, result, state: getAugmentedState(session) } : result));
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
        return finish(jsonResponse(200, { ok: true, settings, state: getAugmentedState(session) }));
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
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
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
        return finish(jsonResponse(result.ok ? 200 : 400, { ...result, state: getAugmentedState(session) }));
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
        return finish(jsonResponse(200, { ok: true, pipeline, state: getAugmentedState(session) }));
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
        return finish(jsonResponse(200, { ok: true, state: getAugmentedState(session) }));
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
        return finish(jsonResponse(200, { ok: true, state: getAugmentedState(session), slots: saveStore.listSaveSlots() }));
      }

      if (method === "POST" && pathname === "/api/backups/load") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        const snapshot = saveStore.loadSessionFromSlot(String(body.slot));
        if (!snapshot) return finish(jsonResponse(404, { ok: false, error: "Backup slot not found." }));
        session = sessionFromSnapshot(snapshot);
        return finish(jsonResponse(200, { ok: true, state: getAugmentedState(session), slots: saveStore.listBackupSlots() }));
      }

      if (method === "POST" && pathname === "/api/saves/delete") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        return finish(jsonResponse(200, { ok: true, deleted: saveStore.deleteSaveSlot(String(body.slot)), slots: saveStore.listSaveSlots() }));
      }

      if (method === "POST" && pathname === "/api/backups/delete") {
        if (!body?.slot) return finish(jsonResponse(400, { ok: false, error: "slot is required." }));
        return finish(jsonResponse(200, { ok: true, deleted: saveStore.deleteSaveSlot(String(body.slot)), slots: saveStore.listBackupSlots() }));
      }

      // ── Rewind routes ───────────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/rewind") {
        return finish(jsonResponse(200, { ok: true, snapshots: _rwGetMeta(storage) }));
      }

      if (method === "POST" && pathname === "/api/rewind/snapshot") {
        const label = body?.label ? String(body.label) : "Manual snapshot";
        const result = _rwTakeSnapshot(storage, session, "manual", label);
        return finish(jsonResponse(result.ok ? 200 : 500, result));
      }

      if (method === "POST" && pathname === "/api/rewind/restore") {
        if (!body?.id) return finish(jsonResponse(400, { ok: false, error: "id is required." }));
        const snapshotJson = storage.getItem(REWIND_STATE_PREFIX + String(body.id));
        if (!snapshotJson) return finish(jsonResponse(404, { ok: false, error: "Snapshot not found." }));
        // Auto-backup current state before restoring
        _rwTakeSnapshot(storage, session, "pre-restore", `Before restore to ${String(body.id)}`);
        try {
          const snapshot = JSON.parse(snapshotJson);
          const rngFactory = (seed) => new session.rng.constructor(seed);
          const restored = GameSession.fromSnapshot(snapshot, rngFactory);
          // Replace active session internals
          Object.assign(session, restored);
          return finish(jsonResponse(200, { ok: true, state: getAugmentedState(session) }));
        } catch (e) {
          return finish(jsonResponse(500, { ok: false, error: e?.message || "Restore failed." }));
        }
      }

      if (method === "POST" && pathname === "/api/rewind/delete") {
        if (!body?.id) return finish(jsonResponse(400, { ok: false, error: "id is required." }));
        const sid = String(body.id);
        storage.removeItem(REWIND_STATE_PREFIX + sid);
        const meta = _rwGetMeta(storage).filter((e) => e.id !== sid);
        _rwSetMeta(storage, meta);
        return finish(jsonResponse(200, { ok: true, snapshots: meta }));
      }

      // ── Agent negotiation routes ────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/agent/roster") {
        const s = ensureSession();
        const players = s.league?.players || [];
        const eligible = players
          .filter((p) => p.agentState && p.agentState.negotiationStatus === "active")
          .map((p) => agentSummary(p))
          .filter(Boolean);
        return finish(jsonResponse(200, { ok: true, agents: eligible }));
      }

      if (method === "POST" && pathname === "/api/agent/offer") {
        const s = ensureSession();
        const { playerId, salary, years } = body || {};
        if (!playerId) return finish(jsonResponse(400, { ok: false, error: "playerId required." }));
        const player = (s.league?.players || []).find((p) => p.id === playerId);
        if (!player) return finish(jsonResponse(404, { ok: false, error: "Player not found." }));
        if (!player.agentState) return finish(jsonResponse(400, { ok: false, error: "Player has no active agent." }));
        const result = evaluateTeamOffer(player, Number(salary) || 0, Number(years) || 1);
        return finish(jsonResponse(200, { ok: true, result, agentState: player.agentState }));
      }

      if (method === "POST" && pathname === "/api/agent/competing-offer") {
        const s = ensureSession();
        const { playerId, competingTeamId } = body || {};
        if (!playerId) return finish(jsonResponse(400, { ok: false, error: "playerId required." }));
        const player = (s.league?.players || []).find((p) => p.id === playerId);
        if (!player) return finish(jsonResponse(404, { ok: false, error: "Player not found." }));
        const result = applyCompetingOffer(player, competingTeamId || "Unknown");
        return finish(jsonResponse(200, { ok: true, result, agentState: player.agentState }));
      }

      // ── GM Legacy routes ────────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/gm-legacy") {
        const s = ensureSession();
        initGmLegacy(s.league);
        const summary = computeGmLegacyScore(s.league.gmLegacy);
        return finish(jsonResponse(200, { ok: true, legacy: summary, raw: s.league.gmLegacy }));
      }

      // ── Rivalry routes ──────────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/rivalry") {
        const s = ensureSession();
        const { teamA, teamB } = body || {};
        initRivalries(s.league);
        if (teamA && teamB) {
          const ctx = getRivalryContext(s.league, teamA, teamB);
          return finish(jsonResponse(200, { ok: true, rivalry: ctx }));
        }
        const teamId = teamA || s.controlledTeamId;
        const rivalries = getTeamRivalries(s.league, teamId);
        return finish(jsonResponse(200, { ok: true, rivalries }));
      }

      // ── Draft Combine routes ────────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/combine/run") {
        const s = ensureSession();
        const draftClass = s.league?.pendingDraft?.prospects || s.league?.draftClass || [];
        if (!draftClass.length) return finish(jsonResponse(400, { ok: false, error: "No draft class available." }));
        const rng = s.rng || new RNG(Date.now());
        const results = runLeagueCombine(draftClass, rng);
        s.league.combineResults = results;
        return finish(jsonResponse(200, { ok: true, results, count: results.length }));
      }

      if (method === "GET" && pathname === "/api/combine/results") {
        const s = ensureSession();
        const draftClass = s.league?.pendingDraft?.prospects || s.league?.draftClass || [];
        const boardIds = (s.league?.scoutingBoards?.[s.controlledTeamId] || []).map((p) => p.id);
        const summary = getCombineSummary(draftClass, boardIds);
        return finish(jsonResponse(200, { ok: true, summary, hasResults: summary.length > 0 }));
      }

      // ── IndexedDB storage routes ────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/storage/estimate") {
        const estimate = navigator?.storage?.estimate
          ? await navigator.storage.estimate().then(({ usage, quota }) => ({
              usedMb: (usage / 1_048_576).toFixed(1),
              quotaMb: (quota / 1_048_576).toFixed(1),
              pct: Math.round((usage / quota) * 100)
            }))
          : null;
        return finish(jsonResponse(200, { ok: true, estimate }));
      }

      // ── Commissioner / Multiplayer routes ───────────────────────────────────
      if (method === "POST" && pathname === "/api/commissioner/create") {
        const s = ensureSession();
        const { leagueName, commissionerId, maxPlayers } = body || {};
        if (!commissionerId) return finish(jsonResponse(400, { ok: false, error: "commissionerId required." }));
        _lobby = createLobby({
          leagueId:      `lobby-${Date.now()}`,
          commissionerId,
          leagueName:    leagueName || "VaultSpark League",
          maxPlayers:    Number(maxPlayers) || 4
        });
        // Commissioner auto-joins with controlled team
        addPlayerToLobby(_lobby, {
          userId:          commissionerId,
          displayName:     commissionerId,
          controlledTeamId: s.controlledTeamId
        });
        _persistLobby();
        return finish(jsonResponse(200, { ok: true, lobby: lobbyStatus(_lobby) }));
      }

      if (method === "GET" && pathname === "/api/commissioner/lobby") {
        if (!_lobby) return finish(jsonResponse(404, { ok: false, error: "No active lobby." }));
        return finish(jsonResponse(200, { ok: true, lobby: lobbyStatus(_lobby) }));
      }

      if (method === "POST" && pathname === "/api/commissioner/join") {
        if (!_lobby) return finish(jsonResponse(404, { ok: false, error: "No active lobby." }));
        const { userId, displayName, controlledTeamId } = body || {};
        if (!userId || !controlledTeamId) return finish(jsonResponse(400, { ok: false, error: "userId and controlledTeamId required." }));
        try {
          addPlayerToLobby(_lobby, { userId, displayName: displayName || userId, controlledTeamId });
          _persistLobby();
          return finish(jsonResponse(200, { ok: true, lobby: lobbyStatus(_lobby) }));
        } catch (e) {
          return finish(jsonResponse(400, { ok: false, error: e.message }));
        }
      }

      if (method === "POST" && pathname === "/api/commissioner/ready") {
        if (!_lobby) return finish(jsonResponse(404, { ok: false, error: "No active lobby." }));
        const { userId } = body || {};
        if (!userId) return finish(jsonResponse(400, { ok: false, error: "userId required." }));
        try {
          const allReady = markPlayerReady(_lobby, userId);
          _persistLobby();
          return finish(jsonResponse(200, { ok: true, allReady, lobby: lobbyStatus(_lobby) }));
        } catch (e) {
          return finish(jsonResponse(400, { ok: false, error: e.message }));
        }
      }

      if (method === "POST" && pathname === "/api/commissioner/intent") {
        if (!_lobby) return finish(jsonResponse(404, { ok: false, error: "No active lobby." }));
        const { userId, type, payload: intentPayload } = body || {};
        if (!userId || !type) return finish(jsonResponse(400, { ok: false, error: "userId and type required." }));
        try {
          const intent = queueIntent(_lobby, userId, type, intentPayload || {});
          _persistLobby();
          return finish(jsonResponse(200, { ok: true, intent, lobby: lobbyStatus(_lobby) }));
        } catch (e) {
          return finish(jsonResponse(400, { ok: false, error: e.message }));
        }
      }

      if (method === "POST" && pathname === "/api/commissioner/advance") {
        if (!_lobby) return finish(jsonResponse(404, { ok: false, error: "No active lobby." }));
        if (_lobby.gateStatus === ADVANCE_GATE_STATUS.ADVANCING) {
          return finish(jsonResponse(409, { ok: false, error: "Already advancing." }));
        }
        lockGate(_lobby);
        const s = ensureSession();
        const intentResults = await applyIntents(_lobby, {
          call: async (action, params) => {
            const res = await new Promise((resolve) => {
              request({ method: "POST", pathname: `/api/${action}`, body: params }, resolve);
            });
            return res.payload;
          }
        });
        const advResult = await new Promise((resolve) =>
          request({ method: "POST", pathname: "/api/advance-week", body: {} }, resolve)
        );
        recordAdvance(_lobby, s.currentYear, s.currentWeek, s.phase, intentResults);
        openGate(_lobby, s.currentYear, s.currentWeek, s.phase);
        _persistLobby();
        return finish(jsonResponse(200, {
          ok: true,
          intentResults,
          state: getAugmentedState(s),
          lobby: lobbyStatus(_lobby)
        }));
      }

      if (method === "DELETE" && pathname === "/api/commissioner/lobby") {
        _lobby = null;
        _persistLobby();
        return finish(jsonResponse(200, { ok: true }));
      }

      // ── Fan Sentiment ────────────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/fan-sentiment") {
        const s = ensureSession();
        const teamId = (url.searchParams.get("team") || s.controlledTeamId || "").toUpperCase();
        if (!teamId) return finish(jsonResponse(400, { ok: false, error: "team required." }));
        const fs = getFanSentiment(s.league, teamId);
        return finish(jsonResponse(200, { ok: true, teamId, fanSentiment: { ...fs, label: fanApprovalLabel(fs.approval) } }));
      }

      // ── Active Injuries ──────────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/injuries/active") {
        const s = ensureSession();
        const teamId = (url.searchParams.get("team") || s.controlledTeamId || "").toUpperCase();
        const roster = teamId ? s.getRoster(teamId) : [];
        const injured = roster
          .filter((p) => p.injuryStatus && p.injuryStatus !== "healthy" && (p.injuryWeeksRemaining || 0) > 0)
          .map((p) => ({
            playerId: p.id || p.playerId,
            name: p.name,
            pos: p.pos,
            status: p.injuryStatus,
            weeksRemaining: p.injuryWeeksRemaining || 0,
            severity: p.injurySeverity || "minor",
            overall: p.overall
          }))
          .sort((a, b) => (b.overall || 0) - (a.overall || 0));
        return finish(jsonResponse(200, { ok: true, teamId, injured, count: injured.length }));
      }

      // ── Stat Leaders ─────────────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/stat-leaders") {
        const s = ensureSession();
        const year = toInt(url.searchParams.get("year")) || s.currentYear;
        const passing = s.statBook.getPlayerSeasonTable("passing", { year })
          .sort((a, b) => (b.yds || 0) - (a.yds || 0)).slice(0, 3);
        const rushing = s.statBook.getPlayerSeasonTable("rushing", { year })
          .sort((a, b) => (b.yds || 0) - (a.yds || 0)).slice(0, 3);
        const defense = s.statBook.getPlayerSeasonTable("defense", { year })
          .sort((a, b) => ((b.sacks || 0) + (b.int || 0) * 1.5) - ((a.sacks || 0) + (a.int || 0) * 1.5)).slice(0, 3);
        return finish(jsonResponse(200, { ok: true, year, leaders: { passing, rushing, defense } }));
      }

      // ── Veteran Mentorship ───────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/mentorship") {
        const s = ensureSession();
        const teamId = (url.searchParams.get("team") || s.controlledTeamId || "").toUpperCase();
        const pairs = getMentorshipStatus(s.league, teamId);
        const history = getMentorshipHistory(s.league, teamId);
        return finish(jsonResponse(200, { ok: true, teamId, pairs, history }));
      }

      // ── Brand Identity (Franchise Brand Builder) ─────────────────────────────
      if (method === "POST" && pathname === "/api/brand-identity") {
        const s = ensureSession();
        const { teamId, customName, customCity, customAbbrev, primaryColor, secondaryColor } = body || {};
        const tid = (teamId || s.controlledTeamId || "").toUpperCase();
        if (!tid) return finish(jsonResponse(400, { ok: false, error: "teamId required." }));
        const team = s.league?.teams?.find((t) => t.id === tid);
        if (!team) return finish(jsonResponse(404, { ok: false, error: `Team ${tid} not found.` }));
        if (!team.brandOverride) team.brandOverride = {};
        if (customName)    team.brandOverride.name       = String(customName).slice(0, 30);
        if (customCity)    team.brandOverride.city       = String(customCity).slice(0, 24);
        if (customAbbrev)  team.brandOverride.abbrev     = String(customAbbrev).toUpperCase().slice(0, 3);
        if (primaryColor)  team.brandOverride.primary    = String(primaryColor).slice(0, 7);
        if (secondaryColor) team.brandOverride.secondary = String(secondaryColor).slice(0, 7);
        team.brandOverrideActive = true;
        return finish(jsonResponse(200, { ok: true, teamId: tid, brandOverride: team.brandOverride, state: getAugmentedState(s) }));
      }

      // ── Speedrun Challenge routes ──────────────────────────────────────────
      if (method === "POST" && pathname === "/api/speedrun/start") {
        const s = ensureSession();
        const { teamId } = body || {};
        const tid = teamId || s.controlledTeamId;
        if (!tid) return finish(jsonResponse(400, { ok: false, error: "teamId required." }));
        const settings = {
          startYear: s.currentYear,
          difficulty: s.getLeagueSettings?.()?.difficulty || "normal"
        };
        _speedrunChallenge = startChallenge(tid, settings);
        _persistSpeedrun();
        return finish(jsonResponse(200, { ok: true, challenge: _speedrunChallenge }));
      }

      if (method === "GET" && pathname === "/api/speedrun/status") {
        return finish(jsonResponse(200, { ok: true, challenge: _speedrunChallenge }));
      }

      if (method === "POST" && pathname === "/api/speedrun/check") {
        if (!_speedrunChallenge || !_speedrunChallenge.active) {
          return finish(jsonResponse(200, { ok: true, complete: false, challenge: null }));
        }
        const s = ensureSession();
        // Find the latest champion entry for the current year
        const latestChampion = (s.league.champions || []).slice(-1)[0] || null;
        const postseasonResults = latestChampion ? { superBowl: { championTeamId: latestChampion.championTeamId } } : null;
        // Advance the season counter
        _speedrunChallenge = advanceChallengeSeason(_speedrunChallenge);
        const result = checkChallengeComplete(_speedrunChallenge, postseasonResults, s.controlledTeamId);
        if (result.complete) {
          _speedrunChallenge.active = false;
        }
        _persistSpeedrun();
        return finish(jsonResponse(200, { ok: true, ...result, challenge: _speedrunChallenge }));
      }

      if (method === "POST" && pathname === "/api/speedrun/abandon") {
        _speedrunChallenge = null;
        _persistSpeedrun();
        return finish(jsonResponse(200, { ok: true }));
      }

      if (method === "GET" && pathname === "/api/speedrun/leaderboard") {
        const raw = localStorage.getItem(SPEEDRUN_LB_KEY) || "[]";
        const entries = parseLeaderboard(raw);
        return finish(jsonResponse(200, { ok: true, entries }));
      }

      if (method === "POST" && pathname === "/api/speedrun/submit") {
        const { playerName } = body || {};
        if (!_speedrunChallenge) {
          return finish(jsonResponse(400, { ok: false, error: "No challenge state to submit." }));
        }
        const entry = formatLeaderboardEntry(_speedrunChallenge, playerName);
        const raw = localStorage.getItem(SPEEDRUN_LB_KEY) || "[]";
        const existing = parseLeaderboard(raw);
        const { rank, entries } = rankEntry(existing, entry);
        localStorage.setItem(SPEEDRUN_LB_KEY, serializeLeaderboard(entries));
        _speedrunChallenge = null;
        _persistSpeedrun();
        return finish(jsonResponse(200, { ok: true, rank, totalEntries: entries.length, entry }));
      }

      // ── Season Narrative Arcs ────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/season-arcs") {
        return finish(jsonResponse(200, { ok: true, arcs: _generateSeasonArcs(session) }));
      }

      // ── GM Decision Queue ────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/gm-decision") {
        return finish(jsonResponse(200, { ok: true, decisions: _generateGmDecisions(getAugmentedState(session)) }));
      }

      // ── Franchise Records Board ──────────────────────────────────────────
      if (method === "GET" && pathname === "/api/records/franchise") {
        const recTeamId = (url.searchParams.get("team") || session.controlledTeamId || "").toUpperCase();
        return finish(jsonResponse(200, { ok: true, records: session.statBook.getRecords(), teamId: recTeamId }));
      }

      // ── AI Team GM Archetypes ────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/team-archetypes") {
        const archetypes = (session.league.teams || []).map((t) => ({
          teamId: t.id,
          name: [t.city, t.nickname].filter(Boolean).join(" ") || t.name || t.id,
          abbrev: t.abbrev || t.id,
          ovr: t.overallRating || 75,
          archetype: _deriveGmArchetype(t)
        }));
        return finish(jsonResponse(200, { ok: true, archetypes }));
      }

      // ── Franchise Moment ─────────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/franchise-moment") {
        const fmTeamId = (url.searchParams.get("team") || session.controlledTeamId || "").toUpperCase();
        const recentGames = session.getRecentBoxScores(fmTeamId, 3);
        let moment = null;
        for (const game of (recentGames || [])) {
          const boxScore = session.getBoxScore(game.gameId);
          if (!boxScore) continue;
          const scoring = boxScore.scoringSummary || [];
          const pbp = boxScore.playByPlay || [];
          const margin = Math.abs((boxScore.homeTeam?.score || 0) - (boxScore.awayTeam?.score || 0));
          const isUpset = game.winnerId && game.winnerId === fmTeamId && margin < 4;
          const walkoff = scoring.slice(-1)[0];
          const dramaScore = (isUpset ? 3 : 0) + (margin <= 3 ? 2 : 0) + (scoring.length > 8 ? 1 : 0);
          if (!moment || dramaScore > (moment.dramaScore || 0)) {
            const homeIsControlled = game.homeTeamId === fmTeamId;
            const teamScore = homeIsControlled ? boxScore.homeTeam?.score : boxScore.awayTeam?.score;
            const oppScore = homeIsControlled ? boxScore.awayTeam?.score : boxScore.homeTeam?.score;
            const won = (teamScore || 0) > (oppScore || 0);
            moment = {
              gameId: game.gameId,
              week: game.week || boxScore.week,
              year: game.year || boxScore.year,
              dramaScore,
              headline: won
                ? (margin <= 3 ? `Clutch ${margin === 0 ? "tie" : `${teamScore}-${oppScore} thriller`} — your team wins it!` : `Dominant ${teamScore}-${oppScore} victory`)
                : `Tough ${teamScore}-${oppScore} loss — narrowly missed`,
              highlight: walkoff ? `${walkoff.type} by ${walkoff.description?.split(" ")[0] || "your team"} — ${walkoff.quarterLabel}` : "Big moments on both sides",
              result: won ? "win" : "loss",
              score: `${teamScore}-${oppScore}`,
              shareText: `🏈 Week ${game.week} ${won ? "Win" : "Loss"} — ${teamScore}-${oppScore}. Playing VaultSpark Football GM — best GM sim around! #VaultSpark`,
              topPlay: pbp.find((p) => p.description?.toLowerCase().includes("touchdown") || p.description?.toLowerCase().includes("interception"))?.description || null
            };
          }
        }
        return finish(jsonResponse(200, { ok: true, moment }));
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
