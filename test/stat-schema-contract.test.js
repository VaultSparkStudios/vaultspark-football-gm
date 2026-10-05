import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOOTBALL_STAT_SCHEMA } from "../src/sport/football/statSchema.js";
import { getSportRules } from "../src/sport/registry.js";
import { createZeroedCareerStats, createZeroedSeasonStats } from "../src/domain/playerFactory.js";
import { StatBook } from "../src/stats/statBook.js";
import { DISPLAY_LABELS } from "../public/lib/appState.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// createZeroedSeasonStats() exactly as playerFactory.js built it before the
// stat schema existed (S116, Phase 1 step 3). Key order is part of the shape.
const PRE_SCHEMA_ZEROED_SEASON_STATS = {
  games: 0,
  gamesStarted: 0,
  snaps: { offense: 0, defense: 0, special: 0, passBlock: 0, runBlock: 0 },
  passing: { cmp: 0, att: 0, yards: 0, td: 0, int: 0, sacks: 0, sackYards: 0, firstDowns: 0, long: 0 },
  rushing: { att: 0, yards: 0, td: 0, long: 0, fumbles: 0, firstDowns: 0, brokenTackles: 0 },
  receiving: { targets: 0, rec: 0, yards: 0, td: 0, long: 0, drops: 0, firstDowns: 0, yac: 0 },
  defense: { tackles: 0, solo: 0, ast: 0, sacks: 0, qbHits: 0, tfl: 0, int: 0, passDefended: 0, ff: 0, fr: 0 },
  blocking: { sacksAllowed: 0, pressuresAllowed: 0, penalties: 0 },
  kicking: { fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0, fgM40: 0, fgA40: 0, fgM50: 0, fgA50: 0 },
  punting: { punts: 0, yards: 0, in20: 0, long: 0, touchbacks: 0, blocks: 0 }
};

// deepEqual ignores key order; JSON.stringify does not.
const sameShapeAndOrder = (actual, expected) => {
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
};

test("the football pack carries the stat schema", () => {
  assert.equal(getSportRules("football").stats, FOOTBALL_STAT_SCHEMA);
  assert.equal(getSportRules().stats, FOOTBALL_STAT_SCHEMA);
});

test("the schema's zeroed shape is the pre-schema createZeroedSeasonStats() output, key order included", () => {
  sameShapeAndOrder(FOOTBALL_STAT_SCHEMA.zeroedSeasonStats(), PRE_SCHEMA_ZEROED_SEASON_STATS);
  sameShapeAndOrder(FOOTBALL_STAT_SCHEMA.zeroedCareerStats(), PRE_SCHEMA_ZEROED_SEASON_STATS);
  sameShapeAndOrder(createZeroedSeasonStats(), PRE_SCHEMA_ZEROED_SEASON_STATS);
  sameShapeAndOrder(createZeroedCareerStats(), PRE_SCHEMA_ZEROED_SEASON_STATS);
  const a = createZeroedSeasonStats();
  const b = createZeroedSeasonStats();
  a.passing.att = 9;
  assert.equal(b.passing.att, 0, "each call returns a fresh object");
});

test("every category the code asks a table for is declared, with its counters in the shape", () => {
  const asked = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) {
        const source = fs.readFileSync(full, "utf8");
        for (const match of source.matchAll(/getPlayer(?:Season|Career)Table\(\s*"(\w+)"/g)) asked.add(match[1]);
      }
    }
  };
  walk(path.join(ROOT, "src"));
  const session = fs.readFileSync(path.join(ROOT, "src", "runtime", "GameSession.js"), "utf8");
  const tableCategories = session.match(/const TABLE_CATEGORIES = \[([^\]]*)\]/);
  assert.ok(tableCategories, "GameSession declares TABLE_CATEGORIES");
  for (const match of tableCategories[1].matchAll(/"(\w+)"/g)) asked.add(match[1]);
  for (const { category } of FOOTBALL_STAT_SCHEMA.warehouse.leaderboards) asked.add(category);
  assert.ok(asked.size >= 8, `found the table call sites (${[...asked].join(", ")})`);

  const zeroed = FOOTBALL_STAT_SCHEMA.zeroedSeasonStats();
  for (const category of asked) {
    const definition = FOOTBALL_STAT_SCHEMA.categories[category];
    assert.ok(definition, `category "${category}" is declared in the football stat schema`);
    assert.equal(typeof definition.hasVolume, "function", `${category}.hasVolume`);
    assert.equal(typeof definition.seasonRow, "function", `${category}.seasonRow`);
    assert.equal(typeof definition.careerRow, "function", `${category}.careerRow`);
    assert.ok(zeroed[definition.counters] && typeof zeroed[definition.counters] === "object", `${category} reads a declared counter group`);
  }
  assert.ok(FOOTBALL_STAT_SCHEMA.categories[FOOTBALL_STAT_SCHEMA.careerFallbackCategory]);
});

