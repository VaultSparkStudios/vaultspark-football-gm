import test from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../src/runtime/bootstrap.js";

/**
 * Save-payload budget guard.
 *
 * This is a *characterization* test, not a passing grade. It records what the
 * snapshot actually weighs today and fails if that grows, because the current
 * numbers are already a live production problem for a zero-backend browser game:
 *
 *   measured 2026-08-01, mode "play", after 6 regular-season weeks
 *     full snapshot                     ~30.7 MB
 *     league.weeklyHistory               ~7.9 MB  (~24 MB projected over 18 weeks)
 *     per archived game                  ~84 KB, of which boxScore is ~98%
 *
 * A typical localStorage origin budget is 5–10 MB, so a franchise cannot finish
 * one season inside it. The symptom is already visible in test output as
 * "Auto-backup skipped: Browser storage is full".
 *
 * Two structural causes, both recorded on the task board rather than changed
 * here — reshaping persistence needs its own session with save-migration care:
 *   1. `boxScore` (including full play-by-play) is retained for every game in
 *      `league.weeklyHistory` for the whole season.
 *   2. `weekResultsCurrentSeason` holds a second copy of the same current-season
 *      games that `league.weeklyHistory` already has.
 *
 * The ceilings below sit just above today's measurements. They exist so the
 * problem cannot quietly get worse, and so the eventual fix has a number to beat.
 */

const MB = 1024 * 1024;

// Ceilings are deliberately close to measured values — headroom is for
// incidental churn, not for new payload.
const SNAPSHOT_CEILING_MB = 34;
const WEEKLY_HISTORY_CEILING_MB = 9;
const PER_GAME_CEILING_KB = 95;

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
    "Saves are already over a browser localStorage budget; do not add payload here."
  );
});

test("weekly history has not grown past its recorded ceiling", () => {
  const session = sessionAfterWeeks(6);
  const megabytes = JSON.stringify(session.league.weeklyHistory).length / MB;
  assert.ok(
    megabytes <= WEEKLY_HISTORY_CEILING_MB,
    `weeklyHistory grew to ${megabytes.toFixed(1)} MB (ceiling ${WEEKLY_HISTORY_CEILING_MB} MB)`
  );
});

test("a single retained game has not grown past its recorded ceiling", () => {
  const session = sessionAfterWeeks(1);
  const game = session.league.weeklyHistory[0]?.games?.[0];
  assert.ok(game, "a played week must retain its games");
  const kilobytes = JSON.stringify(game).length / 1024;
  assert.ok(
    kilobytes <= PER_GAME_CEILING_KB,
    `a retained game grew to ${kilobytes.toFixed(1)} KB (ceiling ${PER_GAME_CEILING_KB} KB)`
  );
});

test("the box score is named as the dominant cost, so the fix targets the right thing", () => {
  const session = sessionAfterWeeks(1);
  const game = session.league.weeklyHistory[0].games[0];
  const total = JSON.stringify(game).length;
  const boxScore = JSON.stringify(game.boxScore).length;

  assert.ok(
    boxScore / total > 0.9,
    `boxScore is ${((boxScore / total) * 100).toFixed(1)}% of a retained game; ` +
    "if this drops, the persistence shape changed and the recorded finding needs re-measuring."
  );
});

test("current-season games are still duplicated across two persisted fields", () => {
  // Documents cause (2) above. When the duplication is removed this test should
  // be updated to assert the opposite — it is here so the redundancy cannot be
  // forgotten, not to bless it.
  const session = sessionAfterWeeks(2);
  const snapshot = session.toSnapshot();

  const inHistory = (JSON.stringify(snapshot.league.weeklyHistory).match(/"gameId"/g) || []).length;
  const inCurrentSeason = (JSON.stringify(snapshot.weekResultsCurrentSeason).match(/"gameId"/g) || []).length;

  assert.ok(inHistory > 0 && inCurrentSeason > 0);
  assert.equal(
    inCurrentSeason,
    inHistory,
    "weekResultsCurrentSeason and league.weeklyHistory hold the same current-season games"
  );
});
