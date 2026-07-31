import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { evaluateBriefFreshness } from "../scripts/check-brief-staleness.mjs";
import {
  describeGeniusCache,
  describeProjectProfile,
  geniusAuthorityFingerprint,
  lifecycleAuthorityFingerprint,
  readCommittedGeniusAuthority
} from "../scripts/lib/startup-authority.mjs";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));

test("project profile labels stale cache and lifecycle authority drift", () => {
  const summary = describeProjectProfile({
    medium: "game",
    stage: "live-beta",
    generatedAt: "2026-07-20T00:00:00.000Z",
    ttlMs: 1_800_000
  }, {
    localVaultStatus: "FORGE",
    authoritativeVaultStatus: "SPARKED",
    authoritativeDrift: true
  }, new Date("2026-07-28T00:00:00.000Z"));
  assert.equal(summary.stale, true);
  assert.match(summary.profileLine, /cache stale 8d/);
  assert.match(summary.authorityLine, /local FORGE · registry SPARKED · DRIFT/);
  assert.match(summary.policyLine, /signed Studio Ark/);
});

test("exhausted genius authority remains an explicit receipt", () => {
  const summary = describeGeniusCache({
    status: "exhausted",
    source: "AUDIT_fixture.md",
    items: [],
    closed: ["one", "two"],
    exhaustedReason: "No open ranked items."
  });
  assert.equal(summary.exhausted, true);
  assert.equal(summary.closedCount, 2);
  assert.equal(summary.reason, "No open ranked items.");
});

test("missing ignored cache falls back to committed audit authority", () => {
  assert.deepEqual(describeGeniusCache(null), {
    status: "unknown",
    source: "latest audit",
    items: [],
    closedCount: 0,
    exhausted: false,
    reason: null
  });
  const authority = readCommittedGeniusAuthority(root);
  assert.equal(authority.status, "exhausted");
  assert.equal(authority.items.length, 0);
  assert.ok(authority.closed.length >= 5);
  assert.ok(authority.closed.includes("canonical-capability-operations-authority"));
  assert.match(authority.source, /^AUDIT_\d{4}-\d{2}-\d{2}\.json$/);
});

test("brief freshness fails when lifecycle or genius authority changes", () => {
  const lifecycle = lifecycleAuthorityFingerprint({ slug: "fa", expectedVaultStatus: "FORGE" });
  const genius = geniusAuthorityFingerprint({ status: "open", items: [{ slug: "one" }], closed: [] });
  const brief = [
    "<!-- generated-at: 2026-07-28 (Session 59 closeout) -->",
    "<!-- brief-coherent: true -->",
    `<!-- lifecycle-authority-fingerprint: ${lifecycle} -->`,
    `<!-- genius-authority-fingerprint: ${genius} -->`,
    "║  Session 60 · 2026-07-28 · BUILDER MODE  ║"
  ].join("\n");
  const fresh = evaluateBriefFreshness({
    briefText: brief,
    status: { currentSession: 59 },
    now: new Date("2026-07-28T12:00:00Z"),
    lifecycleFingerprint: lifecycle,
    geniusFingerprint: genius
  });
  assert.equal(fresh.fresh, true);
  const stale = evaluateBriefFreshness({
    briefText: brief,
    status: { currentSession: 59 },
    now: new Date("2026-07-28T12:00:00Z"),
    lifecycleFingerprint: lifecycleAuthorityFingerprint({ slug: "fa", expectedVaultStatus: "SPARKED" }),
    geniusFingerprint: geniusAuthorityFingerprint({ status: "exhausted", items: [], closed: ["one"] })
  });
  assert.match(stale.reasons.join(" "), /lifecycle authority changed/);
  assert.match(stale.reasons.join(" "), /genius authority changed/);
});

test("live renderer emits source-bound startup authority tiles", () => {
  const result = spawnSync(process.execPath, ["scripts/render-startup-brief.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, STUDIO_BRIEF_NO_DOCTOR_FIX: "1" }
  });
  assert.equal(result.status, 0, result.stderr);
  const brief = readFileSync(resolve(root, "docs", "STARTUP_BRIEF.md"), "utf8");
  assert.match(brief, /lifecycle-authority-fingerprint/);
  assert.match(brief, /genius-authority-fingerprint/);
  assert.match(brief, /Lifecycle authority · local FORGE · registry (?:SPARKED · DRIFT|unavailable)/);
  assert.match(brief, /Profile · (?:game|—) ·/);
  assert.match(brief, /GENIUS HIT LIST/);
});
