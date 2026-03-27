/**
 * Multiplayer Commissioner Leagues — Async Turn-Based System
 *
 * Allows 2–4 players to each control a franchise in the same league.
 * The commissioner advances weeks; each player submits their decisions
 * before the advance locks.
 *
 * Model:
 *   - One league, one GameSession, multiple user slots
 *   - Each user has a controlledTeamId and a readyFlag
 *   - Commissioner can force-advance (override waiting players)
 *   - All decisions are queued as "intents" and applied atomically at advance
 *
 * Turn gate lifecycle:
 *   OPEN → players submit intents → LOCKED (all ready or commissioner forces)
 *         → GameSession.advanceWeek() → OPEN
 *
 * Storage:
 *   - Session metadata lives in a "lobby" record in the save store
 *   - Player intents are queued in the lobby record
 *   - The game state save is shared (single slot, locked during advance)
 */

export const ADVANCE_GATE_STATUS = {
  OPEN: "open",
  LOCKED: "locked",
  ADVANCING: "advancing"
};

export const PLAYER_STATUS = {
  PENDING: "pending",  // has not submitted ready
  READY: "ready",      // submitted ready for this week
  DISCONNECTED: "disconnected"
};

// ── Lobby model ───────────────────────────────────────────────────────────────

export function createLobby({ leagueId, commissionerId, leagueName, maxPlayers = 4 }) {
  return {
    leagueId,
    leagueName,
    commissionerId,
    maxPlayers,
    players: [],           // PlayerSlot[]
    gateStatus: ADVANCE_GATE_STATUS.OPEN,
    currentYear: 1,
    currentWeek: 0,
    currentPhase: "preseason",
    intentQueue: [],       // PlayerIntent[]
    advanceLog: [],        // AdvanceRecord[]
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ── Player slot ───────────────────────────────────────────────────────────────

export function addPlayerToLobby(lobby, { userId, displayName, controlledTeamId }) {
  if (lobby.players.length >= lobby.maxPlayers) {
    throw new Error("Lobby is full.");
  }
  if (lobby.players.some((p) => p.controlledTeamId === controlledTeamId)) {
    throw new Error(`Team ${controlledTeamId} is already claimed.`);
  }
  if (lobby.players.some((p) => p.userId === userId)) {
    throw new Error(`User ${userId} is already in this lobby.`);
  }
  const slot = {
    userId,
    displayName,
    controlledTeamId,
    status: PLAYER_STATUS.PENDING,
    isCommissioner: userId === lobby.commissionerId,
    joinedAt: new Date().toISOString()
  };
  lobby.players.push(slot);
  lobby.updatedAt = new Date().toISOString();
  return slot;
}

// ── Intent queue ──────────────────────────────────────────────────────────────

/**
 * Queue a player's decision intent.
 * Intents are applied atomically when the week advances.
 *
 * @param {string} type — "trade" | "sign-fa" | "release" | "depth-reorder" | "restructure"
 * @param {object} payload — type-specific data
 */
export function queueIntent(lobby, userId, type, payload) {
  if (lobby.gateStatus !== ADVANCE_GATE_STATUS.OPEN) {
    throw new Error("Cannot queue intents while gate is locked or advancing.");
  }
  const slot = lobby.players.find((p) => p.userId === userId);
  if (!slot) throw new Error("User not in lobby.");

  const intent = {
    id: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    controlledTeamId: slot.controlledTeamId,
    type,
    payload,
    queuedAt: new Date().toISOString(),
    applied: false
  };
  lobby.intentQueue.push(intent);
  lobby.updatedAt = new Date().toISOString();
  return intent;
}

// ── Ready gate ────────────────────────────────────────────────────────────────

export function markPlayerReady(lobby, userId) {
  const slot = lobby.players.find((p) => p.userId === userId);
  if (!slot) throw new Error("User not in lobby.");
  slot.status = PLAYER_STATUS.READY;
  lobby.updatedAt = new Date().toISOString();
  return checkAllReady(lobby);
}

export function checkAllReady(lobby) {
  const activePlayers = lobby.players.filter((p) => p.status !== PLAYER_STATUS.DISCONNECTED);
  return activePlayers.every((p) => p.status === PLAYER_STATUS.READY);
}

export function lockGate(lobby) {
  if (lobby.gateStatus !== ADVANCE_GATE_STATUS.OPEN) {
    throw new Error("Gate is not open.");
  }
  lobby.gateStatus = ADVANCE_GATE_STATUS.LOCKED;
  lobby.updatedAt = new Date().toISOString();
}

export function openGate(lobby, year, week, phase) {
  lobby.gateStatus = ADVANCE_GATE_STATUS.OPEN;
  lobby.currentYear = year;
  lobby.currentWeek = week;
  lobby.currentPhase = phase;
  // Reset all players to pending
  for (const slot of lobby.players) {
    if (slot.status !== PLAYER_STATUS.DISCONNECTED) {
      slot.status = PLAYER_STATUS.PENDING;
    }
  }
  // Clear applied intents
  lobby.intentQueue = lobby.intentQueue.filter((i) => !i.applied);
  lobby.updatedAt = new Date().toISOString();
}

// ── Intent application ────────────────────────────────────────────────────────

/**
 * Apply all queued intents to the GameSession before advancing.
 * Returns a list of results (success/failure per intent).
 */
export async function applyIntents(lobby, session) {
  const results = [];
  const pending = lobby.intentQueue.filter((i) => !i.applied);

  for (const intent of pending) {
    try {
      let result;
      switch (intent.type) {
        case "trade":
          result = await session.call("propose-trade", intent.payload);
          break;
        case "sign-fa":
          result = await session.call("sign-free-agent", intent.payload);
          break;
        case "release":
          result = await session.call("release-player", intent.payload);
          break;
        case "depth-reorder":
          result = await session.call("update-depth-chart", intent.payload);
          break;
        case "restructure":
          result = await session.call("restructure-contract", intent.payload);
          break;
        default:
          result = { ok: false, error: `Unknown intent type: ${intent.type}` };
      }
      intent.applied = true;
      results.push({ intentId: intent.id, ok: result?.ok ?? true, result });
    } catch (err) {
      intent.applied = true;
      results.push({ intentId: intent.id, ok: false, error: err.message });
    }
  }

  lobby.updatedAt = new Date().toISOString();
  return results;
}

// ── Advance record ────────────────────────────────────────────────────────────

export function recordAdvance(lobby, year, week, phase, intentResults) {
  lobby.advanceLog.push({
    year,
    week,
    phase,
    advancedAt: new Date().toISOString(),
    intentsApplied: intentResults.length,
    intentsOk: intentResults.filter((r) => r.ok).length
  });
  // Keep last 50 records
  if (lobby.advanceLog.length > 50) lobby.advanceLog.shift();
}

// ── Lobby summary (for UI) ────────────────────────────────────────────────────

export function lobbyStatus(lobby) {
  const activePlayers = lobby.players.filter((p) => p.status !== PLAYER_STATUS.DISCONNECTED);
  const readyCount = activePlayers.filter((p) => p.status === PLAYER_STATUS.READY).length;
  return {
    leagueId: lobby.leagueId,
    leagueName: lobby.leagueName,
    gateStatus: lobby.gateStatus,
    year: lobby.currentYear,
    week: lobby.currentWeek,
    phase: lobby.currentPhase,
    totalPlayers: lobby.players.length,
    readyPlayers: readyCount,
    pendingPlayers: activePlayers.length - readyCount,
    allReady: checkAllReady(lobby),
    pendingIntents: lobby.intentQueue.filter((i) => !i.applied).length,
    players: lobby.players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      teamId: p.controlledTeamId,
      status: p.status,
      isCommissioner: p.isCommissioner
    }))
  };
}
