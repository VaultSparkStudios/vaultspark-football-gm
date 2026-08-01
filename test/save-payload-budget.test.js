import test from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../src/runtime/bootstrap.js";
import { createBrowserSaveStore } from "../src/adapters/persistence/browserSaveStore.js";

/**
 * Save-payload budget guard.
 *
 * Session 64 recorded this as an open blocker: a `mode:"play"` snapshot weighed
 * ~30.7 MB after six weeks, so a franchise could not finish a season inside a
 * browser storage quota. Session 65 fixed it in three layers, and this file is
 * now the guard that keeps it fixed rather than a characterization of a defect:
 *
 *   1. Stored week records keep only identity and scoreline fields — box scores
 *      live once, in `league.gameArchive` (src/runtime/weekResultProjection.js).
 *   2. The archive is bounded, and play-by-play is retained only for a recent
 *      window; the box-score modal says so when a drive log is not stored.
 *   3. Snapshots are gzip+base64 encoded on the way into storage, and rolling
 *      backups are bounded by bytes as well as count
 *      (src/adapters/persistence/snapshotCodec.js).
 *
 * The end-to-end number that matters is the last test: a full season of
 * realistic play, backing up every week, inside a 5 MB origin.
 */

const MB = 1024 * 1024;

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(String(k), String(v)); },
    removeItem(k) { data.delete(String(k)); },
    totalBytes() { return [...data.values()].reduce((sum, v) => sum + String(v).length, 0); }
  };
}

function sessionAfterWeeks(weeks) {
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF", mode: "play" });
  for (let index = 0; index < weeks; index += 1) {
    if (session.phase !== "regular-season") break;
    session.advanceWeek();
  }
  return session;
}

test("stored week records carry no box scores", () => {
  const session = sessionAfterWeeks(2);
  for (const week of session.league.weeklyHistory) {
    for (const game of week.games || []) {
      assert.equal(game.boxScore, undefined, "weeklyHistory must not retain box scores");
      assert.ok(game.gameId, "but must keep the id that resolves one from the archive");
    }
  }
  for (const week of session.weekResultsCurrentSeason) {
    for (const game of week.games || []) {
      assert.equal(game.boxScore, undefined, "weekResultsCurrentSeason must not retain box scores");
    }
  }
});

test("a retained week game is tiny, and its box score is still reachable", () => {
  const session = sessionAfterWeeks(1);
  const game = session.league.weeklyHistory[0]?.games?.[0];
  assert.ok(game);

  const bytes = JSON.stringify(game).length;
  assert.ok(bytes < 600, `a retained game grew to ${bytes} bytes (was ~84,000 before S65)`);
  assert.ok(session.getBoxScore(game.gameId), "the full box score must still resolve from gameArchive");
});

test("weekly history is pruned to the current season", () => {
  const session = sessionAfterWeeks(3);
  const years = new Set(session.league.weeklyHistory.map((entry) => entry.year));
  assert.ok(years.size <= 1, "weeklyHistory should only ever hold the active season");

  // Past seasons remain playable from league.history, which is what getSeasonWeeks reads.
  session.league.weeklyHistory.push({ year: session.currentYear - 5, week: 1, games: [] });
  session.startSeason(session.currentYear + 1);
  assert.ok(
    session.league.weeklyHistory.every((entry) => entry.year === session.currentYear),
    "starting a season must drop other seasons from weeklyHistory"
  );
});

test("the archive is bounded and only recent games keep a drive log", () => {
  const session = sessionAfterWeeks(6);
  const archive = session.league.gameArchive;
  assert.ok(archive.length > 0);
  assert.ok(archive.length <= 272, `archive grew to ${archive.length} entries`);

  const trimmed = archive.filter((entry) => entry.boxScore?.playByPlayTrimmed);
  for (const entry of trimmed) {
    assert.equal(entry.boxScore.playByPlay, undefined);
    // A trimmed entry is still a real box score — only the drive log is gone.
    assert.ok(entry.boxScore.playerStats, "trimmed entries keep their statistical box score");
  }
});

test("a six-week snapshot is far below its former weight", () => {
  const session = sessionAfterWeeks(6);
  const megabytes = JSON.stringify(session.toSnapshot()).length / MB;
  assert.ok(
    megabytes < 16,
    `raw snapshot is ${megabytes.toFixed(1)} MB (was 30.7 MB at S64); the payload reductions have regressed`
  );
});

test("a full season of realistic play fits a 5 MB browser origin", async () => {
  // The guarantee the whole effort exists for: play a season, back up every
  // week, keep a named save — and stay inside the smallest common quota.
  const storage = memoryStorage();
  const store = createBrowserSaveStore({ storage });
  const session = createSession({ seed: 99, startYear: 2026, controlledTeamId: "BUF", mode: "play" });

  let week = 0;
  while (session.phase === "regular-season") {
    session.advanceWeek();
    week += 1;
    await store.saveRollingBackup(session.toSnapshot(), {
      reason: "weekly", year: 2026, week, phase: "regular"
    });
  }
  await store.saveSessionToSlot("dynasty", session.toSnapshot());

  assert.ok(week >= 17, `expected a full season, played ${week} weeks`);
  const totalMb = storage.totalBytes() / MB;
  assert.ok(
    totalMb < 5,
    `a played season plus backups reached ${totalMb.toFixed(2)} MB, over a 5 MB origin budget`
  );

  // And the save must still load back into a working session.
  const loaded = await store.loadSessionFromSlot("dynasty");
  assert.equal(loaded.currentYear, session.currentYear);
  assert.equal(loaded.league.players.length, session.league.players.length);
});
