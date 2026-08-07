import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectVisualGameCandidate,
  resolveVisualGameReceipt,
  VISUAL_GAME_RECEIPT_SCHEMA_VERSION
} from "../scripts/lib/visual-game-receipt.mjs";

const scoringBox = {
  playByPlay: [
    { description: "Run for 4 yards" },
    { description: "Touchdown pass to the corner" }
  ],
  scoringSummary: [{ description: "Touchdown pass to the corner" }]
};

test("visual-game candidate requires play-by-play and a Final Reel authority", () => {
  assert.equal(inspectVisualGameCandidate("g1", scoringBox).accepted, true);
  assert.equal(inspectVisualGameCandidate("g1", { playByPlay: [{ description: "Run" }] }).reason, "high-impact-play-missing");
  assert.equal(inspectVisualGameCandidate("g1", { playByPlay: [] }).reason, "play-by-play-missing");
});

test("visual-game resolver advances through a bye and publishes the accepted runtime trail", async () => {
  let call = 0;
  const applied = [];
  const receipt = await resolveVisualGameReceipt({
    advance: async () => {
      call += 1;
      return call === 1
        ? { dashboard: { currentYear: 2026, currentWeek: 2, phase: "regular", recentBoxScores: [] } }
        : { dashboard: { currentYear: 2026, currentWeek: 3, phase: "regular", recentBoxScores: [{ gameId: "g2" }] } };
    },
    loadBoxScore: async (gameId) => ({ boxScore: gameId === "g2" ? scoringBox : null }),
    applyDashboard: (dashboard) => applied.push(dashboard.currentWeek)
  });
  assert.equal(receipt.schemaVersion, VISUAL_GAME_RECEIPT_SCHEMA_VERSION);
  assert.equal(receipt.gameId, "g2");
  assert.equal(receipt.attempts.length, 2);
  assert.deepEqual(applied, [2, 3]);
  assert.equal(receipt.terminal.playCount, 2);
});

test("visual-game resolver fails with bounded diagnostic evidence", async () => {
  await assert.rejects(
    resolveVisualGameReceipt({
      maxAttempts: 2,
      advance: async () => ({ state: { currentYear: 2026, currentWeek: 1, phase: "preseason", recentBoxScores: [] } }),
      loadBoxScore: async () => ({ boxScore: null })
    }),
    (error) => {
      assert.equal(error.code, "VISUAL_GAME_RECEIPT_UNAVAILABLE");
      assert.equal(error.receipt.attempts.length, 2);
      return true;
    }
  );
});
