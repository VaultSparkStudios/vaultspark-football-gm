import test from "node:test";
import assert from "node:assert/strict";

import {
  dashboardAuthorityKey,
  franchiseScopeFromDashboard,
  franchiseStorageKey,
  normalizeFranchiseScope
} from "../public/lib/franchiseScope.js";
import { createAuthorityEpochTracker } from "../public/lib/authorityEpoch.js";

test("exact franchise identity outranks same-year legacy fields", () => {
  const first = {
    franchiseId: "fa-seed-a-BUF",
    controlledTeamId: "BUF",
    startYear: 2026,
    currentYear: 2026,
    currentWeek: 5,
    phase: "regular-season"
  };
  const second = { ...first, franchiseId: "fa-seed-b-BUF" };

  assert.equal(franchiseScopeFromDashboard(first), "fa-seed-a-buf");
  assert.notEqual(dashboardAuthorityKey(first), dashboardAuthorityKey(second));

  const tracker = createAuthorityEpochTracker(dashboardAuthorityKey(first));
  const stale = tracker.begin("roster", "BUF");
  tracker.replaceAuthority(dashboardAuthorityKey(second));
  assert.equal(tracker.commit(stale, "BUF", () => assert.fail("stale response painted")), false);
  assert.equal(tracker.snapshot().staleResponsesDiscarded, 1);
});

test("legacy identity remains deterministic and storage keys are bounded", () => {
  const legacy = { controlledTeamId: "MIA", startYear: 2031 };
  assert.equal(franchiseScopeFromDashboard(legacy), "legacy-mia-2031");
  assert.equal(franchiseStorageKey("vsfgm:test:v2", legacy), "vsfgm:test:v2:legacy-mia-2031");
  assert.equal(normalizeFranchiseScope("  Franchise / A!  "), "franchise-a");
});
