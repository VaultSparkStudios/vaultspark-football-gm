import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Architecture Review exposes accessible thesis controls and a declared API mutation", () => {
  const overview = fs.readFileSync("public/lib/tabOverview.js", "utf8");
  const app = fs.readFileSync("public/app.js", "utf8");
  const rehearsal = fs.readFileSync("public/game.html", "utf8");
  const styles = fs.readFileSync("public/styles.css", "utf8");
  assert.match(overview, /aria-label="Player-authored Architect thesis"/);
  assert.match(overview, /data-architect-save-focus/);
  assert.match(overview, /data-architect-adaptation/);
  assert.match(overview, /no hidden bonus/i);
  assert.match(app, /api\("\/api\/architect-thesis", \{ method: "POST", body \}\)/);
  assert.match(app, /applyDashboard\(response\.state\)/);
  assert.match(rehearsal, /id="architectRehearsalThesis"/);
  assert.match(styles, /\.architect-thesis-controls/);
  assert.match(styles, /\.architect-thesis-controls :focus-visible/);
});
