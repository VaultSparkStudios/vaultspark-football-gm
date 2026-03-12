import { PFR_RECENT_WEIGHTED_PROFILE } from "./profiles/pfrRecentWeightedProfile.js";
import { PFR_CAREER_WEIGHTED_PROFILE } from "./profiles/pfrCareerWeightedProfile.js";
import { clamp } from "../utils/rng.js";

function getAtPath(obj, pathKey) {
  if (!pathKey) return 0;
  if (!pathKey.includes(".")) return obj?.[pathKey] ?? 0;
  return pathKey.split(".").reduce((acc, key) => (acc && acc[key] != null ? acc[key] : 0), obj);
}

function setAtPath(obj, pathKey, value) {
  if (!pathKey.includes(".")) {
    obj[pathKey] = value;
    return;
  }
  const parts = pathKey.split(".");
  const last = parts.pop();
  let cursor = obj;
  for (const part of parts) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[last] = value;
}

const INTEGER_METRIC_PATHS = new Set([
  "passing.att",
  "passing.cmp",
  "passing.yards",
  "passing.td",
  "passing.int",
  "passing.sacks",
  "rushing.att",
  "rushing.yards",
  "rushing.td",
  "receiving.targets",
  "receiving.rec",
  "receiving.yards",
  "receiving.td",
  "defense.tackles",
  "defense.sacks",
  "defense.passDefended",
  "defense.int",
  "kicking.fga",
  "kicking.fgm",
  "kicking.xpa",
  "kicking.xpm",
  "punting.punts",
  "punting.yards",
  "punting.in20",
  "gamesStarted"
]);

function isIntegerMetric(pathKey) {
  return INTEGER_METRIC_PATHS.has(pathKey);
}

function roundStat(pathKey, value) {
  if (isIntegerMetric(pathKey)) return Math.max(0, Math.round(value));
  return Number(value.toFixed(1));
}

function allPlayers(league) {
  return [...league.players, ...league.retiredPlayers];
}

function activeTeamPlayersByPosition(league, position) {
  return league.players.filter((p) => p.status === "active" && p.teamId !== "FA" && p.position === position);
}

function qualifiedPlayersForPosition(league, position, depthPerTeam) {
  const byTeam = new Map();
  for (const player of activeTeamPlayersByPosition(league, position)) {
    if (!byTeam.has(player.teamId)) byTeam.set(player.teamId, []);
    byTeam.get(player.teamId).push(player);
  }

  const qualified = [];
  for (const [, teamPlayers] of byTeam.entries()) {
    const top = teamPlayers.sort((a, b) => b.overall - a.overall).slice(0, depthPerTeam);
    qualified.push(...top);
  }
  return qualified;
}

function qualifiedPlayersForPositionYear(league, position, depthPerTeam, year) {
  const byTeam = new Map();
  for (const player of allPlayers(league)) {
    const season = player.seasonStats?.[year];
    if (!season || player.position !== position || season.games <= 0) continue;
    const seasonTeam = season.meta?.teamId || player.teamId;
    if (!byTeam.has(seasonTeam)) byTeam.set(seasonTeam, []);
    byTeam.get(seasonTeam).push(player);
  }

  const qualified = [];
  for (const [, teamPlayers] of byTeam.entries()) {
    const top = teamPlayers
      .sort((a, b) => {
        const seasonA = a.seasonStats?.[year];
        const seasonB = b.seasonStats?.[year];
        return (
          (seasonB?.gamesStarted || 0) - (seasonA?.gamesStarted || 0) ||
          (seasonB?.games || 0) - (seasonA?.games || 0) ||
          (b.overall || 0) - (a.overall || 0)
        );
      })
      .slice(0, depthPerTeam);
    qualified.push(...top);
  }
  return qualified;
}

