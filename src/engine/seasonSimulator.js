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

export function applyRegularSeasonResult(league, week, result) {
  const home = league.teams.find((t) => t.id === result.homeTeamId);
  const away = league.teams.find((t) => t.id === result.awayTeamId);
  if (!home || !away) return;

  home.season.pointsFor += result.homeScore;
  home.season.pointsAgainst += result.awayScore;
  home.season.yardsFor += result.homeYards;
  home.season.yardsAgainst += result.awayYards;
  home.season.drivesFor += result.homeDrives || 0;
  home.season.drivesAgainst += result.awayDrives || 0;
  home.season.turnovers += result.homeTurnovers;
  away.season.pointsFor += result.awayScore;
  away.season.pointsAgainst += result.homeScore;
  away.season.yardsFor += result.awayYards;
  away.season.yardsAgainst += result.homeYards;
  away.season.drivesFor += result.awayDrives || 0;
  away.season.drivesAgainst += result.homeDrives || 0;
  away.season.turnovers += result.awayTurnovers;

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

export function runPlayoffsAndSuperBowl({ league, statBook, year, rng, mode = "drive" }) {
  const afc = runConferencePlayoffs({
    league,
    statBook,
    year,
    rng,
    conference: "AFC",
    mode
  });
  const nfc = runConferencePlayoffs({
    league,
    statBook,
    year,
    rng,
    conference: "NFC",
    mode
  });
  const afcChampion = afc.champion;
  const nfcChampion = nfc.champion;

  const superBowlResult = simulateGame({
    league,
    statBook,
    homeTeamId: afcChampion.id,
    awayTeamId: nfcChampion.id,
    year,
    week: 0,
    rng,
    mode,
    allowTie: false,
    seasonType: "playoffs",
    label: "super-bowl"
  });

  const champion = superBowlResult.winnerId === afcChampion.id ? afcChampion : nfcChampion;
  const runnerUp = champion.id === afcChampion.id ? nfcChampion : afcChampion;
  const standings = {
    AFC: conferenceStandings(league, "AFC").map((t) => ({
      teamId: t.id,
      wins: t.season.wins,
      losses: t.season.losses,
      ties: t.season.ties
    })),
    NFC: conferenceStandings(league, "NFC").map((t) => ({
      teamId: t.id,
      wins: t.season.wins,
      losses: t.season.losses,
      ties: t.season.ties
    }))
  };

  return {
    standings,
    bracket: {
      AFC: afc.bracket,
      NFC: nfc.bracket,
      seeds: {
        AFC: afc.seeds,
        NFC: nfc.seeds
      },
      superBowl: {
        homeTeamId: afcChampion.id,
        awayTeamId: nfcChampion.id,
        homeScore: superBowlResult.homeScore,
        awayScore: superBowlResult.awayScore,
        winnerId: superBowlResult.winnerId
      }
    },
    superBowl: {
      homeTeamId: afcChampion.id,
      awayTeamId: nfcChampion.id,
      homeScore: superBowlResult.homeScore,
      awayScore: superBowlResult.awayScore,
      championTeamId: champion.id,
      runnerUpTeamId: runnerUp.id,
      gameId: superBowlResult.gameId
    },
    gameArchiveEntries: [
      ...afc.gameDetails,
      ...nfc.gameDetails,
      { conference: "NFL", round: "super-bowl", ...superBowlResult }
    ],
    divisionRanksForNextYear: buildDivisionRankMap(league)
  };
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

  for (const weekBlock of schedule) {
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
        seasonType: "regular"
      });
      applyRegularSeasonResult(league, weekBlock.week, game);
    }
  }

  const playoffResult = runPlayoffsAndSuperBowl({ league, statBook, year, rng, mode });

  return {
    year,
    standings: playoffResult.standings,
    superBowl: playoffResult.superBowl,
    divisionRanksForNextYear: playoffResult.divisionRanksForNextYear
  };
}
