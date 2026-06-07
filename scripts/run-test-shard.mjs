#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const SHARDS = {
  core: [
    "test/api.test.js",
    "test/calibration.test.js",
    "test/coverage-depth-ratings.test.js",
    "test/generated-league-presentation.test.js",
    "test/pass-structure-regression.test.js",
    "test/quarterback-depth-ratings.test.js",
    "test/ratings-regression.test.js",
    "test/s4-systems.test.js",
    "test/snapshot-migration.test.js",
    "test/standings-tiebreaker.test.js",
    "test/stats-regression.test.js",
    "test/world-state-next-step.test.js"
  ],
  runtime: [
    "test/beta-feedback.test.js",
    "test/browser-save-store.test.js",
    "test/challenge-codes.test.js",
    "test/create-api-client.test.js",
    "test/draft-war-room.test.js",
    "test/file-save-store.test.js",
    "test/launch-readiness.test.js",
    "test/local-api-runtime.test.js",
    "test/save-integrity.test.js",
    "test/session-lookup-indexes.test.js",
    "test/session8-contract-edges.test.js",
    "test/session8-endpoints.test.js"
  ],
  "sim-contract": [
    "test/bootstrap-realism-profile.test.js",
    "test/e2e-session.test.js",
    "test/feature-pack-v1.test.js",
    "test/new-systems.test.js",
    "test/session-actions.test.js",
    "test/strategy-contract-scouting.test.js"
  ],
  "sim-realism": [
    "test/monte-carlo-regression.test.js"
  ],
  long: [
    "test/determinism.test.js",
    "test/realism-career-regression.test.js"
  ],
  studio: [
    "test/studio-protocol-smoke.test.js"
  ]
};

const DEFAULT_SHARDS = ["core", "runtime", "sim-contract", "sim-realism", "studio"];

function usage() {
  const names = Object.keys(SHARDS).join("|");
  console.error(`Usage: node scripts/run-test-shard.mjs <${names}|all|list>`);
}

function runShard(name) {
  const files = SHARDS[name];
  if (!files) {
    usage();
    return 1;
  }

  console.log(`\n== ${name} shard (${files.length} files) ==`);
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-isolation=none", ...files],
    { stdio: "inherit" }
  );
  return result.status ?? 1;
}

const requested = process.argv[2] || "all";

if (requested === "list") {
  for (const [name, files] of Object.entries(SHARDS)) {
    console.log(`${name}: ${files.join(", ")}`);
  }
  process.exit(0);
}

if (requested === "all") {
  for (const name of DEFAULT_SHARDS) {
    const status = runShard(name);
    if (status !== 0) process.exit(status);
  }
  process.exit(0);
}

if (requested === "full") {
  for (const name of Object.keys(SHARDS)) {
    const status = runShard(name);
    if (status !== 0) process.exit(status);
  }
  process.exit(0);
}

process.exit(runShard(requested));
