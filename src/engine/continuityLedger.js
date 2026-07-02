/**
 * continuityLedger.js — Narrative Continuity + Consequence Layer (S29)
 *
 * Makes the story layer compound instead of running as parallel flavour
 * generators:
 *
 *   1. EVENT FEEDBACK — narrative events apply small, bounded deltas to the
 *      real systems they describe (morale, chemistry, owner hot-seat), so a
 *      CULTURE_CRISIS is a gameplay problem, not just a headline.
 *   2. OPEN THREADS — crisis-class events open a thread the league tracks
 *      week to week; threads resolve on real conditions (trade granted,
 *      chemistry recovered, owner target back in reach) and the resolution
 *      is reported, closing the loop the headline opened.
 *   3. PRESS MEMORY — the ledger remembers last week's press-room tone so
 *      the coach can reference the promise he made ("this won't happen
 *      again") and either own it or eat it.
 *
 * All mutations are bounded and idempotent per event. State rides on
 * league.continuityLedger and serializes with saves.
 */

const THREAD_MAX = 12;

export function ensureLedger(league) {
  if (!league.continuityLedger || typeof league.continuityLedger !== "object") {
    league.continuityLedger = { lastPress: null, openThreads: [] };
  }
  if (!Array.isArray(league.continuityLedger.openThreads)) {
    league.continuityLedger.openThreads = [];
  }
  return league.continuityLedger;
}

// ── Bounded stat helpers ─────────────────────────────────────────────────────

function clampStat(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function adjustChemistry(team, delta) {
  if (!team) return;
  if (team.worldState?.culture && typeof team.worldState.culture.chemistry === "number") {
    team.worldState.culture.chemistry = clampStat(team.worldState.culture.chemistry + delta);
  }
  if (team.culture && typeof team.culture.chemistry === "number") {
    team.culture.chemistry = clampStat(team.culture.chemistry + delta);
  }
}

function adjustHotSeat(team, delta) {
  if (!team) return;
  if (team.worldState?.owner && typeof team.worldState.owner.hotSeat === "number") {
    team.worldState.owner.hotSeat = clampStat(team.worldState.owner.hotSeat + delta);
  }
  if (team.owner && typeof team.owner.hotSeat === "number") {
    team.owner.hotSeat = clampStat(team.owner.hotSeat + delta);
  }
}

function adjustMorale(player, delta) {
  if (!player) return;
  player.morale = clampStat((player.morale ?? 60) + delta);
}

// ── 1 · Event feedback (called once per pushed event) ───────────────────────

export function applyEventFeedback(league, event) {
  const team = league.teams?.find((t) => t.id === event.teamIds?.[0]);
  const player = event.playerIds?.[0]
    ? league.players?.find((p) => p.id === event.playerIds[0])
    : null;

  switch (event.type) {
    case "TRADE_REQUEST":
      adjustChemistry(team, -2);
      if (player) player.narrativePressure = { type: "trade-request", year: event.year };
      break;
    case "BREAKOUT_FLAG":
      adjustMorale(player, +4);
      adjustChemistry(team, +1);
      break;
    case "RIVAL_OFFER":
      adjustMorale(player, -2);
      if (player) player.narrativePressure = { type: "rival-offer", year: event.year };
      break;
    case "CULTURE_CRISIS":
      adjustChemistry(team, -3);
      adjustHotSeat(team, +5);
      break;
    case "OWNER_ULTIMATUM":
      adjustHotSeat(team, +3);
      adjustChemistry(team, -1);
      break;
    case "LEGEND_FAREWELL":
      adjustMorale(player, +2);
      adjustChemistry(team, +1);
      break;
    default:
      break;
  }
}

// ── 2 · Open threads ─────────────────────────────────────────────────────────

const THREAD_TYPES = new Set(["TRADE_REQUEST", "CULTURE_CRISIS", "OWNER_ULTIMATUM"]);

export function openThreadForEvent(league, event) {
  if (!THREAD_TYPES.has(event.type)) return null;
  const ledger = ensureLedger(league);
  const key = `${event.type}:${event.playerIds?.[0] || event.teamIds?.[0] || "gen"}:${event.year}`;
  if (ledger.openThreads.some((t) => t.key === key)) return null;

  const thread = {
    key,
    type: event.type,
    year: event.year,
    openedWeek: event.week,
    teamId: event.teamIds?.[0] || null,
    playerId: event.playerIds?.[0] || null,
    headline: event.headline
  };
  ledger.openThreads.unshift(thread);
  if (ledger.openThreads.length > THREAD_MAX) ledger.openThreads.length = THREAD_MAX;
  return thread;
}

function threadResolution(league, thread) {
  const team = league.teams?.find((t) => t.id === thread.teamId);
  const player = thread.playerId ? league.players?.find((p) => p.id === thread.playerId) : null;

  if (thread.type === "TRADE_REQUEST" && player) {
    if (player.teamId !== thread.teamId) {
      return `${player.name} got his wish — the trade-request saga in ${thread.teamId} is over.`;
    }
    if ((player.morale ?? 60) >= 55) {
      return `${player.name} and ${thread.teamId} have mended fences; the trade request is off the table.`;
    }
  }
  if (thread.type === "CULTURE_CRISIS" && team) {
    const chemistry = team.worldState?.culture?.chemistry ?? team.culture?.chemistry ?? 60;
    const streak = team.season?.streak || 0;
    if (chemistry >= 48 || streak >= 2) {
      return `The ${thread.teamId} locker room has stabilized — the culture crisis has passed.`;
    }
  }
  if (thread.type === "OWNER_ULTIMATUM" && team) {
    const targetWins = team.worldState?.owner?.mandate?.targetWins || team.owner?.mandate?.targetWins || 9;
    const wins = team.season?.wins || 0;
    if (wins >= targetWins - 2) {
      return `${thread.teamId} ownership steps back from the brink — the win column answered the ultimatum.`;
    }
  }
  return null;
}

/**
 * Check open threads against live state. Returns resolved threads (with a
 * `resolution` line) so the caller can report them. Threads from previous
 * seasons are pruned silently.
 */
export function resolveThreads(league, { year, week }) {
  const ledger = ensureLedger(league);
  const resolved = [];
  const remaining = [];

  for (const thread of ledger.openThreads) {
    if (thread.year < year) continue; // stale season — prune silently
    if (thread.year === year && thread.openedWeek === week) {
      remaining.push(thread); // never resolve the week it opened
      continue;
    }
    const resolution = threadResolution(league, thread);
    if (resolution) {
      resolved.push({ ...thread, resolution, resolvedWeek: week });
    } else {
      remaining.push(thread);
    }
  }

  ledger.openThreads = remaining;
  return resolved;
}

// ── 3 · Press memory ─────────────────────────────────────────────────────────

export function recordPress(league, entry) {
  const ledger = ensureLedger(league);
  ledger.lastPress = {
    year: entry.year,
    week: entry.week,
    tone: entry.tone,
    isWin: entry.isWin,
    opponent: entry.opponent || null,
    score: entry.score || null
  };
}

/**
 * Return last week's press entry if (and only if) it is exactly the
 * previous week of the same season — continuity has no memory across gaps.
 */
export function getLastPress(league, { year, week }) {
  const last = ensureLedger(league).lastPress;
  if (!last) return null;
  if (last.year !== year || last.week !== week - 1) return null;
  return last;
}
