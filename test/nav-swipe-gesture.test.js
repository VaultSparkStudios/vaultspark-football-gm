import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// resolveNavSwipe is a pure function — import directly from the module source.
// The module has browser globals at the top level but resolveNavSwipe is defined
// before the DOM-dependent code; we read and eval just that function to keep
// the test dependency-free and runnable in Node without a DOM polyfill.
const src = fs.readFileSync(new URL("../public/lib/appCore.js", import.meta.url), "utf8");

// Extract just the exported resolveNavSwipe function body for isolated testing.
const match = src.match(/export function resolveNavSwipe[\s\S]*?^}/m);
if (!match) throw new Error("resolveNavSwipe not found in appCore.js — was it removed?");

// Wrap the extracted source so we can call it in Node.
// eslint-disable-next-line no-new-func
const resolveNavSwipe = new Function(`${match[0].replace("export ", "")}; return resolveNavSwipe;`)();

test("rightward swipe above threshold returns 1 (open)", () => {
  assert.equal(resolveNavSwipe({ x: 10, y: 100 }, { x: 80, y: 105 }), 1);
});

test("leftward swipe above threshold returns -1 (close)", () => {
  assert.equal(resolveNavSwipe({ x: 200, y: 100 }, { x: 130, y: 105 }), -1);
});

test("short swipe below threshold returns 0", () => {
  assert.equal(resolveNavSwipe({ x: 10, y: 100 }, { x: 50, y: 100 }), 0);
});

test("swipe with too much vertical drift returns 0", () => {
  // dx = 70, dy = 60 → dy/dx = 0.857 > offAxisRatio 0.7
  assert.equal(resolveNavSwipe({ x: 10, y: 100 }, { x: 80, y: 160 }), 0);
});

test("swipe with acceptable off-axis drift returns direction", () => {
  // dx = 70, dy = 40 → dy/dx = 0.571 < 0.7
  assert.equal(resolveNavSwipe({ x: 10, y: 100 }, { x: 80, y: 140 }), 1);
});

test("non-finite coordinates return 0", () => {
  assert.equal(resolveNavSwipe({ x: NaN, y: 100 }, { x: 80, y: 100 }), 0);
  assert.equal(resolveNavSwipe({ x: 10, y: Infinity }, { x: 80, y: 100 }), 0);
});

test("custom threshold is respected", () => {
  // dx = 30 — above default threshold of 56 would fail, but custom threshold of 20 passes
  assert.equal(resolveNavSwipe({ x: 10, y: 100 }, { x: 40, y: 102 }, { threshold: 20 }), 1);
  assert.equal(resolveNavSwipe({ x: 10, y: 100 }, { x: 40, y: 102 }), 0);
});

test("bindMobileNav attaches swipe gesture with touch/pen pointer filter", () => {
  assert.ok(
    src.includes('"touch", "pen"') || src.includes('"pen"].includes(event.pointerType)'),
    "touch/pen pointer filter must be present in bindMobileNav"
  );
  assert.ok(src.includes("pointerdown"), "pointerdown listener must be present");
  assert.ok(src.includes("pointerup"), "pointerup listener must be present");
  assert.ok(src.includes("pointercancel"), "pointercancel cleanup must be present");
  assert.ok(src.includes("EDGE_ZONE"), "edge-zone guard for open gesture must be present");
});

test("resolveNavSwipe is exported from appCore.js", () => {
  assert.ok(src.includes("export function resolveNavSwipe"), "resolveNavSwipe must be a named export");
});
