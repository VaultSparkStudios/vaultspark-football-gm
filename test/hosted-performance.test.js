import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateHostedPerformance, percentile, sha256Json } from "../scripts/lib/hosted-performance.mjs";
import { parseArgs, resolveHostedPerformanceRoute } from "../scripts/measure-hosted-performance.mjs";

const base = {
  sourceRevision: "a".repeat(40),
  artifactFingerprint: { algorithm: "sha256", digest: "b".repeat(64) },
  edgeHeaders: { "strict-transport-security": "max-age=31536000", "content-security-policy": "default-src 'self'", "x-frame-options": "DENY" },
  profiles: [
    { name: "desktop", lcpMs: 900, inpMs: 48, cls: 0.01, interactionObserved: true },
    { name: "mobile", lcpMs: 1400, inpMs: 96, cls: 0.04, interactionObserved: true }
  ]
};

test("hosted performance requires exact identity, edge policy, both viewports, and deliberate INP", () => {
  assert.equal(evaluateHostedPerformance(base).status, "verified");
  const missingInp = structuredClone(base);
  missingInp.profiles[1].interactionObserved = false;
  missingInp.profiles[1].inpMs = 0;
  assert.equal(evaluateHostedPerformance(missingInp).status, "blocked");
  assert.ok(evaluateHostedPerformance(missingInp).failures.includes("mobile deliberate interaction observed"));
});

test("hosted performance thresholds fail closed", () => {
  const slow = structuredClone(base);
  slow.profiles[0].lcpMs = 1800;
  slow.profiles[1].cls = 0.1001;
  assert.deepEqual(evaluateHostedPerformance(slow).failures.filter((name) => /LCP|CLS/.test(name)), ["desktop LCP", "mobile CLS"]);
});

test("performance receipt primitives are deterministic", () => {
  assert.equal(percentile([40, 10, 30, 20, 50]), 30);
  assert.equal(sha256Json({ exact: true }), sha256Json({ exact: true }));
  assert.notEqual(sha256Json({ exact: true }), sha256Json({ exact: false }));
});

test("hosted performance routes keep canonical entry and game-shell evidence separate", () => {
  const canonical = parseArgs(["--base-url", "https://staging.example.test", "--runs", "2"]);
  assert.equal(canonical.route.path, "/");
  assert.equal(canonical.route.interactionSelector, "#setupThemeToggleBtn");
  assert.equal(canonical.output, "docs/performance/LATEST.json");
  assert.equal(canonical.runs, 2);

  const game = parseArgs(["--base-url", "https://staging.example.test", "--route", "game.html"]);
  assert.equal(game.route.path, "/game.html");
  assert.equal(game.route.interactionSelector, "#themeToggleBtn");
  assert.equal(game.output, "docs/performance/GAME_SHELL_DIAGNOSTIC.json");
  assert.match(game.route.boundary, /does not replace the canonical public-entry release gate/);
});

test("hosted performance route selection fails closed on arbitrary or cross-origin input", () => {
  assert.equal(resolveHostedPerformanceRoute("./").path, "/");
  assert.equal(resolveHostedPerformanceRoute("/game.html").path, "/game.html");
  assert.throws(() => resolveHostedPerformanceRoute("https://evil.example/game.html"), /same-origin path/);
  assert.throws(() => resolveHostedPerformanceRoute("/game.html?runtime=server"), /query or hash/);
  assert.throws(() => resolveHostedPerformanceRoute("/admin.html"), /Unsupported hosted performance route/);
});

test("Opening Contract modules start loading before dashboard authority resolves", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const preload = app.indexOf("const firstRunSurfacesPromise = Promise.all");
  const dashboard = app.indexOf("await loadCoreDashboard()", preload);
  const consume = app.indexOf("await firstRunSurfacesPromise", dashboard);
  assert.ok(preload >= 0 && preload < dashboard, "lazy first-run modules should start before dashboard loading");
  assert.ok(consume > dashboard, "tutorial mounting still waits for dashboard authority");
});
