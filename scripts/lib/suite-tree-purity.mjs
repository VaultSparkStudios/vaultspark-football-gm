// suite-tree-purity.mjs — S305 [audit #3] · [SIL][S304 #1] · adopted-with-review from Obelisk W271.
//
// Measures whether the suite left the tracked tree byte-identical, AROUND THE SPAWN THE
// CLOSEOUT ALREADY PERFORMS (refresh-test-count.mjs) — no second suite run. Three rules the
// deferral in S304 named:
//   · report the DELTA between two snapshots, so a pre-existing dirty tree is never blamed on
//     the suite;
//   · an unanswerable git is UNMEASURABLE, never clean;
//   · disclose that attribution is PRESUMPTIVE — a concurrent writer inside the window is
//     indistinguishable from the suite.

/** git status --porcelain --untracked-files=no → Map(path → xy code). */
export function parsePorcelain(text) {
  const m = new Map();
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const code = raw.slice(0, 2);
    let p = raw.slice(3).trim();
    if (p.includes(' -> ')) p = p.split(' -> ').pop();
    m.set(p.replace(/\\/g, '/'), code);
  }
  return m;
}

// S372 [audit #8] — the bound is stated, not inherited. spawnSync's default maxBuffer is 1 MB;
// past it the child is killed and the read comes back as an error. That already resolves to
// UNMEASURABLE below (never an empty, clean-looking snapshot), but this module propagates to
// every recipient and a recipient's git-maxbuffer guard refuses a git read that leaves the
// question unasked (Seamline). 64 MB is far beyond any porcelain listing of tracked paths.
export const GIT_STATUS_MAX_BUFFER = 64 * 1024 * 1024;

export function snapshotTrackedTree({ spawnSync, cwd }) {
  try {
    const r = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: GIT_STATUS_MAX_BUFFER });
    if (r.error || r.status !== 0) return { ok: false, text: null, error: r.error?.message || `git exit ${r.status}` };
    return { ok: true, text: r.stdout, error: null, fingerprints: fingerprintDirtyPaths({ spawnSync, cwd, text: r.stdout }) };
  } catch (e) { return { ok: false, text: null, error: e.message }; }
}

/**
 * S385 [audit #2] · [SIL:3⛔][S381 #1] — BYTE fingerprints, scoped to paths already dirty.
 *
 * Status codes cannot see a suite that rewrites a file which was ALREADY dirty: ' M' before,
 * ' M' after, different bytes, reported clean. Each dirty, non-deleted path is hashed as raw
 * working-tree bytes (`--no-filters`, so a CRLF-only rewrite counts too) in one git call.
 * Scope is deliberate: a clean path that changes already shows up as a new status code.
 * A path git could not hash maps to null — unfingerprinted, never "unchanged".
 *
 * @returns {Record<string,string|null>|null} null when the hash read itself failed
 */
export function fingerprintDirtyPaths({ spawnSync, cwd, text }) {
  const paths = [...parsePorcelain(text)].filter(([, code]) => !code.includes('D')).map(([p]) => p);
  if (paths.length === 0) return {};
  try {
    const r = spawnSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd, encoding: 'utf8', windowsHide: true, input: `${paths.join('\n')}\n`, maxBuffer: GIT_STATUS_MAX_BUFFER });
    if (r.error || r.status !== 0) return null;
    const ids = String(r.stdout || '').split(/\r?\n/).filter(Boolean);
    if (ids.length !== paths.length) return null;
    return Object.fromEntries(paths.map((p, i) => [p, /^[0-9a-f]{40,64}$/.test(ids[i]) ? ids[i] : null]));
  } catch { return null; }
}

/**
 * @param {{ok:boolean,text:string|null}} before
 * @param {{ok:boolean,text:string|null}} after
 * @returns {{measurable:boolean, mutated:{path:string,before:string|null,after:string}[], preExisting:number, reason:string|null}}
 */
