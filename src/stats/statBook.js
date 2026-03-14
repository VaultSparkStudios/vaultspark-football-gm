import { createZeroedSeasonStats, ensureSeasonStatBucket, mergeStats } from "../domain/playerFactory.js";
import { approximateValueFromStats } from "./approximateValue.js";

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(digits));
}

function per(numerator, denominator, digits = 1) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(digits));
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function passerRating({ cmp, att, yards, td, int }) {
  if (!att) return 0;
  const a = Math.max(0, Math.min(2.375, cmp / att - 0.3)) * 5;
  const b = Math.max(0, Math.min(2.375, yards / att - 3)) * 0.25;
  const c = Math.max(0, Math.min(2.375, (td / att) * 20));
  const d = Math.max(0, Math.min(2.375, 2.375 - (int / att) * 25));
  return Number((((a + b + c + d) / 6) * 100).toFixed(1));
}

function hasSeasonVolume(season, category) {
  const totalSnaps = (season.snaps?.offense || 0) + (season.snaps?.defense || 0) + (season.snaps?.special || 0);
  if (category === "passing") return (season.passing?.att || 0) > 0;
  if (category === "rushing") return (season.rushing?.att || 0) > 0;
  if (category === "receiving") return (season.receiving?.targets || 0) > 0;
  if (category === "defense") {
    const d = season.defense || {};
    return (season.snaps?.defense || 0) > 0 || d.tackles > 0 || d.sacks > 0 || d.int > 0 || d.passDefended > 0;
  }
  if (category === "blocking") {
    const b = season.blocking || {};
    return (season.snaps?.passBlock || 0) > 0 || (season.snaps?.runBlock || 0) > 0 || b.pressuresAllowed > 0;
  }
  if (category === "kicking") return (season.kicking?.fga || 0) + (season.kicking?.xpa || 0) > 0;
  if (category === "punting") return (season.punting?.punts || 0) > 0;
  if (category === "snaps") return totalSnaps > 0;
  return true;
}

function hasCareerVolume(stats, category) {
  const totalSnaps = (stats.snaps?.offense || 0) + (stats.snaps?.defense || 0) + (stats.snaps?.special || 0);
  if (category === "passing") return (stats.passing?.att || 0) > 0;
  if (category === "rushing") return (stats.rushing?.att || 0) > 0;
  if (category === "receiving") return (stats.receiving?.targets || 0) > 0;
  if (category === "defense") {
    const d = stats.defense || {};
    return (stats.snaps?.defense || 0) > 0 || d.tackles > 0 || d.sacks > 0 || d.int > 0 || d.passDefended > 0;
  }
  if (category === "blocking") {
    const b = stats.blocking || {};
    return (stats.snaps?.passBlock || 0) > 0 || (stats.snaps?.runBlock || 0) > 0 || b.pressuresAllowed > 0;
  }
  if (category === "kicking") return (stats.kicking?.fga || 0) + (stats.kicking?.xpa || 0) > 0;
  if (category === "punting") return (stats.punting?.punts || 0) > 0;
  if (category === "snaps") return totalSnaps > 0;
  return true;
}

function normalizeSeasonType(seasonType, fallback = "all") {
  if (seasonType === "regular" || seasonType === "playoffs" || seasonType === "all") return seasonType;
  return fallback;
}

function ensureSeasonSplit(season, seasonType) {
  const normalized = normalizeSeasonType(seasonType, "regular");
  if (normalized === "all") return season;
  if (!season.splits || typeof season.splits !== "object") {
    season.splits = {
      regular: createZeroedSeasonStats(),
      playoffs: createZeroedSeasonStats()
    };
  }
  if (!season.splits[normalized]) season.splits[normalized] = createZeroedSeasonStats();
  return season.splits[normalized];
}

function getSeasonStatsForType(season, seasonType) {
  const normalized = normalizeSeasonType(seasonType, "all");
  if (normalized === "all") return season;
  return season.splits?.[normalized] || null;
}

function primaryTeamForPlayer(player, seasonType = "all") {
  const gamesByTeam = {};
  for (const season of Object.values(player.seasonStats || {})) {
    const team = season.meta?.teamId;
    if (!team) continue;
    const source = getSeasonStatsForType(season, seasonType);
    if (!source || !source.games) continue;
    gamesByTeam[team] = (gamesByTeam[team] || 0) + (source.games || 0);
  }
  const sorted = Object.entries(gamesByTeam).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || player.teamId;
}

