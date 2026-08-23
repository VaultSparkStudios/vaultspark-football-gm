import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { inspectReleaseNoteFreshness } from "../scripts/check-public-truth.mjs";
import { inspectSimulationClaims, renderSimulationAnchor } from "../scripts/lib/simulation-methodology.mjs";
import { LEAGUE_DISTRIBUTION_TARGET } from "../src/stats/progressionParity.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A gate with no negative control is a green light nobody has tested. These
// build a throwaway tree whose only difference from the real one is the defect.
function scratchRoot({ newestNote, lastSession }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s94-truth-"));
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });
  fs.mkdirSync(path.join(dir, "context"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "public", "status.html"),
    `<h2>Release Notes</h2><h3>${newestNote} — A note</h3><p>Copy.</p>`
  );
  fs.writeFileSync(
    path.join(dir, "context", "PROJECT_STATUS.json"),
    JSON.stringify({ lastSession, lastUpdated: "2026-08-23" })
  );
  fs.writeFileSync(
    path.join(dir, "context", "CURRENT_STATE.md"),
    "# Current State\n" +
      "- 2026-08-22: Session 93 shipped things.\n" +
      "- 2026-08-19: Session 92 shipped things.\n" +
      "- 2026-08-03: Session 69 shipped things.\n"
  );
  return dir;
}

test("NEGATIVE CONTROL: release-note freshness goes red on a page that stopped tracking the product", () => {
  const stale = scratchRoot({ newestNote: "2026-08-03", lastSession: 93 });
  const report = inspectReleaseNoteFreshness(stale);
  assert.equal(report.ok, false);
  assert.equal(report.behind, 24, "24 sessions shipped after the newest published note");
  assert.match(report.problems[0], /24 sessions unpublished/);
});

test("freshness tracks a moving target rather than a hardcoded date", () => {
  // Same published note, later product: still red, and by more.
  const further = inspectReleaseNoteFreshness(scratchRoot({ newestNote: "2026-08-03", lastSession: 120 }));
  assert.equal(further.behind, 51);
  // Published note caught up: green.
  const current = inspectReleaseNoteFreshness(scratchRoot({ newestNote: "2026-08-22", lastSession: 93 }));
  assert.equal(current.ok, true);
  // One session behind is in flight, not rot — the note lands at closeout.
  const inFlight = inspectReleaseNoteFreshness(scratchRoot({ newestNote: "2026-08-19", lastSession: 93 }));
  assert.equal(inFlight.behind, 1);
  assert.equal(inFlight.ok, true);
});

test("the shipped status page is current", () => {
  const report = inspectReleaseNoteFreshness(rootDir);
  assert.equal(report.ok, true, report.problems.join("; "));
});

test("the methodology page publishes the engine's own constants, not a second copy", () => {
  const anchor = renderSimulationAnchor();
  assert.ok(anchor.includes(String(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctCeiling)));
  assert.ok(anchor.includes(String(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctWatchCeiling)));
  assert.equal(inspectSimulationClaims(anchor + " 0.15").ok, true);
});

test("NEGATIVE CONTROL: a hand-written friendlier number is caught", () => {
  const drifted = renderSimulationAnchor()
    .replace(String(LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctCeiling), "4.20");
  const report = inspectSimulationClaims(drifted);
  assert.equal(report.ok, false);
  assert.match(report.problems.join(" "), /elite density ceiling/);
});

test("the methodology page states its limits, which is the point of it", () => {
  const source = fs.readFileSync(path.join(rootDir, "public", "simulation.html"), "utf8");
  for (const admission of ["analogy, not an identity", "structural, not measured", "guardrailed, not replayed"]) {
    assert.ok(source.includes(admission), `simulation.html must keep the honest limit: ${admission}`);
  }
  assert.ok(source.includes("data-simulation-anchor"), "figures must stay generated");
});

test("/stats is withheld from the crawl invitation while the cohort is empty", () => {
  const sitemap = fs.readFileSync(path.join(rootDir, "public", "sitemap.xml"), "utf8");
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/stats<\/loc>/, "a page of zeros must not be the first thing indexed");
  assert.match(sitemap, /simulation\.html/, "the methodology page should be indexed");
});

test("the community pulse renders an invitation, never a row of zeros, before a cohort exists", () => {
  const source = fs.readFileSync(path.join(rootDir, "public", "community-stats.js"), "utf8");
  assert.match(source, /function isPreCohort/);
  assert.match(source, /invitationMarkup/);
  // Both consumer surfaces must take the pre-cohort path, not just the home page.
  const pulse = source.slice(source.indexOf("function renderPulse"), source.indexOf("function percentileMessage"));
  const atlas = source.slice(source.indexOf("function renderAtlas"));
  assert.match(pulse, /isPreCohort\(snapshot\)/);
  assert.match(atlas, /isPreCohort\(snapshot\)/);
});
