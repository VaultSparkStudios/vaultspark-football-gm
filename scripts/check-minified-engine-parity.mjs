#!/usr/bin/env node
// The shipped engine is minified. The browser suite runs the authored source,
// so nothing else would notice if minification changed a simulated result.
// This runs the same seeded league through the authored engine (src/) and the
// shipped engine (static/src/) and requires identical outcomes.
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEngine(base) {
  const at = (relative) => pathToFileURL(path.join(rootDir, base, relative)).href;
  const [{ GameSession }, { RNG }, { RNGStreams }] = await Promise.all([
    import(at("runtime/GameSession.js")),
    import(at("utils/rng.js")),
    import(at("utils/rngStreams.js"))
  ]);
  return { GameSession, RNG, RNGStreams };
}

function simulate({ GameSession, RNG, RNGStreams }, { seed, weeks }) {
  const session = new GameSession({
    rng: new RNG(seed),
    rngStreams: new RNGStreams(seed, RNG),
    startYear: 2026,
    mode: "drive",
    importedPlayers: [],
    controlledTeamId: "BUF"
  });
  for (let week = 0; week < weeks; week += 1) session.advanceWeek();
  const teams = session.league.teams
    .map((team) => [team.id, team.season?.wins, team.season?.losses, team.season?.pointsFor, team.season?.pointsAgainst])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const players = session.league.players
    .map((player) => [player.id, player.teamId || "", player.overall, player.age, player.injury?.weeksRemaining ?? ""])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const digest = createHash("sha256").update(JSON.stringify({ phase: session.phase, week: session.currentWeek, teams, players })).digest("hex");
  return { digest, phase: session.phase, week: session.currentWeek, games: teams.reduce((sum, team) => sum + (team[1] || 0), 0) };
}

export async function checkMinifiedEngineParity({ seed = 132, weeks = 16 } = {}) {
  const authored = simulate(await loadEngine("src"), { seed, weeks });
  const shipped = simulate(await loadEngine(path.join("static", "src")), { seed, weeks });
  return { ok: authored.digest === shipped.digest && authored.games > 0, authored, shipped };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const result = await checkMinifiedEngineParity();
  if (!result.ok) {
    console.error(`Shipped engine diverges from authored engine: ${JSON.stringify(result)}`);
    process.exitCode = 1;
  } else {
    console.log(`Minified engine parity: ${result.authored.games} wins simulated through ${result.authored.phase} week ${result.authored.week}; digests match.`);
  }
}