function buildCareerView(player, seasonType = "all") {
  const normalized = normalizeSeasonType(seasonType, "all");
  if (normalized === "all") {
    return {
      stats: player.careerStats,
      seasons: player.seasonsPlayed,
      primaryTeam: primaryTeamForPlayer(player, "all")
    };
  }

  const stats = createZeroedSeasonStats();
  let seasons = 0;
  for (const season of Object.values(player.seasonStats || {})) {
    const source = getSeasonStatsForType(season, normalized);
    if (!source) continue;
    mergeStats(stats, source);
    if ((source.games || 0) > 0) seasons += 1;
  }

  return {
    stats,
    seasons,
    primaryTeam: primaryTeamForPlayer(player, normalized)
  };
}

function teamSeasonRowsForYear(league, teamSeasonArchive, year) {
  const currentRows = league.teams
    .filter((team) => Number(team.season?.year) === Number(year))
    .map((team) => ({
      year,
      team: team.id,
      games: (team.season?.wins || 0) + (team.season?.losses || 0) + (team.season?.ties || 0),
      pf: team.season?.pointsFor || 0,
      pa: team.season?.pointsAgainst || 0,
      drivesFor: team.season?.drivesFor || 0,
      drivesAgainst: team.season?.drivesAgainst || 0,
      turnovers: team.season?.turnovers || 0
    }));
  if (currentRows.length) return currentRows;
  return teamSeasonArchive
    .filter((row) => row.year === year)
    .map((row) => ({
      year,
      team: row.team,
      games: Number(row.wins || 0) + Number(row.losses || 0) + Number(row.ties || 0),
      pf: row.pf || 0,
      pa: row.pa || 0,
      drivesFor: row.drivesFor || 0,
      drivesAgainst: row.drivesAgainst || 0,
      turnovers: row.turnovers || 0
    }));
}

function seasonAwardHonorMap(league, year) {
  const awards = (league.awards || []).find((entry) => entry.year === year) || {};
  const honors = new Map();
  const applyList = (list = [], allProLevel = null, proBowler = false) => {
    for (const row of list || []) {
      if (!row?.playerId) continue;
      const current = honors.get(row.playerId) || { allProLevel: null, proBowler: false };
      if (allProLevel != null) {
        current.allProLevel = current.allProLevel == null ? allProLevel : Math.min(current.allProLevel, allProLevel);
      }
      if (proBowler) current.proBowler = true;
      honors.set(row.playerId, current);
    }
  };
  applyList(awards.AllPro1, 1, false);
  applyList(awards.AllPro2, 2, false);
  applyList(awards.ProBowl, null, true);
  return honors;
}

