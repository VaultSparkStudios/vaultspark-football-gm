import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { buildWhatIfReplay } from "../src/engine/whatIfReplay.js";

function buildSessionWithLoss() {
  for (let seed = 2026; seed < 2100; seed += 1) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
    for (let week = 0; week < 10; week += 1) session.advanceWeek();
    const losses = session.getRecentBoxScores("BUF", 10).filter((game) => game.winnerId && game.winnerId !== "BUF");
    if (losses.length) return session;
  }
  throw new Error("Fixture could not find a BUF loss in seed range.");
}

test("what-if replay picks a controlled-team loss and never mutates live state", () => {
  const session = buildSessionWithLoss();
  const before = JSON.stringify(session.toSnapshot());
  const replay = session.getWhatIfReplay({ teamId: "BUF" });
  const after = JSON.stringify(session.toSnapshot());

  assert.equal(replay.available, true);
  assert.equal(replay.nonCanon, true);
  assert.match(replay.note, /No standings/);
  assert.equal(after, before);
  assert.notEqual(replay.original.teamScore, replay.replay.teamScore);
});

test("what-if replay is deterministic for the same archived games", () => {
  const session = buildSessionWithLoss();
  const games = session.getRecentBoxScores("BUF", 10);
  const args = {
    teamId: "BUF",
    games,
    getBoxScore: (gameId) => session.getBoxScore(gameId),
    seasonKey: "2026:BUF"
  };

  assert.deepEqual(buildWhatIfReplay(args), buildWhatIfReplay(args));
});
test("GameSession constructs the domain service bundle honestly", () => {
  const session = createSession({ seed: 91, startYear: 2026, controlledTeamId: "BUF" });
  assert.ok(session.services?.contracts);
  assert.ok(session.services?.scouting);
  assert.equal(session.services.contracts.league, session.league);
});