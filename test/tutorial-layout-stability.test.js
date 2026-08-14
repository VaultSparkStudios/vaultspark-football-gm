import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const responsiveEvidence = readFileSync(new URL("../scripts/responsive-evidence.mjs", import.meta.url), "utf8");
const visualReceiptWriter = readFileSync(new URL("../scripts/write-visual-qa-receipt.mjs", import.meta.url), "utf8");

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
  assert.match(responsiveEvidence, /requiredCaptureNames[\s\S]*game-dialog-\$\{theme\}/);
  assert.match(visualReceiptWriter, /First-run Opening Contract tutorial/);
});
