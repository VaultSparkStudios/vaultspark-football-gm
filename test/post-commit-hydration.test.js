import test from "node:test";
import assert from "node:assert/strict";
import { coordinatePostCommitHydration } from "../public/lib/postCommitHydration.js";

test("a failed secondary loader cannot reject or repeat an authoritative commit", async () => {
  let applied = 0;
  const diagnostics = [];
  const response = { state: { currentWeek: 2 }, commandReceipt: { started: { week: 1 }, completed: { week: 2 } } };
  const receipt = await coordinatePostCommitHydration({
    response,
    applyDashboard: (state) => {
      applied += 1;
      assert.equal(state.currentWeek, 2);
    },
    loaders: [
      { name: "roster", load: async () => "ok" },
      { name: "news", load: async () => { throw new Error("offline"); } }
    ],
    recordFailure: (entry) => diagnostics.push(entry)
  });
  assert.equal(applied, 1);
  assert.equal(receipt.committed, true);
  assert.equal(receipt.degraded, true);
  assert.equal(receipt.actionStatus, "committed-degraded");
  assert.equal(receipt.commandReceipt.completed.week, 2);
  assert.deepEqual(receipt.failedPanels, [{ name: "news", message: "offline" }]);
  assert.equal(diagnostics[0].operation, "news");
  assert.equal(typeof diagnostics[0].retry, "function");
});

test("dashboard render failure is a committed degradation, not a mutation failure", async () => {
  let loaderRuns = 0;
  const receipt = await coordinatePostCommitHydration({
    response: { state: { currentWeek: 2 }, commandReceipt: { completed: { week: 2 } } },
    applyDashboard: () => { throw new Error("render exploded"); },
    loaders: [{ name: "roster", load: async () => { loaderRuns += 1; } }]
  });
  assert.equal(receipt.committed, true);
  assert.equal(receipt.actionStatus, "committed-degraded");
  assert.equal(loaderRuns, 0, "dependent loaders do not run against unapplied authority");
  assert.equal(receipt.failedPanels[0].name, "dashboard");
});

test("a clean hydration returns an explicit committed receipt", async () => {
  const resolved = [];
  const receipt = await coordinatePostCommitHydration({
    response: { state: { currentWeek: 2 }, commandReceipt: { completed: { week: 2 } } },
    applyDashboard: () => {},
    loaders: [{ name: "roster", load: async () => "ok" }],
    resolveFailure: (entry) => resolved.push(entry.operation)
  });
  assert.equal(receipt.degraded, false);
  assert.equal(receipt.actionStatus, "committed");
  assert.deepEqual(resolved, ["dashboard", "roster"]);
});
