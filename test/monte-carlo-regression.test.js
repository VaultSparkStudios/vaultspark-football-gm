import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("monte carlo regression guardrail keeps key drifts bounded", () => {
  const drifts = [];
  for (const seed of [2026, 2027, 2028]) {
    const session = createSession({ seed, startYear: 2026, controlledTeamId: "BUF" });
    session.simulateSeasons(2, { runOffseasonAfterLast: true });
    const report = session.getQaReport(session.currentYear - 1);
    drifts.push(report?.comparisons || {});
  }

  const avgAbs = (metric) => {
    const values = drifts
      .map((row) => Math.abs(Number(row?.[metric]?.drift || 0)))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  assert.ok(avgAbs("pointsPerGame") <= 0.85);
  assert.ok(avgAbs("passingYardsPerAttempt") <= 0.35);
  assert.ok(avgAbs("sackRate") <= 0.45);
  assert.ok(avgAbs("interceptionRate") <= 0.5);
  assert.ok(avgAbs("rushYardsPerAttempt") <= 0.35);
});