export function purityDelta(before, after) {
  if (!before?.ok || !after?.ok) {
    return { measurable: false, mutated: [], preExisting: 0, reason: `UNMEASURABLE — git could not answer (${before?.error || after?.error || 'unknown'})` };
  }
  const a = parsePorcelain(before.text);
  const b = parsePorcelain(after.text);
  const mutated = [];
  // Byte comparison runs only when BOTH windows carry fingerprints (S385). A snapshot taken
  // without them (an older proof, an injected fixture) keeps the status-code comparison and
  // says so — `bytes: 'not-measured'` — rather than claiming byte identity.
  const fpA = before.fingerprints;
  const fpB = after.fingerprints;
  const bytesMeasured = fpA !== undefined && fpB !== undefined;
  const unfingerprinted = [];
  for (const [p, code] of b) {
    // A path dirty BEFORE the suite is pre-existing state, not a suite mutation — unless its
    // status code changed (e.g. ' M' → 'MM'), which is new writing on top of old, or its
    // bytes moved under an unchanged code.
    if (!a.has(p)) mutated.push({ path: p, before: null, after: code });
    else if (a.get(p) !== code) mutated.push({ path: p, before: a.get(p), after: code });
    else if (bytesMeasured && !code.includes('D')) {
      const x = fpA?.[p];
      const y = fpB?.[p];
      if (!x || !y) unfingerprinted.push(p);
      else if (x !== y) mutated.push({ path: p, before: code, after: code, bytesChanged: true });
    }
  }
  // S385 review #11 — a pre-dirty path that is CLEAN afterwards was written too (restored,
  // e.g. a checkout wiping uncommitted work). Iterating only the after-snapshot missed it.
  for (const [p, code] of a) if (!b.has(p)) mutated.push({ path: p, before: code, after: null, restored: true });
  return {
    measurable: true, mutated, preExisting: a.size, reason: null,
    bytes: bytesMeasured ? 'pre-dirty-fingerprinted' : 'not-measured',
    unfingerprinted,
  };
}

// S385 — "byte-identical" is claimed only where bytes were compared: a clean path's status
// code proves it, and a pre-dirty path needs its fingerprint. Without fingerprints the
// honest claim for pre-dirty paths is status identity.
function cleanDetail(delta) {
  if (!delta.preExisting) return 'tracked tree byte-identical across the suite (0 pre-existing dirty path(s) excluded)';
  if (delta.bytes === 'pre-dirty-fingerprinted') {
    return `tracked tree byte-identical across the suite (${delta.preExisting} pre-existing dirty path(s) unchanged by byte fingerprint)`;
  }
  return `tracked tree status-identical across the suite (${delta.preExisting} pre-existing dirty path(s) excluded; their bytes were not fingerprinted)`;
}

export function describePurity(delta) {
  if (!delta.measurable) return delta.reason;
  if (delta.mutated.length === 0) return cleanDetail(delta);
  const names = delta.mutated.slice(0, 6).map((m) => m.path).join(', ') + (delta.mutated.length > 6 ? ` +${delta.mutated.length - 6} more` : '');
  return `suite left ${delta.mutated.length} tracked file(s) changed: ${names} — attribution PRESUMPTIVE (a concurrent writer inside the window is indistinguishable from the suite)`;
}

/**
 * S317 [audit #11] — ATTRIBUTED regenerations, not a suppression list.
 *
 * The suite genuinely rewrites tracked repo state: 336 spawnSync/execSync call
 * sites in scripts/test/ run with cwd = ROOT, and several tests assert the
 * mutation AS their pass condition — tier2-render-studio-orchestrator.mjs:26 is
 * literally named "regenerates a parseable compiled JSON surface", and
 * tier1-ark-slo-check.mjs:33 asserts SLO_REPORT.json persisted. So the purity
 * probe could never go green, and every closeout suite run silently dirtied ~22
 * tracked files that then landed in the closeout commit indistinguishable from
 * session work. A reviewer loses the ability to read a closeout diff at all.
 *
 * Each entry names the TEST that causes the write, so this is attribution rather
 * than a blanket allowlist: an unexplained path stays unexpected and still fails,
 * and an entry whose owning test is deleted becomes visibly wrong.
 *
 * THIS IS NOT THE DURABLE FIX. It makes the probe able to distinguish a known
 * regeneration from a new one; it does not stop the suite writing repo state. The
 * durable fix is to run the suite in a throwaway git worktree so producer writes
 * land outside the working tree (the repo already has verified-clone machinery in
 * safe-spawn from S292). That is deferred here with a reason rather than done
 * badly: it touches the harness every test runs under, and doing it in the same
 * session that widened four other gates would make a bad failure hard to localise.
 */
