/**
 * weekResultProjection.js — keep saves inside a browser storage budget (S65).
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 *
 * A `mode:"play"` snapshot measured **~30.7 MB after six regular-season weeks**,
 * with `league.weeklyHistory` alone projecting **~24 MB across a season**. A
 * typical localStorage origin budget is 5–10 MB, so a franchise could not finish
 * one season — the `Auto-backup skipped: Browser storage is full` messages in
 * test output were that ceiling being hit for real.
 *
 * Two causes, both addressed here:
 *
 *   1. **Full box scores were retained per game, forever.** A retained game
 *      weighed ~84 KB, of which `boxScore` (with complete play-by-play) was
 *      ~98%. The same games were stored in `league.weeklyHistory`,
 *      `weekResultsCurrentSeason` *and* `league.history[].weekly`.
 *   2. **`weeklyHistory` was never pruned**, accumulating every week of every
 *      season for the life of the franchise.
 *
 * ── Why this is safe ────────────────────────────────────────────────────────
 *
 * Box scores are not lost: `league.gameArchive` already stores them under an
 * explicit summary, capped at 800 entries, and **every** box-score consumer
 * reads through `GameSession.getBoxScore(gameId)` → `gameArchive`:
 *
 *   - `/api/boxscore` (the box-score modal and the sim-watch overlay)
 *   - `getRecentBoxScores` → `dashboard.recentBoxScores`
 *   - `whatIfReplay`, via its injected `getBoxScore` lookup
 *
 * The tactical film receipt also reads `game.boxScore`, but it is built inside
 * `advanceWeekCommand` from the **live** `advanceWeek()` return value, before
 * anything is persisted. This module never touches that live object — it
 * projects a copy on the way into storage.
 *
 * Every remaining reader of the stored week records uses only identity and
 * scoreline fields, which is exactly what `LEAN_GAME_FIELDS` preserves:
 *
 *   - `getWeekSchedule` / `getSeasonWeeks` (GameSession) — team ids, scores,
 *     winner, tie
 *   - `dashboard.latestWeekResults` → `renderWeekResults`, `simulationCheckpoints`
 *   - the Opening Contract receipt search
 *   - `league.history[].weekly` playback for past seasons
 *
 * `homeStrategy`, `awayStrategy` and `matchupEdges` are dropped deliberately:
 * they have no reader anywhere outside the simulator that produced them.
 */

/**
 * The only per-game fields any stored-week reader consumes.
 * `gameId` is kept so a lean record can still resolve its full box score
 * from `gameArchive`.
 */
export const LEAN_GAME_FIELDS = Object.freeze([
  "gameId",
  "year",
  "week",
  "seasonType",
  "label",
  "homeTeamId",
  "awayTeamId",
  "homeScore",
  "awayScore",
  "winnerId",
  "isTie"
]);

/** Week-level fields worth keeping alongside the games. */
const LEAN_WEEK_FIELDS = Object.freeze(["year", "week", "seasonType", "byeTeams"]);

/** Project one simulated game down to its stored form. */
export function toLeanGame(game) {
  if (!game || typeof game !== "object") return game;
  const lean = {};
  for (const field of LEAN_GAME_FIELDS) {
    if (game[field] !== undefined) lean[field] = game[field];
  }
  return lean;
}

/**
 * Project a week result down to its stored form.
 *
 * Returns a new object — the live `weekResult` handed back to callers keeps its
 * box scores, so post-game consumers (press room, tactical film, celebration
 * moments) are unaffected.
 */
export function toLeanWeekResult(weekResult) {
  if (!weekResult || typeof weekResult !== "object") return weekResult;
  const lean = {};
  for (const field of LEAN_WEEK_FIELDS) {
    if (weekResult[field] !== undefined) lean[field] = weekResult[field];
  }
  lean.games = Array.isArray(weekResult.games) ? weekResult.games.map(toLeanGame) : [];
  return lean;
}

/**
 * Drop weekly history for seasons other than `currentYear`.
 *
 * `weeklyHistory` is only ever read for the current season — completed seasons
 * are served from `league.history[].weekly` by `getSeasonWeeks`. Retaining them
 * in both places was pure duplication that grew without bound.
 */
export function pruneWeeklyHistory(league, currentYear) {
  if (!league || !Array.isArray(league.weeklyHistory)) return 0;
  const year = Number(currentYear);
  const before = league.weeklyHistory.length;
  league.weeklyHistory = league.weeklyHistory.filter((entry) => Number(entry?.year) === year);
  return before - league.weeklyHistory.length;
}

