/**
 * Competition contract (multi-sport Phase 1 steps 5-6).
 *
 * A sport pack's `competition` decides WHO plays WHOM: the regular-season
 * schedule and the postseason format (seeding, the bracket, the next game,
 * completion). The core decides nothing about the format. It asks the pack
 * for the schedule, plays each game through the pack's match engine, applies
 * the stat records, and hands each postseason result back to the pack
 * (src/engine/seasonSimulator.js; GameSession's postseason flow).
 *
 * @typedef {object} ScheduledGame
 * @property {string} homeTeamId
 * @property {string} awayTeamId
 * @property {string} [tag]  how the formula paired them (diagnostics only)
 *
 * @typedef {object} ScheduleWeek
 * @property {number} week  1-based
 * @property {ScheduledGame[]} games  a team plays at most once per week; absent means a bye
 *
 * @typedef {object} PostseasonGame  what `nextGame` names
 * @property {string} homeTeamId
 * @property {string} awayTeamId
 * @property {string} round
 * @property {string} [conference]  the bracket group, when the format has groups
 * @property {boolean} [neutralSite]
 *
 * @typedef {object} PostseasonResult  what `result` returns once the bracket is complete
 * @property {object} standings
 * @property {object} bracket
 * @property {{championTeamId: string, runnerUpTeamId: string, homeScore: number, awayScore: number}} superBowl
 *   the final. The key is still football's name; renaming it to `championship`
 *   is a separate step because saves and history rows store it.
 * @property {object[]} gameArchiveEntries
 * @property {object|null} divisionRanksForNextYear  passed back to the next `buildSchedule`
 *
 * @typedef {object} SportPostseason
 * @property {(league: object) => object} seeds  qualifiers and their seeds, by group
 * @property {(args: {league: object, year: number}) => object} createState
 *   a serializable bracket state with `status` "active" | "completed" (it is saved mid-postseason)
 * @property {(state: object) => PostseasonGame|null} nextGame
 * @property {(game: PostseasonGame) => string} gameLabel  match-engine label (part of the game id)
 * @property {(args: {state: object, league: object, next: PostseasonGame, result: object}) => string} recordResult
 *   records a played game in the state, advances it, returns the winner's id
 * @property {(state: object) => PostseasonResult|null} result  null until completed
 * @property {Object<string, number>} [roundWeeks]  the week number shown for each round
 *
 * @typedef {object} SportCompetition
 * @property {(args: {league: object, year: number, previousDivisionRanks: object|null, rng: object}) => ScheduleWeek[]} buildSchedule
 * @property {SportPostseason} postseason
 */

export const POSTSEASON_FUNCTIONS = Object.freeze(["seeds", "createState", "nextGame", "gameLabel", "recordResult", "result"]);

/**
 * Checks a pack's competition shape. Returns a list of problems (empty when
 * valid) so a test can show every violation at once.
 *
 * @param {SportCompetition} competition
 * @returns {string[]}
 */
export function validateCompetition(competition) {
  if (!competition || typeof competition !== "object") return ["competition is missing"];
  const problems = [];
  if (typeof competition.buildSchedule !== "function") problems.push("competition.buildSchedule is not a function");
  const postseason = competition.postseason;
  if (!postseason || typeof postseason !== "object") {
    problems.push("competition.postseason is missing");
    return problems;
  }
  for (const name of POSTSEASON_FUNCTIONS) {
    if (typeof postseason[name] !== "function") problems.push(`competition.postseason.${name} is not a function`);
  }
  if (postseason.roundWeeks != null && typeof postseason.roundWeeks !== "object") {
    problems.push("competition.postseason.roundWeeks is not an object");
  }
  return problems;
}

/**
 * Checks a built schedule against the structure it was built for: weeks are
 * 1..N in order, nobody plays twice in a week, and every team plays
 * `gamesPerTeam` games. Returns a list of problems.
 *
 * @param {ScheduleWeek[]} weeks
 * @param {{teamIds: string[], gamesPerTeam: number, weeks: number}} expected
 * @returns {string[]}
 */
export function validateSchedule(weeks, { teamIds, gamesPerTeam, weeks: weekCount }) {
  const problems = [];
  if (!Array.isArray(weeks)) return ["schedule is not an array"];
  if (weeks.length !== weekCount) problems.push(`schedule has ${weeks.length} weeks, expected ${weekCount}`);
  const games = new Map(teamIds.map((id) => [id, 0]));
  weeks.forEach((week, index) => {
    if (week.week !== index + 1) problems.push(`week at index ${index} is numbered ${week.week}`);
    const seen = new Set();
    for (const game of week.games || []) {
      for (const id of [game.homeTeamId, game.awayTeamId]) {
        if (!games.has(id)) problems.push(`week ${week.week} names unknown team ${id}`);
        else games.set(id, games.get(id) + 1);
        if (seen.has(id)) problems.push(`${id} plays twice in week ${week.week}`);
        seen.add(id);
      }
      if (game.homeTeamId === game.awayTeamId) problems.push(`${game.homeTeamId} plays itself in week ${week.week}`);
    }
  });
  for (const [id, count] of games) {
    if (count !== gamesPerTeam) problems.push(`${id} plays ${count} games, expected ${gamesPerTeam}`);
  }
  return problems;
}