test("the schema's derived rates keep their formulas and rounding", () => {
  const stats = FOOTBALL_STAT_SCHEMA.zeroedSeasonStats();
  Object.assign(stats, { games: 16 });
  Object.assign(stats.passing, { cmp: 300, att: 450, yards: 3500, td: 25, int: 10, sacks: 30, sackYards: 200, long: 70, firstDowns: 170 });
  const row = FOOTBALL_STAT_SCHEMA.categories.passing.seasonRow(stats);
  assert.equal(row.cmpPct, 66.7);
  assert.equal(row.ypa, 7.8);
  assert.equal(row.nya, 6.88);
  assert.equal(row.anya, 6.98);
  // Each term clamps after scaling, as in the NFL formula: 99.3 for this line.
  assert.equal(row.rate, 99.3);
  // Season and career rushing rows hold the same values; only column order differs.
  Object.assign(stats.rushing, { att: 40, yards: 180, td: 2, long: 22, fumbles: 1, firstDowns: 9 });
  const seasonRush = FOOTBALL_STAT_SCHEMA.categories.rushing.seasonRow(stats);
  const careerRush = FOOTBALL_STAT_SCHEMA.categories.rushing.careerRow(stats);
  assert.deepEqual(seasonRush, careerRush);
  assert.notEqual(Object.keys(seasonRush).join(), Object.keys(careerRush).join());
});

test("the schema's stat labels match the labels the browser shows", () => {
  for (const [key, label] of Object.entries(FOOTBALL_STAT_SCHEMA.displayLabels)) {
    assert.equal(DISPLAY_LABELS[key], label, `label for "${key}"`);
  }
});

// A sport the StatBook has never heard of: one category, its own shape.
const TOY_SCHEMA = Object.freeze({
  zeroedSeasonStats: () => ({ games: 0, gamesStarted: 0, scoring: { goals: 0, assists: 0, shots: 0 } }),
  zeroedCareerStats: () => ({ games: 0, gamesStarted: 0, scoring: { goals: 0, assists: 0, shots: 0 } }),
  rowBaseStats: () => ({}),
  categories: Object.freeze({
    scoring: Object.freeze({
      counters: "scoring",
      hasVolume: (stats) => (stats.scoring?.shots || 0) > 0,
      seasonRow: (stats) => ({
        goals: stats.scoring.goals,
        assists: stats.scoring.assists,
        points: stats.scoring.goals + stats.scoring.assists,
        shootingPct: stats.scoring.shots ? Number(((stats.scoring.goals / stats.scoring.shots) * 100).toFixed(1)) : 0
      }),
      careerRow: (stats) => ({ goals: stats.scoring.goals, points: stats.scoring.goals + stats.scoring.assists }),
      sortKey: "points"
    })
  }),
  defaultSortKey: "points",
  tieBreakKey: "goals",
  careerFallbackCategory: null,
  warehouse: Object.freeze({
    leaderboards: Object.freeze([Object.freeze({ key: "topScoring", category: "scoring" })]),
    leagueAverages: ({ tables }) => ({ goalsPerPlayer: tables.scoring.length ? tables.scoring.reduce((s, r) => s + r.goals, 0) / tables.scoring.length : 0 })
  }),
  records: Object.freeze([Object.freeze({ key: "careerGoals", value: (stats) => stats.scoring.goals })]),
  displayLabels: Object.freeze({ goals: "G", assists: "A", points: "Pts" })
});