/**
 * Rewrite an already-persisted snapshot into the lean shape.
 *
 * Existing franchises carry fat history that would otherwise never shrink, so
 * loading a legacy save is the moment to reclaim it. Idempotent: running it on
 * an already-lean snapshot changes nothing.
 *
 * @returns {{ games: number, weeksPruned: number }} what was reclaimed
 */
export function leanifySnapshot(snapshot) {
  const reclaimed = { games: 0, weeksPruned: 0 };
  if (!snapshot || typeof snapshot !== "object") return reclaimed;

  const countAndLean = (weeks) => {
    if (!Array.isArray(weeks)) return weeks;
    return weeks.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      for (const game of entry.games || []) {
        if (game && typeof game === "object" && game.boxScore !== undefined) reclaimed.games += 1;
      }
      return { ...toLeanWeekResult(entry), ...(entry.year !== undefined ? { year: entry.year } : {}) };
    });
  };

  if (Array.isArray(snapshot.weekResultsCurrentSeason)) {
    snapshot.weekResultsCurrentSeason = countAndLean(snapshot.weekResultsCurrentSeason);
  }

  const league = snapshot.league;
  if (league && typeof league === "object") {
    if (Array.isArray(league.weeklyHistory)) {
      league.weeklyHistory = countAndLean(league.weeklyHistory);
      reclaimed.weeksPruned = pruneWeeklyHistory(league, snapshot.currentYear);
    }
    for (const season of league.history || []) {
      if (season && Array.isArray(season.weekly)) season.weekly = countAndLean(season.weekly);
    }
    // A legacy save's archive is the other half of the reclaim; applying the
    // same retention on load means an existing franchise shrinks the moment it
    // is opened rather than only for games played from here on.
    const archive = applyArchiveRetention(league);
    reclaimed.archiveDropped = archive.dropped;
    reclaimed.archiveTrimmed = archive.trimmed;
  }

  return reclaimed;
}

// ── Game archive retention ───────────────────────────────────────────────────

/**
 * How many of the most recent archived games keep their full play-by-play.
 *
 * Play-by-play is 68% of an archived box score (~57 KB of ~84 KB). It is
 * genuinely used — the sim-watch overlay animates it for the game you just
 * played, and the box-score modal renders a drive log — but only the recent
 * window is ever replayed in practice, while retaining it for every game is
 * what pushed saves past a browser storage quota.
 *
 * Three weeks of league-wide games is a generous window: it always covers the
 * just-played week that sim-watch replays, plus a margin.
 */
export const PLAY_BY_PLAY_RETAINED_GAMES = 48;

/**
 * How many games stay in the archive at all.
 *
 * `gameArchive` is a *recent-games* box-score store, not the permanent record —
 * standings, champions and season history live in `league.history`. One full
 * season keeps every team's recent box scores well inside reach of
 * `getRecentBoxScores`, which never looks past a team's last 20.
 */
export const ARCHIVE_RETAINED_GAMES = 272;

/**
 * Trim the archive in place: cap its length, then drop play-by-play from every
 * entry outside the recent window.
 *
 * Trimmed entries are marked with `playByPlayTrimmed: true` so the UI can say
 * plainly that a drive log is no longer stored, rather than rendering an empty
 * table and letting the player think the game had no plays.
 *
 * @returns {{ dropped: number, trimmed: number }}
 */
export function applyArchiveRetention(league) {
  const result = { dropped: 0, trimmed: 0 };
  if (!league || !Array.isArray(league.gameArchive)) return result;

  if (league.gameArchive.length > ARCHIVE_RETAINED_GAMES) {
    result.dropped = league.gameArchive.length - ARCHIVE_RETAINED_GAMES;
    league.gameArchive = league.gameArchive.slice(-ARCHIVE_RETAINED_GAMES);
  }

  const keepFrom = league.gameArchive.length - PLAY_BY_PLAY_RETAINED_GAMES;
  league.gameArchive.forEach((entry, index) => {
    const box = entry?.boxScore;
    if (!box || index >= keepFrom) return;
    if (box.playByPlay === undefined && box.playByPlayTrimmed) return;
    if (box.playByPlay !== undefined) {
      delete box.playByPlay;
      box.playByPlayTrimmed = true;
      result.trimmed += 1;
    }
  });

  return result;
}
