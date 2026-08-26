import { NFL_STRUCTURE } from "../config.js";
import { simulateGame } from "./gameSimulator.js";
import { buildSeasonSchedule } from "./schedule.js";

export function winPct(team) {
  const games = team.season.wins + team.season.losses + team.season.ties;
  if (!games) return 0;
  return (team.season.wins + 0.5 * team.season.ties) / games;
}

function resultPoints(result) {
  if (result === "W") return 1;
  if (result === "T") return 0.5;
  return 0;
}

function recordPctFromEntries(entries) {
  if (!entries.length) return null;
  const points = entries.reduce((sum, entry) => sum + resultPoints(entry.result), 0);
  return points / entries.length;
}

function recordPctAgainstSet(team, opponentSet) {
  const entries = (team.season.weekResults || []).filter((entry) => opponentSet.has(entry.opponent));
  return recordPctFromEntries(entries);
}

function headToHeadPct(team, tieGroup) {
  const opponents = new Set(tieGroup.filter((entry) => entry.id !== team.id).map((entry) => entry.id));
  return recordPctAgainstSet(team, opponents);
}

function divisionPct(team, allTeams) {
  const opponents = new Set(
    allTeams
      .filter(
        (entry) => entry.id !== team.id && entry.conference === team.conference && entry.division === team.division
      )
      .map((entry) => entry.id)
  );
  return recordPctAgainstSet(team, opponents);
}

function conferencePct(team, allTeams) {
  const opponents = new Set(
    allTeams.filter((entry) => entry.id !== team.id && entry.conference === team.conference).map((entry) => entry.id)
  );
  return recordPctAgainstSet(team, opponents);
}

function pointDifferential(team) {
  return (team.season.pointsFor || 0) - (team.season.pointsAgainst || 0);
}

