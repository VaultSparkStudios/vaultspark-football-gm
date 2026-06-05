import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedbackIssueUrl } from "../public/lib/betaFeedback.js";

// ── Beta feedback URL builder (S14) ──────────────────────────────────────────

test("issue URL targets the public repo with the beta-feedback label", () => {
  const url = buildFeedbackIssueUrl({ year: 2031, week: 7, phase: "regular-season", tab: "overviewTab" });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://github.com/VaultSparkStudios/vaultspark-football-gm/issues/new");
  assert.equal(parsed.searchParams.get("labels"), "beta-feedback");
});

test("game context is embedded in title and body", () => {
  const url = buildFeedbackIssueUrl({
    year: 2031, week: 7, phase: "regular-season", tab: "overviewTab", runtimeMode: "client"
  });
  const params = new URL(url).searchParams;
  assert.match(params.get("title"), /regular-season/);
  assert.match(params.get("body"), /Season: 2031 · Week 7/);
  assert.match(params.get("body"), /Runtime: client/);
});

test("analytics attachment note reflects opt-in state", () => {
  const withDigest = new URL(buildFeedbackIssueUrl({ analyticsAttached: true })).searchParams.get("body");
  const without = new URL(buildFeedbackIssueUrl({ analyticsAttached: false })).searchParams.get("body");
  assert.match(withDigest, /copied to clipboard/);
  assert.match(without, /not attached/);
});

test("missing context degrades gracefully", () => {
  const url = buildFeedbackIssueUrl();
  assert.match(new URL(url).searchParams.get("body"), /Season: \? · Week \?/);
});
