import test from "node:test";
import assert from "node:assert/strict";
import { GameSession, scoutedPlayerPotential } from "../src/runtime/GameSession.js";
import { RNG } from "../src/utils/rng.js";

const session = () => new GameSession({ rng: new RNG(7113), startYear: 2026, controlledTeamId: "BUF" });

test("potential is exact for your players and a bounded, stable read for everyone else", () => {
  const game = session();
  const own = game.getRoster("BUF");
  const truthById = new Map(game.league.players.map((player) => [player.id, player]));
  for (const row of own) assert.equal(row.potential, truthById.get(row.id).potential, "your own roster is never fogged");
  const rival = game.getRoster("MIA");
  let differs = 0;
  for (const row of rival) {
    const truth = truthById.get(row.id);
    const band = truth.age <= 23 ? 6 : truth.age <= 26 ? 4 : truth.age <= 29 ? 2 : 0;
    assert.ok(Math.abs(row.potential - truth.potential) <= band, `${truth.name} stays inside the ±${band} band`);
    if (row.potential !== truth.potential) differs += 1;
  }
  assert.ok(differs > 0, "a rival roster is genuinely uncertain");
  assert.deepEqual(game.getRoster("MIA"), rival, "the same read every time within a year");
});

test("every carrier shows the same read — roster, free agents, search, profile and stat tables", () => {
  const game = session();
  const young = game.league.players.find((player) => player.teamId !== "BUF" && player.status === "active" && player.age <= 23 && scoutedPlayerPotential(player, game.currentYear) !== player.potential);
  assert.ok(young, "fixture: a young rival with a fogged read");
  const read = scoutedPlayerPotential(young, game.currentYear);
  assert.equal(game.getRoster(young.teamId).find((row) => row.id === young.id).potential, read);
  assert.equal(game.getPlayerProfile(young.id).player?.potential ?? game.getPlayerProfile(young.id).potential, read);
  const hit = game.searchPlayers({ query: young.name, limit: 50 }).find((row) => (row.id ?? row.playerId) === young.id);
  if (hit && "potential" in hit) assert.equal(hit.potential, read);
  const freeAgent = game.league.players.find((player) => player.status === "free-agent" && player.age <= 26);
  if (freeAgent) {
    const row = game.getFreeAgents({ limit: 500 }).find((entry) => entry.id === freeAgent.id);
    if (row) assert.equal(row.potential, scoutedPlayerPotential(freeAgent, game.currentYear));
  }
});

test("the fog never moves the simulation", () => {
  const a = session();
  const b = session();
  a.getRoster("MIA");
  a.getFreeAgents({ limit: 100 });
  a.advanceWeek();
  b.advanceWeek();
  assert.deepEqual(a.getDashboardState().latestStandings, b.getDashboardState().latestStandings);
});

test("a restored session keeps the scouting lens on stat tables (review regression)", () => {
  const game = session();
  game.advanceWeek();
  const restored = GameSession.fromSnapshot(JSON.parse(JSON.stringify(game.toSnapshot())), (seed) => new RNG(seed));
  const rows = restored.statBook.getPlayerSeasonTable("passing", { year: restored.currentYear });
  const truthById = new Map(restored.league.players.map((player) => [player.id, player]));
  const rival = rows.find((row) => {
    const truth = truthById.get(row.playerId);
    return truth && truth.teamId !== "BUF" && scoutedPlayerPotential(truth, restored.currentYear) !== truth.potential;
  });
  assert.ok(rival, "fixture: a fogged rival passer exists after one week (20 do for seed 7113)");
  assert.equal(rival.pot, scoutedPlayerPotential(truthById.get(rival.playerId), restored.currentYear));
});
