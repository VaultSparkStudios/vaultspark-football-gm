#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";
import { buildTestReceipt, parseTapSummary, writeTestReceiptAtomic } from "./lib/test-receipt.mjs";
import {
  buildTestProgress,
  clearTestProgress,
  inspectTestProgress,
  resolveShardTimeoutMs,
  writeTestProgressAtomic
} from "./lib/test-progress.mjs";

export const SHARDS = {
  core: [
    "test/api.test.js",
    "test/architect-mastery-portfolio.test.js",
    "test/calibration.test.js",
    "test/coverage-depth-ratings.test.js",
    "test/generated-league-presentation.test.js",
    "test/offseason-calendar.test.js",
    "test/offseason-surfaces.test.js",
    "test/pass-structure-regression.test.js",
    "test/progression-parity.test.js",
    "test/quarterback-depth-ratings.test.js",
    "test/ratings-regression.test.js",
    "test/s4-systems.test.js",
    "test/season-value-authority.test.js",
    "test/situational-playcalling.test.js",
    "test/snapshot-migration.test.js",
    "test/standings-tiebreaker.test.js",
    "test/stats-regression.test.js",
    "test/world-state-next-step.test.js"
  ],
  runtime: [
    "test/action-coordinator.test.js",
    "test/advance-week-command.test.js",
    "test/architect-focus-review.test.js",
    "test/architect-focus-review-browser.test.js",
    "test/architect-plan-rehearsal.test.js",
    "test/architect-thesis-handler.test.js",
    "test/architect-thesis.test.js",
    "test/architect-thesis-browser-wiring.test.js",
    "test/authority-epoch.test.js",
    "test/browser-memory-scope.test.js",
    "test/reward-layer.test.js",
    "test/rival-gm-persona.test.js",
    "test/beta-feedback.test.js",
    "test/contextual-feedback.test.js",
    "test/box-score-presentation.test.js",
    "test/browser-save-store.test.js",
    "test/hybrid-save-store.test.js",
    "test/browser-wiring.test.js",
    "test/client-diagnostics.test.js",
    "test/button-action-contracts.test.js",
    "test/league-story-export.test.js",
    "test/challenge-codes.test.js",
    "test/coaching-lineage-authority.test.js",
    "test/create-api-client.test.js",
    "test/deterministic-ids.test.js",
    "test/draft-agency.test.js",
    "test/draft-war-room.test.js",
    "test/file-save-store.test.js",
    "test/franchise-command-center.test.js",
    "test/franchise-scope-contract.test.js",
    "test/fast-sim-checkpoints.test.js",
    "test/fast-sim-architect-policy.test.js",
    "test/gm-decision-commitments.test.js",
    "test/gm-decision-authority.test.js",
    "test/gm-decision-expansion.test.js",
    "test/gist-sync-security.test.js",
    "test/fa-market-competition.test.js",
    "test/owner-confidence.test.js",
    "test/rival-trade-offers.test.js",
    "test/milestone-moments.test.js",
    "test/opening-contract-recovery.test.js",
    "test/second-order-s62.test.js",
    "test/second-order-s63.test.js",
    "test/inbox-persistence.test.js",
    "test/innovation-candidate-dedup.test.js",
    "test/injury-rehab-command.test.js",
    "test/launch-readiness.test.js",
    "test/local-api-runtime.test.js",
    "test/mobile-loop.test.js",
    "test/tablet-decision-deck.test.js",
    "test/mobile-weekly-intent.test.js",
    "test/modal-manager.test.js",
    "test/opening-contract-prologue.test.js",
    "test/opening-contract-choice-matrix.test.js",
    "test/player-profile-narrative.test.js",
    "test/playtest-journey.test.js",
    "test/post-commit-hydration.test.js",
    "test/potential-visibility.test.js",
    "test/progressive-week-room.test.js",
    "test/return-digest.test.js",
    "test/franchise-scope.test.js",
    "test/season-chapters.test.js",
    "test/save-integrity.test.js",
    "test/session-lookup-indexes.test.js",
    "test/franchise-authority.test.js",
    "test/server-routes.test.js",
    "test/save-payload-budget.test.js",
    "test/snapshot-codec.test.js",
    "test/press-room-truth.test.js",
    "test/opponent-aware-gameplanning.test.js",
    "test/interactive-press-conference.test.js",
    "test/coaching-market.test.js",
    "test/service-authority.test.js",
    "test/start-scenario.test.js",
    "test/tactical-film-room.test.js",
    "test/tab-hydration.test.js",
    "test/session8-contract-edges.test.js",
    "test/session8-endpoints.test.js",
    "test/trade-deadline-frenzy.test.js",
    "test/trade-plan-authority.test.js",
    "test/trade-plan-browser-wiring.test.js",
    "test/weekly-plan-composer.test.js"
  ],
  "sim-contract": [
    "test/bootstrap-realism-profile.test.js",
    "test/continuity-ledger.test.js",
    "test/home-field-advantage.test.js",
    "test/injury-eligibility.test.js",
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
    "test/capability-operations-authority.test.js",
    "test/closeout-board-truth.test.js",
    "test/context-meter-authority.test.js",
    "test/edge-security-policy.test.js",
    "test/edge-style-hash.test.js",
    "test/edge-policy-application.test.js",
    "test/launch-evidence-report.test.js",
    "test/lifecycle-coherence.test.js",
    "test/public-compliance.test.js",
    "test/project-authority-contract.test.js",
    "test/release-provenance.test.js",
    "test/release-truth.test.js",
    "test/secrets-gateway-authority.test.js",
    "test/session52-innovations.test.js",
    "test/session53-innovations.test.js",
    "test/session54-innovations.test.js",
    "test/staging-authority-reconcile.test.js",
    "test/staging-receipt.test.js",
    "test/static-module-roots.test.js",
    "test/service-worker-precache.test.js",
    "test/test-receipt.test.js",
    "test/test-shard-progress.test.js",
    "test/shard-coverage.test.js",
    "test/duplicate-pr-guard.test.js",
    "test/studio-protocol-smoke.test.js",
    "test/startup-authority-contract.test.js",
    "test/session-intent-classifier.test.js",
    "test/task-board-parser-authority.test.js"
  ]
};

