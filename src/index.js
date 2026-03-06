import fs from "node:fs";
import path from "node:path";
import { GAME_NAME } from "./config.js";
import { runLeagueSimulation } from "./engine/leagueSimulator.js";
import { RNG } from "./utils/rng.js";
import { loadImportedPlayersFromPfrPath } from "./runtime/bootstrap.js";

function parseArgs(argv) {
  const currentYear = new Date().getFullYear();
  const args = {
    years: 100,
    seed: Date.now(),
    startYear: currentYear,
    mode: "drive",
    export: false,
    outDir: "output",
    pfr: null,
    realismProfile: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--years") args.years = Number(argv[i + 1]);
    if (arg === "--seed") args.seed = Number(argv[i + 1]);
    if (arg === "--startYear") args.startYear = Number(argv[i + 1]);
    if (arg === "--mode") args.mode = argv[i + 1];
    if (arg === "--export") args.export = true;
    if (arg === "--outDir") args.outDir = argv[i + 1];
    if (arg === "--pfr") args.pfr = argv[i + 1];
    if (arg === "--realismProfile") args.realismProfile = argv[i + 1];
  }

  args.years = Number.isFinite(args.years) && args.years > 0 ? Math.floor(args.years) : 100;
  args.seed = Number.isFinite(args.seed) ? Math.floor(args.seed) : Date.now();
  args.startYear = Number.isFinite(args.startYear) ? Math.floor(args.startYear) : currentYear;
  args.mode = args.mode === "play" ? "play" : "drive";
  return args;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function exportOutput(result, outDir) {
  const absolute = path.resolve(outDir);
  fs.mkdirSync(absolute, { recursive: true });

  writeJson(path.join(absolute, "league-summary.json"), {
    meta: result.meta,
    champions: result.champions,
    history: result.league.history
  });
  writeJson(path.join(absolute, "team-season-table.json"), result.teamSeasonTable);
  writeJson(path.join(absolute, "player-season-tables.json"), result.playerSeasonTables);
  writeJson(path.join(absolute, "player-career-tables.json"), result.playerCareerTables);
  writeJson(path.join(absolute, "records.json"), result.records);
  writeJson(path.join(absolute, "players-active.json"), result.league.players);
  writeJson(path.join(absolute, "players-retired.json"), result.league.retiredPlayers);
}

function printSummary(result) {
  const firstYear = result.meta.startYear;
  const lastYear = result.meta.endYear;
  const lastChampion = result.champions[result.champions.length - 1];
  console.log(`${GAME_NAME}`);
  console.log(`Simulated: ${result.meta.yearsSimulated} seasons (${firstYear}-${lastYear})`);
  console.log(`Active Players: ${result.meta.activePlayers} | Retired Players: ${result.meta.retiredPlayers}`);
  console.log(
    `Latest Champion (${lastChampion.year}): ${lastChampion.championTeamId} def ${lastChampion.runnerUpTeamId} (${lastChampion.score})`
  );
  console.log("Top Career Leaders:");
  console.log(
    `Passing Yards: ${result.records.passingYards[0]?.player || "N/A"} (${result.records.passingYards[0]?.value || 0})`
  );
  console.log(
    `Rushing Yards: ${result.records.rushingYards[0]?.player || "N/A"} (${result.records.rushingYards[0]?.value || 0})`
  );
  console.log(
    `Receiving Yards: ${result.records.receivingYards[0]?.player || "N/A"} (${result.records.receivingYards[0]?.value || 0})`
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rng = new RNG(args.seed);
  if (args.pfr && !fs.existsSync(path.resolve(args.pfr))) {
    console.warn(`PFR file not found at ${path.resolve(args.pfr)}. Falling back to generated rosters.`);
  }
  const importedPlayers = loadImportedPlayersFromPfrPath(args.pfr, rng, args.startYear);
  const result = runLeagueSimulation({
    years: args.years,
    startYear: args.startYear,
    rng,
    importedPlayers,
    mode: args.mode,
    realismProfilePath: args.realismProfile
  });
  printSummary(result);
  if (args.export) {
    exportOutput(result, args.outDir);
    console.log(`Export complete: ${path.resolve(args.outDir)}`);
  }
}

main();