function compareNullableDesc(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function sortTieGroup(group, allTeams) {
  const sameDivision = group.every(
    (entry) => entry.conference === group[0].conference && entry.division === group[0].division
  );
  const sameConference = group.every((entry) => entry.conference === group[0].conference);

  return group.slice().sort((a, b) => {
    const h2hCmp = compareNullableDesc(headToHeadPct(a, group), headToHeadPct(b, group));
    if (h2hCmp !== 0) return h2hCmp;

    if (sameDivision) {
      const divCmp = compareNullableDesc(divisionPct(a, allTeams), divisionPct(b, allTeams));
      if (divCmp !== 0) return divCmp;
    }

    if (sameConference) {
      const confCmp = compareNullableDesc(conferencePct(a, allTeams), conferencePct(b, allTeams));
      if (confCmp !== 0) return confCmp;
    }

    return (
      pointDifferential(b) - pointDifferential(a) ||
      (b.season.pointsFor || 0) - (a.season.pointsFor || 0) ||
      b.overallRating - a.overallRating ||
      a.id.localeCompare(b.id)
    );
  });
}

export function sortStandings(teams) {
  const base = teams.slice().sort((a, b) => winPct(b) - winPct(a) || b.season.wins - a.season.wins);
  const ranked = [];
  let index = 0;

  while (index < base.length) {
    const currentPct = winPct(base[index]);
    let end = index + 1;
    while (end < base.length && Math.abs(winPct(base[end]) - currentPct) < 1e-9) end += 1;

    const tieGroup = base.slice(index, end);
    const resolved = tieGroup.length > 1 ? sortTieGroup(tieGroup, teams) : tieGroup;
    ranked.push(...resolved);
    index = end;
  }

  return ranked;
}

/**
 * Add one game's contribution to a season counter, treating a missing or
 * non-finite running total as zero so a single bad value cannot poison the rest
 * of the season. Non-finite contributions are dropped, not accumulated.
 */
function addSeasonCounter(season, key, delta) {
  const running = Number(season[key]);
  const add = Number(delta);
  season[key] = (Number.isFinite(running) ? running : 0) + (Number.isFinite(add) ? add : 0);
}

export function applyRegularSeasonResult(league, week, result) {
  const home = league.teams.find((t) => t.id === result.homeTeamId);
  const away = league.teams.find((t) => t.id === result.awayTeamId);
  if (!home || !away) return;

  // S71: accumulate through a finite guard. A season record that arrives from an
  // older save missing a counter would otherwise pin it at NaN for the whole
  // year, and every downstream reader takes these as `x || 0` — which launders
  // the NaN into a zero denominator instead of raising it.
  addSeasonCounter(home.season, "pointsFor", result.homeScore);
  addSeasonCounter(home.season, "pointsAgainst", result.awayScore);
  addSeasonCounter(home.season, "yardsFor", result.homeYards);
  addSeasonCounter(home.season, "yardsAgainst", result.awayYards);
  addSeasonCounter(home.season, "drivesFor", result.homeDrives);
  addSeasonCounter(home.season, "drivesAgainst", result.awayDrives);
  addSeasonCounter(home.season, "turnovers", result.homeTurnovers);
  addSeasonCounter(away.season, "pointsFor", result.awayScore);
  addSeasonCounter(away.season, "pointsAgainst", result.homeScore);
  addSeasonCounter(away.season, "yardsFor", result.awayYards);
  addSeasonCounter(away.season, "yardsAgainst", result.homeYards);
  addSeasonCounter(away.season, "drivesFor", result.awayDrives);
  addSeasonCounter(away.season, "drivesAgainst", result.homeDrives);
  addSeasonCounter(away.season, "turnovers", result.awayTurnovers);

  if (result.isTie) {
    home.season.ties += 1;
    away.season.ties += 1;
    home.season.weekResults.push({ week, opponent: away.id, result: "T", score: `${result.homeScore}-${result.awayScore}` });
    away.season.weekResults.push({ week, opponent: home.id, result: "T", score: `${result.awayScore}-${result.homeScore}` });
    return;
  }

  const homeWon = result.winnerId === home.id;
  if (homeWon) {
    home.season.wins += 1;
    away.season.losses += 1;
    home.season.weekResults.push({ week, opponent: away.id, result: "W", score: `${result.homeScore}-${result.awayScore}` });
    away.season.weekResults.push({ week, opponent: home.id, result: "L", score: `${result.awayScore}-${result.homeScore}` });
  } else {
    away.season.wins += 1;
    home.season.losses += 1;
    home.season.weekResults.push({ week, opponent: away.id, result: "L", score: `${result.homeScore}-${result.awayScore}` });
    away.season.weekResults.push({ week, opponent: home.id, result: "W", score: `${result.awayScore}-${result.homeScore}` });
  }
}

export function conferenceStandings(league, conference) {
  return sortStandings(league.teams.filter((t) => t.conference === conference));
}

export function divisionStandings(league, conference, division) {
  return sortStandings(league.teams.filter((t) => t.conference === conference && t.division === division));
}

export function getPlayoffSeeds(league, conference) {
  const divisions = [...new Set(league.teams.filter((t) => t.conference === conference).map((t) => t.division))];
  const divisionWinners = divisions.map((d) => divisionStandings(league, conference, d)[0]);
  const sortedDivisionWinners = sortStandings(divisionWinners);

  const nonWinners = league.teams.filter(
    (team) => team.conference === conference && !sortedDivisionWinners.some((w) => w.id === team.id)
  );
  const wildCards = sortStandings(nonWinners).slice(0, 3);
  const seeds = [...sortedDivisionWinners, ...wildCards].slice(0, NFL_STRUCTURE.playoffTeamsPerConference);
  seeds.forEach((team, index) => {
    team.playoffSeed = index + 1;
  });
  return seeds;
}

function simulateBracketGame({ league, statBook, year, rng, higherSeedTeam, lowerSeedTeam, mode, label }) {
  const result = simulateGame({
    league,
    statBook,
    homeTeamId: higherSeedTeam.id,
    awayTeamId: lowerSeedTeam.id,
    year,
    week: 0,
    rng,
    mode,
    allowTie: false,
    seasonType: "playoffs",
    label
  });
  const winner = result.winnerId === higherSeedTeam.id ? higherSeedTeam : lowerSeedTeam;
  return { result, winner };
}

function bracketGameRow({ conference, round, higherSeedTeam, lowerSeedTeam, result }) {
  return {
    conference,
    round,
    gameId: result.gameId,
    homeTeamId: higherSeedTeam.id,
    awayTeamId: lowerSeedTeam.id,
    homeSeed: higherSeedTeam.playoffSeed,
    awaySeed: lowerSeedTeam.playoffSeed,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    winnerId: result.winnerId
  };
}

function lowestRemaining(seedTeams) {
  return seedTeams.slice().sort((a, b) => b.playoffSeed - a.playoffSeed)[0];
}

function runConferencePlayoffs({ league, statBook, year, rng, conference, mode }) {
  const seeds = getPlayoffSeeds(league, conference);
  const bySeed = Object.fromEntries(seeds.map((team) => [team.playoffSeed, team]));
  const advancing = [bySeed[1]];
  const bracket = {
    wildcard: [],
    divisional: [],
    conference: []
  };
  const gameDetails = [];

  const wildcardGames = [
    [2, 7],
    [3, 6],
    [4, 5]
  ];
  for (const [high, low] of wildcardGames) {
    const matchup = simulateBracketGame({
      league,
      statBook,
      year,
      rng,
      higherSeedTeam: bySeed[high],
      lowerSeedTeam: bySeed[low],
      mode,
      label: `${conference.toLowerCase()}-wildcard`
    });
    bracket.wildcard.push(
      bracketGameRow({
        conference,
        round: "wildcard",
        higherSeedTeam: bySeed[high],
        lowerSeedTeam: bySeed[low],
        result: matchup.result
      })
    );
    gameDetails.push({ conference, round: "wildcard", ...matchup.result });
    advancing.push(matchup.winner);
  }

  const divRoundTeams = advancing.slice();
  const topSeed = bySeed[1];
  const opponentForTop = lowestRemaining(divRoundTeams.filter((t) => t.id !== topSeed.id));
  const otherTwo = divRoundTeams.filter((t) => t.id !== topSeed.id && t.id !== opponentForTop.id).sort((a, b) => a.playoffSeed - b.playoffSeed);

  const div1 = simulateBracketGame({
    league,
    statBook,
    year,
    rng,
    higherSeedTeam: topSeed,
    lowerSeedTeam: opponentForTop,
    mode,
    label: `${conference.toLowerCase()}-divisional`
  });
  const div2 = simulateBracketGame({
    league,
    statBook,
    year,
    rng,
    higherSeedTeam: otherTwo[0],
    lowerSeedTeam: otherTwo[1],
    mode,
    label: `${conference.toLowerCase()}-divisional`
  });
  bracket.divisional.push(
    bracketGameRow({
      conference,
      round: "divisional",
      higherSeedTeam: topSeed,
      lowerSeedTeam: opponentForTop,
      result: div1.result
    })
  );
  gameDetails.push({ conference, round: "divisional", ...div1.result });
  bracket.divisional.push(
    bracketGameRow({
      conference,
      round: "divisional",
      higherSeedTeam: otherTwo[0],
      lowerSeedTeam: otherTwo[1],
      result: div2.result
    })
  );
  gameDetails.push({ conference, round: "divisional", ...div2.result });

  const conferenceChampionship = simulateBracketGame({
    league,
    statBook,
    year,
    rng,
    higherSeedTeam: div1.winner.playoffSeed < div2.winner.playoffSeed ? div1.winner : div2.winner,
    lowerSeedTeam: div1.winner.playoffSeed < div2.winner.playoffSeed ? div2.winner : div1.winner,
    mode,
    label: `${conference.toLowerCase()}-conference`
  });
  bracket.conference.push(
    bracketGameRow({
      conference,
      round: "conference",
      higherSeedTeam: div1.winner.playoffSeed < div2.winner.playoffSeed ? div1.winner : div2.winner,
      lowerSeedTeam: div1.winner.playoffSeed < div2.winner.playoffSeed ? div2.winner : div1.winner,
      result: conferenceChampionship.result
    })
  );
  gameDetails.push({ conference, round: "conference", ...conferenceChampionship.result });

  return {
    champion: conferenceChampionship.winner,
    seeds: seeds.map((team) => ({ teamId: team.id, seed: team.playoffSeed })),
    bracket,
    gameDetails
  };
}

export function buildDivisionRankMap(league) {
  const rankMap = {};
  for (const conference of NFL_STRUCTURE.conferences) {
    const divisions = [...new Set(league.teams.filter((t) => t.conference === conference).map((t) => t.division))];
    for (const division of divisions) {
      const ranked = divisionStandings(league, conference, division);
      ranked.forEach((team, index) => {
        rankMap[team.id] = index + 1;
      });
    }
  }
  return rankMap;
}

export const POSTSEASON_STATE_SCHEMA_VERSION = "1.0";

const POSTSEASON_STAGE_ORDER = Object.freeze([
  "AFC-wildcard",
  "AFC-divisional",
  "AFC-conference",
  "NFC-wildcard",
  "NFC-divisional",
  "NFC-conference",
  "NFL-super-bowl"
]);

function teamForPostseason(league, teamId) {
  return league.teams.find((team) => team.id === teamId) || null;
}

function seedForPostseason(state, teamId) {
  for (const conference of NFL_STRUCTURE.conferences) {
    const seed = state.seeds[conference].find((entry) => entry.teamId === teamId)?.seed;
    if (seed != null) return seed;
  }
  return null;
}

function conferenceFromStage(stage) {
  return stage.startsWith("AFC-") ? "AFC" : stage.startsWith("NFC-") ? "NFC" : "NFL";
}

function roundFromStage(stage) {
  return stage.replace(/^(AFC|NFC|NFL)-/, "");
}

function matchupIds(left, right) {
  return [left.id, right.id];
}

function buildWildcardMatchups(state, conference) {
  const bySeed = Object.fromEntries(state.seeds[conference].map((entry) => [entry.seed, entry.teamId]));
  return [[2, 7], [3, 6], [4, 5]].map(([high, low]) => [bySeed[high], bySeed[low]]);
}

function buildDivisionalMatchups(state, league, conference) {
  const seedOneId = state.seeds[conference].find((entry) => entry.seed === 1).teamId;
  const survivors = [seedOneId, ...state.roundWinners];
  const topSeed = teamForPostseason(league, seedOneId);
  const opponentForTop = lowestRemaining(
    survivors.filter((teamId) => teamId !== seedOneId).map((teamId) => teamForPostseason(league, teamId))
  );
  const otherTwo = survivors
    .filter((teamId) => teamId !== seedOneId && teamId !== opponentForTop.id)
    .map((teamId) => teamForPostseason(league, teamId))
    .sort((a, b) => a.playoffSeed - b.playoffSeed);
  return [matchupIds(topSeed, opponentForTop), matchupIds(otherTwo[0], otherTwo[1])];
}

function buildConferenceMatchup(state, league) {
  const finalists = state.roundWinners
    .map((teamId) => teamForPostseason(league, teamId))
    .sort((a, b) => a.playoffSeed - b.playoffSeed);
  return [matchupIds(finalists[0], finalists[1])];
}

function advancePostseasonStage(state, league) {
  const currentStageIndex = POSTSEASON_STAGE_ORDER.indexOf(state.stage);
  const conference = conferenceFromStage(state.stage);
  const round = roundFromStage(state.stage);

  if (round === "conference") state.conferenceChampions[conference] = state.roundWinners[0];
  if (round === "super-bowl") {
    state.stage = "complete";
    state.status = "completed";
    state.matchups = [];
    state.gameIndex = 0;
    state.roundWinners = [];
    state.standings = Object.fromEntries(NFL_STRUCTURE.conferences.map((name) => [
      name,
      conferenceStandings(league, name).map((team) => ({
        teamId: team.id,
        wins: team.season.wins,
        losses: team.season.losses,
        ties: team.season.ties
      }))
    ]));
    state.divisionRanksForNextYear = buildDivisionRankMap(league);
    return state;
  }

  state.stage = POSTSEASON_STAGE_ORDER[currentStageIndex + 1];
  state.gameIndex = 0;
  if (state.stage.endsWith("-wildcard")) {
    state.roundWinners = [];
    state.matchups = buildWildcardMatchups(state, conferenceFromStage(state.stage));
  } else if (state.stage.endsWith("-divisional")) {
    state.matchups = buildDivisionalMatchups(state, league, conferenceFromStage(state.stage));
    state.roundWinners = [];
  } else if (state.stage.endsWith("-conference")) {
    state.matchups = buildConferenceMatchup(state, league);
    state.roundWinners = [];
  } else {
    state.matchups = [[state.conferenceChampions.AFC, state.conferenceChampions.NFC]];
    state.roundWinners = [];
  }
  return state;
}

export function createPostseasonState({ league, year }) {
  const seeds = Object.fromEntries(NFL_STRUCTURE.conferences.map((conference) => [
    conference,
    getPlayoffSeeds(league, conference).map((team) => ({ teamId: team.id, seed: team.playoffSeed }))
  ]));
  const state = {
    schemaVersion: POSTSEASON_STATE_SCHEMA_VERSION,
    kind: "postseason-round-state",
    year,
    status: "active",
    stage: "AFC-wildcard",
    gameIndex: 0,
    seeds,
    matchups: [],
    roundWinners: [],
    conferenceChampions: { AFC: null, NFC: null },
    bracket: {
      AFC: { wildcard: [], divisional: [], conference: [] },
      NFC: { wildcard: [], divisional: [], conference: [] },
      seeds,
      superBowl: null
    },
    superBowl: null,
    gameArchiveEntries: [],
    standings: null,
    divisionRanksForNextYear: null
  };
  state.matchups = buildWildcardMatchups(state, "AFC");
  return state;
}

export function nextPostseasonGame(state = {}) {
  if (state.status !== "active") return null;
  const matchup = state.matchups?.[state.gameIndex];
  if (!matchup) return null;
  const conference = conferenceFromStage(state.stage);
  const round = roundFromStage(state.stage);
  return {
    conference,
    round,
    homeTeamId: matchup[0],
    awayTeamId: matchup[1],
    neutralSite: round === "super-bowl"
  };
}

export function simulateNextPostseasonGame({ state, league, statBook, year, rng, mode = "drive" }) {
  const next = nextPostseasonGame(state);
  if (!next) return null;
  const higherSeedTeam = teamForPostseason(league, next.homeTeamId);
  const lowerSeedTeam = teamForPostseason(league, next.awayTeamId);
  let result;
  let winner;
  if (next.round === "super-bowl") {
    result = simulateGame({
      league,
      statBook,
      homeTeamId: higherSeedTeam.id,
      awayTeamId: lowerSeedTeam.id,
      year,
      week: 0,
      rng,
      mode,
      allowTie: false,
      seasonType: "playoffs",
      label: "super-bowl",
      neutralSite: true
    });
    winner = result.winnerId === higherSeedTeam.id ? higherSeedTeam : lowerSeedTeam;
    const runnerUp = winner.id === higherSeedTeam.id ? lowerSeedTeam : higherSeedTeam;
    state.bracket.superBowl = {
      homeTeamId: higherSeedTeam.id,
      awayTeamId: lowerSeedTeam.id,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winnerId: result.winnerId
    };
    state.superBowl = {
      homeTeamId: higherSeedTeam.id,
      awayTeamId: lowerSeedTeam.id,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      championTeamId: winner.id,
      runnerUpTeamId: runnerUp.id,
      gameId: result.gameId
    };
  } else {
    const matchup = simulateBracketGame({
      league,
      statBook,
      year,
      rng,
      higherSeedTeam,
      lowerSeedTeam,
      mode,
      label: `${next.conference.toLowerCase()}-${next.round}`
    });
    result = matchup.result;
    winner = matchup.winner;
    state.bracket[next.conference][next.round].push(bracketGameRow({
      conference: next.conference,
      round: next.round,
      higherSeedTeam,
      lowerSeedTeam,
      result
    }));
  }

  state.gameArchiveEntries.push({ conference: next.conference, round: next.round, ...result });
  state.roundWinners.push(winner.id);
  state.gameIndex += 1;
  if (state.gameIndex >= state.matchups.length) advancePostseasonStage(state, league);
  return { game: result, winnerId: winner.id, conference: next.conference, round: next.round };
}

export function postseasonResultFromState(state) {
  if (state?.status !== "completed") return null;
  return {
    standings: state.standings,
    bracket: state.bracket,
    superBowl: state.superBowl,
    gameArchiveEntries: state.gameArchiveEntries,
    divisionRanksForNextYear: state.divisionRanksForNextYear
  };
}

export function runPlayoffsAndSuperBowl({ league, statBook, year, rng, mode = "drive" }) {
  const state = createPostseasonState({ league, year });
  while (state.status === "active") {
    simulateNextPostseasonGame({ state, league, statBook, year, rng, mode });
  }
  return postseasonResultFromState(state);
}

export function simulateSeason({
  league,
  statBook,
  year,
  rng,
  previousDivisionRanks = null,
  mode = "drive"
}) {
  const schedule = buildSeasonSchedule({ league, year, previousDivisionRanks, rng });

  let previousBlock = null;
  for (const weekBlock of schedule) {
    const rested = new Set(
      previousBlock
        ? league.teams
            .map((team) => team.id)
            .filter((teamId) =>
              !previousBlock.games.some(
                (game) => game.homeTeamId === teamId || game.awayTeamId === teamId
              )
            )
        : []
    );
    for (const matchup of weekBlock.games) {
      const game = simulateGame({
        league,
        statBook,
        homeTeamId: matchup.homeTeamId,
        awayTeamId: matchup.awayTeamId,
        year,
        rng,
        mode,
        allowTie: true,
        seasonType: "regular",
        homeRested: rested.has(matchup.homeTeamId),
        awayRested: rested.has(matchup.awayTeamId)
      });
      applyRegularSeasonResult(league, weekBlock.week, game);
    }
    previousBlock = weekBlock;
  }

  const playoffResult = runPlayoffsAndSuperBowl({ league, statBook, year, rng, mode });

  return {
    year,
    standings: playoffResult.standings,
    superBowl: playoffResult.superBowl,
    divisionRanksForNextYear: playoffResult.divisionRanksForNextYear
  };
}
