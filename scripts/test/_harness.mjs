// _harness.mjs — micro test harness. No deps. Usage:
//   import {test, run, assert, assertEq, assertMatch} from './_harness.mjs';
//   test('does X', () => { ... });  // register
//   await run();                     // execute all, print, exit code
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REG = [];

// S283 — REGISTRATION-AFTER-RUN IS A SILENT GREEN.
//
// `run()` iterates REG as it stands at call time and prints `pass/REG.length`.
// A test registered AFTER that call is therefore never executed and never
// counted — and the printed line is internally consistent, so nothing looks
// wrong. Observed live: six tests appended below an existing `await run(...)`
// produced `8/8 ✓` while silently skipping all six. That is precisely the
// defect class the session was auditing — a green that omits work — and the
// suite is the instrument everything else is verified with, so it must not be
// capable of it.
//
// Two guards, because either alone leaves a hole: `test()` refuses to register
// once the run has started (loud, at the exact call site), and an exit-time
// assertion catches any path that slipped past — a `test()` inside a callback,
// a dynamic import that registers late, a second `run()`. The exit guard reads
// the REAL registry length against what was actually executed, so it cannot be
// fooled by the same off-by-registration the printed line was.
let RUN_STARTED = false;
let EXECUTED = 0;

export function test(name, fn) {
  if (RUN_STARTED) {
    // Throwing here is deliberate: a warning would be swallowed by the very
    // "looks green" output this exists to prevent.
    throw new Error(
      `test("${name}") was registered AFTER run() — it would never execute and never be counted. ` +
      `Move every test() above the run() call (it must be the last statement in the file).`,
    );
  }
  REG.push({ name, fn });
}

export function assertMatch(str, re, msg) {
  if (!re.test(str)) throw new Error(`${msg || 'no regex match'}: ${re} vs ${JSON.stringify(String(str).slice(0, 80))}`);
}
export function assertEq(a, b, msg) { assert.deepEqual(a, b, msg); }
export { assert };

// S276 — failures used to print `err.split('\n')[0]`. Any test that throws a captured
// stdout/stderr blob (139 such throws across 53 files) therefore reported its ENTIRE
// reason as `{`, the first line of pretty-printed JSON. That happened live: a stale
// workflow-manifest sourceHash was invisible until the validator was re-run by hand.
// The message is already captured in full; only the render threw it away.
const FAILURE_MAX_LINES = 20;

function indentFailure(err) {
  const lines = String(err ?? '').replace(/\s+$/, '').split('\n');
  const shown = lines.slice(0, FAILURE_MAX_LINES).map((l) => `      ${l}`);
  const hidden = lines.length - FAILURE_MAX_LINES;
  // Say what was elided rather than eliding silently — a truncated reason that does
  // not announce its truncation is how the original bug read as a complete message.
  if (hidden > 0) shown.push(`      … +${hidden} more line(s)`);
  return shown.join('\n');
}

/**
 * S326 — A SUITE YOU CANNOT IDENTIFY IS A SUITE NOBODY CAN ACT ON.
 *
 * `label` defaulted to '' and 49 suites call `run()` with no argument, so every
 * one of them printed an anonymous row — `                    12/12  ✓` — in a
 * full-suite run of several hundred files. When one of those fails, the runner
 * output names no file to open. Found while fixing tier2-render-brief-delta,
 * which was one of the 49.
 *
 * Fixing 49 call sites would leave the 50th free to reintroduce it, so the
 * default is derived here instead: the entry script's basename, which is exactly
 * the identifier a reader needs to re-run it. An explicit label still wins.
 */
function callerSuiteName() {
  try {
    const entry = process.argv[1];
    if (!entry) return 'unnamed-suite';
    return entry.split(/[\\/]/).pop().replace(/\.(mjs|js|ts)$/, '') || 'unnamed-suite';
  } catch { return 'unnamed-suite'; }
}

export async function run(label = callerSuiteName()) {
  RUN_STARTED = true;
  let pass = 0, fail = 0;
  const failures = [];
  for (const t of REG) {
    try {
      await t.fn();
      pass++;
    } catch (e) {
      fail++;
      failures.push({ name: t.name, err: e.message });
    }
  }
  const line = `${label.padEnd(32)} ${pass}/${REG.length}  ${fail ? '⛔ ' + fail + ' FAIL' : '✓'}`;
  console.log(line);
  for (const f of failures) console.log(`   ⛔ ${f.name}\n${indentFailure(f.err)}`);
  EXECUTED = pass + fail;
  recordDirectProof({ label, pass, fail, total: REG.length, failures });
  if (fail > 0) process.exit(1);
  return { pass, fail, total: REG.length, failures };
}

// Backstop for anything that slipped past the registration guard (a late
// dynamic import, a test() inside a callback, a second run()). Compares the
// registry against what actually EXECUTED, so it cannot be fooled by the same
// off-by-registration that made the printed line look consistent.
process.on('exit', (code) => {
  if (!RUN_STARTED || REG.length === EXECUTED) return;
  const skipped = REG.length - EXECUTED;
  console.error(
    `\n⛔ HARNESS: ${skipped} test(s) were registered but never executed ` +
    `(registry ${REG.length}, executed ${EXECUTED}). The printed result omitted them.`,
  );
  if (code === 0) process.exitCode = 1;   // never let a silent omission exit green
});

function recordDirectProof(result) {
  try {
    const script = process.argv[1] ? path.resolve(process.argv[1]) : null;
    if (!script || !fs.existsSync(script)) return;
    const root = findRepoRoot(process.cwd());
    if (!root) return;
    const rel = path.relative(root, script).replace(/\\/g, '/');
    if (!rel.startsWith('scripts/test/')) return;
    const stat = fs.statSync(script);
    const proofPath = path.join(root, '.cache', 'direct-test-proofs.json');
    let proofs = {};
    try { proofs = JSON.parse(fs.readFileSync(proofPath, 'utf8')); } catch { proofs = {}; }
    proofs[rel] = {
      file: rel,
      generatedAt: new Date().toISOString(),
      mtimeMs: stat.mtimeMs,
      pass: result.pass,
      total: result.total,
      fail: result.fail,
      status: result.fail === 0 ? 'pass' : 'fail',
      label: result.label || path.basename(rel, path.extname(rel)),
    };
    fs.mkdirSync(path.dirname(proofPath), { recursive: true });
    fs.writeFileSync(proofPath, JSON.stringify(proofs, null, 2) + '\n', 'utf8');
  } catch {
    // Proof receipts are observability aids; the harness result is authoritative.
  }
}

function findRepoRoot(start) {
  let cur = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const next = path.dirname(cur);
    if (next === cur) return null;
    cur = next;
  }
  return null;
}
