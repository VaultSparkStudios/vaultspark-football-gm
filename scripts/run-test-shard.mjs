#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";

export const SHARDS = {
  core: [
    "test/api.test.js",
    "test/calibration.test.js",
    "test/coverage-depth-ratings.test.js",
    "test/generated-league-presentation.test.js",
    "test/pass-structure-regression.test.js",
    "test/quarterback-depth-ratings.test.js",
    "test/ratings-regression.test.js",
    "test/s4-systems.test.js",
    "test/situational-playcalling.test.js",
    "test/snapshot-migration.test.js",
    "test/standings-tiebreaker.test.js",
    "test/stats-regression.test.js",
    "test/world-state-next-step.test.js"
  ],
  runtime: [
    "test/advance-week-command.test.js",
    "test/authority-epoch.test.js",
    "test/beta-feedback.test.js",
    "test/box-score-presentation.test.js",
    "test/browser-save-store.test.js",
    "test/browser-wiring.test.js",
    "test/button-action-contracts.test.js",
    "test/league-story-export.test.js",
    "test/challenge-codes.test.js",
    "test/create-api-client.test.js",
    "test/deterministic-ids.test.js",
    "test/draft-war-room.test.js",
    "test/file-save-store.test.js",
    "test/fast-sim-checkpoints.test.js",
    "test/gm-decision-commitments.test.js",
    "test/gist-sync-security.test.js",
    "test/inbox-persistence.test.js",
    "test/injury-rehab-command.test.js",
    "test/launch-readiness.test.js",
    "test/local-api-runtime.test.js",
    "test/mobile-loop.test.js",
    "test/modal-manager.test.js",
    "test/player-profile-narrative.test.js",
    "test/potential-visibility.test.js",
    "test/return-digest.test.js",
    "test/save-integrity.test.js",
    "test/session-lookup-indexes.test.js",
    "test/tactical-film-room.test.js",
    "test/session8-contract-edges.test.js",
    "test/session8-endpoints.test.js",
    "test/trade-deadline-frenzy.test.js"
  ],
  "sim-contract": [
    "test/bootstrap-realism-profile.test.js",
    "test/continuity-ledger.test.js",
    "test/determinism-smoke.test.js",
    "test/e2e-session.test.js",
    "test/feature-pack-v1.test.js",
    "test/new-systems.test.js",
    "test/scouting-skill-reveal.test.js",
    "test/session-actions.test.js",
    "test/snap-allocation.test.js",
    "test/session20-features.test.js",
    "test/strategy-contract-scouting.test.js",
    "test/time-capsule.test.js",
    "test/what-if-replay.test.js"
  ],
  "sim-realism": [
    "test/monte-carlo-regression.test.js"
  ],
  long: [
    "test/determinism.test.js",
    "test/realism-career-regression.test.js"
  ],
  studio: [
    "test/audit-renderer.test.js",
    "test/launch-evidence-report.test.js",
    "test/lifecycle-coherence.test.js",
    "test/public-compliance.test.js",
    "test/release-provenance.test.js",
    "test/shard-coverage.test.js",
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

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
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
}
