/**
 * Football's stat schema (multi-sport Phase 1 step 3).
 *
 * One declaration drives the per-player stat shape (the zeroed season and
 * career objects), the StatBook's table categories, their "has volume" tests,
 * row builders and derived rates, the warehouse and records views, and the
 * column labels. The StatBook reads it through `getSportRules(sportId).stats`
 * and holds no football names of its own, so another sport supplies a
 * different schema without editing src/stats/statBook.js.
 *
 * Everything here is the code that lived in statBook.js and playerFactory.js
 * before the move, unchanged: same formulas, same rounding, same key order in
 * every object built. The golden master (scripts/golden-master.mjs) is the
 * proof. This module imports nothing, so any layer may read it without a cycle.
 */

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(digits));
}

function per(numerator, denominator, digits = 1) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(digits));
}

export function passerRating({ cmp, att, yards, td, int }) {
  if (!att) return 0;
  const a = Math.max(0, Math.min(2.375, (cmp / att - 0.3) * 5));
  const b = Math.max(0, Math.min(2.375, (yards / att - 3) * 0.25));
  const c = Math.max(0, Math.min(2.375, (td / att) * 20));
  const d = Math.max(0, Math.min(2.375, 2.375 - (int / att) * 25));
  return Number((((a + b + c + d) / 6) * 100).toFixed(1));
}

// The per-player stat shape, in key order. Top-level counters first, then one
// group of counters per stat family. `long` is merged as a max, everything
// else summed (see mergeStats in src/domain/playerFactory.js).
const SEASON_COUNTERS = Object.freeze(["games", "gamesStarted"]);
const COUNTER_GROUPS = Object.freeze({
  snaps: Object.freeze(["offense", "defense", "special", "passBlock", "runBlock"]),
  passing: Object.freeze(["cmp", "att", "yards", "td", "int", "sacks", "sackYards", "firstDowns", "long"]),
  rushing: Object.freeze(["att", "yards", "td", "long", "fumbles", "firstDowns", "brokenTackles"]),
  receiving: Object.freeze(["targets", "rec", "yards", "td", "long", "drops", "firstDowns", "yac"]),
  defense: Object.freeze(["tackles", "solo", "ast", "sacks", "qbHits", "tfl", "int", "passDefended", "ff", "fr"]),
  blocking: Object.freeze(["sacksAllowed", "pressuresAllowed", "penalties"]),
  kicking: Object.freeze(["fgm", "fga", "xpm", "xpa", "long", "fgM40", "fgA40", "fgM50", "fgA50"]),
  punting: Object.freeze(["punts", "yards", "in20", "long", "touchbacks", "blocks"])
});

function zeroedSeasonStats() {
  const stats = {};
  for (const key of SEASON_COUNTERS) stats[key] = 0;
  for (const [group, fields] of Object.entries(COUNTER_GROUPS)) {
    const counters = {};
    for (const field of fields) counters[field] = 0;
    stats[group] = counters;
  }
  return stats;
}

const totalSnaps = (stats) => (stats.snaps?.offense || 0) + (stats.snaps?.defense || 0) + (stats.snaps?.special || 0);

// Snap columns every player row carries after the core's identity columns.
function rowBaseStats(stats) {
  return {
    offSn: stats.snaps?.offense || 0,
    defSn: stats.snaps?.defense || 0,
    stSn: stats.snaps?.special || 0,
    sn: totalSnaps(stats)
  };
}

function passingRow(stats) {
  const p = stats.passing;
  return {
    cmp: p.cmp,
    att: p.att,
    cmpPct: pct(p.cmp, p.att),
    yds: p.yards,
    td: p.td,
    int: p.int,
    ypa: per(p.yards, p.att),
    ypc: per(p.yards, p.cmp),
    tdPct: pct(p.td, p.att),
    intPct: pct(p.int, p.att),
    nya: per(p.yards - p.sackYards, p.att + p.sacks, 2),
    anya: per(p.yards - p.sackYards + p.td * 20 - p.int * 45, p.att + p.sacks, 2),
    rate: passerRating(p),
    sacks: p.sacks,
    sackYds: p.sackYards,
    lng: p.long,
    firstDowns: p.firstDowns
  };
}

