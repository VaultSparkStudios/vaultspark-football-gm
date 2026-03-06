import { ensureSeasonStatBucket, mergeStats } from "../domain/playerFactory.js";

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(digits));
}

function per(numerator, denominator, digits = 1) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(digits));
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

function hasCareerVolume(player, category) {
  const stats = player.careerStats;
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

function primaryTeamForPlayer(player) {
  const gamesByTeam = {};
  for (const season of Object.values(player.seasonStats || {})) {
    const team = season.meta?.teamId;
    if (!team) continue;
    gamesByTeam[team] = (gamesByTeam[team] || 0) + (season.games || 0);
  }
  const sorted = Object.entries(gamesByTeam).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || player.teamId;
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

  registerGameAppearance(playerId, year, started = false, teamId = null, position = null) {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    const season = ensureSeasonStatBucket(player, year);
    this.ensureSeasonMeta(player, season, teamId, position);
    season.games += 1;
    season.gamesStarted += started ? 1 : 0;
    player.careerStats.games += 1;
    player.careerStats.gamesStarted += started ? 1 : 0;
  }

  applyStatDelta(playerId, year, delta, meta = null) {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    const season = ensureSeasonStatBucket(player, year);
    this.ensureSeasonMeta(player, season, meta?.teamId || null, meta?.position || null);
    mergeStats(season, delta);
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
      turnovers: team.season.turnovers
    }));
    this.teamSeasonArchive.push(...rows);
    this.buildWarehouseForYear(year);
  }

  buildWarehouseForYear(year) {
    const passing = this.getPlayerSeasonTable("passing", { year });
    const rushing = this.getPlayerSeasonTable("rushing", { year });
    const receiving = this.getPlayerSeasonTable("receiving", { year });
    const defense = this.getPlayerSeasonTable("defense", { year });
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
    const rows = [];
    for (const player of this.allPlayers()) {
      for (const [yearKey, season] of Object.entries(player.seasonStats)) {
        const year = Number(yearKey);
        if (filters.year != null && year !== filters.year) continue;
        if (filters.position && player.position !== filters.position) continue;
        const seasonTeam = season.meta?.teamId || player.teamId;
        if (filters.team && seasonTeam !== filters.team) continue;
        if (!hasSeasonVolume(season, category)) continue;

        const base = {
          year,
          playerId: player.id,
          player: player.name,
          age: player.age,
          pos: season.meta?.position || player.position,
          tm: seasonTeam,
          g: season.games,
          gs: season.gamesStarted,
          offSn: season.snaps?.offense || 0,
          defSn: season.snaps?.defense || 0,
          stSn: season.snaps?.special || 0,
          sn: (season.snaps?.offense || 0) + (season.snaps?.defense || 0) + (season.snaps?.special || 0)
        };

        if (category === "passing") {
          const p = season.passing;
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
            firstDowns: p.firstDowns
          });
        } else if (category === "rushing") {
          const r = season.rushing;
          rows.push({
            ...base,
            att: r.att,
            yds: r.yards,
            td: r.td,
            lng: r.long,
            ypa: per(r.yards, r.att),
            fmb: r.fumbles,
            firstDowns: r.firstDowns,
            brkTkl: r.brokenTackles
          });
        } else if (category === "receiving") {
          const r = season.receiving;
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
            drops: r.drops
          });
        } else if (category === "defense") {
          const d = season.defense;
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
            fr: d.fr
          });
        } else if (category === "blocking") {
          const b = season.blocking || {};
          rows.push({
            ...base,
            passBlkSn: season.snaps?.passBlock || 0,
            runBlkSn: season.snaps?.runBlock || 0,
            sacksAllowed: b.sacksAllowed || 0,
            pressuresAllowed: b.pressuresAllowed || 0,
            penalties: b.penalties || 0
          });
        } else if (category === "kicking") {
          const k = season.kicking;
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
            fgA50: k.fgA50
          });
        } else if (category === "punting") {
          const p = season.punting;
          rows.push({
            ...base,
            punts: p.punts,
            yds: p.yards,
            ypp: per(p.yards, p.punts),
            in20: p.in20,
            lng: p.long,
            tb: p.touchbacks || 0,
            blk: p.blocks || 0
          });
        } else if (category === "snaps") {
          rows.push({
            ...base,
            offSnPct: pct(season.snaps?.offense || 0, season.games * 64),
            defSnPct: pct(season.snaps?.defense || 0, season.games * 64),
            stSnPct: pct(season.snaps?.special || 0, season.games * 24)
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
    const rows = this.allPlayers()
      .filter((p) => (filters.position ? p.position === filters.position : true))
      .filter((p) =>
        filters.team
          ? Object.values(p.seasonStats || {}).some((season) => (season.meta?.teamId || p.teamId) === filters.team)
          : true
      )
      .filter((p) => hasCareerVolume(p, category))
      .map((player) => {
        const primaryTeam = primaryTeamForPlayer(player);
        const base = {
          playerId: player.id,
          player: player.name,
          tm: primaryTeam,
          pos: player.position,
          status: player.status,
          seasons: player.seasonsPlayed,
          offSn: player.careerStats.snaps?.offense || 0,
          defSn: player.careerStats.snaps?.defense || 0,
          stSn: player.careerStats.snaps?.special || 0,
          sn:
            (player.careerStats.snaps?.offense || 0) +
            (player.careerStats.snaps?.defense || 0) +
            (player.careerStats.snaps?.special || 0)
        };

        if (category === "passing") {
          const p = player.careerStats.passing;
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
            firstDowns: p.firstDowns
          };
        }
        if (category === "rushing") {
          const r = player.careerStats.rushing;
          return {
            ...base,
            att: r.att,
            yds: r.yards,
            td: r.td,
            ypa: per(r.yards, r.att),
            lng: r.long,
            fmb: r.fumbles,
            firstDowns: r.firstDowns,
            brkTkl: r.brokenTackles
          };
        }
        if (category === "receiving") {
          const r = player.careerStats.receiving;
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
            drops: r.drops
          };
        }
        if (category === "defense") {
          const d = player.careerStats.defense;
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
            fr: d.fr
          };
        }
        if (category === "blocking") {
          const b = player.careerStats.blocking || {};
          return {
            ...base,
            passBlkSn: player.careerStats.snaps?.passBlock || 0,
            runBlkSn: player.careerStats.snaps?.runBlock || 0,
            sacksAllowed: b.sacksAllowed || 0,
            pressuresAllowed: b.pressuresAllowed || 0,
            penalties: b.penalties || 0
          };
        }
        const k = player.careerStats.kicking;
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
            fgA50: k.fgA50
          };
        }

        const p = player.careerStats.punting;
        if (category === "punting") {
          return {
            ...base,
            punts: p.punts,
            yds: p.yards,
            ypp: per(p.yards, p.punts),
            in20: p.in20,
            lng: p.long,
            tb: p.touchbacks || 0,
            blk: p.blocks || 0
          };
        }
        return {
          ...base,
          offSnPct: pct(player.careerStats.snaps?.offense || 0, Math.max(1, player.careerStats.games) * 64),
          defSnPct: pct(player.careerStats.snaps?.defense || 0, Math.max(1, player.careerStats.games) * 64),
          stSnPct: pct(player.careerStats.snaps?.special || 0, Math.max(1, player.careerStats.games) * 24)
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
      fieldGoalsMade: leaders((p) => p.careerStats.kicking.fgm)
    };
  }
}
