import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { achievedIntentStreak, isIsoCalendarDate, parseInlineSilCategories } from "../scripts/lib/startup-sil-truth.mjs";
import { readCommittedGeniusAuthority } from "../scripts/lib/startup-authority.mjs";

test("inline SIL v3 categories are parsed without a legacy score table", () => {
  const parsed = parseInlineSilCategories(
    "SIL v3.0: **993 / 1000** (Dev Health 100, Creative Alignment 100, Momentum 100, Engagement 100, Process Quality 94, Cross-Repo Coherence 99, Security Posture 100, Ecosystem Integration 100, Capital Efficiency 100, Automation Coverage 100)."
  );
  assert.deepEqual(parsed, {
    devHealth: 100,
    creativeAlignment: 100,
    momentum: 100,
    engagement: 100,
    processQuality: 94,
    crossRepoCoherence: 99,
    securityPosture: 100,
    ecosystemIntegration: 100,
    capitalEfficiency: 100,
    automationCoverage: 100
  });
});

test("only real ISO calendar dates can become activity authority", () => {
  assert.equal(isIsoCalendarDate("2026-08-26"), true);
  assert.equal(isIsoCalendarDate(95), false);
  assert.equal(isIsoCalendarDate("95"), false);
  assert.equal(isIsoCalendarDate("2026-99-99"), false);
});

test("intent streak reads parsed entry bodies and stops on the first miss", () => {
  assert.equal(achievedIntentStreak([
    { body: "Intent outcome: Achieved" },
    { body: "Classification: Achieved — exact scope" },
    { body: "Intent outcome: Partial" },
    { body: "Intent outcome: Achieved" }
  ]), 2);
});

test("session-suffixed audits are valid committed genius authority", () => {
  const authority = readCommittedGeniusAuthority(fileURLToPath(new URL("..", import.meta.url)));
  assert.equal(authority.source, "AUDIT_2026-08-26_SESSION96.json");
  assert.equal(authority.status, "open");
  assert.equal(authority.items.length, 4);
});