function enforceIntegrity(player, year) {
  const season = player.seasonStats?.[year];
  if (!season) return;
  const toInt = (value) => Math.max(0, Math.round(Number(value) || 0));

  if (season.passing.cmp > season.passing.att) season.passing.cmp = season.passing.att;
  if (season.passing.int > season.passing.att) season.passing.int = season.passing.att;
  if (season.receiving.rec > season.receiving.targets) season.receiving.rec = season.receiving.targets;
  if (season.kicking.fgm > season.kicking.fga) season.kicking.fgm = season.kicking.fga;
  if (season.kicking.xpm > season.kicking.xpa) season.kicking.xpm = season.kicking.xpa;
  if (season.kicking.fga < 0) season.kicking.fga = 0;
  if (season.kicking.fgm < 0) season.kicking.fgm = 0;

  // Keep distance split stats coherent with total FG makes/attempts.
  let fgM40 = toInt(season.kicking.fgM40);
  let fgA40 = toInt(season.kicking.fgA40);
  let fgM50 = toInt(season.kicking.fgM50);
  let fgA50 = toInt(season.kicking.fgA50);

  const madeTotal = fgM40 + fgM50;
  if (madeTotal > season.kicking.fgm && madeTotal > 0) {
    const scale = season.kicking.fgm / madeTotal;
    fgM40 = Math.round(fgM40 * scale);
    fgM50 = season.kicking.fgm - fgM40;
  }
  fgA40 = Math.max(fgA40, fgM40);
  fgA50 = Math.max(fgA50, fgM50);

  const splitAttempts = fgA40 + fgA50;
  if (splitAttempts > season.kicking.fga) {
    let reduceBy = splitAttempts - season.kicking.fga;
    const slack40 = Math.max(0, fgA40 - fgM40);
    const slack50 = Math.max(0, fgA50 - fgM50);
    const totalSlack = slack40 + slack50;
    const cut40 = Math.min(slack40, totalSlack ? Math.round((slack40 / totalSlack) * reduceBy) : 0);
    fgA40 -= cut40;
    reduceBy -= cut40;
    const cut50 = Math.min(slack50, reduceBy);
    fgA50 -= cut50;
    reduceBy -= cut50;
    if (reduceBy > 0) {
      const fallback40 = Math.min(Math.max(0, fgA40 - fgM40), reduceBy);
      fgA40 -= fallback40;
      reduceBy -= fallback40;
    }
    if (reduceBy > 0) {
      fgA50 = Math.max(fgM50, fgA50 - reduceBy);
    }
  }

  season.kicking.fgM40 = fgM40;
  season.kicking.fgA40 = fgA40;
  season.kicking.fgM50 = fgM50;
  season.kicking.fgA50 = fgA50;
}

function syncCareerFromSeasonDelta(player, year, pathKey, oldValue, newValue) {
  const delta = newValue - oldValue;
  if (delta === 0) return;
  const oldCareer = getAtPath(player.careerStats, pathKey);
  setAtPath(player.careerStats, pathKey, Math.max(0, oldCareer + delta));
  if (pathKey === "gamesStarted") {
    player.careerStats.gamesStarted = Math.max(0, player.careerStats.gamesStarted + delta);
  }
}

function rebalanceDiscreteMetric({ qualified, year, pathKey, targetAverage }) {
  if (!qualified.length || !isIntegerMetric(pathKey)) return;
  const desiredTotal = Math.max(0, Math.round(Number(targetAverage || 0) * qualified.length));
  let currentTotal = qualified.reduce((sum, player) => sum + Math.round(getAtPath(player.seasonStats?.[year], pathKey) || 0), 0);
  if (currentTotal === desiredTotal) return;

  if (currentTotal < desiredTotal) {
    const sorted = qualified
      .slice()
      .sort(
        (a, b) =>
          (b.seasonStats?.[year]?.gamesStarted || 0) - (a.seasonStats?.[year]?.gamesStarted || 0) ||
          (b.seasonStats?.[year]?.games || 0) - (a.seasonStats?.[year]?.games || 0) ||
          (b.overall || 0) - (a.overall || 0)
      );
    let idx = 0;
    while (currentTotal < desiredTotal) {
      const player = sorted[idx % sorted.length];
      const season = player.seasonStats?.[year];
      if (!season) break;
      const oldValue = Math.round(getAtPath(season, pathKey) || 0);
      const nextValue = oldValue + 1;
      setAtPath(season, pathKey, nextValue);
      syncCareerFromSeasonDelta(player, year, pathKey, oldValue, nextValue);
      currentTotal += 1;
      idx += 1;
      if (idx > desiredTotal * 3 + sorted.length * 2) break;
    }
    return;
  }

  const sorted = qualified
    .slice()
    .sort(
      (a, b) =>
        (getAtPath(b.seasonStats?.[year], pathKey) || 0) - (getAtPath(a.seasonStats?.[year], pathKey) || 0) ||
        (a.seasonStats?.[year]?.gamesStarted || 0) - (b.seasonStats?.[year]?.gamesStarted || 0) ||
        (a.overall || 0) - (b.overall || 0)
    );
  let idx = 0;
  while (currentTotal > desiredTotal) {
    const player = sorted[idx % sorted.length];
    const season = player.seasonStats?.[year];
    if (!season) break;
    const oldValue = Math.round(getAtPath(season, pathKey) || 0);
    if (oldValue > 0) {
      const nextValue = oldValue - 1;
      setAtPath(season, pathKey, nextValue);
      syncCareerFromSeasonDelta(player, year, pathKey, oldValue, nextValue);
      currentTotal -= 1;
    }
    idx += 1;
    if (idx > currentTotal * 3 + sorted.length * 2) break;
  }
}

