import { GameSession } from "../runtime/GameSession.js";

export function runLeagueSimulation({
  years = 100,
  startYear = 2026,
  rng,
  importedPlayers = [],
  mode = "drive",
  realismProfilePath = null
}) {
  const session = new GameSession({
    rng,
    startYear,
    mode,
    importedPlayers,
    realismProfilePath
  });

  for (let seasonOffset = 0; seasonOffset < years; seasonOffset += 1) {
    session.simulateOneSeason({
      runOffseasonAfter: seasonOffset < years - 1
    });
  }
  return session.exportState();
}