function receivingRow(stats) {
  const r = stats.receiving;
  return {
    tgt: r.targets,
    rec: r.rec,
    yds: r.yards,
    ypr: per(r.yards, r.rec),
    ypt: per(r.yards, r.targets),
    ypg: per(r.yards, stats.games),
    recPg: per(r.rec, stats.games),
    td: r.td,
    tdPct: pct(r.td, r.targets),
    lng: r.long,
    catchPct: pct(r.rec, r.targets),
    firstDownPct: pct(r.firstDowns, r.targets),
    firstDowns: r.firstDowns,
    yac: r.yac,
    drops: r.drops
  };
}

function defenseRow(stats) {
  const d = stats.defense;
  return {
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
    tklPg: per(d.tackles, stats.games),
    sackPg: per(d.sacks, stats.games, 2),
    takeaways: d.int + d.fr
  };
}

function blockingRow(stats) {
  const b = stats.blocking || {};
  return {
    passBlkSn: stats.snaps?.passBlock || 0,
    runBlkSn: stats.snaps?.runBlock || 0,
    sacksAllowed: b.sacksAllowed || 0,
    pressuresAllowed: b.pressuresAllowed || 0,
    pressurePct: pct(b.pressuresAllowed || 0, stats.snaps?.passBlock || 0, 2),
    penalties: b.penalties || 0,
    penaltyPct: pct(b.penalties || 0, (stats.snaps?.passBlock || 0) + (stats.snaps?.runBlock || 0), 2)
  };
}

function kickingRow(stats) {
  const k = stats.kicking;
  return {
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
    fgM40to49: Math.max(0, k.fgm - k.fgM40 - k.fgM50),
    fgA40to49: Math.max(0, k.fga - k.fgA40 - k.fgA50)
  };
}

function puntingRow(stats) {
  const p = stats.punting;
  return {
    punts: p.punts,
    yds: p.yards,
    ypp: per(p.yards, p.punts),
    in20: p.in20,
    lng: p.long,
    tb: p.touchbacks || 0,
    in20Pct: pct(p.in20, p.punts),
    tbPct: pct(p.touchbacks || 0, p.punts),
    blk: p.blocks || 0
  };
}

/**
 * Table categories, in the order the session lists them. Each declares:
 *   counters   the stat group it reads (documentation and contract tests)
 *   hasVolume  whether a season or career has enough of it to earn a row
 *   seasonRow  the category's columns for one season (after the core's base
 *              columns; the core appends `av` last)
 *   careerRow  the same for a career total, when it differs from seasonRow
 *   sortKey    the column the table sorts on (descending), else defaultSortKey
 */
