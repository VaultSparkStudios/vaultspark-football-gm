import fs from "node:fs";
import path from "node:path";
import { buildCareerProfileFromPfrRows, buildWeightedProfileFromPfrRows } from "../../stats/realismCalibrator.js";

function parseArgs(argv) {
  const args = { input: null, outDir: "output/pfr-etl", fromYear: 2019, toYear: 2025, halfLife: 2.2 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[i + 1];
    if (arg === "--outDir") args.outDir = argv[i + 1];
    if (arg === "--fromYear") args.fromYear = Number(argv[i + 1]);
    if (arg === "--toYear") args.toYear = Number(argv[i + 1]);
    if (arg === "--halfLife") args.halfLife = Number(argv[i + 1]);
  }
  return args;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const peek = line[i + 1];
      if (inQuotes && peek === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    return row;
  });
}

function loadRows(inputPath) {
  const absolute = path.resolve(inputPath);
  if (!fs.existsSync(absolute)) throw new Error(`Input not found: ${absolute}`);
  const text = fs.readFileSync(absolute, "utf8");
  if (absolute.toLowerCase().endsWith(".csv")) return parseCsv(text);
  if (absolute.toLowerCase().endsWith(".ndjson")) {
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
  return JSON.parse(text);
}

function num(row, ...keys) {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function str(row, ...keys) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function toSeasonRow(row) {
  return {
    season: num(row, "season", "year"),
    player_id: str(row, "player_id", "pfr_id", "id"),
    player: str(row, "player", "player_name", "name"),
    pos: str(row, "pos", "position"),
    team: str(row, "team", "tm"),
    age: num(row, "age"),
    games: num(row, "g", "games"),
    gs: num(row, "gs", "games_started"),
    pass_att: num(row, "pass_att", "passing_att", "att"),
    pass_cmp: num(row, "pass_cmp", "passing_cmp", "cmp"),
    pass_yds: num(row, "pass_yds", "passing_yds", "pass_yards"),
    pass_td: num(row, "pass_td", "passing_td"),
    pass_int: num(row, "pass_int", "passing_int"),
    sacks: num(row, "sacks", "pass_sacked"),
    rush_att: num(row, "rush_att", "rushing_att"),
    rush_yds: num(row, "rush_yds", "rushing_yds"),
    rush_td: num(row, "rush_td", "rushing_td"),
    targets: num(row, "targets", "tgt"),
    rec: num(row, "rec", "receptions"),
    rec_yds: num(row, "rec_yds", "receiving_yds"),
    rec_td: num(row, "rec_td", "receiving_td"),
    tackles: num(row, "tackles", "tkl"),
    pass_defended: num(row, "pass_defended", "pd"),
    def_int: num(row, "def_int", "interceptions"),
    fga: num(row, "fga", "fg_att"),
    fgm: num(row, "fgm", "fg_made"),
    xpa: num(row, "xpa", "xp_att"),
    xpm: num(row, "xpm", "xp_made"),
    punts: num(row, "punts", "punt_att"),
    punt_yds: num(row, "punt_yds", "punting_yds"),
    in20: num(row, "in20", "punts_in20")
  };
}

function buildPlayerImport(seasonRows) {
  const latestByPlayer = new Map();
  for (const row of seasonRows) {
    const id = row.player_id || `${row.player}-${row.pos}`;
    if (!latestByPlayer.has(id) || row.season > latestByPlayer.get(id).season) {
      latestByPlayer.set(id, row);
    }
  }
  return [...latestByPlayer.values()].map((row) => ({
    player_id: row.player_id,
    name: row.player,
    pos: row.pos,
    team: row.team,
    age: row.age,
    season: row.season,
    pass_yds: row.pass_yds,
    rush_yds: row.rush_yds,
    rec_yds: row.rec_yds,
    tackles: row.tackles,
    sacks: row.sacks,
    interceptions: row.def_int
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Missing --input. Provide JSON/CSV/NDJSON rows from your PFR scraping pipeline.");
    process.exit(1);
  }

  const rows = loadRows(args.input);
  if (!Array.isArray(rows) || !rows.length) {
    console.error("No rows found in input.");
    process.exit(1);
  }

  const seasonRows = rows.map(toSeasonRow).filter((row) => row.season > 0 && row.player);
  const playerImport = buildPlayerImport(seasonRows);
  const profile = buildWeightedProfileFromPfrRows(seasonRows, {
    fromYear: args.fromYear,
    toYear: args.toYear,
    halfLife: args.halfLife
  });
  const careerProfile = buildCareerProfileFromPfrRows(seasonRows, {
    fromYear: Math.max(1960, args.fromYear - 20),
    toYear: args.toYear,
    minCareerSeasons: 2
  });

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "season-rows.json"), `${JSON.stringify(seasonRows, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "player-import.json"), `${JSON.stringify(playerImport, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "realism-profile.json"), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "career-realism-profile.json"), `${JSON.stringify(careerProfile, null, 2)}\n`, "utf8");

  console.log(`PFR ETL complete: ${outDir}`);
  console.log(`Season rows: ${seasonRows.length}`);
  console.log(`Player import records: ${playerImport.length}`);
}

main();
