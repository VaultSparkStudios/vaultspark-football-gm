/**
 * build-showcase-league.mjs — the decade the Community Stats page shows while
 * the cohort forms (S109).
 *
 * Runs the engine for ten seasons from one fixed seed and writes
 * public/showcase-league.json: a handful of labelled cards derived from the
 * result. It is committed rather than built on every deploy because a
 * ten-season run costs minutes on a loaded machine; regenerate it when the
 * engine changes what a decade produces.
 *
 * Usage: node scripts/build-showcase-league.mjs [--seed 20260306] [--years 10]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLeagueSimulation } from "../src/engine/leagueSimulator.js";
import { RNG } from "../src/utils/rng.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(rootDir, "public", "showcase-league.json");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

function teamLabel(league, teamId) {
  const team = (league?.teams || []).find((entry) => entry.id === teamId);
  if (!team) return String(teamId);
  // Generated identities carry the city inside the name ("Fresno Mustangs").
  const name = String(team.name || "");
  const city = String(team.city || "");
  if (!city || name.startsWith(city)) return name || String(teamId);
  return `${city} ${name}`;
}

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function summarizeShowcase(result, { seed, years }) {
  const league = result.league || {};
  const champions = Array.isArray(result.champions) ? result.champions : [];
  const titles = new Map();
  for (const entry of champions) titles.set(entry.championTeamId, (titles.get(entry.championTeamId) || 0) + 1);
  const [dynastyId, dynastyTitles] = [...titles.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const distinctChampions = titles.size;
  const last = champions[champions.length - 1];
  const records = result.records || {};
  const leader = (key) => records[key]?.[0] || null;
  const passing = leader("passingYards");
  const rushing = leader("rushingYards");
  const receiving = leader("receivingYards");
  const cards = [
    dynastyId && {
      id: "dynasty",
      label: "Most titles",
      value: `${dynastyTitles} in ${years}`,
      detail: `${teamLabel(league, dynastyId)} won ${dynastyTitles} championship${dynastyTitles === 1 ? "" : "s"} across the decade.`
    },
    {
      id: "champions",
      label: "Different champions",
      value: String(distinctChampions),
      detail: `${distinctChampions} of 32 clubs lifted the trophy at least once in ${years} seasons.`
    },
    last && {
      id: "latest-title",
      label: "Final season's title game",
      value: String(last.score || "—"),
      detail: `${teamLabel(league, last.championTeamId)} over ${teamLabel(league, last.runnerUpTeamId)} in ${last.year}.`
    },
    passing && {
      id: "passing",
      label: "Career passing yards leader",
      value: fmt(passing.value),
      detail: `${passing.player}, over the decade.`
    },
    rushing && {
      id: "rushing",
      label: "Career rushing yards leader",
      value: fmt(rushing.value),
      detail: `${rushing.player}, over the decade.`
    },
    receiving && {
      id: "receiving",
      label: "Career receiving yards leader",
      value: fmt(receiving.value),
      detail: `${receiving.player}, over the decade.`
    },
    {
      id: "retired",
      label: "Careers ended",
      value: fmt(result.meta?.retiredPlayers),
      detail: `${fmt(result.meta?.retiredPlayers)} players retired while ${fmt(result.meta?.activePlayers)} were still on a roster at the end.`
    }
  ].filter(Boolean);
  return {
    schemaVersion: "1.0",
    kind: "simulation",
    seed,
    seasons: years,
    startYear: result.meta?.startYear,
    endYear: result.meta?.endYear,
    generatedAt: new Date().toISOString().slice(0, 10),
    cards
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1]).replace(/\\/g, "/")}`).href;
if (isMain) {
  const seed = arg("--seed", 20260306);
  const years = arg("--years", 10);
  const startYear = arg("--start", 2026);
  const started = Date.now();
  const result = runLeagueSimulation({ years, startYear, rng: new RNG(seed), importedPlayers: null, mode: "drive" });
  const showcase = summarizeShowcase(result, { seed, years });
  fs.writeFileSync(outFile, `${JSON.stringify(showcase, null, 2)}\n`, "utf8");
  console.log(`showcase league written: ${path.relative(rootDir, outFile)} · ${showcase.cards.length} cards · ${Math.round((Date.now() - started) / 1000)}s`);
}
