import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { resolveSimWatchSwipe } from "../public/lib/simWatchDirector.js";

test("Sim-Watch swipe transport maps horizontal touch intent to the existing director", () => {
  assert.equal(resolveSimWatchSwipe({ x: 180, y: 80 }, { x: 90, y: 88 }), 1, "left advances");
  assert.equal(resolveSimWatchSwipe({ x: 80, y: 80 }, { x: 150, y: 75 }), -1, "right rewinds");
});

test("Sim-Watch swipe transport preserves vertical scrolling and ignores short gestures", () => {
  assert.equal(resolveSimWatchSwipe({ x: 100, y: 100 }, { x: 130, y: 102 }), 0);
  assert.equal(resolveSimWatchSwipe({ x: 100, y: 100 }, { x: 180, y: 190 }), 0);
  assert.equal(resolveSimWatchSwipe({}, {}), 0);
});

test("the box-score ticker has one reachable Sim-Watch launch path", () => {
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.equal((app.match(/getElementById\("boxScoreTicker"\).*addEventListener/g) || []).length, 1);
  assert.match(app, /await loadBoxScore\(gameId\);\s+await runSimWatch\(gameId\);/);
  assert.match(styles, /#simWatchOverlay \{[\s\S]*?z-index: 1100;/);
  assert.match(styles, /max-height: calc\(100dvh - 16px\)/);
});
