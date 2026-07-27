import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFeedbackDisclosureReceipt,
  buildFeedbackContextFingerprint,
  buildFeedbackIssueUrl,
  commitFeedbackNavigation,
  openFeedbackPlaceholder,
  selectPublishedPlaytestReceipt
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

test("local playtest receipts stay private unless explicitly supplied", () => {
  const without = new URL(buildFeedbackIssueUrl()).searchParams.get("body");
  assert.match(without, /not attached — local receipts stay private/);
  assert.doesNotMatch(without, /Playtest\/Clarity/);

  const receipt = selectPublishedPlaytestReceipt({
    schemaVersion: "1.0",
    kind: "local-playtest-receipt",
    ratings: { clarity: 4, agency: 5, pace: 3, returnIntent: 4 },
    note: "  Great\nweek\u0000 — keep it going.  "
  });
  const withReceipt = new URL(buildFeedbackIssueUrl({ playtestReceipt: receipt })).searchParams.get("body");
  assert.match(withReceipt, /Playtest\/Clarity: 4\/5/);
  assert.match(withReceipt, /Playtest\/Note: Great week — keep it going\./);
  assert.match(withReceipt, /explicitly selected/);
});

test("published receipt selection rejects malformed or out-of-range local data", () => {
  assert.equal(selectPublishedPlaytestReceipt(null), null);
  assert.equal(selectPublishedPlaytestReceipt({ schemaVersion: "1.0", kind: "wrong" }), null);
  assert.equal(selectPublishedPlaytestReceipt({
    schemaVersion: "1.0",
    kind: "local-playtest-receipt",
    ratings: { clarity: 6, agency: 5, pace: 3, returnIntent: 4 }
  }), null);
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

test("public feedback disclosure is bounded, control-free, and receipt-visible", () => {
  const disclosure = buildFeedbackDisclosureReceipt({
    franchiseFingerprint: Array.from({ length: 11 }, (_, index) => ({
      label: `Signal ${index}\u0000`,
      value: "x".repeat(400)
    })),
    launchReadinessRows: Array.from({ length: 15 }, (_, index) => ({
      area: `Gate ${index}`,
      status: "Needs verification".repeat(5),
      detail: "source-derived detail ".repeat(30)
    }))
  });
  assert.equal(disclosure.kind, "feedback-disclosure-receipt");
  assert.equal(disclosure.fingerprintRows.length, 8);
  assert.equal(disclosure.readinessRows.length, 12);
  assert.deepEqual(disclosure.omitted, { fingerprintRows: 3, readinessRows: 3 });
  assert.equal(disclosure.fingerprintRows[0].value.length, 160);
  assert.doesNotMatch(disclosure.fingerprintRows[0].label, /\u0000/);

  const body = new URL(buildFeedbackIssueUrl({
    franchiseFingerprint: Array.from({ length: 11 }, (_, index) => ({ label: `Signal ${index}`, value: "ok" })),
    launchReadinessRows: Array.from({ length: 15 }, (_, index) => ({ area: `Gate ${index}`, status: "Hold", detail: "evidence" }))
  })).searchParams.get("body");
  assert.match(body, /Disclosure budget: 6 excess context rows were omitted/);
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
