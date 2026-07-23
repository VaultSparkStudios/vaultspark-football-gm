import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildFranchiseCommandReceipt, buildFranchiseCommandStack } from "../public/lib/franchiseCommandCenter.js";
import { buildLocalPlaytestReceipt, buildLocalPlaytestTrend } from "../public/lib/playtestReceipts.js";
import { previewTacticalIdentity } from "../public/lib/tacticalFilmRoom.js";

function receipt(index, ratings) {
  return buildLocalPlaytestReceipt({ ...ratings, createdAt: `2026-07-2${index}T12:00:00.000Z` }, {
    year: 2026, week: index, phase: "regular-season", teamId: "BUF", evidenceMoment: "test"
  });
}

test("three explicit local receipts unlock a bounded trend with a sample and causality warning", () => {
  const two = [receipt(1, { clarity: 4, agency: 5, pace: 3, returnIntent: 4 }), receipt(2, { clarity: 2, agency: 4, pace: 3, returnIntent: 5 })];
  assert.deepEqual(buildLocalPlaytestTrend(two).available, false);
  const trend = buildLocalPlaytestTrend([...two, receipt(3, { clarity: 3, agency: 3, pace: 3, returnIntent: 3 })]);
  assert.equal(trend.available, true);
  assert.deepEqual(trend.averages, { clarity: 3, agency: 4, pace: 3, returnIntent: 4 });
  assert.match(trend.warning, /self-selected.*do(?:es)? not prove.*causality/i);
});

test("tactical previews reward only execution and expose the exact next identity threshold", () => {
  const ledger = [{ tactic: "run-heavy", aligned: true }, { tactic: "run-heavy", aligned: false }];
  const preview = previewTacticalIdentity(ledger, "run-heavy");
  assert.equal(preview.projectedTier, "Established");
  assert.equal(preview.tierChange, true);
  assert.match(preview.copy, /If executed/);
  assert.match(preview.disclaimer, /Only an executed call updates/);
  assert.equal(previewTacticalIdentity(ledger, "unknown"), null);
});

test("ranked command authority emits a deterministic explanation receipt", () => {
  const input = { dashboard: { controlledTeamId: "BUF", currentYear: 2026, currentWeek: 9, phase: "regular-season", cap: { capSpace: -1 }, injuryReport: [], rosterNeeds: [] } };
  const cards = buildFranchiseCommandStack(input);
  assert.deepEqual(cards.map((card) => card.rank), [1, 2, 3]);
  assert.equal(cards[0].reasonCode, "cap-pressure");
  const first = buildFranchiseCommandReceipt(input);
  assert.deepEqual(first, buildFranchiseCommandReceipt(input));
  assert.equal(first.commands.at(-1).reasonCode, "advance-ready");
});

test("the browser renders explanation, identity preview, and local trend without adding network custody", () => {
  const overview = readFileSync(new URL("../public/lib/tabOverview.js", import.meta.url), "utf8");
  const flow = readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  const feedback = readFileSync(new URL("../public/lib/betaFeedback.js", import.meta.url), "utf8");
  const contextual = readFileSync(new URL("../public/lib/contextualFeedback.js", import.meta.url), "utf8");
  const core = readFileSync(new URL("../public/lib/appCore.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(overview, /franchise-command-reason/);
  assert.match(flow, /previewTacticalIdentity/);
  assert.match(feedback, /buildLocalPlaytestTrend/);
  assert.match(contextual, /getElementById\("overviewTab"\).*prepend\(panel\)/s);
  assert.match(core, /actionStatus === "committed"[\s\S]*setStatus\("Ready"\)/);
  assert.doesNotMatch(styles, /\.contextual-evidence-prompt\s*\{[^}]*position:\s*fixed/s);
});
test("public repository excludes the orphaned internal secret-broker implementation", () => {
  assert.equal(existsSync(new URL("../scripts/lib/obelisk-broker.mjs", import.meta.url)), false);
});
