// suite-preflight.mjs — S371 · [SIL][S370 #2] cheap whole-tree contracts before the full suite.
//
// S370 spent three 64-shard passes (about 80 minutes each) on reds its own edits had caused:
// a byte-identical argv twin, two fixture numbers that mirrored a measured value, and a
// capability declared in the live map but missing from the committed schema. Each of those
// is decided by a test that reads the WHOLE TREE and finishes in seconds. Run first, they
// turn an 80-minute discovery into a 20-second one.
//
// WHAT RUNS, AND WHY IT IS THE TEST FILE AND NOT THE LINT. Two of these lints exit non-zero
// on warnings: lint-measured-sources exits 1 on any live-ledger coincidence (20 on 2026-10-11,
// with zero under --frozen) and lint-policy-drift exits 1 on any near-twin (10, none of them
// byte-identical). A preflight that
// stopped on those exit codes would stop every run. What reddens the suite is narrower —
// zero findings under --frozen, zero pairs at similarity 1 — and those thresholds live in the
// suite's own test files. Running those files is the only form that cannot drift from the
// suite: a preflight stop is, by construction, a file the suite would have reported red.
//
// The same reasoning sets the retry: the suite re-runs a failed file once in isolation and
// counts a pass there as flaky, not red. A check stops the run only when it fails twice.
//
// Everything here is pure except runSuitePreflight, which takes its spawn as an argument.

import fs from 'node:fs';
import path from 'node:path';

/**
 * The checks, in the order they run. `file` is a suite member; `stands` names the lint or
 * contract it stands for, and `inspect` is the command that shows the finding directly.
 */
export const SUITE_PREFLIGHT_CHECKS = Object.freeze([
  {
    id: 'canon-031',
    file: 'scripts/test/tier1-observability-honesty-s161.mjs',
    stands: 'CANON-031 mirrored-literal lint (lint-measured-sources.mjs --frozen: zero findings)',
    inspect: 'node scripts/lint-measured-sources.mjs --frozen',
  },
  {
    id: 'policy-drift',
    file: 'scripts/test/tier2-policy-drift-extract.mjs',
    stands: 'twin-literal lint (lint-policy-drift.mjs: zero byte-identical pairs)',
    inspect: 'node scripts/lint-policy-drift.mjs',
  },
  {
    id: 'capability-schema',
    file: 'scripts/test/tier2-ci-capability-map.mjs',
    stands: 'capability schema export (portfolio/CAPABILITY_SCHEMA.json matches the live map name for name)',
    inspect: 'node scripts/seed-ci-capability-map.mjs --export',
  },
  {
    id: 'push-gates',
    file: 'scripts/test/tier2-push-gates.mjs',
    stands: 'push gates (every tree-wide gate the pre-push hook executes)',
    inspect: 'node scripts/test/tier2-push-gates.mjs',
  },
  // S371 — the first full pass with the preflight still went red on these two, 80 minutes
  // in: a fixture string read as a real import, and a persisted doctor score past 24h
  // (the same stale-score red S370 paid a pass for). Both take seconds to read.
  {
    id: 'test-imports',
    file: 'scripts/test/tier2-test-import-resolution.mjs',
    stands: 'every named import in scripts/test resolves (a fixture import line counts)',
    inspect: 'node scripts/test/tier2-test-import-resolution.mjs',
  },
  {
    id: 'doctor-score-fresh',
    file: 'scripts/test/tier2-doctor-score-coherence.mjs',
    stands: 'persisted doctorScore is under 24h old (refresh: node scripts/ops.mjs doctor --update-json)',
    inspect: 'node scripts/test/tier2-doctor-score-coherence.mjs',
  },
]);

export const PREFLIGHT_SKIP_FLAG = '--no-preflight';
/** One file's budget. The four checks measured 3–6s each on 2026-10-11; this is a ceiling. */
export const PREFLIGHT_FILE_TIMEOUT_MS = 180_000;

/**
 * Does this invocation get a preflight?
 *
 * Only a run of the WHOLE suite: the single-process full run and the sharded aggregate.
 * Not a child shard (the aggregate already ran it), not a manual single shard or a --tier
 * run (the operator chose a subset), not --changed (it has its own selector, which already
 * carries every tier1 file and the twin lint, under a 120s budget), and not hosted CI,
 * whose job is to report the whole suite rather than to save a workstation's time.
 *
 * @returns {{run:boolean, reason:string}}
 */
