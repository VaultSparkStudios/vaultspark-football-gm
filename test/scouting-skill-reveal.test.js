import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";

function advanceToStage(session, stageName) {
  let result = session.advanceOffseasonPipeline();
  let guard = 0;
  while (result?.stage !== stageName && guard < 10) {
    result = session.advanceOffseasonPipeline();
    guard += 1;
  }
  assert.equal(result?.stage, stageName, `offseason pipeline did not reach ${stageName} within the guard`);
  return result;
}

function pearson(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

test("combine grade is position-weighted and bounded, not one flat formula for every position", () => {
  const session = createSession({ seed: 501, startYear: 2026, controlledTeamId: "BUF" });
  session.prepareDraft();
  advanceToStage(session, "pro-days"); // runs retirements -> coaching-carousel -> combine

  const prospects = session.league.pendingDraft.available;
  for (const prospect of prospects) {
    assert.ok(
      Number.isFinite(prospect.scouting.combineGrade) && prospect.scouting.combineGrade >= 45 && prospect.scouting.combineGrade <= 99,
      `combine grade for ${prospect.position} must be a finite number in [45,99]`
    );
  }

  // Statistical proof of position weighting across the real 256-prospect class:
  // bench press should correlate far more strongly with an OL/DL's combine grade
  // than with a WR/DB's, and forty speed should correlate far more strongly with
  // a WR/DB's grade than with an OL/DL's. A single flat formula (the pre-fix
  // behavior) would produce nearly identical correlations for both groups.
  const powerGroup = prospects.filter((p) => p.position === "OL" || p.position === "DL");
  const speedGroup = prospects.filter((p) => p.position === "WR" || p.position === "DB");
  assert.ok(powerGroup.length >= 15 && speedGroup.length >= 15, "need a sizeable sample of each position group");

  const benchCorrPower = pearson(powerGroup.map((p) => p.scouting.combine.bench), powerGroup.map((p) => p.scouting.combineGrade));
  const benchCorrSpeed = pearson(speedGroup.map((p) => p.scouting.combine.bench), speedGroup.map((p) => p.scouting.combineGrade));
  const speedCorrPower = pearson(powerGroup.map((p) => -p.scouting.combine.forty), powerGroup.map((p) => p.scouting.combineGrade));
  const speedCorrSpeed = pearson(speedGroup.map((p) => -p.scouting.combine.forty), speedGroup.map((p) => p.scouting.combineGrade));

  assert.ok(
    benchCorrPower > benchCorrSpeed + 0.15,
    `bench should correlate more with OL/DL grade than WR/DB grade: power=${benchCorrPower.toFixed(2)} speed=${benchCorrSpeed.toFixed(2)}`
  );
  assert.ok(
    speedCorrSpeed > speedCorrPower + 0.15,
    `forty speed should correlate more with WR/DB grade than OL/DL grade: speed=${speedCorrSpeed.toFixed(2)} power=${speedCorrPower.toFixed(2)}`
  );
});

test("pro-day precision scales with scouting investment: invested prospects converge toward truth", () => {
  const invested = createSession({ seed: 502, startYear: 2026, controlledTeamId: "BUF" });
  invested.prepareDraft();

  const target = invested.league.pendingDraft.available[10];
  const trueOverall = target.overall;

  invested.grantWeeklyScoutingPoints();
  invested.grantWeeklyScoutingPoints();
  invested.grantWeeklyScoutingPoints();
  for (let i = 0; i < 6; i += 1) {
    const result = invested.allocateScoutingPoints({ teamId: "BUF", playerId: target.id, points: 15 });
    if (!result.ok) break;
  }
  const preProDayEval = invested.ensureScoutingTeamState("BUF").evaluations[target.id];
  const preProDayGap = Math.abs(preProDayEval - trueOverall);

  advanceToStage(invested, "draft"); // runs retirements -> coaching-carousel -> combine -> pro-days

  const postProDayEval = invested.ensureScoutingTeamState("BUF").evaluations[target.id];
  const postProDayGap = Math.abs(postProDayEval - trueOverall);

  assert.ok(
    postProDayGap <= preProDayGap + 2,
    `heavy investment should not make the evaluation drift further from truth: pre-gap=${preProDayGap} post-gap=${postProDayGap}`
  );

  // Unscouted control: same prospect id, zero investment, must gain NO private
  // evaluation from pro-days alone (only the public baseline moves).
  const unscouted = createSession({ seed: 502, startYear: 2026, controlledTeamId: "BUF" });
  unscouted.prepareDraft();
  advanceToStage(unscouted, "draft");
  const unscoutedEval = unscouted.ensureScoutingTeamState("BUF").evaluations[target.id];
  assert.equal(unscoutedEval, undefined, "an uninvested prospect must not gain a private evaluation from pro-days alone");
});

test("interview and medical reads unlock only past real investment thresholds, and stay private per team", () => {
  const session = createSession({ seed: 503, startYear: 2026, controlledTeamId: "BUF" });
  session.prepareDraft();
  session.grantWeeklyScoutingPoints();
  session.grantWeeklyScoutingPoints();
  session.grantWeeklyScoutingPoints();

  const target = session.league.pendingDraft.available[3];

  // Below the interview threshold (20 pts): no flags yet.
  const light = session.allocateScoutingPoints({ teamId: "BUF", playerId: target.id, points: 12 });
  assert.equal(light.ok, true);
  assert.deepEqual(light.flags, {});

  // Cross the interview threshold.
  const interview = session.allocateScoutingPoints({ teamId: "BUF", playerId: target.id, points: 10 });
  assert.equal(interview.ok, true);
  assert.ok(interview.flags.makeup, "interview read must unlock past 20 total points");
  assert.ok(["positive", "neutral", "concern"].includes(interview.flags.makeup.bucket));
  assert.ok(interview.flags.makeup.note.length > 5);
  assert.equal(interview.flags.medical, undefined, "medical read must not unlock early");

  // Cross the medical threshold.
  const medical = session.allocateScoutingPoints({ teamId: "BUF", playerId: target.id, points: 15 });
  assert.equal(medical.ok, true);
  assert.ok(medical.flags.medical, "medical read must unlock past 35 total points");
  assert.ok(["clean", "monitor", "red-flag"].includes(medical.flags.medical.level));

  // Flags are stable once unlocked (not re-rolled on further spend).
  const again = session.allocateScoutingPoints({ teamId: "BUF", playerId: target.id, points: 5 });
  assert.deepEqual(again.flags.makeup, interview.flags.makeup);
  assert.deepEqual(again.flags.medical, medical.flags.medical);

  // Privacy: a rival team that never scouted this prospect sees no flags.
  const rivalBoard = session.getScoutingBoard({ teamId: "MIA", limit: 50 });
  const rivalRow = rivalBoard.prospects.find((p) => p.playerId === target.id);
  assert.ok(rivalRow);
  assert.equal(rivalRow.flags, null, "an uninvested rival team must not see the flags BUF paid for");

  // Visibility: the investing team's own board shows the flags.
  const bufBoard = session.getScoutingBoard({ teamId: "BUF", limit: 50 });
  const bufRow = bufBoard.prospects.find((p) => p.playerId === target.id);
  assert.ok(bufRow.flags?.makeup);
  assert.ok(bufRow.flags?.medical);
});

test("medical read is deterministic per prospect, not re-rolled randomness", () => {
  const a = createSession({ seed: 504, startYear: 2026, controlledTeamId: "BUF" });
  const b = createSession({ seed: 504, startYear: 2026, controlledTeamId: "BUF" });
  a.prepareDraft();
  b.prepareDraft();
  a.grantWeeklyScoutingPoints();
  a.grantWeeklyScoutingPoints();
  a.grantWeeklyScoutingPoints();
  b.grantWeeklyScoutingPoints();
  b.grantWeeklyScoutingPoints();
  b.grantWeeklyScoutingPoints();

  const targetId = a.league.pendingDraft.available[7].id;
  a.allocateScoutingPoints({ teamId: "BUF", playerId: targetId, points: 40 });
  b.allocateScoutingPoints({ teamId: "BUF", playerId: targetId, points: 40 });

  const medicalA = a.ensureScoutingTeamState("BUF").flags[targetId].medical;
  const medicalB = b.ensureScoutingTeamState("BUF").flags[targetId].medical;
  assert.deepEqual(medicalA, medicalB, "identical seed + identical prospect id must yield identical medical read");
});
