/**
 * The card-visibility gate's own proof.
 *
 * A gate is only worth its runtime if it can still fail on the defect it exists
 * to catch. Two earlier versions of this scanner were discarded during S89: one
 * produced 39 false positives out of 48 toggled ids, and one returned a clean
 * result on HEAD while silently failing its negative control — it would have
 * passed the real, shipped S88 bug. This test pins both directions: a fixture
 * reproducing the pre-S88 structure must be reported, and the live tree must be
 * clean. If someone later loosens the detector, the first assertion breaks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scanCardVisibility } from "../scripts/check-card-visibility.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

// The exact shape S88 shipped and then fixed: the toggle targets the inner <p>,
// while the surrounding <article> keeps a header and several sub-widgets visible.
const HUSK_HTML = `<!doctype html><html><body>
  <div class="grid">
    <article><h3>Team OVR</h3><p id="ovrCard">-</p></article>
    <article class="gm-legacy-card" id="gmLegacyCardWrap">
      <h3>GM Legacy <span id="gmLegacyGradeVal"></span></h3>
      <p id="gmLegacyCard">-</p>
      <span id="gmLegacyLabel"></span>
      <div id="gmMasteryPortfolio"></div>
      <div id="gmPersonaTier"></div>
    </article>
  </div>
</body></html>`;

const HUSK_JS = `
export function renderGmLegacyScore(summary) {
  const card = document.getElementById("gmLegacyCard");
  if (!summary) { card.hidden = true; return; }
  card.hidden = false;
}
`;

function withFixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-visibility-"));
  try {
    const libDir = path.join(dir, "lib");
    fs.mkdirSync(libDir);
    fs.writeFileSync(path.join(libDir, "tabOverview.js"), HUSK_JS, "utf8");
    const htmlFile = path.join(dir, "game.html");
    fs.writeFileSync(htmlFile, HUSK_HTML, "utf8");
    return run({ libDir, htmlFile });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("the gate still catches the empty-state husk it was built for", () => {
  const result = withFixture(({ libDir, htmlFile }) => scanCardVisibility({ libDir, htmlFile }));
  assert.equal(result.findings.length, 1, "the husk fixture must be reported");
  const [finding] = result.findings;
  assert.equal(finding.id, "gmLegacyCard");
  assert.equal(finding.tag, "p");
  assert.equal(finding.host, "gmLegacyCardWrap", "the gate must name the wrapper that would stay visible");
  assert.ok(
    finding.survivingSiblings.length >= 4,
    `the husk leaves visible siblings behind: ${finding.survivingSiblings.join(", ")}`
  );
});

test("the live game tree has no empty-state husks", () => {
  const result = scanCardVisibility();
  assert.deepEqual(
    result.findings.map((f) => `#${f.id} inside #${f.host}`),
    [],
    "a card must hide its whole wrapper, not just an inner node"
  );
  // Guard the guard: a scanner that silently stopped finding toggles would report
  // zero findings for the wrong reason.
  assert.ok(result.toggledIds > 20, `expected the scanner to still find visibility toggles, saw ${result.toggledIds}`);
  assert.ok(result.staticIds > 20, `expected static toggle targets in game.html, saw ${result.staticIds}`);
});

test("the gate script is wired to run standalone", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/check-card-visibility.mjs"), "utf8");
  assert.match(src, /process\.exit\(result\.findings\.length \? 1 : 0\)/, "the gate must exit non-zero on findings");
});
