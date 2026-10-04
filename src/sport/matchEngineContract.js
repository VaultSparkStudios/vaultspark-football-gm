/**
 * Match engine contract (multi-sport Phase 1 step 2).
 *
 * A sport pack's match engine plays one game and RETURNS what happened. It
 * never writes the season stat book: the core applies the returned records
 * through src/stats/applyGameStats.js. That split is what lets a second sport
 * bring its own engine without the core knowing its stat schema, and lets a
 * caller play a game without crediting anyone (a preview or rehearsal simply
 * does not apply the records).
 *
 * @typedef {object} MatchContext
 * @property {object} league
 * @property {object} statBook  read-only here: player lookups for the box score
 * @property {string} homeTeamId
 * @property {string} awayTeamId
 * @property {number} year
 * @property {number} [week]
 * @property {object} rng
 * @property {string} [mode]
 * @property {boolean} [allowTie]
 * @property {"regular"|"playoffs"} [seasonType]
 * @property {string} [label]
 * @property {boolean} [neutralSite]
 * @property {boolean} [homeRested]
 * @property {boolean} [awayRested]
 *
 * Every record carries `seq`: one counter shared by all three lists, so the
 * applier can replay the writes in the order the engine made them.
 *
 * @typedef {object} AppearanceRecord
 * @property {number} seq
 * @property {string} playerId
 * @property {number} year
 * @property {boolean} started
 * @property {string|null} teamId
 * @property {string|null} position
 * @property {string} seasonType
 *
 * @typedef {object} StatDeltaRecord  also the shape of a snap-count record
 * @property {number} seq
 * @property {string} playerId
 * @property {number} year
 * @property {object} delta  nested numeric stat increments (`long` keys take the max)
 * @property {{teamId?: string, position?: string, seasonType: string}|null} meta
 *
 * @typedef {object} MatchOutput
 * @property {object} result  the game result the core already used (scores, winnerId, gameId, boxScore, ...)
 * @property {object} boxScore  the same object as result.boxScore
 * @property {StatDeltaRecord[]} statDeltas  play-by-play production and blocking outcomes
 * @property {AppearanceRecord[]} appearances  starters first, then players who only came off the bench
 * @property {StatDeltaRecord[]} snapCounts  snaps by unit, plus pass/run blocking snaps for linemen
 */

export const MATCH_OUTPUT_RECORD_LISTS = Object.freeze(["statDeltas", "appearances", "snapCounts"]);

const RESULT_KEYS = Object.freeze(["gameId", "homeTeamId", "awayTeamId", "homeScore", "awayScore", "winnerId", "isTie", "boxScore"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deltaProblem(delta, path) {
  if (!isPlainObject(delta)) return `${path} is not an object`;
  for (const [key, value] of Object.entries(delta)) {
    if (isPlainObject(value)) {
      const nested = deltaProblem(value, `${path}.${key}`);
      if (nested) return nested;
    } else if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${path}.${key} is not a finite number`;
    }
  }
  return null;
}

/**
 * Checks a match engine's output against the contract. Returns a list of
 * problems (empty when valid) rather than throwing, so a test can show every
 * violation at once.
 *
 * @param {MatchOutput} output
 * @returns {string[]}
 */
export function validateMatchOutput(output) {
  const problems = [];
  if (!isPlainObject(output)) return ["output is not an object"];
  if (!isPlainObject(output.result)) problems.push("result is missing");
  else {
    for (const key of RESULT_KEYS) {
      if (!(key in output.result)) problems.push(`result.${key} is missing`);
    }
    for (const key of MATCH_OUTPUT_RECORD_LISTS) {
      // Results are spread into saved week results and the game archive.
      if (key in output.result) problems.push(`result.${key} must not ride inside the saved result`);
    }
  }
  if (!isPlainObject(output.boxScore)) problems.push("boxScore is missing");
  else if (output.result && output.boxScore !== output.result.boxScore) problems.push("boxScore is not result.boxScore");

  const seen = new Set();
  for (const list of MATCH_OUTPUT_RECORD_LISTS) {
    if (!Array.isArray(output[list])) {
      problems.push(`${list} is not an array`);
      continue;
    }
    output[list].forEach((record, index) => {
      const at = `${list}[${index}]`;
      if (!isPlainObject(record)) {
        problems.push(`${at} is not an object`);
        return;
      }
      if (!Number.isInteger(record.seq) || record.seq < 0) problems.push(`${at}.seq is not a non-negative integer`);
      else if (seen.has(record.seq)) problems.push(`${at}.seq ${record.seq} is reused`);
      else seen.add(record.seq);
      if (typeof record.playerId !== "string" || !record.playerId) problems.push(`${at}.playerId is missing`);
      if (!Number.isInteger(record.year)) problems.push(`${at}.year is not an integer`);
      if (list === "appearances") {
        if (typeof record.started !== "boolean") problems.push(`${at}.started is not a boolean`);
        if (typeof record.seasonType !== "string") problems.push(`${at}.seasonType is missing`);
      } else {
        const problem = deltaProblem(record.delta, `${at}.delta`);
        if (problem) problems.push(problem);
        if (record.meta !== null && !isPlainObject(record.meta)) problems.push(`${at}.meta is not an object`);
        else if (record.meta && typeof record.meta.seasonType !== "string") problems.push(`${at}.meta.seasonType is missing`);
      }
    });
  }
  if (seen.size && Math.max(...seen) !== seen.size - 1) problems.push("seq values are not a contiguous 0..n-1 run");
  return problems;
}