const DEFAULT_SHARDS = ["core", "runtime", "sim-contract", "sim-realism", "studio"];

function usage() {
  const names = Object.keys(SHARDS).join("|");
  console.error(`Usage: node scripts/run-test-shard.mjs <${names}|all|list>`);
}

export function runShard(name, { timeoutMs = resolveShardTimeoutMs() } = {}) {
  const files = SHARDS[name];
  if (!files) {
    usage();
    return { name, status: 1, summary: { valid: false, reason: "unknown shard" } };
  }

  console.log(`\n== ${name} shard (${files.length} files) ==`);
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    // Several integration files intentionally own listeners/timers after their
    // assertions finish. Node 24 otherwise waits forever even after emitting a
    // complete green TAP summary, preventing the atomic receipt from existing.
    ["--test", "--test-isolation=none", "--test-force-exit", ...files],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs, killSignal: "SIGTERM" }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const durationMs = Date.now() - startedAt;
  const timedOut = result.error?.code === "ETIMEDOUT";
  const summary = parseTapSummary(result.stdout || "");
  summary.durationMs = durationMs;
  if (timedOut) {
    summary.valid = false;
    summary.reason = `Shard exceeded the bounded ${timeoutMs}ms timeout.`;
  }
  return {
    name,
    status: timedOut ? 124 : (result.status ?? 1),
    timedOut,
    durationMs,
    summary
  };
}

function executeWithProgress(command, shardNames, { writeGreenReceipt = false } = {}) {
  const root = process.cwd();
  const startedAt = new Date().toISOString();
  const timeoutMs = resolveShardTimeoutMs();
  const completed = [];
  const update = (status, currentShard, failure = null) => writeTestProgressAtomic(root, buildTestProgress({
    command,
    requestedShards: shardNames,
    completedShards: completed,
    currentShard,
    status,
    startedAt,
    timeoutMs,
    failure
  }));

  for (const name of shardNames) {
    update("running", name);
    const result = runShard(name, { timeoutMs });
    completed.push(result);
    if (result.status !== 0) {
      update(result.timedOut ? "timed-out" : "failed", name, {
        shard: name,
        exitCode: result.status,
        reason: result.summary?.reason || "shard failed"
      });
      return result.status;
    }
    update("running", null);
  }

  if (writeGreenReceipt) {
    const receipt = buildTestReceipt({ root, command, shards: completed });
    const receiptPath = writeTestReceiptAtomic(root, receipt);
    console.log(`\nDirect test receipt: ${receipt.passed}/${receipt.total} -> ${receiptPath}`);
  }
  clearTestProgress(root);
  return 0;
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

  if (requested === "status") {
    console.log(JSON.stringify(inspectTestProgress(process.cwd()), null, 2));
    process.exit(0);
  }

  if (requested === "all") {
    process.exit(executeWithProgress("all", DEFAULT_SHARDS, { writeGreenReceipt: true }));
  }

  if (requested === "full") {
    process.exit(executeWithProgress("full", Object.keys(SHARDS)));
  }

  process.exit(executeWithProgress(requested, [requested]));
}
