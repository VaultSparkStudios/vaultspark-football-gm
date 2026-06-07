import test from "node:test";
import assert from "node:assert/strict";
import { buildDraftPressureModel } from "../public/lib/tabDraft.js";

test("draft pressure model highlights user on-clock target", () => {
  const model = buildDraftPressureModel({
    controlledTeamId: "BUF",
    scoutingBoard: ["p2"],
    rosterNeeds: [{ position: "WR", delta: -2 }],
    draft: {
      currentPick: 33,
      totalPicks: 224,
      order: ["BUF", "MIA"],
      available: [
        { id: "p1", name: "Safe Guard", position: "OL", scouting: { rank: 12, projectedRound: 2 } },
        { id: "p2", name: "Field Tilt", position: "WR", scouting: { rank: 20, projectedRound: 3 } }
      ]
    }
  });

  assert.equal(model.status, "You are on the clock");
  assert.equal(model.tone, "danger");
  assert.equal(model.targets[0].player, "Field Tilt");
  assert.ok(model.insight.includes("pressure target"));
});

test("draft pressure model is useful before a draft exists", () => {
  const model = buildDraftPressureModel();
  assert.equal(model.status, "No active draft");
  assert.equal(model.targets.length, 0);
  assert.ok(model.chips.includes("Prepare board"));
});