test("a toy one-category schema drives StatBook tables without touching statBook.js", () => {
  const players = [
    { id: "p1", name: "Ada", age: 25, overall: 70, potential: 80, position: "F", teamId: "AAA", status: "active", seasonStats: {}, careerStats: TOY_SCHEMA.zeroedCareerStats(), seasonsPlayed: 1 },
    { id: "p2", name: "Bo", age: 29, overall: 74, potential: 74, position: "D", teamId: "BBB", status: "active", seasonStats: {}, careerStats: TOY_SCHEMA.zeroedCareerStats(), seasonsPlayed: 1 },
    { id: "p3", name: "Cy", age: 31, overall: 60, potential: 60, position: "G", teamId: "BBB", status: "active", seasonStats: {}, careerStats: TOY_SCHEMA.zeroedCareerStats(), seasonsPlayed: 1 }
  ];
  const league = {
    sportId: "toy-hockey", // not registered: only the injected schema can serve it
    players,
    retiredPlayers: [],
    teams: [
      { id: "AAA", name: "Alphas", conference: "East", division: "North", season: { year: 2030, wins: 1, losses: 0, ties: 0, pointsFor: 4, pointsAgainst: 2, yardsFor: 0, yardsAgainst: 0, turnovers: 0 } },
      { id: "BBB", name: "Betas", conference: "East", division: "North", season: { year: 2030, wins: 0, losses: 1, ties: 0, pointsFor: 2, pointsAgainst: 4, yardsFor: 0, yardsAgainst: 0, turnovers: 0 } }
    ],
    awards: []
  };
  const book = new StatBook(league, { statSchema: TOY_SCHEMA });
  assert.equal(book.statSchema, TOY_SCHEMA);
  for (const [id, teamId, delta] of [
    ["p1", "AAA", { scoring: { goals: 3, assists: 1, shots: 10 } }],
    ["p2", "BBB", { scoring: { goals: 1, assists: 4, shots: 6 } }],
    ["p3", "BBB", { scoring: { goals: 0, assists: 0, shots: 0 } }]
  ]) {
    book.registerGameAppearance(id, 2030, true, teamId, null, "regular");
    book.applyStatDelta(id, 2030, delta, { teamId, seasonType: "regular" });
  }

  // Buckets and splits come from the toy shape, not football's.
  assert.deepEqual(Object.keys(players[0].seasonStats[2030]).filter((k) => k !== "meta" && k !== "splits"), ["games", "gamesStarted", "scoring"]);
  assert.deepEqual(players[0].seasonStats[2030].splits.playoffs, TOY_SCHEMA.zeroedSeasonStats());

  const season = book.getPlayerSeasonTable("scoring", { year: 2030 });
  assert.deepEqual(season.map((row) => row.playerId), ["p2", "p1"], "volume filter drops the shotless player; sorted by the schema's sortKey");
  assert.deepEqual(
    Object.keys(season[0]),
    ["year", "playerId", "player", "age", "ovr", "pot", "pos", "tm", "seasonType", "g", "gs", "goals", "assists", "points", "shootingPct", "av"]
  );
  assert.equal(season[1].shootingPct, 30);
  assert.equal(season[0].points, 5);

  const career = book.getPlayerCareerTable("scoring", {});
  assert.deepEqual(career.map((row) => [row.playerId, row.points]), [["p2", 5], ["p1", 4]]);
  assert.ok(!("assists" in career[0]), "career rows use the schema's careerRow");

  assert.deepEqual(book.getPlayerSeasonTable("passing", { year: 2030 }), [], "a football category means nothing to this sport");

  book.archiveTeamSeason(2030);
  const warehouse = book.getWarehouseSnapshot({ year: 2030 });
  assert.deepEqual(Object.keys(warehouse), ["year", "generatedAt", "topScoring", "teamSummary", "leagueAverages"]);
  assert.equal(warehouse.leagueAverages.goalsPerPlayer, 2);
  assert.deepEqual(book.getWarehouseSnapshot({ year: 2030, teamId: "BBB" }).topScoring.map((row) => row.playerId), ["p2"]);

  const records = book.getRecords();
  assert.deepEqual(Object.keys(records), ["careerGoals", "approximateValue"]);
  assert.deepEqual(records.careerGoals.map((row) => row.playerId), ["p1", "p2"]);
});

test("statBook.js names no football stat category", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "stats", "statBook.js"), "utf8");
  for (const category of Object.keys(FOOTBALL_STAT_SCHEMA.categories)) {
    assert.doesNotMatch(source, new RegExp(`"${category}"`), `statBook.js should not branch on "${category}"`);
  }
  assert.doesNotMatch(source, /passerRating|createZeroedSeasonStats/);
});