export const EXPECTED_REGENERATIONS = Object.freeze([
  { path: 'portfolio/INFRA_DEBT_LEDGER.md',              by: 'scripts/test/tier2-portfolio-debt.mjs' },
  { path: 'portfolio/compiled/STUDIO_ORCHESTRATOR.json', by: 'scripts/test/tier2-render-studio-orchestrator.mjs (asserts the regeneration)' },
  { path: 'docs/STUDIO_ORCHESTRATOR.md',                 by: 'scripts/test/tier2-render-studio-orchestrator.mjs' },
  { path: 'portfolio/compiled/SESSION_ORCHESTRATOR.json', by: 'scripts/test/tier2-session-orchestrator-v2-smoke.mjs (session-orchestrator-v2.mjs writes it unconditionally; --json does not suppress)' },
  { path: 'docs/STARTUP_BRIEF.md',                       by: 'scripts/test/tier2-render-startup-brief.mjs' },
  { path: 'docs/STARTUP_BRIEF_V5.md',                    by: 'scripts/test/tier2-render-startup-brief.mjs' },
  { path: 'docs/FEED_DISTRIBUTION_EVAL.md',              by: 'scripts/test/tier2-eval-feed-distribution.mjs' },
  { path: 'docs/FEED_DISTRIBUTION_EVAL_ALL.md',          by: 'scripts/test/tier2-eval-feed-distribution.mjs' },
  { path: 'portfolio/ark/SLO_REPORT.json',               by: 'scripts/test/tier1-ark-slo-check.mjs (asserts persistence)' },
  { path: 'portfolio/ops/phantom-blocker-sweep.ndjson',  by: 'scripts/test/tier2-phantom-blocker-sweep.mjs' },
  { path: 'context/GENIUS_LIST.json',                    by: 'scripts/test/tier2-genius-list*.mjs' },
  { path: 'context/GENIUS_LIST.md',                      by: 'scripts/test/tier2-genius-list*.mjs' },
  { path: 'docs/AGENT_CAPABILITIES.md',                  by: 'scripts/test/tier2-agent-capabilities*.mjs' },
  { path: 'docs/CLOSEOUT_STATUS_BOARD.md',               by: 'scripts/test/tier2-closeout-board*.mjs' },
  { path: 'portfolio/ACTIVE_SESSIONS.json',              by: 'scripts/test/tier2-studio-status*.mjs' },
  { path: 'portfolio/FOUNDER_COCKPIT.json',              by: 'scripts/test/tier2-founder-cockpit*.mjs' },
  { path: 'portfolio/events.ndjson',                     by: 'scripts/test/tier2-studio-events*.mjs' },
  { path: 'portfolio/ops/obelisk-receipts.ndjson',       by: 'scripts/test/tier2-obelisk*.mjs' },
  { path: 'portfolio/ops/routing-grades.ndjson',         by: 'scripts/test/tier2-model-router*.mjs' },
]);

const EXPECTED_PATHS = new Map(EXPECTED_REGENERATIONS.map((e) => [e.path, e.by]));

/** Split a purity delta into attributed regenerations and genuinely new mutations. */
export function partitionPurity(delta) {
  if (!delta?.measurable) return { measurable: false, expected: [], unexpected: [], reason: delta?.reason ?? null };
  const expected = [];
  const unexpected = [];
  for (const m of delta.mutated) {
    if (EXPECTED_PATHS.has(m.path)) expected.push({ ...m, by: EXPECTED_PATHS.get(m.path) });
    else unexpected.push(m);
  }
  return { measurable: true, expected, unexpected, reason: null };
}

/**
 * Verdict over the partition. An UNEXPECTED mutation fails; a known regeneration is
 * reported and does not. Unmeasurable stays unmeasurable — never clean.
 */
