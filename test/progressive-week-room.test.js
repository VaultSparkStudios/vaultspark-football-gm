import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProgressiveWeekRoom } from "../public/lib/franchiseArchitecture.js";

test("Week Room makes Now primary and preserves compact Season and Legacy horizons", () => {
  const horizons = [
    { id: "now", title: "Choose the call" },
    { id: "season", title: "Keep the promise" },
    { id: "legacy", title: "Build the career" }
  ];
  const room = buildProgressiveWeekRoom({ horizons, signal: { sampleSize: 2 }, ledger: [{ id: "a" }] });
  assert.equal(room.primary.id, "now");
  assert.deepEqual(room.horizonChips.map((lane) => lane.id), ["season", "legacy"]);
  assert.equal(room.review.ledger.length, 1);
});

test("Week Room has an honest empty review and one native accessible disclosure", () => {
  const room = buildProgressiveWeekRoom();
  assert.equal(room.primary, null);
  assert.equal(room.review.signal.ready, false);
  assert.match(room.review.signal.disclaimer, /No result is inferred/);

  const overview = readFileSync(new URL("../public/lib/tabOverview.js", import.meta.url), "utf8");
  const game = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  assert.match(overview, /<details class="architecture-review">/);
  assert.match(overview, /This week's controlled call/);
  assert.match(overview, /Architecture Review/);
  assert.match(game, /The Week Room/);
});
