import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStartScenarioRequest,
  getStartScenarioPlan,
  START_SCENARIO_CHOICES,
  validateStartScenario
} from "../public/lib/startScenarioContract.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";

test("all 27 Opening Contract combinations execute, explain, and restore exactly", () => {
  let index = 0;
  for (const identity of START_SCENARIO_CHOICES.identity) {
    for (const pressure of START_SCENARIO_CHOICES.pressure) {
      for (const firstCall of START_SCENARIO_CHOICES.firstCall) {
        const selections = { identity, pressure, firstCall };
        const request = buildStartScenarioRequest(selections);
        const validation = validateStartScenario(request);
        assert.equal(validation.ok, true, JSON.stringify(selections));

        const expected = getStartScenarioPlan(validation.value.selections);
        const session = createSession({
          seed: 58_100 + index,
          startYear: 2026,
          controlledTeamId: "BUF"
        });
        const result = session.applyStartScenario(request);
        assert.equal(result.ok, true, JSON.stringify(selections));
        assert.equal(result.idempotent, false);
        assert.deepEqual(result.receipt.selections, validation.value.selections);
        assert.equal(result.receipt.effects.identity.id, expected.identity.id);
        assert.equal(result.receipt.effects.identity.passRate, expected.identity.passRate);
        assert.equal(result.receipt.effects.pressure.id, expected.pressure.id);
        assert.equal(result.receipt.effects.pressure.patience, expected.pressure.patience);
        assert.equal(result.receipt.effects.scouting.id, expected.scouting.id);
        assert.equal(result.receipt.effects.scouting.pointsReserved, expected.scouting.pointsReserved);

        const idempotent = session.applyStartScenario(request);
        assert.equal(idempotent.ok, true);
        assert.equal(idempotent.idempotent, true);
        assert.deepEqual(idempotent.receipt, result.receipt);

        const restored = createSessionFromSnapshot(session.toSnapshot());
        assert.deepEqual(restored.getDashboardState().startScenarioReceipt, result.receipt);
        index += 1;
      }
    }
  }
  assert.equal(index, 27);
});
