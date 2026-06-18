import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Session 21 feature tests ──────────────────────────────────────────────────

// 1. pressConference-deterministic-ids
test("pressConference-deterministic-ids: id uses teamId not Math.random", () => {
  const src = readFileSync(new URL("../src/engine/pressConference.js", import.meta.url), "utf8");
  const forBlock = src.slice(src.indexOf("for (const item of items)"), src.indexOf("for (const item of items)") + 300);
  assert.ok(!forBlock.includes("Math.random"), "id does not use Math.random");
  assert.ok(forBlock.includes("controlledTeamId"), "id uses controlledTeamId");
  assert.ok(forBlock.includes("pc-"), "id uses pc- prefix");
});

// 2. hot-seat classification
import { classifyNewsItem, getInboxActionTab } from "../public/lib/engagementFeatures.js";

test("hot-seat-classification: hot-seat type is CRITICAL", () => {
  assert.equal(classifyNewsItem({ type: "hot-seat" }), "CRITICAL");
});

test("hot-seat-classification: previous CRITICAL types still work", () => {
  assert.equal(classifyNewsItem({ type: "cap-alert" }), "CRITICAL");
  assert.equal(classifyNewsItem({ type: "injury", headline: "out for season" }), "CRITICAL");
});

// 3. hot-seat action deeplink
test("hot-seat-action-deeplink: hot-seat maps to overviewTab", () => {
  assert.equal(getInboxActionTab({ type: "hot-seat" }), "overviewTab");
});

test("hot-seat-action-deeplink: existing mappings unchanged", () => {
  assert.equal(getInboxActionTab({ type: "cap-alert" }), "contractsTab");
  assert.equal(getInboxActionTab({ type: "injury" }), "rosterTab");
  assert.equal(getInboxActionTab({ type: "trade" }), "contractsTab");
  assert.equal(getInboxActionTab({ type: "unknown" }), null);
});

// 4. ingestNarrativeAlerts — OWNER_ULTIMATUM promotion
import { ingestNarrativeAlerts } from "../public/lib/engagementFeatures.js";

test("ingestNarrativeAlerts: returns 0 for empty dashboard", () => {
  assert.equal(ingestNarrativeAlerts({}), 0);
  assert.equal(ingestNarrativeAlerts(null), 0);
});

test("ingestNarrativeAlerts: promotes OWNER_ULTIMATUM from narrativeLog as CRITICAL hot-seat", () => {
  const dashboard = {
    currentYear: 2030,
    currentWeek: 14,
    narrativeLog: [
      {
        id: "narr-2030-14-OWNER_ULTIMATUM-KC",
        type: "OWNER_ULTIMATUM",
        year: 2030,
        week: 14,
        headline: "KC ownership delivers ultimatum to front office",
        detail: "Owner pressure is critical.",
        teamIds: ["KC"]
      }
    ]
  };
  const added = ingestNarrativeAlerts(dashboard);
  assert.equal(added, 1, "adds 1 CRITICAL item");
});

test("ingestNarrativeAlerts: ignores OWNER_ULTIMATUM from a different year", () => {
  const dashboard = {
    currentYear: 2031,
    currentWeek: 14,
    narrativeLog: [
      {
        id: "narr-2030-14-OWNER_ULTIMATUM-KC",
        type: "OWNER_ULTIMATUM",
        year: 2030,
        week: 14,
        headline: "Old ultimatum",
        teamIds: ["KC"]
      }
    ]
  };
  const added = ingestNarrativeAlerts(dashboard);
  assert.equal(added, 0, "does not add items from prior year");
});

test("ingestNarrativeAlerts: ignores non-OWNER_ULTIMATUM narrative events", () => {
  const dashboard = {
    currentYear: 2030,
    currentWeek: 10,
    narrativeLog: [
      { type: "BREAKOUT_FLAG", year: 2030, week: 10, headline: "Player breaks out" }
    ]
  };
  assert.equal(ingestNarrativeAlerts(dashboard), 0);
});

// 5. ingestNarrativeAlerts — fan sentiment threshold
test("ingestNarrativeAlerts: adds CRITICAL item when fan approval <= 38", () => {
  const dashboard = {
    currentYear: 2030,
    currentWeek: 8,
    fanSentiment: { approval: 30, trend: "falling", label: "Frustrated", reasons: ["lost this week"] }
  };
  const added = ingestNarrativeAlerts(dashboard);
  assert.equal(added, 1, "adds 1 item for low fan approval");
});

test("ingestNarrativeAlerts: does not add fan item when approval > 38", () => {
  const dashboard = {
    currentYear: 2030,
    currentWeek: 8,
    fanSentiment: { approval: 55, trend: "stable", label: "Steady" }
  };
  assert.equal(ingestNarrativeAlerts(dashboard), 0);
});

test("ingestNarrativeAlerts: boundary at 38 (exactly) adds item", () => {
  const dashboard = {
    currentYear: 2030,
    currentWeek: 9,
    fanSentiment: { approval: 38, trend: "falling", label: "Frustrated" }
  };
  assert.equal(ingestNarrativeAlerts(dashboard), 1);
});
