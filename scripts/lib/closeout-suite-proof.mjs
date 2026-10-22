import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from './safe-spawn.mjs';
import { discoverSuiteInventory } from './test-discovery.mjs';
import { reconcileAggregateProof } from './test-proof-reconciliation.mjs';

export function sameProjectPath(left, right, platform = process.platform) {
  const canonical = (value) => {
    const resolved = fs.realpathSync(value);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return canonical(left) === canonical(right);
}

// S366 [audit #3] — ONE predicate for "this file's result counts as verified green".
// The closeout gate and run-tests' shard-proof reuse both read it, so --resume-shards can
// never reuse a shard (e.g. one carrying a FLAKY file) that this gate would then reject.
export const VERIFIED_RESULT_STATUSES = Object.freeze(['pass', 'covered-directly']);
export function isVerifiedSuiteResult(result) {
  return Boolean(result) && VERIFIED_RESULT_STATUSES.includes(result.status) && result.total > 0 && result.pass === result.total;
}

export function assessCloseoutSuiteProof(root, proof, { anchorMs, now = Date.now() } = {}) {
  const errors = [];
  const generatedMs = Date.parse(proof?.generatedAt || '');
  if (!Number.isFinite(anchorMs)) errors.push('previous closeout anchor is unmeasured');
  if (!Number.isFinite(generatedMs) || generatedMs <= anchorMs || generatedMs > now) errors.push('complete proof must be dated after the previous closeout and not in the future');
  if (proof?.complete !== true || proof?.state !== 'complete' || (proof?.pendingShards || []).length) errors.push('full-suite shard proof is incomplete');
  const shards = Array.isArray(proof?.shards) ? proof.shards : [];
  if (!Number.isInteger(proof?.shardCount) || proof.shardCount < 1 || shards.length !== proof.shardCount
    || new Set(shards.map((row) => row.shard)).size !== proof.shardCount) errors.push('complete shard execution inventory is missing');
  // S365 [audit #3] — an absent shardCount already failed the inventory check above;
  // the loop must not invent a zero-shard proof for it, it simply has nothing to walk.
  for (let index = 1; Number.isInteger(proof?.shardCount) && index <= proof.shardCount; index++) {
    const shard = shards.find((row) => row.shard === `${index}/${proof.shardCount}`);
    const startedMs = Date.parse(shard?.executionStartedAt || '');
    if (!Number.isFinite(startedMs) || startedMs <= anchorMs || startedMs > generatedMs) errors.push(`shard ${index} did not execute after the previous closeout`);
  }
  let reconciliation;
  try { reconciliation = reconcileAggregateProof(root, proof); }
  catch (error) { reconciliation = { ok: false, errors: [`unreadable proof: ${error.message}`] }; }
  errors.push(...reconciliation.errors);
  const expected = discoverSuiteInventory(root).map((file) => path.relative(root, file.path).replace(/\\/g, '/'));
  const results = new Map((Array.isArray(proof?.results) ? proof.results : []).map((row) => [String(row.file || '').replace(/\\/g, '/'), row]));
  if (!expected.length || results.size !== expected.length) errors.push('result inventory does not cover the complete runner suite');
  for (const file of expected) {
    const result = results.get(file);
    if (!isVerifiedSuiteResult(result)) errors.push(`full-suite result not verified: ${file}`);
  }
  return { ok: errors.length === 0, errors, generatedAt: proof?.generatedAt || null, files: expected.length };
}

export function findCloseoutSuiteProof(root, { anchorMs: suppliedAnchor } = {}) {
  const anchor = spawnSync('git', ['log', '-1', '--format=%ct', '--', 'context/SELF_IMPROVEMENT_LOOP.md'], { cwd: root, encoding: 'utf8', timeout: 15_000, maxBuffer: 256 * 1024 * 1024 });
  const anchorSeconds = anchor.status === 0 && /^\d+$/.test(anchor.stdout.trim()) ? Number(anchor.stdout.trim()) : NaN;
  const anchorMs = suppliedAnchor ?? (Number.isFinite(anchorSeconds) ? anchorSeconds * 1000 : NaN);
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name === 'aggregate.json') files.push(file);
    }
  };
  walk(path.join(root, '.cache', 'test-shards'));
  const candidates = files.flatMap((file) => {
    try { const proof = JSON.parse(fs.readFileSync(file, 'utf8')); return [{ file, proof }]; } catch { return []; }
  }).sort((a, b) => Date.parse(b.proof.generatedAt) - Date.parse(a.proof.generatedAt));
  const rejected = [];
  for (const { file, proof } of candidates) {
    const result = assessCloseoutSuiteProof(root, proof, { anchorMs });
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (result.ok) return { ...result, proofPath: relative, anchorMs };
    rejected.push({ proofPath: relative, errors: result.errors.slice(0, 5) });
  }
  return { ok: false, anchorMs, errors: ['no complete source-bound full-suite proof after the previous closeout'], rejected: rejected.slice(0, 3) };
}