export function preflightApplies({ skipFlag = false, changed = false, shardSpec = '', tier = null, ci = false, available = null } = {}) {
  // run-tests.mjs is a propagated protocol script, and the check files are studio-ops
  // tests. On a checkout that has none of them there is nothing to run and nothing to say.
  if (available === 0) return { run: false, reason: 'no whole-tree contract test on this checkout' };
  if (skipFlag) return { run: false, reason: `skipped by ${PREFLIGHT_SKIP_FLAG}` };
  if (shardSpec) return { run: false, reason: 'single shard — the aggregate run owns the preflight' };
  if (changed) return { run: false, reason: '--changed selects its own contract tests' };
  if (tier) return { run: false, reason: `--tier=${tier} is a chosen subset` };
  if (ci) return { run: false, reason: 'hosted CI reports the whole suite' };
  return { run: true, reason: 'full suite' };
}

/** How many of the check files exist under `root`. */
export function availablePreflightChecks(root, checks = SUITE_PREFLIGHT_CHECKS) {
  return checks.filter((check) => fs.existsSync(path.join(root, check.file))).length;
}

/**
 * One attempt at one check, from a spawnSync result. A timeout or a spawn that never
 * started produced no verdict; it is neither a pass nor a red.
 * @returns {{state:'pass'|'red'|'unmeasured', exitStatus:number|null, detail:string}}
 */
export function classifyPreflightAttempt(res) {
  const exitStatus = Number.isInteger(res?.status) ? res.status : null;
  if (res?.error || exitStatus === null || res?.signal) {
    const why = res?.error?.code || res?.error?.message || (res?.signal ? `signal ${res.signal}` : 'no exit status');
    return { state: 'unmeasured', exitStatus, detail: `no verdict (${why})` };
  }
  return exitStatus === 0
    ? { state: 'pass', exitStatus, detail: 'exit 0' }
    : { state: 'red', exitStatus, detail: `exit ${exitStatus}` };
}

/** Is a second attempt owed? Only after a red first one — parity with the suite's isolation retry. */
export function preflightRetryOwed(attempts) {
  return attempts.length === 1 && attempts[0].state === 'red';
}

/**
 * The verdict over every check's attempts.
 *
 *   red        every attempt ran and failed (two of them)          → stops the run
 *   pass       some attempt exited 0
 *   unmeasured the deciding attempt produced no verdict            → named, does not stop
 *   skipped    not run on this host (file absent / deferred)       → named, does not stop
 *
 * Unmeasured does not stop because the suite would not call that file red either: a file
 * that cannot be spawned is env-blocked there, and a timeout is inconclusive.
 *
 * @param {{id:string,file:string,stands:string,inspect?:string,attempts?:object[],skipped?:string}[]} rows
 */
export function judgePreflight(rows) {
  const checks = (rows || []).map((row) => {
    const attempts = row.attempts || [];
    let state;
    if (row.skipped) state = 'skipped';
    else if (attempts.length === 0) state = 'unmeasured';
    else if (attempts.some((a) => a.state === 'pass')) state = 'pass';
    else if (attempts.length >= 2 && attempts.every((a) => a.state === 'red')) state = 'red';
    else state = 'unmeasured';
    return {
      id: row.id, file: row.file, stands: row.stands, inspect: row.inspect || null, state,
      flaky: state === 'pass' && attempts.length > 1,
      exitStatuses: attempts.map((a) => a.exitStatus),
      detail: row.skipped || (attempts.length ? attempts[attempts.length - 1].detail : 'not run'),
      outputTail: attempts.length ? String(attempts[attempts.length - 1].outputTail || '') : '',
    };
  });
  const stoppedBy = checks.filter((c) => c.state === 'red');
  return {
    stop: stoppedBy.length > 0,
    stoppedBy,
    unmeasured: checks.filter((c) => c.state === 'unmeasured'),
    skipped: checks.filter((c) => c.state === 'skipped'),
    passed: checks.filter((c) => c.state === 'pass'),
    checks,
  };
}

