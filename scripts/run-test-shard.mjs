#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";
import { buildTestReceipt, parseTapSummary, writeTestReceiptAtomic } from "./lib/test-receipt.mjs";

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
    "test/action-coordinator.test.js",
    "test/advance-week-command.test.js",
    "test/authority-epoch.test.js",
    "test/beta-feedback.test.js",
    "test/contextual-feedback.test.js",
    "test/box-score-presentation.test.js",
    "test/browser-save-store.test.js",
    "test/browser-wiring.test.js",
    "test/client-diagnostics.test.js",
    "test/button-action-contracts.test.js",
    "test/league-story-export.test.js",
    "test/challenge-codes.test.js",
    "test/create-api-client.test.js",
    "test/deterministic-ids.test.js",
    "test/draft-agency.test.js",
    "test/draft-war-room.test.js",
    "test/file-save-store.test.js",
    "test/franchise-command-center.test.js",
    "test/fast-sim-checkpoints.test.js",
    "test/gm-decision-commitments.test.js",
    "test/gm-decision-authority.test.js",
    "test/gist-sync-security.test.js",
    "test/inbox-persistence.test.js",
    "test/injury-rehab-command.test.js",
    "test/launch-readiness.test.js",
    "test/local-api-runtime.test.js",
    "test/mobile-loop.test.js",
    "test/mobile-nav.test.js",
    "test/mobile-weekly-intent.test.js",
    "test/modal-manager.test.js",
    "test/opening-contract-prologue.test.js",
    "test/player-profile-narrative.test.js",
    "test/post-commit-hydration.test.js",
    "test/potential-visibility.test.js",
    "test/return-digest.test.js",
    "test/save-integrity.test.js",
    "test/session-lookup-indexes.test.js",
    "test/start-scenario.test.js",
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
    "test/api-contract-parity.test.js",
    "test/audit-renderer.test.js",
    "test/browser-module-reachability.test.js",
    "test/browser-promise-observability.test.js",
    "test/launch-evidence-report.test.js",
    "test/lifecycle-coherence.test.js",
    "test/public-compliance.test.js",
    "test/release-provenance.test.js",
    "test/session52-innovations.test.js",
    "test/session53-innovations.test.js",
    "test/session54-innovations.test.js",
    "test/staging-receipt.test.js",
    "test/test-receipt.test.js",
    "test/shard-coverage.test.js",
    "test/studio-protocol-smoke.test.js",
    "test/task-board-parser-authority.test.js"
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
    return { name, status: 1, summary: { valid: false, reason: "unknown shard" } };
  }

  console.log(`\n== ${name} shard (${files.length} files) ==`);
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-isolation=none", ...files],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    name,
    status: result.status ?? 1,
    summary: parseTapSummary(result.stdout || "")
  };
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
    const completed = [];
    for (const name of DEFAULT_SHARDS) {
      const result = runShard(name);
      completed.push(result);
      if (result.status !== 0) process.exit(result.status);
    }
    const receipt = buildTestReceipt({ root: process.cwd(), command: "all", shards: completed });
    const receiptPath = writeTestReceiptAtomic(process.cwd(), receipt);
    console.log(`\nDirect test receipt: ${receipt.passed}/${receipt.total} -> ${receiptPath}`);
    process.exit(0);
  }

  if (requested === "full") {
    for (const name of Object.keys(SHARDS)) {
      const result = runShard(name);
      if (result.status !== 0) process.exit(result.status);
    }
    process.exit(0);
  }

  process.exit(runShard(requested).status);
}