export function applySeasonRealismCalibration({ league, year, profile = PFR_RECENT_WEIGHTED_PROFILE }) {
  const calibrationReport = { year, profileSource: profile.meta?.source || "custom", positions: {} };

  for (const [position, positionProfile] of Object.entries(profile.positions || {})) {
    const depth = Math.max(1, Math.floor(positionProfile.depthPerTeam || 1));
    const qualified = qualifiedPlayersForPositionYear(league, position, depth, year).filter(
      (p) => p.seasonStats?.[year] && p.seasonStats[year].games > 0
    );
    if (!qualified.length) {
      calibrationReport.positions[position] = { adjustedPlayers: 0, metrics: {} };
      continue;
    }

    const metricReport = {};
    for (const [pathKey, targetAverage] of Object.entries(positionProfile.metrics || {})) {
      const actualAverage =
        qualified.reduce((sum, player) => sum + getAtPath(player.seasonStats[year], pathKey), 0) / qualified.length;

      if (!actualAverage || !Number.isFinite(actualAverage)) {
        if (targetAverage > 0) {
          for (const player of qualified) {
            const season = player.seasonStats[year];
            const oldValue = getAtPath(season, pathKey);
            const seeded = roundStat(pathKey, targetAverage);
            setAtPath(season, pathKey, seeded);
            syncCareerFromSeasonDelta(player, year, pathKey, oldValue, seeded);
          }
        }
        rebalanceDiscreteMetric({ qualified, year, pathKey, targetAverage });
        const postAverage =
          qualified.reduce((sum, player) => sum + getAtPath(player.seasonStats[year], pathKey), 0) / qualified.length;
        metricReport[pathKey] = {
          targetAverage,
          actualAverage: 0,
          multiplier: targetAverage > 0 ? "seeded" : 1,
          postAverage: Number(postAverage.toFixed(2))
        };
        continue;
      }

      const multiplier = clamp(targetAverage / actualAverage, 0.2, 5.5);
      metricReport[pathKey] = {
        targetAverage: Number(targetAverage.toFixed ? targetAverage.toFixed(2) : targetAverage),
        actualAverage: Number(actualAverage.toFixed(2)),
        multiplier: Number(multiplier.toFixed(3))
      };

      for (const player of qualified) {
        const season = player.seasonStats[year];
        const oldValue = getAtPath(season, pathKey);
        const scaled = roundStat(pathKey, oldValue * multiplier);
        setAtPath(season, pathKey, scaled);
        syncCareerFromSeasonDelta(player, year, pathKey, oldValue, scaled);
      }

      rebalanceDiscreteMetric({ qualified, year, pathKey, targetAverage });

      const postAverage =
        qualified.reduce((sum, player) => sum + getAtPath(player.seasonStats[year], pathKey), 0) / qualified.length;
      metricReport[pathKey].postAverage = Number(postAverage.toFixed(2));
    }

    for (const player of qualified) enforceIntegrity(player, year);

    calibrationReport.positions[position] = {
      adjustedPlayers: qualified.length,
      metrics: metricReport
    };
  }

  return calibrationReport;
}

function normalizePosition(position) {
  const pos = String(position || "").toUpperCase();
  if (["HB", "FB"].includes(pos)) return "RB";
  if (["LT", "LG", "C", "RG", "RT"].includes(pos)) return "OL";
  if (["DT", "DE", "NT"].includes(pos)) return "DL";
  if (["ILB", "OLB", "MLB"].includes(pos)) return "LB";
  if (["CB", "FS", "SS", "S"].includes(pos)) return "DB";
  if (pos === "PK") return "K";
  return pos;
}