/** Lines for stderr. Names which check stopped the run and how to see the finding. */
export function formatPreflight(judgement, { durationMs = null } = {}) {
  const lines = [];
  const took = Number.isFinite(durationMs) ? ` in ${(durationMs / 1000).toFixed(1)}s` : '';
  for (const c of judgement.checks) {
    const mark = c.state === 'pass' ? (c.flaky ? '⚠' : '✓') : c.state === 'red' ? '⛔' : c.state === 'skipped' ? '⏸' : '◐';
    const note = c.state === 'pass' ? (c.flaky ? ' (failed once, passed on retry)' : '')
      : c.state === 'red' ? ` — ${c.detail}, twice`
      : ` — ${c.detail}`;
    lines.push(`  ${mark} preflight ${c.id.padEnd(18)} ${c.file}${note}`);
  }
  if (judgement.stop) {
    lines.push(`⛔ suite preflight STOPPED the run before any test shard${took}: ${judgement.stoppedBy.map((c) => c.id).join(', ')}`);
    for (const c of judgement.stoppedBy) {
      lines.push(`   ${c.id} — ${c.stands}`);
      for (const tail of c.outputTail.split(/\r?\n/).filter((l) => l.trim()).slice(-8)) lines.push(`      ${tail}`);
      lines.push(`      see it: node ${c.file}${c.inspect ? `   ·   ${c.inspect}` : ''}`);
    }
    lines.push(`   The suite would report these same file(s) red. Fix them, or pass ${PREFLIGHT_SKIP_FLAG} to run the suite anyway.`);
  } else {
    const parts = [`${judgement.passed.length} passed`];
    if (judgement.unmeasured.length) parts.push(`${judgement.unmeasured.length} unmeasured (no verdict — NOT a pass)`);
    if (judgement.skipped.length) parts.push(`${judgement.skipped.length} not run here`);
    lines.push(`✓ suite preflight${took}: ${parts.join(' · ')} — continuing to the suite`);
  }
  return lines;
}

/**
 * What a stopped preflight writes to the live failures sidecar. The runner empties that
 * ledger when a run starts, and an empty ledger reads as "nothing failed" to the doctor and
 * launch-control readers (lib/test-sidecar-summary.mjs); a stopped run must leave the red
 * it found there, closed by a summary that is not ok.
 */
export function preflightFailureRecords(judgement) {
  const failed = judgement.stoppedBy.map((c) => ({
    phase: 'retry',
    file: c.file,
    tier: (/tier(\d)/.exec(path.basename(c.file)) || [])[1] || '?',
    status: 'fail',
    preflight: c.id,
    cause: `suite preflight (${c.id}): ${c.outputTail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || c.detail}`.slice(0, 240),
  }));
  return [
    ...failed,
    { phase: 'summary', preflightStopped: true, totalPass: 0, totalAll: 0, files: failed.length, failures: failed.length, flaky: 0, inconclusive: 0, envBlocked: 0, deferred: 0, ok: false },
  ];
}

/** The compact record a run publishes about its preflight. */
export function preflightRecord(judgement, { durationMs = null } = {}) {
  return {
    ran: true,
    stopped: judgement.stop,
    durationMs,
    checks: judgement.checks.map((c) => ({ id: c.id, file: c.file, state: c.state, exitStatuses: c.exitStatuses, flaky: c.flaky })),
  };
}

/**
 * Run the checks. Each is a plain `node <file>` child with no shell; the exit status is read
 * from the spawn result itself.
 *
 * @param {object} o
 * @param {string} o.root
 * @param {Function} o.spawnSync            (cmd, args, opts) → {status, signal, error, stdout, stderr}
 * @param {Function} [o.notRunHere]         (check) → string reason, or '' to run it
 * @param {Function} [o.onCheck]            called with each finished row (progress)
 */
export function runSuitePreflight({ root, spawnSync, checks = SUITE_PREFLIGHT_CHECKS, execPath = process.execPath, notRunHere = () => '', onCheck = () => {}, timeoutMs = PREFLIGHT_FILE_TIMEOUT_MS, now = Date.now } = {}) {
  const startedAt = now();
  const rows = [];
  for (const check of checks) {
    const abs = path.join(root, check.file);
    const row = { ...check, attempts: [] };
    const reason = !fs.existsSync(abs) ? 'file absent on this checkout' : notRunHere(check);
    if (reason) {
      row.skipped = reason;
    } else {
      do {
        const res = spawnSync(execPath, [abs], { cwd: root, encoding: 'utf8', timeout: timeoutMs, shell: false, windowsHide: true });
        const out = `${res?.stdout || ''}${res?.stderr || ''}`;
        row.attempts.push({ ...classifyPreflightAttempt(res), outputTail: out.trim().split(/\r?\n/).slice(-12).join('\n') });
      } while (preflightRetryOwed(row.attempts));
    }
    rows.push(row);
    onCheck(row);
  }
  const durationMs = now() - startedAt;
  const judgement = judgePreflight(rows);
  return { judgement, durationMs, lines: formatPreflight(judgement, { durationMs }), record: preflightRecord(judgement, { durationMs }) };
}
