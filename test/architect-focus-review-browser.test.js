import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overview = readFileSync(new URL("../public/lib/tabOverview.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

test("Architecture Review renders declaration/current/delta and an exact action target", () => {
  assert.match(overview, /thesis\.review\?\.baseline/);
  assert.match(overview, /Declaration/);
  assert.match(overview, /Current/);
  assert.match(overview, /Evidence delta/);
  assert.match(overview, /data-blueprint-target-tab/);
  assert.match(overview, /No declaration baseline yet/);
});

test("Architect checkpoint cards collapse to one column on narrow screens", () => {
  assert.match(styles, /\.architect-focus-review-grid/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.architect-focus-review-grid\s*\{\s*grid-template-columns:\s*1fr/);
});