function readNumber(row, ...keys) {
  for (const key of keys) {
    if (row[key] == null || row[key] === "") continue;
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function seasonWeight(season, toYear, halfLife) {
  if (!Number.isFinite(season)) return 0;
  const delta = Math.max(0, toYear - season);
  return Math.pow(0.5, delta / Math.max(0.25, halfLife));
}

const SEASON_METRIC_PATH_MAP = {
  "passing.att": ["pass_att", "passing_att", "att"],
  "passing.cmp": ["pass_cmp", "passing_cmp", "cmp"],
  "passing.yards": ["pass_yds", "passing_yds", "pass_yards"],
  "passing.td": ["pass_td", "passing_td"],
  "passing.int": ["pass_int", "passing_int", "int"],
  "passing.sacks": ["sacks", "pass_sacked"],
  "rushing.att": ["rush_att", "rushing_att"],
  "rushing.yards": ["rush_yds", "rushing_yds"],
  "rushing.td": ["rush_td", "rushing_td"],
  "receiving.targets": ["targets", "tgt"],
  "receiving.rec": ["rec", "receptions"],
  "receiving.yards": ["rec_yds", "receiving_yds"],
  "receiving.td": ["rec_td", "receiving_td"],
  "defense.tackles": ["tackles", "tkl"],
  "defense.sacks": ["sacks"],
  "defense.passDefended": ["pass_defended", "pd"],
  "defense.int": ["def_int", "interceptions", "int"],
  "kicking.fga": ["fga", "fg_att"],
  "kicking.fgm": ["fgm", "fg_made"],
  "kicking.xpa": ["xpa", "xp_att"],
  "kicking.xpm": ["xpm", "xp_made"],
  "punting.punts": ["punts", "punt_att"],
  "punting.yards": ["punt_yds", "punting_yds"],
  "punting.in20": ["in20", "punts_in20"],
  gamesStarted: ["gs", "games_started"],
  games: ["g", "games"]
};

function meetsCareerQualifiers(player, qualifiers = {}) {
  for (const [metricPath, minimum] of Object.entries(qualifiers || {})) {
    const minValue = Number(minimum || 0);
    if (!Number.isFinite(minValue) || minValue <= 0) continue;
    const actual = Number(getAtPath(player, metricPath) || 0);
    if (actual < minValue) return false;
  }
  return true;
}

export function buildWeightedProfileFromPfrRows(
  rows,
  { fromYear = 2019, toYear = 2025, halfLife = 2.2, fallbackProfile = PFR_RECENT_WEIGHTED_PROFILE } = {}
) {
  const profile = JSON.parse(JSON.stringify(fallbackProfile));
  const aggregates = {};
  for (const pos of Object.keys(profile.positions)) {
    aggregates[pos] = {};
    for (const key of Object.keys(profile.positions[pos].metrics)) {
      aggregates[pos][key] = { weightedSum: 0, totalWeight: 0 };
    }
  }

  for (const row of rows || []) {
    const season = readNumber(row, "season", "year");
    if (!season || season < fromYear || season > toYear) continue;
    const position = normalizePosition(row.position || row.pos);
    if (!aggregates[position]) continue;
    const games = readNumber(row, "games", "g");
    if (games != null && games <= 2) continue;

    const weight = seasonWeight(season, toYear, halfLife) * (games != null ? Math.max(0.5, games / 17) : 1);
    for (const metricKey of Object.keys(aggregates[position])) {
      const value = readNumber(row, ...(SEASON_METRIC_PATH_MAP[metricKey] || []));
      if (value == null) continue;
      aggregates[position][metricKey].weightedSum += value * weight;
      aggregates[position][metricKey].totalWeight += weight;
    }
  }

  for (const [position, metricAgg] of Object.entries(aggregates)) {
    for (const [metricKey, values] of Object.entries(metricAgg)) {
      if (!values.totalWeight) continue;
      profile.positions[position].metrics[metricKey] = Number((values.weightedSum / values.totalWeight).toFixed(2));
    }
  }

  profile.meta = {
    source: "Generated from PFR rows",
    generatedAt: new Date().toISOString(),
    fromYear,
    toYear,
    halfLife
  };
  return profile;
}

export function buildCareerProfileFromPfrRows(
  rows,
  {
    fromYear = 2000,
    toYear = 2025,
    minCareerSeasons = 2,
    minCareerGames = 40,
    fallbackProfile = PFR_CAREER_WEIGHTED_PROFILE
  } = {}
) {
  const profile = JSON.parse(JSON.stringify(fallbackProfile));
  const byPlayer = new Map();

  for (const row of rows || []) {
    const season = readNumber(row, "season", "year");
    if (!season || season < fromYear || season > toYear) continue;
    const playerId =
      String(row.player_id || row.pfr_id || row.id || row.player || row.player_name || "").trim() || null;
    if (!playerId) continue;
    const pos = normalizePosition(row.position || row.pos);
    if (!profile.positions[pos]) continue;

    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, {
        id: playerId,
        posCount: {},
        seasons: new Set(),
        seasonsPlayed: 0,
        careerStats: {
          games: 0,
          gamesStarted: 0,
          passing: { att: 0, cmp: 0, yards: 0, td: 0, int: 0, sacks: 0 },
          rushing: { att: 0, yards: 0, td: 0 },
          receiving: { targets: 0, rec: 0, yards: 0, td: 0 },
          defense: { tackles: 0, sacks: 0, passDefended: 0, int: 0 },
          kicking: { fga: 0, fgm: 0, xpa: 0, xpm: 0 },
          punting: { punts: 0, yards: 0, in20: 0 }
        }
      });
    }

    const player = byPlayer.get(playerId);
    player.posCount[pos] = (player.posCount[pos] || 0) + 1;
    player.seasons.add(season);
    player.seasonsPlayed = player.seasons.size;
    player.careerStats.games += readNumber(row, ...(SEASON_METRIC_PATH_MAP.games || [])) || 0;
    player.careerStats.gamesStarted += readNumber(row, ...(SEASON_METRIC_PATH_MAP.gamesStarted || [])) || 0;
    player.careerStats.passing.att += readNumber(row, ...(SEASON_METRIC_PATH_MAP["passing.att"] || [])) || 0;
    player.careerStats.passing.cmp += readNumber(row, ...(SEASON_METRIC_PATH_MAP["passing.cmp"] || [])) || 0;
    player.careerStats.passing.yards += readNumber(row, ...(SEASON_METRIC_PATH_MAP["passing.yards"] || [])) || 0;
    player.careerStats.passing.td += readNumber(row, ...(SEASON_METRIC_PATH_MAP["passing.td"] || [])) || 0;
    player.careerStats.passing.int += readNumber(row, ...(SEASON_METRIC_PATH_MAP["passing.int"] || [])) || 0;
    player.careerStats.passing.sacks += readNumber(row, ...(SEASON_METRIC_PATH_MAP["passing.sacks"] || [])) || 0;
    player.careerStats.rushing.att += readNumber(row, ...(SEASON_METRIC_PATH_MAP["rushing.att"] || [])) || 0;
    player.careerStats.rushing.yards += readNumber(row, ...(SEASON_METRIC_PATH_MAP["rushing.yards"] || [])) || 0;
    player.careerStats.rushing.td += readNumber(row, ...(SEASON_METRIC_PATH_MAP["rushing.td"] || [])) || 0;
    player.careerStats.receiving.targets += readNumber(row, ...(SEASON_METRIC_PATH_MAP["receiving.targets"] || [])) || 0;
    player.careerStats.receiving.rec += readNumber(row, ...(SEASON_METRIC_PATH_MAP["receiving.rec"] || [])) || 0;
    player.careerStats.receiving.yards += readNumber(row, ...(SEASON_METRIC_PATH_MAP["receiving.yards"] || [])) || 0;
    player.careerStats.receiving.td += readNumber(row, ...(SEASON_METRIC_PATH_MAP["receiving.td"] || [])) || 0;
    player.careerStats.defense.tackles += readNumber(row, ...(SEASON_METRIC_PATH_MAP["defense.tackles"] || [])) || 0;
    player.careerStats.defense.sacks += readNumber(row, ...(SEASON_METRIC_PATH_MAP["defense.sacks"] || [])) || 0;
    player.careerStats.defense.passDefended +=
      readNumber(row, ...(SEASON_METRIC_PATH_MAP["defense.passDefended"] || [])) || 0;
    player.careerStats.defense.int += readNumber(row, ...(SEASON_METRIC_PATH_MAP["defense.int"] || [])) || 0;
    player.careerStats.kicking.fga += readNumber(row, ...(SEASON_METRIC_PATH_MAP["kicking.fga"] || [])) || 0;
    player.careerStats.kicking.fgm += readNumber(row, ...(SEASON_METRIC_PATH_MAP["kicking.fgm"] || [])) || 0;
    player.careerStats.kicking.xpa += readNumber(row, ...(SEASON_METRIC_PATH_MAP["kicking.xpa"] || [])) || 0;
    player.careerStats.kicking.xpm += readNumber(row, ...(SEASON_METRIC_PATH_MAP["kicking.xpm"] || [])) || 0;
    player.careerStats.punting.punts += readNumber(row, ...(SEASON_METRIC_PATH_MAP["punting.punts"] || [])) || 0;
    player.careerStats.punting.yards += readNumber(row, ...(SEASON_METRIC_PATH_MAP["punting.yards"] || [])) || 0;
    player.careerStats.punting.in20 += readNumber(row, ...(SEASON_METRIC_PATH_MAP["punting.in20"] || [])) || 0;
  }

  const grouped = {};
  for (const position of Object.keys(profile.positions)) grouped[position] = [];
  for (const player of byPlayer.values()) {
    const primary = Object.entries(player.posCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!primary || !grouped[primary]) continue;
    const positionProfile = profile.positions?.[primary] || {};
    const minSeasonsForPos = Math.max(1, Number(positionProfile.minCareerSeasons ?? minCareerSeasons));
    const minGamesForPos = Math.max(0, Number(positionProfile.minCareerGames ?? minCareerGames));
    if (player.seasonsPlayed < minSeasonsForPos) continue;
    if ((player.careerStats?.games || 0) < minGamesForPos) continue;
    if (!meetsCareerQualifiers(player, positionProfile.qualifiers || {})) continue;
    grouped[primary].push(player);
  }

  for (const [position, details] of Object.entries(profile.positions)) {
    const players = grouped[position] || [];
    if (!players.length) continue;
    details.minCareerSeasons = Math.max(1, Number(details.minCareerSeasons ?? minCareerSeasons));
    details.minCareerGames = Math.max(0, Number(details.minCareerGames ?? minCareerGames));
    for (const metricPath of Object.keys(details.metrics || {})) {
      const average =
        players.reduce((sum, player) => sum + getAtPath(player, metricPath), 0) / Math.max(1, players.length);
      details.metrics[metricPath] = Number(average.toFixed(2));
    }
  }

  profile.meta = {
    source: "Generated from PFR career rows",
    generatedAt: new Date().toISOString(),
    fromYear,
    toYear,
    minCareerSeasons,
    minCareerGames,
    qualifyingByPosition: true
  };
  return profile;
}

