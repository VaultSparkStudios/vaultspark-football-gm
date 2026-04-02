/**
 * Speedrun Challenge Mode
 * - Tracks seasons elapsed since challenge start
 * - Detects Super Bowl win (championship flag in postseason results)
 * - Records completion: seasons count, team, difficulty settings
 * - Formats leaderboard entries for Gist storage
 */

/**
 * Start a new speedrun challenge.
 * @param {string} teamId - Controlled team ID
 * @param {object} [settings] - Difficulty / league settings snapshot
 * @returns {object} challenge state
 */
export function startChallenge(teamId, settings = {}) {
  return {
    active: true,
    teamId,
    startYear: settings.startYear || 1,
    settings: {
      difficulty: settings.difficulty || "normal",
      injuryRate: settings.injuryRate ?? 1,
      tradeAggression: settings.tradeAggression ?? 50
    },
    seasonsElapsed: 0
  };
}

/**
 * Advance the challenge by one season.
 * @param {object} challengeState
 * @returns {object} updated state (new object)
 */
export function advanceChallengeSeason(challengeState) {
  if (!challengeState || !challengeState.active) return challengeState;
  return {
    ...challengeState,
    seasonsElapsed: challengeState.seasonsElapsed + 1
  };
}

/**
 * Check whether the controlled team won the championship this season.
 * @param {object} challengeState
 * @param {object} postseasonResults - must contain `.superBowl.championTeamId`
 * @param {string} controlledTeamId
 * @returns {{ complete: boolean, seasonsElapsed: number }}
 */
export function checkChallengeComplete(challengeState, postseasonResults, controlledTeamId) {
  if (!challengeState || !challengeState.active) {
    return { complete: false, seasonsElapsed: 0 };
  }
  const championId = postseasonResults?.superBowl?.championTeamId
    || postseasonResults?.championTeamId
    || null;
  const won = championId != null && championId === controlledTeamId;
  return {
    complete: won,
    seasonsElapsed: challengeState.seasonsElapsed
  };
}

/**
 * Format a completed challenge into a leaderboard entry.
 * @param {object} challengeState
 * @param {string} playerName
 * @returns {object} leaderboard entry
 */
export function formatLeaderboardEntry(challengeState, playerName) {
  return {
    playerName: playerName || "Anonymous",
    teamId: challengeState.teamId,
    seasons: challengeState.seasonsElapsed,
    date: new Date().toISOString(),
    settings: challengeState.settings || {}
  };
}

/**
 * Parse a JSON leaderboard string into a sorted array.
 * @param {string} gistContent - JSON string
 * @returns {Array} sorted entries (fewest seasons first, then earliest date)
 */
export function parseLeaderboard(gistContent) {
  try {
    const entries = JSON.parse(gistContent);
    if (!Array.isArray(entries)) return [];
    return sortEntries(entries);
  } catch {
    return [];
  }
}

/**
 * Serialize leaderboard entries to a JSON string.
 * @param {Array} entries
 * @returns {string}
 */
export function serializeLeaderboard(entries) {
  return JSON.stringify(Array.isArray(entries) ? entries : [], null, 2);
}

/**
 * Insert a new entry into the sorted leaderboard and return its 1-based rank.
 * @param {Array} entries - existing sorted entries
 * @param {object} newEntry
 * @returns {{ rank: number, entries: Array }}
 */
export function rankEntry(entries, newEntry) {
  const list = Array.isArray(entries) ? [...entries] : [];
  list.push(newEntry);
  const sorted = sortEntries(list);
  const rank = sorted.findIndex(
    (e) => e.playerName === newEntry.playerName && e.date === newEntry.date && e.seasons === newEntry.seasons
  ) + 1;
  return { rank: rank || sorted.length, entries: sorted };
}

/** Sort by fewest seasons ascending, then earliest date ascending. */
function sortEntries(entries) {
  return entries.slice().sort((a, b) => {
    if (a.seasons !== b.seasons) return a.seasons - b.seasons;
    return (a.date || "").localeCompare(b.date || "");
  });
}
