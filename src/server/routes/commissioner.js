import { executeAdvanceWeekTransaction } from "../../runtime/advanceWeekCommand.js";
import { resolveChampionTeamId } from "../../engine/gmLegacyScore.js";
import { startChallenge, advanceChallengeSeason, checkChallengeComplete, formatLeaderboardEntry, rankEntry } from "../../engine/speedrunChallenge.js";
import { createLobby, addPlayerToLobby, queueIntent, markPlayerReady, lockGate, openGate, applyIntents, recordAdvance, lobbyStatus, ADVANCE_GATE_STATUS } from "../../runtime/multiplayerSession.js";
import { readRequestBody } from "../httpHardening.js";

// Commissioner (multiplayer) lobby and speedrun challenge.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleCommissionerRoutes(req, res, url, ctx) {
  const { commissionerIntentSessionAdapter, parseJsonBody, sendJson, writeAutoBackup } = ctx;

  // ── Commissioner turn gate (server-memory adapter) ─────────────────────────
  if (req.method === "POST" && url.pathname === "/api/commissioner/create") {
    const body = parseJsonBody(await readRequestBody(req));
    const commissionerId = body?.commissionerId || body?.userId || body?.gmId;
    const controlledTeamId = body?.controlledTeamId || body?.teamId || ctx.session.controlledTeamId;
    if (!commissionerId) {
      sendJson(res, 400, { ok: false, error: "commissionerId required." });
      return true;
    }
    ctx.serverLobby = createLobby({
      leagueId: "lobby-" + Date.now(),
      commissionerId,
      leagueName: body?.leagueName || "VaultSpark League",
      maxPlayers: Number(body?.maxPlayers) || 4
    });
    addPlayerToLobby(ctx.serverLobby, {
      userId: commissionerId,
      displayName: commissionerId,
      controlledTeamId
    });
    sendJson(res, 200, { ok: true, lobby: lobbyStatus(ctx.serverLobby) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/commissioner/lobby") {
    if (!ctx.serverLobby) {
      sendJson(res, 404, { ok: false, error: "No active lobby." });
      return true;
    }
    sendJson(res, 200, { ok: true, lobby: lobbyStatus(ctx.serverLobby) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/commissioner/join") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!ctx.serverLobby) {
      sendJson(res, 404, { ok: false, error: "No active lobby." });
      return true;
    }
    const userId = body?.userId || body?.gmId;
    const controlledTeamId = body?.controlledTeamId || body?.teamId;
    if (!userId || !controlledTeamId) {
      sendJson(res, 400, { ok: false, error: "userId and controlledTeamId required." });
      return true;
    }
    try {
      addPlayerToLobby(ctx.serverLobby, {
        userId,
        displayName: body?.displayName || userId,
        controlledTeamId
      });
      sendJson(res, 200, { ok: true, lobby: lobbyStatus(ctx.serverLobby) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/commissioner/ready") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!ctx.serverLobby) {
      sendJson(res, 404, { ok: false, error: "No active lobby." });
      return true;
    }
    const userId = body?.userId || body?.gmId;
    if (!userId) {
      sendJson(res, 400, { ok: false, error: "userId required." });
      return true;
    }
    try {
      const allReady = markPlayerReady(ctx.serverLobby, userId);
      sendJson(res, 200, { ok: true, allReady, lobby: lobbyStatus(ctx.serverLobby) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/commissioner/intent") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!ctx.serverLobby) {
      sendJson(res, 404, { ok: false, error: "No active lobby." });
      return true;
    }
    if (!body?.userId || !body?.type) {
      sendJson(res, 400, { ok: false, error: "userId and type required." });
      return true;
    }
    try {
      const intent = queueIntent(ctx.serverLobby, body.userId, body.type, body.payload || {});
      sendJson(res, 200, { ok: true, intent, lobby: lobbyStatus(ctx.serverLobby) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/commissioner/advance") {
    const body = parseJsonBody(await readRequestBody(req)) || {};
    if (!ctx.serverLobby) {
      sendJson(res, 404, { ok: false, error: "No active lobby." });
      return true;
    }
    if (ctx.serverLobby.gateStatus === ADVANCE_GATE_STATUS.ADVANCING) {
      sendJson(res, 409, { ok: false, error: "Already advancing." });
      return true;
    }
    try {
      lockGate(ctx.serverLobby);
      const intentResults = await applyIntents(ctx.serverLobby, commissionerIntentSessionAdapter());
      const outcome = executeAdvanceWeekTransaction(ctx.session, body);
      if (!outcome.ok) {
        openGate(ctx.serverLobby, ctx.session.currentYear, ctx.session.currentWeek, ctx.session.phase);
        sendJson(res, outcome.status || 409, { ...outcome, lobby: lobbyStatus(ctx.serverLobby) });
        return true;
      }
      const { committedSession } = outcome;
      ctx.session = committedSession;
      recordAdvance(ctx.serverLobby, ctx.session.currentYear, ctx.session.currentWeek, ctx.session.phase, intentResults);
      openGate(ctx.serverLobby, ctx.session.currentYear, ctx.session.currentWeek, ctx.session.phase);
      writeAutoBackup("commissioner-advance");
      sendJson(res, 200, {
        ok: true,
        intentResults,
        state: ctx.session.getDashboardState(),
        lobby: lobbyStatus(ctx.serverLobby)
      });
    } catch (error) {
      if (ctx.serverLobby?.gateStatus !== ADVANCE_GATE_STATUS.OPEN) {
        openGate(ctx.serverLobby, ctx.session.currentYear, ctx.session.currentWeek, ctx.session.phase);
      }
      sendJson(res, 400, { ok: false, error: error.message, lobby: lobbyStatus(ctx.serverLobby) });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname === "/api/commissioner/lobby") {
    ctx.serverLobby = null;
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/speedrun/start") {
    const body = parseJsonBody(await readRequestBody(req));
    const teamId = body?.teamId || ctx.session.controlledTeamId;
    if (!teamId) {
      sendJson(res, 400, { ok: false, error: "teamId required." });
      return true;
    }
    ctx.serverSpeedrunChallenge = startChallenge(teamId, {
      startYear: ctx.session.currentYear,
      difficulty: ctx.session.getLeagueSettings?.()?.difficulty || "normal"
    });
    sendJson(res, 200, { ok: true, challenge: ctx.serverSpeedrunChallenge });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/speedrun/status") {
    sendJson(res, 200, {
      ok: true,
      challenge: ctx.serverSpeedrunChallenge,
      leagueMeta: {
        seed: ctx.session.rng?.seed ?? null,
        startYear: ctx.session.startYear ?? ctx.session.currentYear ?? null,
        controlledTeamId: ctx.session.controlledTeamId || null
      }
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/speedrun/check") {
    if (!ctx.serverSpeedrunChallenge?.active) {
      sendJson(res, 200, { ok: true, complete: false, challenge: null });
      return true;
    }
    const latestChampion = (ctx.session.league.champions || []).slice(-1)[0] || null;
    const championTeamId = resolveChampionTeamId(latestChampion);
    ctx.serverSpeedrunChallenge = advanceChallengeSeason(ctx.serverSpeedrunChallenge);
    const result = checkChallengeComplete(
      ctx.serverSpeedrunChallenge,
      championTeamId ? { superBowl: { championTeamId } } : null,
      ctx.session.controlledTeamId
    );
    if (result.complete) ctx.serverSpeedrunChallenge.active = false;
    sendJson(res, 200, { ok: true, ...result, challenge: ctx.serverSpeedrunChallenge });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/speedrun/abandon") {
    ctx.serverSpeedrunChallenge = null;
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/speedrun/leaderboard") {
    sendJson(res, 200, { ok: true, entries: ctx.serverSpeedrunLeaderboard.map((entry) => ({ ...entry })) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/speedrun/submit") {
    const body = parseJsonBody(await readRequestBody(req));
    if (!ctx.serverSpeedrunChallenge) {
      sendJson(res, 400, { ok: false, error: "No challenge state to submit." });
      return true;
    }
    const entry = formatLeaderboardEntry(ctx.serverSpeedrunChallenge, body?.playerName);
    const ranked = rankEntry(ctx.serverSpeedrunLeaderboard, entry);
    ctx.serverSpeedrunLeaderboard = ranked.entries;
    ctx.serverSpeedrunChallenge = null;
    sendJson(res, 200, {
      ok: true,
      rank: ranked.rank,
      totalEntries: ctx.serverSpeedrunLeaderboard.length,
      entry
    });
    return true;
  }

  return false;
}