function buildApproximateValueContext(league, teamSeasonArchive, players, year, seasonType = "all") {
  const teamRows = teamSeasonRowsForYear(league, teamSeasonArchive, year);
  const teamContext = new Map(
    teamRows.map((row) => [
      row.team,
      {
        teamId: row.team,
        games: row.games || 0,
        pointsFor: row.pf || 0,
        pointsAgainst: row.pa || 0,
        drivesFor: row.drivesFor || 0,
        drivesAgainst: row.drivesAgainst || 0,
        turnovers: row.turnovers || 0,
        passYds: 0,
        passTd: 0,
        passInt: 0,
        rushYds: 0,
        rushTd: 0,
        recYds: 0,
        recTd: 0,
        firstDowns: 0,
        punts: 0,
        puntYds: 0,
        puntBlocks: 0,
        fga: 0,
        fgm: 0,
        fgA40: 0,
        fgM40: 0,
        fgA50: 0,
        fgM50: 0,
        xpa: 0,
        xpm: 0,
        defTakeaways: 0,
        defTd: 0,
        frontSevenPoints: 0,
        secondaryPoints: 0,
        olLineWeight: 0,
        teLineWeight: 0,
        totalYards: 0
      }
    ])
  );

  for (const player of players) {
    const season = player.seasonStats?.[year];
    if (!season) continue;
    const source = getSeasonStatsForType(season, seasonType);
    if (!source) continue;
    const teamId = season.meta?.teamId || player.teamId;
    if (!teamContext.has(teamId)) {
      teamContext.set(teamId, {
        teamId,
        games: source.games || 0,
        pointsFor: 0,
        pointsAgainst: 0,
        drivesFor: 0,
        drivesAgainst: 0,
        turnovers: 0,
        passYds: 0,
        passTd: 0,
        passInt: 0,
        rushYds: 0,
        rushTd: 0,
        recYds: 0,
        recTd: 0,
        firstDowns: 0,
        punts: 0,
        puntYds: 0,
        puntBlocks: 0,
        fga: 0,
        fgm: 0,
        fgA40: 0,
        fgM40: 0,
        fgA50: 0,
        fgM50: 0,
        xpa: 0,
        xpm: 0,
        defTakeaways: 0,
        defTd: 0,
        frontSevenPoints: 0,
        secondaryPoints: 0,
        olLineWeight: 0,
        teLineWeight: 0,
        totalYards: 0
      });
    }
    const team = teamContext.get(teamId);
    team.games = Math.max(team.games || 0, source.games || 0);
    team.passYds += source.passing?.yards || 0;
    team.passTd += source.passing?.td || 0;
    team.passInt += source.passing?.int || 0;
    team.rushYds += source.rushing?.yards || 0;
    team.rushTd += source.rushing?.td || 0;
    team.recYds += source.receiving?.yards || 0;
    team.recTd += source.receiving?.td || 0;
    team.firstDowns +=
      (source.passing?.firstDowns || 0) + (source.rushing?.firstDowns || 0) + (source.receiving?.firstDowns || 0);
    team.punts += source.punting?.punts || 0;
    team.puntYds += source.punting?.yards || 0;
    team.puntBlocks += source.punting?.blocks || 0;
    team.fga += source.kicking?.fga || 0;
    team.fgm += source.kicking?.fgm || 0;
    team.fgA40 += source.kicking?.fgA40 || 0;
    team.fgM40 += source.kicking?.fgM40 || 0;
    team.fgA50 += source.kicking?.fgA50 || 0;
    team.fgM50 += source.kicking?.fgM50 || 0;
    team.xpa += source.kicking?.xpa || 0;
    team.xpm += source.kicking?.xpm || 0;
    team.defTakeaways += (source.defense?.int || 0) + (source.defense?.fr || 0);
    const tackleConstant = player.position === "DL" ? 0.6 : player.position === "LB" ? 0.3 : 0;
    const defensivePoints =
      (source.games || 0) +
      5 * (source.gamesStarted || 0) +
      (source.defense?.sacks || 0) +
      4 * (source.defense?.fr || 0) +
      4 * (source.defense?.int || 0) +
      tackleConstant * (source.defense?.tackles || 0);
    if (player.position === "DL" || player.position === "LB") team.frontSevenPoints += defensivePoints;
    if (player.position === "DB") team.secondaryPoints += defensivePoints;
    if (player.position === "OL") team.olLineWeight += source.snaps?.offense || source.gamesStarted || 0;
    if (player.position === "TE") team.teLineWeight += source.snaps?.offense || source.gamesStarted || 0;
    team.totalYards = team.passYds + team.rushYds;
  }

  const honors = seasonAwardHonorMap(league, year);
  const allTeams = [...teamContext.values()];
  const qbRows = [];
  let rbRushYds = 0;
  let rbRushAtt = 0;
  let receiverYds = 0;
  let receiverRec = 0;
  for (const player of players) {
    const season = player.seasonStats?.[year];
    if (!season) continue;
    const source = getSeasonStatsForType(season, seasonType);
    if (!source) continue;
    if (player.position === "QB" && (source.passing?.att || 0) > 0) {
      qbRows.push({
        att: source.passing?.att || 0,
        aypa:
          (source.passing?.att || 0) > 0
            ? ((source.passing?.yards || 0) + 20 * (source.passing?.td || 0) - 45 * (source.passing?.int || 0)) /
              (source.passing?.att || 1)
            : 0
      });
    }
    if (player.position === "RB") {
      rbRushYds += source.rushing?.yards || 0;
      rbRushAtt += source.rushing?.att || 0;
    }
    if (player.position === "WR" || player.position === "TE") {
      receiverYds += source.receiving?.yards || 0;
      receiverRec += source.receiving?.rec || 0;
    }
  }

  const leagueAverages = {
    avgPointsPerDrive:
      allTeams.reduce((sum, row) => sum + ratio(Number(row.pointsFor || 0), Math.max(1, Number(row.drivesFor || 0))), 0) /
      Math.max(1, allTeams.length),
    passAypa:
      qbRows.filter((row) => row.att >= 50).reduce((sum, row) => sum + row.aypa, 0) /
        Math.max(1, qbRows.filter((row) => row.att >= 50).length) || 0,
    rbYpc: rbRushYds / Math.max(1, rbRushAtt),
    receiverYpr: receiverYds / Math.max(1, receiverRec),
    avgPointsAllowedPerDrive:
      allTeams.reduce((sum, row) => sum + ratio(Number(row.pointsAgainst || 0), Math.max(1, Number(row.drivesAgainst || 0))), 0) /
      Math.max(1, allTeams.length),
    xpPct: ratio(
      allTeams.reduce((sum, row) => sum + (row.xpm || 0), 0),
      allTeams.reduce((sum, row) => sum + (row.xpa || 0), 0)
    ),
    fgUnder40Pct: ratio(
      allTeams.reduce((sum, row) => sum + (row.fgM40 || 0), 0),
      allTeams.reduce((sum, row) => sum + (row.fgA40 || 0), 0)
    ),
    fg40To49Pct: (() => {
      const made = allTeams.reduce((sum, row) => sum + Math.max(0, (row.fgm || 0) - (row.fgM40 || 0) - (row.fgM50 || 0)), 0);
      const att = allTeams.reduce((sum, row) => sum + Math.max(0, (row.fga || 0) - (row.fgA40 || 0) - (row.fgA50 || 0)), 0);
      return ratio(made, att);
    })(),
    fg50Pct: ratio(
      allTeams.reduce((sum, row) => sum + (row.fgM50 || 0), 0),
      allTeams.reduce((sum, row) => sum + (row.fgA50 || 0), 0)
    ),
    puntGrossYpa: ratio(
      allTeams.reduce((sum, row) => sum + (row.puntYds || 0), 0),
      allTeams.reduce((sum, row) => sum + (row.punts || 0), 0)
    )
  };

  return { teams: teamContext, league: leagueAverages, honors };
}