export function describePartitionedPurity(delta) {
  const p = partitionPurity(delta);
  if (!p.measurable) return { pass: false, warn: true, detail: p.reason };
  if (p.unexpected.length) {
    const names = p.unexpected.slice(0, 5).map((m) => m.path).join(', ');
    return {
      pass: false,
      warn: true,
      detail: `${p.unexpected.length} UNEXPECTED tracked file(s) written by the suite: ${names}`
        + `${p.expected.length ? ` · ${p.expected.length} known regeneration(s)` : ''}`
        + ' — attribution PRESUMPTIVE (a concurrent writer inside the window is indistinguishable from the suite)',
    };
  }
  // Checked BEFORE the known-regeneration pass (S385 review #1): the suite always rewrites
  // expected paths, so checking after it let a failed hash read pass in the common case.
  if (delta.unfingerprinted?.length) {
    return {
      pass: false,
      warn: true,
      detail: `${delta.unfingerprinted.length} pre-existing dirty path(s) could not be byte-fingerprinted (${delta.unfingerprinted.slice(0, 4).join(', ')}) — byte purity UNMEASURED for them, not clean`
        + `${p.expected.length ? ` · ${p.expected.length} known regeneration(s)` : ''}`,
    };
  }
  if (p.expected.length) {
    return {
      pass: true,
      warn: true,
      detail: `${p.expected.length} known regeneration(s) — the suite rewrites tracked repo state BY DESIGN and they land in the closeout commit. `
        + 'Attributed, not excused: the durable fix is running the suite in a throwaway worktree.',
    };
  }
  return { pass: true, warn: false, detail: cleanDetail(delta) };
}

/**
 * S317 [audit #11] — OBSERVED BUT NOT YET ATTRIBUTED.
 *
 * A clean-tree run on 2026-09-02 reported these as UNEXPECTED, and a second run
 * did not — because the first run had dirtied them, so they became pre-existing and
 * were correctly excluded. That is the registry looking more complete than it is,
 * and it is exactly the shape this module exists to refuse.
 *
 * They are NOT added to EXPECTED_REGENERATIONS, because an entry there must name
 * the test that writes it and this session did not identify their owners. Guessing
 * an owner would turn attribution back into suppression. Listed here so the next
 * session starts from a measurement instead of a clean-looking gate.
 *
 * S371 — two of the five were attributed and their writers fixed AT SOURCE, so they left
 * this list without entering EXPECTED_REGENERATIONS (a fixed writer is not a regeneration):
 *   · context/SIGNALS.md — scripts/test/tier2-render-startup-brief.mjs (rendered at the real
 *     root) and scripts/test/tier2-brief-golden.mjs (hermetic, but the v5 child's
 *     writeSignalsArtifact ignored hermetic mode). Both now render hermetically and assert
 *     the file is byte-identical.
 *   · portfolio/RETROFIT_REPORT_<date>.json — scripts/test/tier2-retrofit-mode-smoke.mjs;
 *     initiate.mjs --retrofit now takes --report-dir and the smoke uses a scratch one.
 */
export const UNATTRIBUTED_OBSERVED = Object.freeze([
  'docs/GENIUS_LIST.md',
  'portfolio/BLOCKER_DISCIPLINE_LOG.ndjson',
  'portfolio/ark/DISPATCH_ESCALATIONS.json',
]);

/**
 * S370 [audit #2] · [SIL:2⛔][S305 #1] — one purity verdict for a suite that ran as several
 * invocations (the sharded, resumable closeout run).
 *
 * Each invocation measures its OWN before/after delta, so edits made between two
 * checkpoints (a repair, then a resume) are never attributed to the suite. The verdict is
 * the union of what each invocation dirtied. Any unmeasurable invocation makes the whole
 * verdict unmeasurable — a partly observed run is not a clean one. No invocation that
 * executed tests means no measurement at all (null), never "pure".
 *
 * @param {{startedAt:string, endedAt:string, executedShards?:string[], delta:object}[]} invocations
 */
