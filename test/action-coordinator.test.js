import test from "node:test";
import assert from "node:assert/strict";
import { createSingleFlightCoordinator } from "../public/lib/actionCoordinator.js";

test("same-key actions join one in-flight mutation", async () => {
  const events = [];
  const coordinator = createSingleFlightCoordinator({
    onStart: (key) => events.push(`start:${key}`),
    onFinish: (key) => events.push(`finish:${key}`)
  });
  let executions = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const task = async () => {
    executions += 1;
    await gate;
    return "committed";
  };
  const first = coordinator.run("simulation", task);
  const second = coordinator.run("simulation", task);
  assert.equal(first, second);
  assert.equal(executions, 0, "execution starts in a microtask after the lease is registered");
  release();
  assert.equal(await first, "committed");
  assert.equal(await second, "committed");
  assert.equal(executions, 1);
  assert.deepEqual(events, ["start:simulation", "finish:simulation"]);
  assert.equal(coordinator.isActive("simulation"), false);
});

test("different action keys may proceed independently", async () => {
  const coordinator = createSingleFlightCoordinator();
  const results = await Promise.all([
    coordinator.run("simulation", async () => "week"),
    coordinator.run("read", async () => "roster")
  ]);
  assert.deepEqual(results, ["week", "roster"]);
  assert.deepEqual(coordinator.activeKeys(), []);
});