function playerSeasonApproximateValue(player, season, seasonType, context) {
  const source = getSeasonStatsForType(season, seasonType);
  if (!source) return 0;
  const teamId = season.meta?.teamId || player.teamId;
  return approximateValueFromStats(
    season.meta?.position || player.position,
    source,
    {
      team: context?.teams?.get(teamId) || null,
      league: context?.league || null,
      honors: context?.honors?.get(player.id) || null
    }
  );
}

function playerCareerApproximateValue(player, seasonType, contextByYear) {
  let total = 0;
  for (const [yearKey, season] of Object.entries(player.seasonStats || {})) {
    const context = contextByYear.get(Number(yearKey));
    total += playerSeasonApproximateValue(player, season, seasonType, context);
  }
  return total;
}

export class StatBook {
  constructor(league) {
    this.league = league;
    this.teamSeasonArchive = [];
    this.playerIndex = new Map();
    this.warehouse = { byYear: {} };
    this.reindexPlayers();
  }

  reindexPlayers() {
    this.playerIndex = new Map(
      [...this.league.players, ...this.league.retiredPlayers].map((player) => [player.id, player])
    );
  }

  allPlayers() {
    return [...this.league.players, ...this.league.retiredPlayers];
  }

  getPlayerById(playerId) {
    return this.playerIndex.get(playerId) || null;
  }

  ensureSeasonMeta(player, season, teamId = null, position = null) {
    if (!season.meta || typeof season.meta !== "object") {
      season.meta = {
        teamId: teamId || player.teamId,
        position: position || player.position,
        teamGames: {}
      };
    }
    if (!season.meta.teamGames || typeof season.meta.teamGames !== "object") season.meta.teamGames = {};
    if (teamId) {
      season.meta.teamGames[teamId] = (season.meta.teamGames[teamId] || 0) + 1;
      const byTeam = Object.entries(season.meta.teamGames).sort((a, b) => b[1] - a[1]);
      season.meta.teamId = byTeam[0]?.[0] || teamId;
    }
    if (position) season.meta.position = position;
  }