export function mergeInvocationPurity(invocations, { filesRun = null } = {}) {
  const rows = (invocations || []).filter((row) => row && row.delta);
  if (rows.length === 0) return null;
  const measuredAt = rows[rows.length - 1].endedAt;
  const broken = rows.find((row) => !row.delta.measurable);
  let delta;
  if (broken) {
    delta = { measurable: false, mutated: [], preExisting: 0, reason: broken.delta.reason || 'UNMEASURABLE — an invocation could not snapshot the tree' };
  } else {
    const byPath = new Map();
    for (const row of rows) for (const m of row.delta.mutated) byPath.set(m.path, m);
    // Bytes count as measured only if EVERY window fingerprinted; one unfingerprinted
    // path in any window keeps the merged verdict from claiming byte purity.
    delta = {
      measurable: true, mutated: [...byPath.values()], preExisting: rows[0].delta.preExisting, reason: null,
      bytes: rows.every((row) => row.delta.bytes === 'pre-dirty-fingerprinted') ? 'pre-dirty-fingerprinted' : 'not-measured',
      unfingerprinted: [...new Set(rows.flatMap((row) => row.delta.unfingerprinted || []))],
    };
  }
  const parts = partitionPurity(delta);
  const verdict = describePartitionedPurity(delta);
  return {
    ...delta,
    measuredAt,
    filesRun,
    invocations: rows.length,
    expected: parts.expected,
    unexpected: parts.unexpected,
    pass: verdict.pass,
    detail: verdict.detail,
  };
}

/**
 * S370 review #3 — the verdict for a sharded run, bound to the proofs it is built from.
 *
 * Each shard proof carries the delta measured around its own child. A proof with no window
 * (written before the measurement existed, or by a run that could not snapshot) means part
 * of the suite ran unobserved: the verdict is then UNMEASURABLE and says how much is
 * missing. It never reports "byte-identical" for the shards that happen to have a window.
 *
 * @param {{shard:string, purity:{startedAt:string,endedAt:string,delta:object}|null}[]} shardRows
 */
export function mergeShardPurity(shardRows, { filesRun = null } = {}) {
  const rows = shardRows || [];
  if (rows.length === 0) return null;
  const unobserved = rows.filter((row) => !row.purity || !row.purity.delta);
  if (unobserved.length) {
    const reason = `UNMEASURABLE — ${unobserved.length} of ${rows.length} shard proof(s) carry no purity window (${unobserved.slice(0, 4).map((row) => row.shard).join(', ')}${unobserved.length > 4 ? ', …' : ''}); re-run those shards to measure`;
    const measuredAt = rows.map((row) => row.purity?.endedAt).filter(Boolean).sort().pop() || null;
    return { measurable: false, mutated: [], preExisting: 0, reason, measuredAt, filesRun, invocations: rows.length - unobserved.length, expected: [], unexpected: [], pass: false, detail: reason };
  }
  const ordered = rows.map((row) => row.purity).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  return mergeInvocationPurity(ordered, { filesRun });
}

/**
 * S370 review r2 #3 — a shard that is run AGAIN starts from a tree its own earlier run may
 * have dirtied. That path is in the new before-snapshot, so the new delta is empty and the
 * replaced window would take the finding with it: "byte-identical" over a file the suite
 * wrote an hour ago. Paths the replaced window attributed to this shard, and that are STILL
 * dirty after the re-run, stay attributed. A path that was reverted in between drops out.
 */
export function carryForwardMutations(priorPurity, delta, afterSnapshot) {
  if (!delta?.measurable || !priorPurity?.delta?.measurable || !afterSnapshot?.ok) return delta;
  const stillDirty = parsePorcelain(afterSnapshot.text);
  const have = new Set(delta.mutated.map((m) => m.path));
  // A RESTORED finding (pre-dirty path wiped clean) is still true while the path stays
  // clean; a re-run starts from that clean state and cannot see it (review S385 r2 #11).
  const carried = priorPurity.delta.mutated
    .filter((m) => !have.has(m.path) && (m.restored ? !stillDirty.has(m.path) : stillDirty.has(m.path)))
    .map((m) => (m.restored ? { ...m, carried: true } : { ...m, after: stillDirty.get(m.path), carried: true }));
  return carried.length ? { ...delta, mutated: [...delta.mutated, ...carried] } : delta;
}

/** The compact form PROJECT_STATUS.json carries (paths only). */
export function statusTreePurity(treePurity) {
  if (!treePurity) return null;
  return {
    measurable: treePurity.measurable,
    mutated: (treePurity.mutated || []).map((m) => m.path),
    preExisting: treePurity.preExisting,
    measuredAt: treePurity.measuredAt,
    detail: treePurity.detail,
  };
}
