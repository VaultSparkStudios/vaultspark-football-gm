import test from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../src/runtime/bootstrap.js";

/**
 * Save-payload budget guard.
 *
 * Records what the snapshot weighs and fails if that grows.
 *
 * Fix shipped (this session):
 *   toSnapshot() now strips boxScore from every game in weeklyHistory,
 *   weekResultsCurrentSeason, and history[].weekly before serialization.
 *   boxScores remain in league.gameArchive (capped at 800) for the historical
 *   box-score viewer. The in-memory session retains full boxScores for live
 *   features (tactical film room, press conference).
 *
 * Measured 2026-08-01, mode "play", after 6 regular-season weeks (post-fix):
 *   full snapshot (toSnapshot())              ~15 MB  (was ~30.7 MB)
 *   snapshot.league.weeklyHistory             ~0.2 MB (was ~7.9 MB)
 *   snapshot game entry (no boxScore)         ~2 KB   (was ~84 KB)
 *
 * Remaining cause still recorded on the task board:
 *   weekResultsCurrentSeason still duplicates the same game records that
 *   league.weeklyHistory holds — neither has boxScore after the fix, so the
 *   duplication is small. Resolving it requires more structural work.
 */

const MB = 1024 * 1024;
const KB = 1024;

// Ceilings sit above post-fix measurements with modest headroom for incidental
// churn. Tightening requires a re-measurement commit.
const SNAPSHOT_CEILING_MB = 20;
const WEEKLY_HISTORY_SNAPSHOT_CEILING_MB = 0.5;
const PER_GAME_SNAPSHOT_CEILING_KB = 10;

function sessionAfterWeeks(weeks) {
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  for (let index = 0; index < weeks; index += 1) {
    if (session.phase !== "regular-season") break;
    session.advanceWeek();
  }
  return session;
}

test("the six-week snapshot has not grown past its recorded ceiling", () => {
  const session = sessionAfterWeeks(6);
  const bytes = JSON.stringify(session.toSnapshot()).length;
  const megabytes = bytes / MB;

  assert.ok(
    megabytes <= SNAPSHOT_CEILING_MB,
    `snapshot grew to ${megabytes.toFixed(1)} MB (ceiling ${SNAPSHOT_CEILING_MB} MB). ` +
    "Saves must fit in a browser localStorage budget."
  );
});

test("weeklyHistory in the snapshot has not grown past its recorded ceiling", () => {
  const session = sessionAfterWeeks(6);
  const snap = session.toSnapshot();
  const megabytes = JSON.stringify(snap.league.weeklyHistory).length / MB;
  assert.ok(
    megabytes <= WEEKLY_HISTORY_SNAPSHOT_CEILING_MB,
    `snapshot weeklyHistory grew to ${megabytes.toFixed(2)} MB (ceiling ${WEEKLY_HISTORY_SNAPSHOT_CEILING_MB} MB). ` +
    "boxScore must be stripped from week history before saving."
  );
});

test("a single game entry in the snapshot has no boxScore and fits the lean ceiling", () => {
  const session = sessionAfterWeeks(1);
  const snap = session.toSnapshot();
  const game = snap.league.weeklyHistory[0]?.games?.[0];
  assert.ok(game, "a played week must retain its games in the snapshot");
  assert.ok(!game.boxScore, "game.boxScore must be absent from snapshot weeklyHistory — it lives in gameArchive");
  assert.ok(game.gameId, "gameId must be present");
  assert.ok(typeof game.homeScore === "number", "homeScore must be present");
  const kilobytes = JSON.stringify(game).length / KB;
  assert.ok(
    kilobytes <= PER_GAME_SNAPSHOT_CEILING_KB,
    `a snapshot game entry grew to ${kilobytes.toFixed(1)} KB (ceiling ${PER_GAME_SNAPSHOT_CEILING_KB} KB)`
  );
});

test("gameArchive retains boxScore for the historical box-score viewer", () => {
  const session = sessionAfterWeeks(1);
  const snap = session.toSnapshot();
  const game = snap.league.weeklyHistory[0]?.games?.[0];
  assert.ok(game, "a played week must exist");
  const archived = (snap.league.gameArchive || []).find((entry) => entry.gameId === game.gameId);
  assert.ok(archived, "the game must appear in gameArchive");
  assert.ok(archived.boxScore, "gameArchive entry must retain boxScore for the box-score viewer");
});

test("in-memory weeklyHistory retains boxScore for live features", () => {
  // The session's live weeklyHistory keeps full boxScores so the tactical film
  // room, press conference, and other in-session features can read them without
  // a gameArchive lookup. Only toSnapshot() strips them before serialization.
  const session = sessionAfterWeeks(1);
  const game = session.league.weeklyHistory[0]?.games?.[0];
  assert.ok(game, "a played week must exist in memory");
  assert.ok(game.boxScore, "in-memory game.boxScore must be present for live features");
});

test("game records are still stored in both weeklyHistory and weekResultsCurrentSeason", () => {
  // Documents the remaining duplication. Without boxScore the overhead is small;
  // eliminating it requires structural work deferred to a dedicated session.
  const session = sessionAfterWeeks(2);
  const snapshot = session.toSnapshot();

  const inHistory = (JSON.stringify(snapshot.league.weeklyHistory).match(/"gameId"/g) || []).length;
  const inCurrentSeason = (JSON.stringify(snapshot.weekResultsCurrentSeason).match(/"gameId"/g) || []).length;

  assert.ok(inHistory > 0 && inCurrentSeason > 0, "both fields must have game records");
  assert.equal(
    inCurrentSeason,
    inHistory,
    "weekResultsCurrentSeason and league.weeklyHistory hold the same current-season games"
  );
});
