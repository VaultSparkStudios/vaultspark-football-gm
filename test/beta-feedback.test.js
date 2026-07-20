import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFeedbackContextFingerprint,
  buildFeedbackIssueUrl,
  commitFeedbackNavigation,
  openFeedbackPlaceholder
} from "../public/lib/betaFeedback.js";

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

test("launch readiness rows are embedded in the beta issue body", () => {
  const body = new URL(buildFeedbackIssueUrl({
    launchReadinessRows: [
      { area: "Runtime", status: "Ready", detail: "browser | regular-season | 0 server requests" },
      { area: "Public Domain", status: "Blocked", detail: "Cloudflare runbook pending" },
      { area: "Contact Email", status: "Unverified", detail: "Need a real received-message receipt" }
    ]
  })).searchParams.get("body");

  assert.match(body, /Readiness\/Runtime: Ready/);
  assert.match(body, /Readiness\/Public Domain: Blocked/);
  assert.match(body, /Readiness\/Contact Email: Unverified/);
  assert.doesNotMatch(body, /token|password/i);
});

test("franchise fingerprint rows are embedded without secret-like payloads", () => {
  const fingerprint = buildFeedbackContextFingerprint({
    dashboard: {
      controlledTeamId: "BUF",
      controlledTeam: { name: "Buffalo Voltage", abbrev: "BUF" },
      latestStandings: [{ team: "BUF", wins: 7, losses: 3 }],
      cap: { capSpace: -1_250_000 },
      rosterNeeds: [{ pos: "CB" }]
    },
    newsRows: [{ headline: "Starting quarterback questionable before rivalry week" }]
  });
  const body = new URL(buildFeedbackIssueUrl({ franchiseFingerprint: fingerprint })).searchParams.get("body");

  assert.match(body, /Franchise\/Team: Buffalo Voltage/);
  assert.match(body, /Franchise\/Record: 7-3/);
  assert.match(body, /Franchise\/Cap: over cap/);
  assert.match(body, /Franchise\/Top Need: CB/);
  assert.match(body, /quarterback questionable/);
  assert.doesNotMatch(body, /token|password|localStorage|snapshot|save payload/i);
});

test("missing context degrades gracefully", () => {
  const url = buildFeedbackIssueUrl();
  assert.match(new URL(url).searchParams.get("body"), /Season: \? · Week \?/);
});

test("feedback placeholder opens synchronously and severs opener access", () => {
  const popup = { opener: { unsafe: true }, location: { replace() {} } };
  const calls = [];
  const result = openFeedbackPlaceholder({ open: (...args) => { calls.push(args); return popup; } });
  assert.equal(result, popup);
  assert.deepEqual(calls, [["about:blank", "_blank"]]);
  assert.equal(popup.opener, null);
});

test("feedback navigation uses the reserved popup or a reliable current-tab fallback", () => {
  let replaced = "";
  assert.equal(
    commitFeedbackNavigation({
      popup: { location: { replace: (url) => { replaced = url; } } },
      url: "https://example.test/feedback"
    }),
    "popup"
  );
  assert.equal(replaced, "https://example.test/feedback");

  let assigned = "";
  assert.equal(
    commitFeedbackNavigation({
      popup: null,
      url: "https://example.test/fallback",
      browser: { location: { assign: (url) => { assigned = url; } } }
    }),
    "current-tab"
  );
  assert.equal(assigned, "https://example.test/fallback");
});
