#!/usr/bin/env node
/**
 * import-ci-test-receipt.mjs — let hosted CI stand as the local test receipt.
 *
 * The startup brief reports "Tests STALE" whenever .cache/test-count.json is
 * missing, even when hosted CI has just run every shard green on the same
 * commit. Re-running a 45-minute suite locally only to restate that result is
 * waste, so this reads the result instead.
 *
 * It refuses unless all of these hold, because the receipt is bound to the
 * exact files on disk:
 *   - the working tree is clean and HEAD is the requested commit;
 *   - a CI run for that commit completed successfully;
 *   - every required unit-shard job succeeded and printed totals that
 *     reconcile (tests = pass + fail + cancelled, fail = 0).
 *
 * The totals are parsed from each job's own log, never estimated, and the
 * receipt records which hosted run they came from.
 *
 * Usage: node scripts/import-ci-test-receipt.mjs [--sha <40-hex>] [--dry-run]
 */
import path from "node:path";
import { execFileSync } from "./lib/safe-spawn.mjs";
import { fileURLToPath } from "node:url";
import { buildTestReceipt, parseTapSummary, writeTestReceiptAtomic } from "./lib/test-receipt.mjs";
import { DEFAULT_SHARDS } from "./run-test-shard.mjs";

const JOB_NAME = /^unit-shards \(([a-z:]+)\)$/;
const shardKey = (label) => label.replace(/:/g, "-");

/** Strip the "job<TAB>step<TAB>timestamp " prefix GitHub puts on every log line. */
export function stripLogPrefix(log) {
  return String(log).split(/\r?\n/).map((line) => line.replace(/^[^\t]*\t[^\t]*\t\S+ /, "")).join("\n");
}

/**
 * Turn hosted job results into the shard list a receipt is built from.
 * `jobs` is [{ name, conclusion, log }]. Throws on anything short of a
 * complete, green, reconciled set, so a partial run can never become a receipt.
 */
export function shardsFromCiJobs(jobs, requiredShards = DEFAULT_SHARDS) {
  const byShard = new Map();
  for (const job of jobs) {
    const label = JOB_NAME.exec(job.name || "")?.[1];
    if (!label) continue;
    const key = shardKey(label);
    if (byShard.has(key)) throw new Error(`Hosted run reports the ${key} shard more than once.`);
    byShard.set(key, job);
  }
  return requiredShards.map((name) => {
    const job = byShard.get(name);
    if (!job) throw new Error(`Hosted run has no job for the ${name} shard.`);
    if (job.conclusion !== "success") throw new Error(`Hosted ${name} shard concluded ${job.conclusion || "unknown"}.`);
    const summary = parseTapSummary(stripLogPrefix(job.log));
    if (!summary.valid) throw new Error(`Hosted ${name} shard totals are unusable: ${summary.reason}`);
    if (summary.fail !== 0 || summary.pass !== summary.tests) throw new Error(`Hosted ${name} shard is not fully green (${summary.pass}/${summary.tests}).`);
    return { name, status: 0, summary };
  });
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}
function gh(root, ...args) {
  return execFileSync("gh", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true });
}

export function importCiTestReceipt({ root, sha, dryRun = false, run = { git, gh } }) {
  const head = run.git(root, "rev-parse", "HEAD");
  const target = sha || head;
  if (!/^[a-f0-9]{40}$/.test(target)) throw new Error("A full 40-character commit is required.");
  if (head !== target) throw new Error(`HEAD is ${head.slice(0, 8)}, not ${target.slice(0, 8)}; check out the commit the hosted run tested.`);
  if (run.git(root, "status", "--porcelain")) throw new Error("The working tree has changes; a hosted result only describes the committed files.");
  const runs = JSON.parse(run.gh(root, "run", "list", "--workflow", "CI", "--commit", target, "--json", "databaseId,status,conclusion,attempt,headSha", "--limit", "20"));
  const green = runs.find((entry) => entry.headSha === target && entry.status === "completed" && entry.conclusion === "success");
  if (!green) throw new Error(`No completed, successful CI run for ${target.slice(0, 8)}.`);
  const jobs = JSON.parse(run.gh(root, "run", "view", String(green.databaseId), "--json", "jobs")).jobs
    .filter((job) => JOB_NAME.test(job.name || ""))
    .map((job) => ({ name: job.name, conclusion: job.conclusion, log: run.gh(root, "run", "view", String(green.databaseId), "--job", String(job.databaseId), "--log") }));
  const shards = shardsFromCiJobs(jobs);
  const receipt = {
    ...buildTestReceipt({ root, command: "all", shards, sourceRevision: target }),
    origin: { type: "hosted-ci", workflow: "CI", runId: green.databaseId, attempt: green.attempt ?? 1 }
  };
  if (!dryRun) writeTestReceiptAtomic(root, receipt);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const shaIndex = process.argv.indexOf("--sha");
  try {
    const receipt = importCiTestReceipt({ root, sha: shaIndex >= 0 ? process.argv[shaIndex + 1] : null, dryRun: process.argv.includes("--dry-run") });
    console.log(`Hosted CI run ${receipt.origin.runId} for ${receipt.sourceRevision.slice(0, 8)}: ${receipt.passed}/${receipt.total} across ${receipt.shards.length} shards${process.argv.includes("--dry-run") ? " (dry run, nothing written)" : " — receipt written"}.`);
  } catch (error) {
    console.error(`No receipt written: ${error.message}`);
    process.exitCode = 1;
  }
}