const CATEGORIES = Object.freeze({
  passing: Object.freeze({
    counters: "passing",
    hasVolume: (stats) => (stats.passing?.att || 0) > 0,
    seasonRow: passingRow,
    careerRow: passingRow
  }),
  rushing: Object.freeze({
    counters: "rushing",
    hasVolume: (stats) => (stats.rushing?.att || 0) > 0,
    seasonRow(stats) {
      const r = stats.rushing;
      return {
        att: r.att,
        yds: r.yards,
        td: r.td,
        lng: r.long,
        ypa: per(r.yards, r.att),
        ypg: per(r.yards, stats.games),
        apg: per(r.att, stats.games),
        firstDownPct: pct(r.firstDowns, r.att),
        fmbRate: pct(r.fumbles, r.att, 2),
        fmb: r.fumbles,
        firstDowns: r.firstDowns,
        brkTkl: r.brokenTackles
      };
    },
    // The career table has always placed `lng` after the rates; kept as-is.
    careerRow(stats) {
      const r = stats.rushing;
      return {
        att: r.att,
        yds: r.yards,
        td: r.td,
        ypa: per(r.yards, r.att),
        ypg: per(r.yards, stats.games),
        apg: per(r.att, stats.games),
        firstDownPct: pct(r.firstDowns, r.att),
        fmbRate: pct(r.fumbles, r.att, 2),
        lng: r.long,
        fmb: r.fumbles,
        firstDowns: r.firstDowns,
        brkTkl: r.brokenTackles
      };
    }
  }),
  receiving: Object.freeze({
    counters: "receiving",
    hasVolume: (stats) => (stats.receiving?.targets || 0) > 0,
    seasonRow: receivingRow,
    careerRow: receivingRow
  }),
  defense: Object.freeze({
    counters: "defense",
    hasVolume(stats) {
      const d = stats.defense || {};
      return (stats.snaps?.defense || 0) > 0 || d.tackles > 0 || d.sacks > 0 || d.int > 0 || d.passDefended > 0;
    },
    seasonRow: defenseRow,
    careerRow: defenseRow,
    sortKey: "tkl"
  }),
  blocking: Object.freeze({
    counters: "blocking",
    hasVolume(stats) {
      const b = stats.blocking || {};
      return (stats.snaps?.passBlock || 0) > 0 || (stats.snaps?.runBlock || 0) > 0 || b.pressuresAllowed > 0;
    },
    seasonRow: blockingRow,
    careerRow: blockingRow,
    sortKey: "passBlkSn"
  }),
  kicking: Object.freeze({
    counters: "kicking",
    hasVolume: (stats) => (stats.kicking?.fga || 0) + (stats.kicking?.xpa || 0) > 0,
    seasonRow: kickingRow,
    careerRow: kickingRow,
    sortKey: "fgm"
  }),
  punting: Object.freeze({
    counters: "punting",
    hasVolume: (stats) => (stats.punting?.punts || 0) > 0,
    seasonRow: puntingRow,
    careerRow: puntingRow,
    sortKey: "punts"
  }),
  snaps: Object.freeze({
    counters: "snaps",
    hasVolume: (stats) => totalSnaps(stats) > 0,
    seasonRow(stats) {
      return {
        offSnPct: pct(stats.snaps?.offense || 0, stats.games * 64),
        defSnPct: pct(stats.snaps?.defense || 0, stats.games * 64),
        stSnPct: pct(stats.snaps?.special || 0, stats.games * 24)
      };
    },
    // Career shares floor the games at one; the season table never did.
    careerRow(stats) {
      return {
        offSnPct: pct(stats.snaps?.offense || 0, Math.max(1, stats.games) * 64),
        defSnPct: pct(stats.snaps?.defense || 0, Math.max(1, stats.games) * 64),
        stSnPct: pct(stats.snaps?.special || 0, Math.max(1, stats.games) * 24)
      };
    },
    sortKey: "sn"
  })
});

// Season-end warehouse: the leaderboards it keeps and the league averages it
// derives. `tables` are the full regular-season tables by category.
const WAREHOUSE = Object.freeze({
  leaderboards: Object.freeze([
    Object.freeze({ key: "topPassing", category: "passing" }),
    Object.freeze({ key: "topRushing", category: "rushing" }),
    Object.freeze({ key: "topReceiving", category: "receiving" }),
    Object.freeze({ key: "topDefense", category: "defense" })
  ]),
  leagueAverages({ teams, tables }) {
    const passing = tables.passing || [];
    const rushing = tables.rushing || [];
    const passYardsPerAttempt = passing.reduce((sum, row) => sum + (row.yds || 0), 0) /
      Math.max(1, passing.reduce((sum, row) => sum + (row.att || 0), 0));
    const rushYardsPerAttempt = rushing.reduce((sum, row) => sum + (row.yds || 0), 0) /
      Math.max(1, rushing.reduce((sum, row) => sum + (row.att || 0), 0));
    return {
      pointsPerGame: teams.length ? Number((teams.reduce((sum, t) => sum + t.pf / 17, 0) / teams.length).toFixed(2)) : 0,
      yardsPerGame: teams.length ? Number((teams.reduce((sum, t) => sum + (t.yardOff || 0) / 17, 0) / teams.length).toFixed(2)) : 0,
      passYardsPerAttempt: Number(passYardsPerAttempt.toFixed(3)),
      rushYardsPerAttempt: Number(rushYardsPerAttempt.toFixed(3))
    };
  }
});

