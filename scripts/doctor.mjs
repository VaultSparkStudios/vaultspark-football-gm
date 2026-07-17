#!/usr/bin/env node
import { spawnSync } from "./lib/safe-spawn.mjs";
import { inspectLifecycleCoherence } from "./lifecycle-coherence.mjs";
import { updateProjectStatus } from "./lib/write-project-status.mjs";

const args = new Set(process.argv.slice(2));

const blocker = spawnSync(process.execPath, ["scripts/blocker-preflight.mjs", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8"
});
if ((blocker.status ?? 1) !== 0) {
  process.stderr.write(blocker.stderr || blocker.stdout || "blocker preflight failed\n");
  process.exit(blocker.status ?? 1);
}

let blockerItems = [];
try {
  blockerItems = JSON.parse(blocker.stdout || "{}").items || [];
} catch (error) {
  console.error(`doctor could not parse blocker preflight: ${error.message}`);
  process.exit(1);
}

const lifecycle = inspectLifecycleCoherence(process.cwd());
const lifecycleItems = lifecycle.checks
  .filter((check) => !check.ok)
  .map((check) => ({
    id: `lifecycle-${check.id}`,
    status: check.blocking ? "failing" : "warning",
    blocking: check.blocking,
    detail: check.detail
  }));
const items = [...blockerItems, ...lifecycleItems];
const blockingFailing = items.filter((item) => item.blocking !== false && /fail|block/i.test(item.status || "")).length;
const warning = items.filter((item) => item.status === "warning").length;
const passing = lifecycle.checks.filter((check) => check.ok).length;
const total = passing + blockingFailing + warning;
const output = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  blockingFailing,
  failing: blockingFailing,
  warning,
  passing,
  lifecycle,
  items
};
if (args.has("--update-json")) {
  updateProjectStatus(process.cwd(), (status) => ({
    ...status,
    doctorScore: {
      blockingFailing,
      total,
      failing: blockingFailing,
      score: total ? Math.round((passing / total) * 100) : 100,
      date: new Date().toISOString().slice(0, 10),
      passing,
      warning,
      checks: items
    }
  }));
}
if (!args.has("--quiet")) console.log(JSON.stringify(output, null, 2));
if (blockingFailing) process.exitCode = 2;