  registerGameAppearance(playerId, year, started = false, teamId = null, position = null, seasonType = "regular") {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    const season = ensureSeasonStatBucket(player, year);
    this.ensureSeasonMeta(player, season, teamId, position);
    season.games += 1;
    season.gamesStarted += started ? 1 : 0;
    const split = ensureSeasonSplit(season, seasonType);
    split.games += 1;
    split.gamesStarted += started ? 1 : 0;
    player.careerStats.games += 1;
    player.careerStats.gamesStarted += started ? 1 : 0;
  }

  applyStatDelta(playerId, year, delta, meta = null) {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    const season = ensureSeasonStatBucket(player, year);
    this.ensureSeasonMeta(player, season, meta?.teamId || null, meta?.position || null);
    mergeStats(season, delta);
    mergeStats(ensureSeasonSplit(season, normalizeSeasonType(meta?.seasonType, "regular")), delta);
    mergeStats(player.careerStats, delta);
  }

  archiveTeamSeason(year) {
    const rows = this.league.teams.map((team) => ({
      year,
      team: team.id,
      teamName: team.name,
      conference: team.conference,
      division: team.division,
      wins: team.season.wins,
      losses: team.season.losses,
      ties: team.season.ties,
      winPct: Number(
        ((team.season.wins + team.season.ties * 0.5) /
          Math.max(1, team.season.wins + team.season.losses + team.season.ties)).toFixed(3)
      ),
      pf: team.season.pointsFor,
      pa: team.season.pointsAgainst,
      yardOff: team.season.yardsFor,
      yardDef: team.season.yardsAgainst,
      drivesFor: team.season.drivesFor || 0,
      drivesAgainst: team.season.drivesAgainst || 0,
      turnovers: team.season.turnovers
    }));
    this.teamSeasonArchive.push(...rows);
    this.buildWarehouseForYear(year);
  }

  buildWarehouseForYear(year) {
    const passing = this.getPlayerSeasonTable("passing", { year, seasonType: "regular" });
    const rushing = this.getPlayerSeasonTable("rushing", { year, seasonType: "regular" });
    const receiving = this.getPlayerSeasonTable("receiving", { year, seasonType: "regular" });
    const defense = this.getPlayerSeasonTable("defense", { year, seasonType: "regular" });
    const teams = this.getTeamSeasonTable({ year });
    this.warehouse.byYear[year] = {
      year,
      generatedAt: Date.now(),
      topPassing: passing.slice(0, 40),
      topRushing: rushing.slice(0, 40),
      topReceiving: receiving.slice(0, 40),
      topDefense: defense.slice(0, 40),
      teamSummary: teams,
      leagueAverages: {
        pointsPerGame: teams.length ? Number((teams.reduce((sum, t) => sum + t.pf / 17, 0) / teams.length).toFixed(2)) : 0,
        yardsPerGame: teams.length ? Number((teams.reduce((sum, t) => sum + (t.yardOff || 0) / 17, 0) / teams.length).toFixed(2)) : 0,
        passYardsPerAttempt: passing.reduce((sum, row) => sum + (row.yds || 0), 0) /
          Math.max(1, passing.reduce((sum, row) => sum + (row.att || 0), 0)),
        rushYardsPerAttempt: rushing.reduce((sum, row) => sum + (row.yds || 0), 0) /
          Math.max(1, rushing.reduce((sum, row) => sum + (row.att || 0), 0))
      }
    };
    this.warehouse.byYear[year].leagueAverages.passYardsPerAttempt = Number(this.warehouse.byYear[year].leagueAverages.passYardsPerAttempt.toFixed(3));
    this.warehouse.byYear[year].leagueAverages.rushYardsPerAttempt = Number(this.warehouse.byYear[year].leagueAverages.rushYardsPerAttempt.toFixed(3));
    return this.warehouse.byYear[year];
  }

  getWarehouseSnapshot({ year = null, teamId = null } = {}) {
    const targetYear = year ?? Math.max(0, ...this.teamSeasonArchive.map((row) => row.year));
    if (!targetYear) return null;
    if (!this.warehouse.byYear[targetYear]) this.buildWarehouseForYear(targetYear);
    const snapshot = this.warehouse.byYear[targetYear];
    if (!snapshot) return null;
    if (!teamId) return snapshot;
    return {
      ...snapshot,
      teamSummary: snapshot.teamSummary.filter((row) => row.team === teamId),
      topPassing: snapshot.topPassing.filter((row) => row.tm === teamId),
      topRushing: snapshot.topRushing.filter((row) => row.tm === teamId),
      topReceiving: snapshot.topReceiving.filter((row) => row.tm === teamId),
      topDefense: snapshot.topDefense.filter((row) => row.tm === teamId)
    };
  }

