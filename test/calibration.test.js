import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

test("calibration report includes postAverage for key position metrics", () => {
  const session = createSession({ seed: 2026, startYear: 2026, controlledTeamId: "BUF" });
  session.simulateOneSeason({ runOffseasonAfter: false });
  const report = session.lastCalibrationReport;
  assert.ok(report);
  assert.ok(report.positions.QB.metrics["passing.yards"].postAverage > 0);
  assert.ok(report.positions.RB.metrics["rushing.yards"].postAverage > 0);
  assert.ok(report.positions.DB.metrics["defense.passDefended"].postAverage >= 0);
});
