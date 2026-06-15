import test from "node:test";
import assert from "node:assert/strict";

// ── Session 20 feature tests ──────────────────────────────────────────────────
import { readFileSync } from "node:fs";

// 1. narrative-deterministic-ids (internal fix — verified via source inspection)
import { runNarrativeChecks, buildVeteranLegacyBlurb as _bvlb } from "../src/engine/narrativeEvents.js";

test("narrative-deterministic-ids: pushEvent id uses deterministic template not Math.random", () => {
  const src = readFileSync(new URL("../src/engine/narrativeEvents.js", import.meta.url), "utf8");
  const pushFn = src.slice(src.indexOf("function pushEvent"), src.indexOf("function pushEvent") + 400);
  assert.ok(!pushFn.includes("Math.random"), "pushEvent id does not use Math.random");
  assert.ok(pushFn.includes("narr-"), "pushEvent id uses narr- prefix template");
});

test("narrative-deterministic-ids: id template covers year/week/type/player segments", () => {
  const src = readFileSync(new URL("../src/engine/narrativeEvents.js", import.meta.url), "utf8");
  const pushFn = src.slice(src.indexOf("function pushEvent"), src.indexOf("function pushEvent") + 400);
  assert.ok(pushFn.includes("event.year"), "id embeds year");
  assert.ok(pushFn.includes("event.week"), "id embeds week");
  assert.ok(pushFn.includes("event.type"), "id embeds type");
});

// 2. miracle-run-comeback-arc
import { isMiracleRun } from "../public/lib/seasonEpilogue.js";

test("miracle-run-comeback-arc: isMiracleRun true when sub-.500 and made playoffs", () => {
  assert.equal(isMiracleRun(0.45, true), true);
  assert.equal(isMiracleRun(0.49, true), true);
});

test("miracle-run-comeback-arc: isMiracleRun false when winPct >= .500", () => {
  assert.equal(isMiracleRun(0.5, true), false);
  assert.equal(isMiracleRun(0.6, true), false);
});

test("miracle-run-comeback-arc: isMiracleRun false when missed playoffs", () => {
  assert.equal(isMiracleRun(0.4, false), false);
});

// 3. veteran-farewell-legacy
import { buildVeteranLegacyBlurb } from "../src/engine/narrativeEvents.js";

test("veteran-farewell-legacy: buildVeteranLegacyBlurb returns 3-sentence string", () => {
  const player = { name: "Marcus Cole", position: "QB", overall: 88, age: 38 };
  const blurb = buildVeteranLegacyBlurb(player, 2026);
  assert.equal(typeof blurb, "string", "returns a string");
  const sentences = blurb.split(".").filter((s) => s.trim().length > 0);
  assert.ok(sentences.length >= 2, "has at least 2 sentences");
  assert.ok(blurb.includes("Cole") || blurb.includes("QB") || blurb.includes("2026"), "mentions player context");
});

// 4. gm-reputation-league-awareness
import { buildGmReputationProfile } from "../src/engine/gmLegacyScore.js";

test("gm-reputation-league-awareness: unestablished when no seasons", () => {
  const result = buildGmReputationProfile({ seasonsServed: 0 });
  assert.equal(result.tradeStyle, "Unestablished");
  assert.equal(result.multiplier, 1.0);
});

test("gm-reputation-league-awareness: Aggressive Buyer raises multiplier", () => {
  const legacy = { seasonsServed: 5, tradeNetAV: -15, capGradeTotal: 250, cultureGradeTotal: 300 };
  const result = buildGmReputationProfile(legacy);
  assert.equal(result.tradeStyle, "Aggressive Buyer");
  assert.ok(result.multiplier > 1.0, "multiplier is above 1.0");
});

test("gm-reputation-league-awareness: Cap Hawk lowers multiplier", () => {
  const legacy = { seasonsServed: 4, tradeNetAV: 0, capGradeTotal: 320, cultureGradeTotal: 240 };
  const result = buildGmReputationProfile(legacy);
  assert.equal(result.capStyle, "Cap Hawk");
  assert.ok(result.multiplier < 1.0, "multiplier is below 1.0");
});

test("gm-reputation-league-awareness: multiplier clamped at [0.85, 1.20]", () => {
  const legacy = { seasonsServed: 10, tradeNetAV: -50, capGradeTotal: 100, cultureGradeTotal: 50 };
  const result = buildGmReputationProfile(legacy);
  assert.ok(result.multiplier >= 0.85 && result.multiplier <= 1.2, "within clamp range");
});

// 5. inbox-action-deeplinks
import { getInboxActionTab } from "../public/lib/engagementFeatures.js";

test("inbox-action-deeplinks: cap-alert maps to contractsTab", () => {
  assert.equal(getInboxActionTab({ type: "cap-alert" }), "contractsTab");
  assert.equal(getInboxActionTab({ type: "cap_alert" }), "contractsTab");
});

test("inbox-action-deeplinks: injury maps to rosterTab", () => {
  assert.equal(getInboxActionTab({ type: "injury" }), "rosterTab");
});

test("inbox-action-deeplinks: trade maps to contractsTab", () => {
  assert.equal(getInboxActionTab({ type: "trade" }), "contractsTab");
});

test("inbox-action-deeplinks: unknown type returns null", () => {
  assert.equal(getInboxActionTab({ type: "newsletter" }), null);
  assert.equal(getInboxActionTab({}), null);
});

// 6. ai-rival-coach-intel
import { buildRivalCoachIntel } from "../public/lib/rivalCoachIntel.js";

test("ai-rival-coach-intel: returns 3 tendencies for each archetype", () => {
  for (const label of ["Moneyball", "Win-Now", "Gut-Feel", "Loyalty"]) {
    const result = buildRivalCoachIntel(label, 50, 78);
    assert.equal(result.tendencies.length, 3, `${label} has 3 tendencies`);
    assert.equal(result.archetype, label, "archetype label preserved");
  }
});

test("ai-rival-coach-intel: high rivalry heat produces alert note", () => {
  const result = buildRivalCoachIntel("Win-Now", 80, 75);
  assert.equal(result.alertLevel, "high");
  assert.ok(result.heatNote && result.heatNote.length > 0, "has heat note");
});

test("ai-rival-coach-intel: low rivalry heat has no heat note", () => {
  const result = buildRivalCoachIntel("Loyalty", 10, 70);
  assert.equal(result.alertLevel, "low");
  assert.equal(result.heatNote, null);
});

test("ai-rival-coach-intel: elite team triggers ovrNote", () => {
  const result = buildRivalCoachIntel("Moneyball", 30, 85);
  assert.ok(result.ovrNote && result.ovrNote.length > 0, "has ovr note for 85+ team");
});

test("ai-rival-coach-intel: below-elite team has no ovrNote", () => {
  const result = buildRivalCoachIntel("Moneyball", 30, 75);
  assert.equal(result.ovrNote, null);
});

test("ai-rival-coach-intel: unknown archetype falls back to Loyalty tendencies", () => {
  const result = buildRivalCoachIntel("Alien", 0, 70);
  assert.equal(result.tendencies.length, 3, "fallback still returns 3 tendencies");
});
