import test from "node:test";
import assert from "node:assert/strict";

import { titleTokens, similarity, clusterByTitle } from "../scripts/check-duplicate-prs.mjs";

/**
 * The real titles this guard exists for — 33 PRs for one feature, opened daily
 * between 2026-06-16 and 2026-07-31, none of which shared an exact signature.
 */
const REAL_DUPLICATES = [
  "feat: scrollable 100dvh mobile nav drawer (CANON-041 mobile parity)",
  "fix: mobile bottom nav z-index above mobileLoopOverlay — unblocks CANON-041 CI",
  "Mobile nav drawer: 100dvh scrollable slide-in menu on phones (CANON-041)",
  "feat(mobile): horizontal scrollable sticky nav strip + 100dvh fixes",
  "feat(mobile): CANON-041 scrollable 100dvh nav drawer",
  "feat: mobile bottom tab bar + 100dvh (CANON-041 scrollable mobile nav)",
  "feat: CANON-041 mobile nav drawer — 100dvh slide-in with hamburger toggle"
];

const UNRELATED = [
  "perf(save): make a franchise persistable — full season now 3.95 MB",
  "chore(deps): bump the github-actions group across 1 directory",
  "feat(landing): harmonize brand colors to gold/teal + Playwright coverage"
];

test("titles reduce to their meaningful words", () => {
  const tokens = titleTokens("feat(mobile): CANON-041 scrollable 100dvh nav drawer");
  assert.ok(tokens.has("scrollable"));
  assert.ok(tokens.has("nav"));
  assert.ok(tokens.has("drawer"));
  // Conventional-commit prefix, issue key and dimensions carry no signal.
  assert.ok(!tokens.has("feat"));
  assert.ok(!tokens.has("canon"));
  assert.ok(!tokens.has("dvh"));
});

test("similarity is symmetric and bounded", () => {
  const a = titleTokens(REAL_DUPLICATES[0]);
  const b = titleTokens(REAL_DUPLICATES[2]);
  assert.equal(similarity(a, b), similarity(b, a));
  assert.ok(similarity(a, b) > 0 && similarity(a, b) <= 1);
  assert.equal(similarity(a, a), 1);
  assert.equal(similarity(new Set(), a), 0);
});

test("the real duplicate titles cluster together despite different wording", () => {
  const prs = REAL_DUPLICATES.map((title, index) => ({ number: index + 1, title }));
  const clusters = clusterByTitle(prs);
  const largest = clusters.sort((a, b) => b.members.length - a.members.length)[0];
  assert.ok(
    largest.members.length >= 5,
    `expected the mobile-nav titles to cluster, largest group was ${largest.members.length}`
  );
});

test("unrelated work is never grouped with a duplicate cluster", () => {
  const prs = [...REAL_DUPLICATES, ...UNRELATED].map((title, index) => ({ number: index + 1, title }));
  const clusters = clusterByTitle(prs);
  const largest = clusters.sort((a, b) => b.members.length - a.members.length)[0];
  const grouped = largest.members.map((m) => m.title);
  for (const title of UNRELATED) {
    assert.ok(!grouped.includes(title), `"${title}" must not join the duplicate cluster`);
  }
});

test("a healthy queue produces no oversized cluster", () => {
  const prs = UNRELATED.map((title, index) => ({ number: index + 1, title }));
  const clusters = clusterByTitle(prs);
  assert.ok(clusters.every((cluster) => cluster.members.length <= 1));
});

test("an empty or junk title is ignored rather than grouping everything", () => {
  const prs = [{ number: 1, title: "" }, { number: 2, title: "fix:" }, { number: 3, title: "!!!" }];
  const clusters = clusterByTitle(prs);
  assert.equal(clusters.length, 0);
});
