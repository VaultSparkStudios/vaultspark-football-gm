// Read-only balance probe: how talent is spread across positions and clubs,
// and whether elite players pile up in one position room on one club.
//
// Uses the canonical session path (createSession + simulateSeasons). Prints
// JSON lines to stdout and writes nothing.
//
// Population: active-roster players on a club (practice squad excluded).
// "Stacked room": a club holding more players at or above the threshold than
// the position has starting jobs (STARTER_COUNTS).
//
//   node scripts/probe-position-balance.mjs [--seeds 117,2026] [--checkpoints 0,5,10]
import { createSession } from "../src/runtime/bootstrap.js";
import { splitActivePopulation } from "../src/stats/progressionParity.js";
import { STARTER_COUNTS } from "../src/domain/talentDistribution.js";

function argList(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  return String(process.argv[index + 1] || "").split(",").map(Number).filter(Number.isFinite);
}

const seeds = argList("--seeds", [117, 2026, 4040, 7411, 8354, 20260306]);
const checkpoints = argList("--checkpoints", [0, 5, 10, 20]).sort((a, b) => a - b);
const POSITIONS = Object.keys(STARTER_COUNTS);
const THRESHOLDS = [85, 90];

function quantile(sorted, q) {
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * q)] : null;
}

function measure(league) {
  const players = splitActivePopulation(league).activeRosterOnly;
  const teamIds = league.teams.map((team) => team.id);
  const out = {};
  for (const position of POSITIONS) {
    const room = players.filter((player) => player.position === position);
    const overalls = room.map((player) => player.overall).sort((a, b) => a - b);
    const byTeam = new Map(teamIds.map((id) => [id, []]));
    for (const player of room) byTeam.get(player.teamId)?.push(player.overall);
    const best = [...byTeam.values()].map((list) => (list.length ? Math.max(...list) : 0)).sort((a, b) => a - b);
    const row = {
      n: room.length,
      mean: Math.round((overalls.reduce((sum, value) => sum + value, 0) / Math.max(1, overalls.length)) * 10) / 10,
      p50: quantile(overalls, 0.5),
      p90: quantile(overalls, 0.9),
      max: overalls.at(-1) ?? null,
      // Spread of each club's best player at the position: are clubs different?
      clubBestMin: best[0],
      clubBestP50: quantile(best, 0.5),
      clubBestMax: best.at(-1)
    };
    for (const threshold of THRESHOLDS) {
      const counts = [...byTeam.values()].map((list) => list.filter((value) => value >= threshold).length);
      row[`n${threshold}`] = counts.reduce((sum, value) => sum + value, 0);
      row[`clubsWithNone${threshold}`] = counts.filter((value) => value === 0).length;
      row[`stackedClubs${threshold}`] = counts.filter((value) => value > STARTER_COUNTS[position]).length;
      row[`maxOnOneClub${threshold}`] = Math.max(0, ...counts);
    }
    out[position] = row;
  }
  return { activeRosterPlayers: players.length, positions: out };
}

for (const seed of seeds) {
  const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
  let simulated = 0;
  for (const checkpoint of checkpoints) {
    if (checkpoint > simulated) {
      session.simulateSeasons(checkpoint - simulated, { runOffseasonAfterLast: true });
      simulated = checkpoint;
    }
    console.log(JSON.stringify({ seed, seasons: checkpoint, ...measure(session.league) }));
  }
}
