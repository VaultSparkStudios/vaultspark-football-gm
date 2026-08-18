import fs from "node:fs";
import path from "node:path";

export const TEST_PROGRESS_SCHEMA_VERSION = "1.0";
export const TEST_PROGRESS_RELATIVE_PATH = path.join(".cache", "test-progress.json");
/**
 * S90 — raised from 20 to 45 minutes when `long` joined the canonical shards.
 * The career-realism decade alone runs ~12 minutes and the whole `long` shard
 * lands near 16-18; a 20-minute ceiling made an honest slow shard a coin flip,
 * and a timeout reads as a failure. A generous ceiling that never lies is worth
 * more than a tight one that sometimes does.
 */
export const DEFAULT_SHARD_TIMEOUT_MS = 45 * 60 * 1000;

export function resolveShardTimeoutMs(value = process.env.TEST_SHARD_TIMEOUT_MS) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? Math.floor(parsed) : DEFAULT_SHARD_TIMEOUT_MS;
}

export function buildTestProgress({
  command,
  requestedShards = [],
  completedShards = [],
  currentShard = null,
  status = "running",
  startedAt,
  updatedAt = new Date().toISOString(),
  runnerPid = process.pid,
  timeoutMs = DEFAULT_SHARD_TIMEOUT_MS,
  failure = null
} = {}) {
  return {
    schemaVersion: TEST_PROGRESS_SCHEMA_VERSION,
    kind: "direct-test-progress",
    authoritative: false,
    status,
    command,
    requestedShards,
    completedShards: completedShards.map((entry) => ({
      name: entry.name,
      status: entry.status,
      passed: entry.summary?.pass ?? null,
      total: entry.summary?.tests ?? null,
      durationMs: entry.durationMs ?? entry.summary?.durationMs ?? null
    })),
    currentShard,
    runnerPid,
    timeoutMs,
    startedAt,
    updatedAt,
    failure,
    disclaimer: "This is partial execution evidence, never a green test receipt. Only .cache/test-count.json can prove a complete source-bound run."
  };
}

export function writeTestProgressAtomic(root, progress) {
  const target = path.join(root, TEST_PROGRESS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
  return target;
}

export function clearTestProgress(root) {
  const target = path.join(root, TEST_PROGRESS_RELATIVE_PATH);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

export function inspectTestProgress(root = process.cwd(), { now = Date.now(), staleAfterMs = DEFAULT_SHARD_TIMEOUT_MS * 2 } = {}) {
  const target = path.join(root, TEST_PROGRESS_RELATIVE_PATH);
  if (!fs.existsSync(target)) return { exists: false, authoritative: false, target, reason: "progress receipt missing" };
  try {
    const progress = JSON.parse(fs.readFileSync(target, "utf8"));
    const updatedAtMs = Date.parse(progress.updatedAt);
    const valid = progress.schemaVersion === TEST_PROGRESS_SCHEMA_VERSION
      && progress.kind === "direct-test-progress"
      && progress.authoritative === false
      && ["running", "failed", "timed-out"].includes(progress.status)
      && Number.isInteger(progress.runnerPid);
    const stale = !Number.isFinite(updatedAtMs) || now - updatedAtMs > staleAfterMs;
    return {
      exists: true,
      valid,
      stale,
      authoritative: false,
      reason: !valid ? "progress receipt schema invalid" : stale ? "progress receipt is stale" : null,
      progress,
      target
    };
  } catch (error) {
    return { exists: true, valid: false, stale: true, authoritative: false, target, reason: error.message };
  }
}
