/**
 * audit-exec-log.mjs — canonical normalization for audit execution-log entries
 * (S166 · [SIL][S163 #1]).
 *
 * Two execution-log schemas exist in archived audit JSON sidecars:
 *   legacy : { at|date|session, result, note?, evidence? }
 *   modern : { at, status, note }
 *
 * render-audit-md.mjs carries a compatibility branch to read both. This lib is
 * the SINGLE source of truth for converting legacy → modern, so the one-time
 * migration (migrate-audit-sidecars.mjs) and any future consumer agree. Once all
 * archived sidecars are migrated, the renderer's compat branch can retire.
 *
 * inferStatus mirrors render-audit-md.mjs exactly — verified by a test so the two
 * cannot drift while both exist.
 */

/** Map a free-text legacy `result` to a modern status token. */
export function inferStatus(result) {
  if (!result) return '?';
  if (/blocked/i.test(result)) return 'blocked';
  if (/deferred/i.test(result)) return 'deferred';
  if (/shipped|tested|done|pass/i.test(result)) return 'shipped';
  return 'noted';
}

/**
 * Normalize one execution-log entry to the modern { at, status, note } shape.
 * Idempotent: a modern entry is returned with the same fields. Returns a new
 * object; never mutates the input.
 */
export function normalizeEntry(e) {
  // S283: a bare STRING is the third schema in the wild — sidecars written by
  // hand carry `executionLog: ["shipped L1+L2 …"]`. It used to fall through the
  // guard below unchanged, so isModern() stayed false forever and the one-time
  // migration counted it as migrated on EVERY run: `✓ migrated 14` followed
  // immediately by `would migrate 14`. A heal that reports success while
  // changing nothing is the same lying-heal class as an auto-fix that cannot
  // repair what it claims (cf. write-project-status --fix, this session). A
  // string carries only its note, so `at` is honestly 'unknown' rather than
  // being back-dated to the migration run.
  if (typeof e === 'string') {
    const note = e.trim();
    return { at: 'unknown', status: inferStatus(note), note };
  }
  if (!e || typeof e !== 'object') return e;
  const at = e.at || e.date || (e.session != null ? `session ${e.session}` : 'unknown');
  const status = e.status || (e.result ? inferStatus(e.result) : '?');
  const note = e.note || e.result || e.evidence || '';
  return { at, status, note };
}

/** True if an entry is already in modern form (no legacy-only fields). */
export function isModern(e) {
  return e && typeof e === 'object'
    && 'status' in e
    && !('result' in e) && !('date' in e) && !('session' in e) && !('evidence' in e);
}

export default { inferStatus, normalizeEntry, isModern };
