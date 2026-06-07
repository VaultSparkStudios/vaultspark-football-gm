import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchReadinessRows } from "../public/lib/tabSettings.js";

test("launch readiness rows expose static beta launch posture", () => {
  const rows = buildLaunchReadinessRows({
    dashboard: { phase: "regular-season" },
    saves: [{ slot: "alpha" }],
    persistence: { kind: "browser" },
    observability: { server: { requests: 7 } },
    speedrunChallenge: { active: true }
  });

  assert.equal(rows.length, 5);
  assert.equal(rows.find((row) => row.area === "Runtime").status, "Ready");
  assert.equal(rows.find((row) => row.area === "Challenge Codes").status, "Active");
  assert.equal(rows.find((row) => row.area === "Public Domain").status, "Blocked");
});