export function buildCareerCalibrationSnapshot({
  league,
  profile = PFR_CAREER_WEIGHTED_PROFILE,
  includeActive = true
} = {}) {
  const players = includeActive ? [...league.players, ...league.retiredPlayers] : [...league.retiredPlayers];
  const snapshot = {};
  for (const [position, positionProfile] of Object.entries(profile.positions || {})) {
    const minCareerSeasons = Math.max(1, Number(positionProfile.minCareerSeasons || 1));
    const minCareerGames = Math.max(0, Number(positionProfile.minCareerGames || 0));
    const qualifiers = positionProfile.qualifiers || {};
    const qualified = players.filter(
      (player) =>
        player.position === position &&
        Number(player.seasonsPlayed || 0) >= minCareerSeasons &&
        Number(player.careerStats?.games || 0) >= minCareerGames &&
        meetsCareerQualifiers(player, qualifiers)
    );
    const metrics = {};
    for (const metricPath of Object.keys(positionProfile.metrics || {})) {
      const average =
        qualified.length > 0
          ? qualified.reduce((sum, player) => sum + getAtPath(player, metricPath), 0) / qualified.length
          : 0;
      metrics[metricPath] = Number(average.toFixed(2));
    }
    snapshot[position] = {
      sampleSize: qualified.length,
      minCareerSeasons,
      minCareerGames,
      averages: metrics
    };
  }
  return snapshot;
}

export function buildPositionCalibrationSnapshot({ league, year, profile = PFR_RECENT_WEIGHTED_PROFILE }) {
  const snapshot = {};
  for (const [position, positionProfile] of Object.entries(profile.positions)) {
    const qualified = qualifiedPlayersForPositionYear(league, position, positionProfile.depthPerTeam || 1, year);
    const metrics = {};
    for (const metricPath of Object.keys(positionProfile.metrics)) {
      const average =
        qualified.length > 0
          ? qualified.reduce((sum, player) => sum + getAtPath(player.seasonStats[year], metricPath), 0) /
            qualified.length
          : 0;
      metrics[metricPath] = Number(average.toFixed(2));
    }
    snapshot[position] = {
      sampleSize: qualified.length,
      averageGames: qualified.length
        ? Number(
            (
              qualified.reduce((sum, player) => sum + (player.seasonStats?.[year]?.games || 0), 0) / qualified.length
            ).toFixed(2)
          )
        : 0,
      averages: metrics
    };
  }
  return snapshot;
}

export function getAllPlayersForTables(league) {
  return allPlayers(league);
}