  getTeamSeasonTable(filters = {}) {
    const { year, team, conference, division } = filters;
    return this.teamSeasonArchive
      .filter((row) => (year == null ? true : row.year === year))
      .filter((row) => (!team ? true : row.team === team))
      .filter((row) => (!conference ? true : row.conference === conference))
      .filter((row) => (!division ? true : row.division === division))
      .sort((a, b) => b.winPct - a.winPct || b.pf - a.pf);
  }

  getPlayerSeasonTable(category, filters = {}) {
    const seasonType = normalizeSeasonType(filters.seasonType, "all");
    const players = this.allPlayers();
    const avContexts = new Map();
    const rows = [];
    for (const player of players) {
      for (const [yearKey, season] of Object.entries(player.seasonStats)) {
        const year = Number(yearKey);
        if (filters.year != null && year !== filters.year) continue;
        if (filters.position && player.position !== filters.position) continue;
        const seasonTeam = season.meta?.teamId || player.teamId;
        if (filters.team && seasonTeam !== filters.team) continue;
        const source = getSeasonStatsForType(season, seasonType);
        if (!source || !hasSeasonVolume(source, category)) continue;
        if (!avContexts.has(year)) {
          avContexts.set(
            year,
            buildApproximateValueContext(this.league, this.teamSeasonArchive, players, year, seasonType)
          );
        }
        const av = playerSeasonApproximateValue(player, season, seasonType, avContexts.get(year));

        const base = {
          year,
          playerId: player.id,
          player: player.name,
          age: player.age,
          pos: season.meta?.position || player.position,
          tm: seasonTeam,
          seasonType,
          g: source.games,
          gs: source.gamesStarted,
          offSn: source.snaps?.offense || 0,
          defSn: source.snaps?.defense || 0,
          stSn: source.snaps?.special || 0,
          sn: (source.snaps?.offense || 0) + (source.snaps?.defense || 0) + (source.snaps?.special || 0)
        };

        if (category === "passing") {
          const p = source.passing;
          rows.push({
            ...base,
            cmp: p.cmp,
            att: p.att,
            cmpPct: pct(p.cmp, p.att),
            yds: p.yards,
            td: p.td,
            int: p.int,
            ypa: per(p.yards, p.att),
            ypc: per(p.yards, p.cmp),
            rate: passerRating(p),
            sacks: p.sacks,
            sackYds: p.sackYards,
            lng: p.long,
            firstDowns: p.firstDowns,
            av
          });
        } else if (category === "rushing") {
          const r = source.rushing;
          rows.push({
            ...base,
            att: r.att,
            yds: r.yards,
            td: r.td,
            lng: r.long,
            ypa: per(r.yards, r.att),
            fmb: r.fumbles,
            firstDowns: r.firstDowns,
            brkTkl: r.brokenTackles,
            av
          });
        } else if (category === "receiving") {
          const r = source.receiving;
          rows.push({
            ...base,
            tgt: r.targets,
            rec: r.rec,
            yds: r.yards,
            ypr: per(r.yards, r.rec),
            ypt: per(r.yards, r.targets),
            td: r.td,
            lng: r.long,
            catchPct: pct(r.rec, r.targets),
            firstDowns: r.firstDowns,
            yac: r.yac,
            drops: r.drops,
            av
          });
        } else if (category === "defense") {
          const d = source.defense;
          rows.push({
            ...base,
            tkl: d.tackles,
            solo: d.solo,
            ast: d.ast,
            sacks: d.sacks,
            tfl: d.tfl,
            qbHits: d.qbHits,
            int: d.int,
            pd: d.passDefended,
            ff: d.ff,
            fr: d.fr,
            av
          });
        } else if (category === "blocking") {
          const b = source.blocking || {};
          rows.push({
            ...base,
            passBlkSn: source.snaps?.passBlock || 0,
            runBlkSn: source.snaps?.runBlock || 0,
            sacksAllowed: b.sacksAllowed || 0,
            pressuresAllowed: b.pressuresAllowed || 0,
            penalties: b.penalties || 0,
            av
          });
        } else if (category === "kicking") {
          const k = source.kicking;
          rows.push({
            ...base,
            fgm: k.fgm,
            fga: k.fga,
            fgPct: pct(k.fgm, k.fga),
            xpm: k.xpm,
            xpa: k.xpa,
            xpPct: pct(k.xpm, k.xpa),
            lng: k.long,
            fgM40: k.fgM40,
            fgA40: k.fgA40,
            fgM50: k.fgM50,
            fgA50: k.fgA50,
            av
          });
        } else if (category === "punting") {
          const p = source.punting;
          rows.push({
            ...base,
            punts: p.punts,
            yds: p.yards,
            ypp: per(p.yards, p.punts),
            in20: p.in20,
            lng: p.long,
            tb: p.touchbacks || 0,
            blk: p.blocks || 0,
            av
          });
        } else if (category === "snaps") {
          rows.push({
            ...base,
            offSnPct: pct(source.snaps?.offense || 0, source.games * 64),
            defSnPct: pct(source.snaps?.defense || 0, source.games * 64),
            stSnPct: pct(source.snaps?.special || 0, source.games * 24),
            av
          });
        }
      }
    }
    const sortKey =
      category === "defense"
        ? "tkl"
        : category === "kicking"
          ? "fgm"
          : category === "punting"
            ? "punts"
            : category === "blocking"
              ? "passBlkSn"
              : category === "snaps"
                ? "sn"
                : "yds";
    return rows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0) || (b.td || 0) - (a.td || 0));
  }

  getPlayerCareerTable(category, filters = {}) {
    const seasonType = normalizeSeasonType(filters.seasonType, "all");
    const players = this.allPlayers();
    const avContexts = new Map();
    const ensureContext = (year) => {
      if (!avContexts.has(year)) {
        avContexts.set(
          year,
          buildApproximateValueContext(this.league, this.teamSeasonArchive, players, year, seasonType)
        );
      }
      return avContexts.get(year);
    };

    const rows = players
      .filter((p) => (filters.position ? p.position === filters.position : true))
      .filter((p) =>
        filters.team
          ? Object.values(p.seasonStats || {}).some((season) => {
              const source = getSeasonStatsForType(season, seasonType);
              return source && (source.games || 0) > 0 && (season.meta?.teamId || p.teamId) === filters.team;
            })
          : true
      )
      .map((player) => ({ player, careerView: buildCareerView(player, filters.seasonType) }))
      .filter(({ careerView }) => hasCareerVolume(careerView.stats, category))
      .map(({ player, careerView }) => {
        const stats = careerView.stats;
        for (const yearKey of Object.keys(player.seasonStats || {})) ensureContext(Number(yearKey));
        const av = playerCareerApproximateValue(player, seasonType, avContexts);
        const base = {
          playerId: player.id,
          player: player.name,
          tm: careerView.primaryTeam,
          pos: player.position,
          status: player.status,
          seasonType,
          seasons: careerView.seasons,
          g: stats.games || 0,
          gs: stats.gamesStarted || 0,
          offSn: stats.snaps?.offense || 0,
          defSn: stats.snaps?.defense || 0,
          stSn: stats.snaps?.special || 0,
          sn: (stats.snaps?.offense || 0) + (stats.snaps?.defense || 0) + (stats.snaps?.special || 0)
        };

        if (category === "passing") {
          const p = stats.passing;
          return {
            ...base,
            cmp: p.cmp,
            att: p.att,
            cmpPct: pct(p.cmp, p.att),
            yds: p.yards,
            td: p.td,
            int: p.int,
            ypa: per(p.yards, p.att),
            ypc: per(p.yards, p.cmp),
            rate: passerRating(p),
            sacks: p.sacks,
            sackYds: p.sackYards,
            lng: p.long,
            firstDowns: p.firstDowns,
            av
          };
        }
        if (category === "rushing") {
          const r = stats.rushing;
          return {
            ...base,
            att: r.att,
            yds: r.yards,
            td: r.td,
            ypa: per(r.yards, r.att),
            lng: r.long,
            fmb: r.fumbles,
            firstDowns: r.firstDowns,
            brkTkl: r.brokenTackles,
            av
          };
        }
        if (category === "receiving") {
          const r = stats.receiving;
          return {
            ...base,
            tgt: r.targets,
            rec: r.rec,
            yds: r.yards,
            ypr: per(r.yards, r.rec),
            ypt: per(r.yards, r.targets),
            td: r.td,
            lng: r.long,
            catchPct: pct(r.rec, r.targets),
            firstDowns: r.firstDowns,
            yac: r.yac,
            drops: r.drops,
            av
          };
        }
        if (category === "defense") {
          const d = stats.defense;
          return {
            ...base,
            tkl: d.tackles,
            solo: d.solo,
            ast: d.ast,
            sacks: d.sacks,
            tfl: d.tfl,
            qbHits: d.qbHits,
            int: d.int,
            pd: d.passDefended,
            ff: d.ff,
            fr: d.fr,
            av
          };
        }
        if (category === "blocking") {
          const b = stats.blocking || {};
          return {
            ...base,
            passBlkSn: stats.snaps?.passBlock || 0,
            runBlkSn: stats.snaps?.runBlock || 0,
            sacksAllowed: b.sacksAllowed || 0,
            pressuresAllowed: b.pressuresAllowed || 0,
            penalties: b.penalties || 0,
            av
          };
        }
        const k = stats.kicking;
        if (category === "kicking") {
          return {
            ...base,
            fgm: k.fgm,
            fga: k.fga,
            fgPct: pct(k.fgm, k.fga),
            xpm: k.xpm,
            xpa: k.xpa,
            xpPct: pct(k.xpm, k.xpa),
            lng: k.long,
            fgM40: k.fgM40,
            fgA40: k.fgA40,
            fgM50: k.fgM50,
            fgA50: k.fgA50,
            av
          };
        }

        const p = stats.punting;
        if (category === "punting") {
          return {
            ...base,
            punts: p.punts,
            yds: p.yards,
            ypp: per(p.yards, p.punts),
            in20: p.in20,
            lng: p.long,
            tb: p.touchbacks || 0,
            blk: p.blocks || 0,
            av
          };
        }
        return {
          ...base,
          offSnPct: pct(stats.snaps?.offense || 0, Math.max(1, stats.games) * 64),
          defSnPct: pct(stats.snaps?.defense || 0, Math.max(1, stats.games) * 64),
          stSnPct: pct(stats.snaps?.special || 0, Math.max(1, stats.games) * 24),
          av
        };
      });

    const sortKey =
      category === "defense"
        ? "tkl"
        : category === "kicking"
          ? "fgm"
          : category === "punting"
            ? "punts"
              : category === "blocking"
                ? "passBlkSn"
              : category === "snaps"
                ? "sn"
                : "yds";
    return rows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0) || (b.td || 0) - (a.td || 0));
  }

  getRecords() {
    const allPlayers = [...this.league.players, ...this.league.retiredPlayers];
    const avContexts = new Map();
    for (const player of allPlayers) {
      for (const yearKey of Object.keys(player.seasonStats || {})) {
        const year = Number(yearKey);
        if (!avContexts.has(year)) {
          avContexts.set(
            year,
            buildApproximateValueContext(this.league, this.teamSeasonArchive, allPlayers, year, "all")
          );
        }
      }
    }
    const leaders = (metricAccessor, min = 1) =>
      allPlayers
        .map((player) => ({
          playerId: player.id,
          player: player.name,
          pos: player.position,
          status: player.status,
          value: metricAccessor(player)
        }))
        .filter((row) => row.value >= min)
        .sort((a, b) => b.value - a.value)
        .slice(0, 25);

    return {
      passingYards: leaders((p) => p.careerStats.passing.yards),
      passingTD: leaders((p) => p.careerStats.passing.td),
      rushingYards: leaders((p) => p.careerStats.rushing.yards),
      rushingTD: leaders((p) => p.careerStats.rushing.td),
      receivingYards: leaders((p) => p.careerStats.receiving.yards),
      receivingTD: leaders((p) => p.careerStats.receiving.td),
      tackles: leaders((p) => p.careerStats.defense.tackles),
      sacks: leaders((p) => p.careerStats.defense.sacks),
      interceptions: leaders((p) => p.careerStats.defense.int),
      fieldGoalsMade: leaders((p) => p.careerStats.kicking.fgm),
      approximateValue: leaders((p) => playerCareerApproximateValue(p, "all", avContexts))
    };
  }
}
