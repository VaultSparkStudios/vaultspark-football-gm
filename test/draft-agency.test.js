import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifySimulationCheckpoint } from "../public/lib/simulationCheckpoints.js";
import { createSession } from "../src/runtime/bootstrap.js";

test("offseason pipeline stops before the controlled franchise draft pick", () => {
  const session = createSession({ seed: 5201, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "offseason";
  const draft = session.prepareDraft();
  draft.currentPick = 1;
  draft.order[0] = "MIA";
  draft.order[1] = "BUF";
  session.getOffseasonPipeline().stage = "draft";

  const result = session.advanceOffseasonPipeline();
  assert.equal(result.stage, "draft");
  assert.equal(result.userActionRequired, true);
  assert.equal(result.blockingReason, "controlled-team-on-clock");
  assert.equal(draft.currentPick, 2);
  assert.equal(draft.selections.length, 1);
  assert.equal(draft.selections[0].teamId, "MIA");
  assert.equal(draft.selections.some((selection) => selection.teamId === "BUF"), false);

  const dashboard = session.getDashboardState();
  assert.equal(dashboard.draft.teamOnClock, "BUF");
  assert.equal(dashboard.draft.controlledTeamOnClock, true);
  assert.equal(dashboard.draft.userActionRequired, true);
});

test("explicit Finish Draft delegation remains the only CPU path through a controlled pick", () => {
  const session = createSession({ seed: 5202, startYear: 2026, controlledTeamId: "BUF" });
  session.phase = "offseason";
  const draft = session.prepareDraft();
  draft.currentPick = 1;
  draft.order[0] = "BUF";
  session.getOffseasonPipeline().stage = "draft";

  const blocked = session.advanceOffseasonPipeline();
  assert.equal(blocked.userActionRequired, true);
  assert.equal(draft.currentPick, 1);

  const delegated = session.runCpuDraft({ untilUserPick: false });
  assert.equal(delegated.ok, true);
  assert.equal(delegated.draft.completed, true);
  assert.ok(delegated.draft.selections.some((selection) => selection.teamId === "BUF"));

  const completed = session.advanceOffseasonPipeline();
  assert.equal(completed.stage, "udfa");
});

test("fast simulation treats offseason stages as checkpoints and controlled picks as blocking", () => {
  const stage = classifySimulationCheckpoint({
    previous: { phase: "offseason", offseasonPipeline: { stage: "combine" } },
    next: { phase: "offseason", offseasonPipeline: { stage: "pro-days" } }
  });
  assert.equal(stage.shouldPause, true);
  assert.equal(stage.blocking, false);
  assert.equal(stage.primary.id, "offseason-stage");

  const pick = classifySimulationCheckpoint({
    previous: { phase: "offseason", offseasonPipeline: { stage: "pro-days" }, draft: { currentPick: 1 } },
    next: {
      phase: "offseason",
      controlledTeamId: "BUF",
      offseasonPipeline: { stage: "draft" },
      draft: { currentPick: 7, teamOnClock: "BUF", controlledTeamOnClock: true, userActionRequired: true }
    }
  });
  assert.equal(pick.shouldPause, true);
  assert.equal(pick.blocking, true);
  assert.equal(pick.primary.id, "controlled-draft-pick");
  assert.deepEqual(pick.reasons.map((reason) => reason.id), ["controlled-draft-pick", "offseason-stage"]);
});

test("blocking draft checkpoints cannot expose a blind Resume action", () => {
  const flow = readFileSync(new URL("../public/lib/gameFlow.js", import.meta.url), "utf8");
  assert.match(flow, /remaining > 0 && !checkpoint\.blocking/);
  assert.match(flow, /completedSeason \|\| checkpoint\.blocking \? null/);
});
