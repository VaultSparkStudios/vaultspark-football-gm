import { ensureSeasonStatBucket, mergeStats } from "../domain/playerFactory.js";
import { getSportRules } from "../sport/registry.js";
import { approximateValueFromStats } from "./approximateValue.js";

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

// Whether a season or career has enough of a category to earn a table row. A
// category the schema does not declare has always counted as having volume.
function hasCategoryVolume(schema, stats, category) {
  const definition = schema.categories[category];
  return definition ? definition.hasVolume(stats) : true;
}

function normalizeSeasonType(seasonType, fallback = "all") {
  if (seasonType === "regular" || seasonType === "playoffs" || seasonType === "all") return seasonType;
  return fallback;
}

function ensureSeasonSplit(schema, season, seasonType) {
  const normalized = normalizeSeasonType(seasonType, "regular");
  if (normalized === "all") return season;
  if (!season.splits || typeof season.splits !== "object") {
    season.splits = {
      regular: schema.zeroedSeasonStats(),
      playoffs: schema.zeroedSeasonStats()
    };
  }
  if (!season.splits[normalized]) season.splits[normalized] = schema.zeroedSeasonStats();
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

function buildCareerView(schema, player, seasonType = "all") {
  const normalized = normalizeSeasonType(seasonType, "all");
  if (normalized === "all") {
    return {
      stats: player.careerStats,
      seasons: player.seasonsPlayed,
      primaryTeam: primaryTeamForPlayer(player, "all")
    };
  }

  const stats = schema.zeroedCareerStats();
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

/**
 * One team's season row, in the shape the archive stores and the dashboard
 * reads. Declared once (S109): the archive is written at season end, so the
 * live standings the dashboard shows in-season come from the same mapping
 * over the live `team.season` record rather than a second literal.
 */
export function teamSeasonRow(team, year) {
  return {
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
    turnovers: team.season.turnovers,
    // S86 [audit #4] — carry playoff participation into the archived row so a
    // restored session derives the same answer the live session did. Written
    // on the team by seasonSimulator, never on team.season.
    playoffSeed: team.playoffSeed ?? null,
    playoffExit: team.playoffExit ?? null
  };
}

export function sortTeamSeasonRows(rows) {
  return rows.sort((a, b) => b.winPct - a.winPct || b.pf - a.pf);
}

export class StatBook {
  // An injected schema, else the league's sport pack's. Private so the
  // StatBook's own enumerable state is unchanged by the schema it reads.
  #statSchema = null;

  /**
   * @param {object} league
   * @param {{ statSchema?: object }} [options] statSchema overrides the
   *   league's sport schema (getSportRules(league.sportId).stats).
   */
  constructor(league, { statSchema = null } = {}) {
    this.#statSchema = statSchema;
    this.league = league;
    this.teamSeasonArchive = [];
    this.playerIndex = new Map();
    this.warehouse = { byYear: {} };
    this.reindexPlayers();
  }

  /** The stat schema every table, split and view is built from. */
  get statSchema() {
    return this.#statSchema || getSportRules(this.league?.sportId).stats;
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
    const season = ensureSeasonStatBucket(player, year, () => this.statSchema.zeroedSeasonStats());
    this.ensureSeasonMeta(player, season, teamId, position);
    season.games += 1;
    season.gamesStarted += started ? 1 : 0;
    const split = ensureSeasonSplit(this.statSchema, season, seasonType);
    split.games += 1;
    split.gamesStarted += started ? 1 : 0;
    player.careerStats.games += 1;
    player.careerStats.gamesStarted += started ? 1 : 0;
  }

  applyStatDelta(playerId, year, delta, meta = null) {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    const season = ensureSeasonStatBucket(player, year, () => this.statSchema.zeroedSeasonStats());
    this.ensureSeasonMeta(player, season, meta?.teamId || null, meta?.position || null);
    mergeStats(season, delta);
    mergeStats(ensureSeasonSplit(this.statSchema, season, normalizeSeasonType(meta?.seasonType, "regular")), delta);
    mergeStats(player.careerStats, delta);
  }

  archiveTeamSeason(year) {
    const rows = this.league.teams.map((team) => teamSeasonRow(team, year));
    this.teamSeasonArchive.push(...rows);
    this.buildWarehouseForYear(year);
  }

  buildWarehouseForYear(year) {
    const { warehouse } = this.statSchema;
    const tables = {};
    for (const { category } of warehouse.leaderboards) {
      if (!tables[category]) tables[category] = this.getPlayerSeasonTable(category, { year, seasonType: "regular" });
    }
    const teams = this.getTeamSeasonTable({ year });
    const snapshot = { year, generatedAt: Date.now() };
    for (const { key, category } of warehouse.leaderboards) snapshot[key] = tables[category].slice(0, 40);
    snapshot.teamSummary = teams;
    snapshot.leagueAverages = warehouse.leagueAverages({ teams, tables });
    this.warehouse.byYear[year] = snapshot;
    return this.warehouse.byYear[year];
  }

  getWarehouseSnapshot({ year = null, teamId = null } = {}) {
    const targetYear = year ?? Math.max(0, ...this.teamSeasonArchive.map((row) => row.year));
    if (!targetYear) return null;
    if (!this.warehouse.byYear[targetYear]) this.buildWarehouseForYear(targetYear);
    const snapshot = this.warehouse.byYear[targetYear];
    if (!snapshot) return null;
    if (!teamId) return snapshot;
    const filtered = {
      ...snapshot,
      teamSummary: snapshot.teamSummary.filter((row) => row.team === teamId)
    };
    for (const { key } of this.statSchema.warehouse.leaderboards) {
      filtered[key] = (snapshot[key] || []).filter((row) => row.tm === teamId);
    }
    return filtered;
  }

  getTeamSeasonTable(filters = {}) {
    const { year, team, conference, division } = filters;
    return sortTeamSeasonRows(this.teamSeasonArchive
      .filter((row) => (year == null ? true : row.year === year))
      .filter((row) => (!team ? true : row.team === team))
      .filter((row) => (!conference ? true : row.conference === conference))
      .filter((row) => (!division ? true : row.division === division)));
  }

  /**
   * S109: the standings of the season in progress, from the live team records.
   * The archive only exists for finished seasons, so before this the dashboard
   * showed "No rows" for a whole first season and last year's table after it.
   */
  getLiveTeamSeasonTable(year) {
    return sortTeamSeasonRows(this.league.teams.map((team) => teamSeasonRow(team, year)));
  }

  getPlayerSeasonTable(category, filters = {}) {
    const schema = this.statSchema;
    const definition = schema.categories[category] || null;
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
        if (!source || !hasCategoryVolume(schema, source, category)) continue;
        // An undeclared category has volume but no columns: it lists nothing.
        if (!definition) continue;
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
          ovr: player.overall,
          pot: this.potentialView ? this.potentialView(player) : player.potential,
          pos: season.meta?.position || player.position,
          tm: seasonTeam,
          seasonType,
          g: source.games,
          gs: source.gamesStarted,
          ...schema.rowBaseStats(source)
        };
        rows.push({ ...base, ...definition.seasonRow(source), av });
      }
    }
    const sortKey = definition?.sortKey || schema.defaultSortKey;
    const tieBreakKey = schema.tieBreakKey;
    return rows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0) || (b[tieBreakKey] || 0) - (a[tieBreakKey] || 0));
  }

  getPlayerCareerTable(category, filters = {}) {
    const schema = this.statSchema;
    // A career table for an undeclared category has always shown the schema's
    // fallback row (football: snap shares).
    const definition = schema.categories[category] || schema.categories[schema.careerFallbackCategory] || null;
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
      .map((player) => ({ player, careerView: buildCareerView(schema, player, filters.seasonType) }))
      .filter(({ careerView }) => hasCategoryVolume(schema, careerView.stats, category))
      .map(({ player, careerView }) => {
        const stats = careerView.stats;
        for (const yearKey of Object.keys(player.seasonStats || {})) ensureContext(Number(yearKey));
        const av = playerCareerApproximateValue(player, seasonType, avContexts);
        const base = {
          playerId: player.id,
          player: player.name,
          age: player.age,
          ovr: player.overall,
          pot: this.potentialView ? this.potentialView(player) : player.potential,
          tm: careerView.primaryTeam,
          pos: player.position,
          status: player.status,
          seasonType,
          seasons: careerView.seasons,
          g: stats.games || 0,
          gs: stats.gamesStarted || 0,
          ...schema.rowBaseStats(stats)
        };
        return definition ? { ...base, ...definition.careerRow(stats), av } : { ...base, av };
      });

    const sortKey = schema.categories[category]?.sortKey || schema.defaultSortKey;
    const tieBreakKey = schema.tieBreakKey;
    return rows.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0) || (b[tieBreakKey] || 0) - (a[tieBreakKey] || 0));
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

    const records = {};
    for (const { key, value } of this.statSchema.records) records[key] = leaders((p) => value(p.careerStats));
    records.approximateValue = leaders((p) => playerCareerApproximateValue(p, "all", avContexts));
    return records;
  }
}
