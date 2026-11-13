import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expectedResponsiveNames, responsiveCaptureFailures } from "../scripts/lib/responsive-evidence-contract.mjs";

const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const responsiveEvidence = readFileSync(new URL("../scripts/responsive-evidence.mjs", import.meta.url), "utf8");
const visualReceiptWriter = readFileSync(new URL("../scripts/write-visual-qa-receipt.mjs", import.meta.url), "utf8");
const gameHtml = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const tutorial = readFileSync(new URL("../public/lib/tutorialCampaign.js", import.meta.url), "utf8");
const modalManager = readFileSync(new URL("../public/lib/modalManager.js", import.meta.url), "utf8");

// S84: docs/performance/GAME_SHELL_DIAGNOSTIC.json recorded desktop/mobile CLS failures
// on the first-run /game.html tutorial route caused by these panels/elements rendering
// at zero size before snapping to their real, async-hydrated height. A reserved
// min-height stops that snap from moving content under a reading player.
const DESKTOP_SELECTORS = [
  "#franchiseCommandCenter",
  "#coGmBriefPanel",
  "#franchiseArchitecture",
  "#trophyRoadPanel",
  "#gmCommitmentBoard"
];

const MOBILE_SELECTORS = [
  ".overview-hero-side",
  "#weeklyPlanSummaryText",
  ".footer-guide-panel",
  ".game-footer"
];

for (const selector of [...DESKTOP_SELECTORS, ...MOBILE_SELECTORS]) {
  test(`stylesheet reserves layout space for ${selector}`, () => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}\\s*\\{[^}]*min-height\\s*:\\s*\\d`, "");
    assert.match(styles, pattern, `expected a min-height rule for ${selector} in public/styles.css`);
  });
}

test("first-run tutorial visual proof covers both themes and durable receipts", () => {
  assert.match(responsiveEvidence, /game-dialog-\$\{theme\}/);
  assert.match(responsiveEvidence, /import\s*\{[^}]*expectedResponsiveNames[^}]*responsiveCaptureFailures[^}]*\}\s*from\s*"\.\/lib\/responsive-evidence-contract\.mjs"/);
  assert.match(responsiveEvidence, /const requiredCaptureNames = requiredNames;/);
  assert.match(responsiveEvidence, /responsiveCaptureFailures\(records, requiredCaptureNames\)/);
  const declaration = responsiveEvidence.match(/const requiredNames = viewports\.flatMap\([^;]+;/)?.[0];
  assert.ok(declaration, "native capture runner must derive its required inventory from the shared contract");
  const profiles = ["mobile", "tablet", "desktop"];
  for (const scope of ["full", "lazy-style"]) {
    const required = Array.from(runInNewContext(`${declaration}\nrequiredNames;`, {
      viewports: profiles.map(name => ({ name })), expectedResponsiveNames, lazyStyleOnly: scope === "lazy-style"
    }));
    assert.deepEqual(required, profiles.flatMap(profile => expectedResponsiveNames(profile, { scope })));
    for (const profile of profiles) for (const theme of ["dark", "light"]) {
      for (const surface of ["game-dialog", "tutorial-identity", "tutorial-pressure", "tutorial-first-call", "tutorial-receipt"]) {
        assert.ok(required.includes(`${profile}-${surface}-${theme}`), `${scope} must require ${profile}-${surface}-${theme}`);
      }
    }
  }
  assert.match(visualReceiptWriter, /First-run Opening Contract tutorial/);
});

test("shared tutorial inventory rejects an omitted frame in every profile and theme", () => {
  for (const profile of ["mobile", "tablet", "desktop"]) {
    const required = expectedResponsiveNames(profile);
    const records = required.map(name => ({ name, overflowX: false, bodyContrast: 7, undersizedControls: [],
      ...(name.endsWith("-sim-watch-authority") ? { visualGameReceipt: {
        schemaVersion: "1.0", kind: "deterministic-visual-game-receipt", gameId: "test-game",
        terminal: { gameId: "test-game", accepted: true, playCount: 1, impactCount: 1 }, attempts: [{}]
      } } : {}) }));
    assert.deepEqual(responsiveCaptureFailures(records, required), [], "complete synthetic inventory is a passing control, not browser proof");
    for (const theme of ["dark", "light"]) {
      for (const surface of ["game-dialog", "tutorial-identity", "tutorial-pressure", "tutorial-first-call", "tutorial-receipt"]) {
        const omitted = `${profile}-${surface}-${theme}`;
        assert.deepEqual(responsiveCaptureFailures(records.filter(record => record.name !== omitted), required),
          [`${omitted}: required capture missing`]);
      }
    }
  }
});

test("first-run boot paints a fixed Opening Contract surface before dashboard hydration", () => {
  assert.match(gameHtml, /id="gameBootOverlay"/);
  assert.match(gameHtml, /Building Your Franchise Command Deck/);
  assert.match(gameHtml, /<body class="game-body game-booting">/);
  assert.match(styles, /\.game-boot-overlay\s*\{[^}]*position:\s*fixed/);
  assert.match(styles, /\.game-body\.game-booting[^}]*visibility:\s*hidden/);
  assert.match(tutorial, /void overlay\.offsetWidth;[\s\S]*openModal\(overlay/);
  assert.equal((modalManager.match(/focus\(\{ preventScroll: true \}\)/g) || []).length, 2);
  assert.match(app, /launchOpeningContract\(\{ auto: true \}\);\s*document\.body\.classList\.remove\("game-booting"\);\s*document\.getElementById\("gameBootOverlay"\)\?\.remove\(\)/);
});