// Career record boards, in display order. The core appends its approximate
// value board after these.
const RECORDS = Object.freeze([
  Object.freeze({ key: "passingYards", value: (stats) => stats.passing.yards }),
  Object.freeze({ key: "passingTD", value: (stats) => stats.passing.td }),
  Object.freeze({ key: "rushingYards", value: (stats) => stats.rushing.yards }),
  Object.freeze({ key: "rushingTD", value: (stats) => stats.rushing.td }),
  Object.freeze({ key: "receivingYards", value: (stats) => stats.receiving.yards }),
  Object.freeze({ key: "receivingTD", value: (stats) => stats.receiving.td }),
  Object.freeze({ key: "tackles", value: (stats) => stats.defense.tackles }),
  Object.freeze({ key: "sacks", value: (stats) => stats.defense.sacks }),
  Object.freeze({ key: "interceptions", value: (stats) => stats.defense.int }),
  Object.freeze({ key: "fieldGoalsMade", value: (stats) => stats.kicking.fgm })
]);

// Column labels for the stat tables' columns. The browser still carries its
// own copy in public/lib/appState.js (DISPLAY_LABELS, which also labels non-stat
// columns); test/stat-schema-contract.test.js holds the two equal until the
// client reads the active pack's labels directly.
const DISPLAY_LABELS = Object.freeze({
  ovr: "OVR", pot: "POT", pos: "Pos", tm: "Tm",
  yds: "Yds", td: "TD", tkl: "Tkl", rec: "Rec", tgt: "Tgt", ypr: "YPR",
  fgm: "FGM", fga: "FGA", xpm: "XPM", xpa: "XPA",
  age: "Age", g: "G", gs: "GS", cmpPct: "Cmp%", tdPct: "TD%", intPct: "Int%",
  firstDowns: "1D", ypg: "Y/G", apg: "A/G", recPg: "R/G", ypt: "Y/Tgt", av: "AV",
  pd: "PD", ff: "FF", fr: "FR", nya: "NY/A", anya: "ANY/A",
  rate: "Rate", ypa: "Y/A", catchPct: "Catch%", fgPct: "FG%", xpPct: "XP%",
  firstDownPct: "1D%", fmbRate: "Fum%", pressurePct: "Pressure%", penaltyPct: "Penalty%",
  tklPg: "Tkl/G", sackPg: "Sack/G", takeaways: "TA", in20Pct: "In20%", tbPct: "TB%",
  fgM40to49: "FGM 40–49", fgA40to49: "FGA 40–49",
  qbHits: "QB Hits", tfl: "TFL", brkTkl: "Brk Tkl", fmb: "Fum", lng: "Lng",
  offSn: "Off Sn", defSn: "Def Sn", stSn: "ST Sn",
  passBlkSn: "Pass Blk Sn", runBlkSn: "Run Blk Sn", sacksAllowed: "Sacks All",
  pressuresAllowed: "Pressures All", in20: "In 20", tb: "TB", blk: "Blk"
});

export const FOOTBALL_STAT_SCHEMA = Object.freeze({
  seasonCounters: SEASON_COUNTERS,
  counterGroups: COUNTER_GROUPS,
  zeroedSeasonStats,
  zeroedCareerStats: zeroedSeasonStats,
  rowBaseStats,
  categories: CATEGORIES,
  defaultSortKey: "yds",
  tieBreakKey: "td",
  // A career table asked for a category the schema does not know has always
  // fallen through to the snap-share row.
  careerFallbackCategory: "snaps",
  warehouse: WAREHOUSE,
  records: RECORDS,
  displayLabels: DISPLAY_LABELS
});
