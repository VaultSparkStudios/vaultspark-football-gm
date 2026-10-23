/**
 * audit-sidecar.mjs — JSON sidecar for docs/AUDIT_<date>.md (G2, S118).
 *
 * Replaces the markdown-table-as-contract between /audit and /implement.
 * /audit writes both files; /implement reads the JSON.
 *
 * Schema (v2.1):
 *   {
 *     schemaVersion: "1.0",
 *     generatedAt: ISO-8601,
 *     project: { slug, type, name },
 *     axes: { gamification: 3, ux: 2, ... },        // applied weights
 *     items: [
 *       {
 *         id: 1,                                     // matches # in markdown
 *         slug: "single-page-magic-link",
 *         tier: "🔥" | "⚡" | "💡",
 *         axis: "ux" | "security" | ...,
 *         effortHours: 4,
 *         impact: 9,
 *         innovation: 8,
 *         priority: 12.7,
 *         title: "Replace 3-step signup with single-page magic-link",
 *         why: "Friction kills 40% of signups...",
 *         recipe: "Implement /api/magic-link endpoint...",
 *         status: "pending" | "shipped" | "blocked" | "deferred",
 *         executionLog: [{ at, status, note }]
 *       }
 *     ],
 *     totals: { count: N, priority: PPP.PP, top3: [slug,slug,slug] },
 *     innovationReserve: [slug,...],
 *     skipped: [{ slug, reason }],
 *   }
 */

import fs from 'fs';
import path from 'path';
import { selectSessionAudit, parseSessionId } from './audit-selector.mjs';
import { normalizeEntry } from './audit-exec-log.mjs';
import { validatePremise, VOLATILE_PROBLEM_PREFIX } from './audit-premises.mjs';
import { validateLifecycleAuditAssessment } from './lifecycle-skill-profile.mjs';
import { profileFor } from '../arc-profile.mjs';

const SCHEMA_VERSION = '2.1';
export const AUDIT_CONTRACT_VERSION = SCHEMA_VERSION;
const ITEM_STATUSES = new Set(['pending', 'shipped', 'blocked', 'deferred']);
const ITEM_TIERS = new Set(['🔥', '⚡', '💡']);

/** Canonical /audit axes (SESSION_PROTOCOL §2B, infrastructure wording). */
export const CANONICAL_AUDIT_AXES = Object.freeze([
  'features-depth',
  'ui-ux-feedback',
  'gamification-immersion',
  'ai-intelligence',
  'security',
  'speed-organization-efficiency',
  'token-cost',
  'observability-honesty',
  'sil-debt',
]);
const CANONICAL_AUDIT_AXIS_SET = new Set(CANONICAL_AUDIT_AXES);

/**
 * Validate the executable /audit -> /implement contract, not merely JSON syntax.
 * Routine sidecars have a deliberately different shape and do not call this.
 * Returns path-addressed errors so producers can migrate instead of guessing.
 */
export function validateAuditContract(audit) {
  const errors = [];
  const need = (ok, at, message) => { if (!ok) errors.push(`${at} ${message}`); };
  need(audit && typeof audit === 'object' && !Array.isArray(audit), '/', 'must be an object');
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return errors;
  errors.push(...validateLifecycleAuditAssessment(audit));
  need(Array.isArray(audit.items), '/items', 'must be an array');
  if (!Array.isArray(audit.items)) return errors;

  // Empty-item reference runs exercise plumbing and remain valid. A real plan
  // must carry the full executable shape below.
  if (audit.items.length === 0) return errors;
  need(audit.project && typeof audit.project === 'object', '/project', 'must be an object');
  for (const key of ['slug', 'type', 'name']) {
    need(typeof audit.project?.[key] === 'string' && audit.project[key].trim(), `/project/${key}`, 'must be a non-empty string');
  }
  need(audit.totals && typeof audit.totals === 'object', '/totals', 'must be an object');
  need(Number.isFinite(audit.totals?.count), '/totals/count', 'must be numeric');
  need(Number.isFinite(audit.totals?.priority), '/totals/priority', 'must be numeric');
  need(Array.isArray(audit.totals?.top3), '/totals/top3', 'must be an array');

  const slugs = new Set();
  audit.items.forEach((item, index) => {
    const at = `/items/${index}`;
    need(item && typeof item === 'object' && !Array.isArray(item), at, 'must be an object');
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    need(Number.isInteger(item.id) && item.id > 0, `${at}/id`, 'must be a positive integer');
    need(typeof item.slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(item.slug), `${at}/slug`, 'must be a stable kebab-case identifier');
    if (typeof item.slug === 'string') {
      need(!slugs.has(item.slug), `${at}/slug`, `duplicates ${item.slug}`);
      slugs.add(item.slug);
    }
    need(ITEM_TIERS.has(item.tier), `${at}/tier`, 'must be 🔥, ⚡, or 💡');
    need(typeof item.axis === 'string' && item.axis.trim(), `${at}/axis`, 'must be a non-empty string');
    need(Number.isFinite(item.effortHours) && item.effortHours >= 0, `${at}/effortHours`, 'must be a non-negative number');
    need(Number.isFinite(item.impact) && item.impact >= 1 && item.impact <= 10, `${at}/impact`, 'must be a number from 1 to 10');
    need(Number.isFinite(item.innovation) && item.innovation >= 1 && item.innovation <= 10, `${at}/innovation`, 'must be a number from 1 to 10');
    need(Number.isFinite(item.priority), `${at}/priority`, 'must be numeric');
    need(typeof item.title === 'string' && item.title.trim(), `${at}/title`, 'must be a non-empty string');
    need(typeof item.recipe === 'string' && item.recipe.trim(), `${at}/recipe`, 'must be a concrete non-empty string');
    need(ITEM_STATUSES.has(item.status), `${at}/status`, 'must be pending, shipped, blocked, or deferred');
    need(Array.isArray(item.executionLog), `${at}/executionLog`, 'must be an array');
    need(item.ladder && typeof item.ladder === 'object', `${at}/ladder`, 'must define L1/L2/L3');
    for (const rung of ['L1', 'L2', 'L3']) {
      need(Number.isFinite(item.ladder?.[rung]?.effortHours), `${at}/ladder/${rung}/effortHours`, 'must be numeric');
      need(typeof item.ladder?.[rung]?.recipe === 'string' && item.ladder[rung].recipe.trim(), `${at}/ladder/${rung}/recipe`, 'must be non-empty');
    }
  });
  if (audit.totals && Number.isFinite(audit.totals.count)) {
    need(audit.totals.count === audit.items.length, '/totals/count', `must equal items.length (${audit.items.length})`);
  }
  return errors;
}

/**
 * S284 [audit #1] — validate every typed premise a sidecar carries.
 *
 * DELIBERATELY SEPARATE from validateAuditContract. Premises were the one part of
 * the contract nothing checked, so a sidecar could be BORN carrying claims no
 * adapter can read; they then degraded to `unverified` at verify time, which is
 * non-fatal, and the audit reported itself trustworthy on evidence that never
 * existed. The fix belongs at WRITE time, where the author can still fix it.
 *
 * It is not folded into validateAuditContract because that function gates READING
 * a sidecar too, and several already-committed sidecars carry bad adapters. Making
 * those unreadable would destroy premise verification for the very audits that
 * most need re-checking — a fix that costs more than the defect. So: writes are
 * gated (writeAuditSidecar throws), reads are not.
 *
 * Premises stay OPTIONAL — an item without them is unverified, never invalid.
 *
 * @returns {string[]} path-addressed errors; empty means every premise is readable.
 */
export function validateAuditPremiseContract(audit, { includeVolatile = false } = {}) {
  const errors = [];
  if (!audit || !Array.isArray(audit.items)) return errors;
  audit.items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    if (item.premises === undefined) return;
    if (!Array.isArray(item.premises)) {
      errors.push(`/items/${index}/premises must be an array when present`);
      return;
    }
    item.premises.forEach((premise, pIndex) => {
      // S321 [audit #5] — VOLATILITY GATES WRITES, NOT READS. A premise pinned to a
      // drifting measurement is refused when it is authored, where the author can
      // still fix it. Letting it also invalidate an ALREADY-COMMITTED sidecar would
      // make that audit unreadable to the premise verifier — the precise cost the
      // comment above this function refuses to pay, and the read path already has an
      // honest answer for it (STATUS.VOLATILE).
      const problems = validatePremise(premise)
        .filter((problem) => includeVolatile || !problem.startsWith(VOLATILE_PROBLEM_PREFIX));
      for (const problem of problems) {
        errors.push(`/items/${index}/premises/${pIndex} ${problem}`);
      }
    });
  });
  return errors;
}

/**
 * Validate proof owed by a newly-written audit.
 *
 * This deliberately stays separate from validateAuditContract(): historical
 * sidecars remain readable, while every new write must prove all nine axes,
 * reconcile admitted candidates with items, and give pending items at least
 * one machine-readable premise. An axis may yield zero items only when it has
 * explicit rejected-on-verify evidence.
 */
/**
 * A routine packet is typed EVIDENCE, not an /implement plan, and owes no session.
 * `kind` is the declaration; the `-routine` filename is the older convention several
 * committed packets still carry, so both are read (S303's two-kinds rule, applied at
 * write time).
 */
export function isRoutinePacket(audit, date = null) {
  return audit?.kind === 'routine' || /-routine$/.test(String(date ?? audit?.__writeDate ?? ''));
}

export function validateAuditWriteContract(audit) {
  const errors = [];
  const need = (ok, at, message) => { if (!ok) errors.push(`${at} ${message}`); };
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return errors;

  // S321 [audit #6] — A PLAN MUST BE BINDABLE TO A SESSION.
  //
  // audit-selector.mjs's tier-1 mode answers "which audit is THIS session's work",
  // and it is the only answer that module calls trustworthy. It can only bind a
  // sidecar that carries a readable session id. Nothing required one, so a plan could
  // be BORN unbindable — this session's own /audit wrote exactly that, and the
  // newest-variant resolver then ranked it below the PREVIOUS session's sidecar, which
  // is the plan /implement would have executed.
  //
  // Write-time only, deliberately, following the premise-contract precedent above:
  // validateAuditContract also gates READS, and several committed sidecars carry a
  // drifted spelling. Making those unreadable would destroy selection for the audits
  // that most need it — a fix costing more than the defect. Reads coerce; writes gate.
  //
  // NARROWED AFTER THE FIRST CUT OVER-REACHED, and the narrowing matters. Requiring a
  // session on EVERY write outlawed the routine evidence packet, whose absence of one
  // is a deliberate design property: audit-selector's own header states that "routine
  // audits carry no session and thus can never be mistaken for session work", and
  // audit-run.mjs omits the field on purpose when its sessionId is not a number. The
  // over-broad rule broke the nightly production audit path and seven test files, and
  // was caught by running the suite rather than by reasoning about it.
  //
  // So the two halves are separated by strength of claim: a MALFORMED session id is
  // refused always, because it is the actual defect — a claim nothing can read. An
  // ABSENT one is refused only for a canonical session plan, where it is required.
  {
    const sid = parseSessionId(audit.session);
    need(sid.state !== 'malformed', '/session',
      `must be a readable session number (321 or "S321"); ${JSON.stringify(audit.session)} does not parse and would silently fall through to the weakest selection tier`);
    if (!isRoutinePacket(audit)) {
      need(sid.state !== 'absent', '/session',
        'must carry the session this plan belongs to — audit-selector binds on it, and a plan without one cannot be selected as the work of the current session');
    }
  }

  need(audit.axes && typeof audit.axes === 'object' && !Array.isArray(audit.axes), '/axes', 'must be an object keyed by the canonical nine-axis registry');
  if (audit.axes && typeof audit.axes === 'object' && !Array.isArray(audit.axes)) {
    for (const axis of CANONICAL_AUDIT_AXES) {
      need(Object.hasOwn(audit.axes, axis), `/axes/${axis}`, 'is required by the canonical nine-axis registry');
      if (Object.hasOwn(audit.axes, axis)) {
        need(Number.isFinite(audit.axes[axis]) && audit.axes[axis] > 0, `/axes/${axis}`, 'must be a positive numeric weight');
      }
    }
    for (const axis of Object.keys(audit.axes)) {
      need(CANONICAL_AUDIT_AXIS_SET.has(axis), `/axes/${axis}`, 'is not a canonical audit axis');
    }
  }

  need(audit.axisCoverage && typeof audit.axisCoverage === 'object' && !Array.isArray(audit.axisCoverage), '/axisCoverage', 'must be an object proving all nine axes were examined');
  const coverage = audit.axisCoverage && typeof audit.axisCoverage === 'object' && !Array.isArray(audit.axisCoverage)
    ? audit.axisCoverage
    : null;
  const items = Array.isArray(audit.items) ? audit.items : [];

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    need(CANONICAL_AUDIT_AXIS_SET.has(item.axis), `/items/${index}/axis`, 'must name a canonical audit axis');
    if (item.status === 'pending') {
      need(Array.isArray(item.premises) && item.premises.length > 0, `/items/${index}/premises`, 'must contain at least one typed premise while status is pending');
    }
  }

  if (!coverage) return errors;
  for (const axis of CANONICAL_AUDIT_AXES) {
    const at = `/axisCoverage/${axis}`;
    const row = coverage[axis];
    need(row && typeof row === 'object' && !Array.isArray(row), at, 'must be an object');
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;

    need(Array.isArray(row.surviving), `${at}/surviving`, 'must be an array of admitted item slugs');
    need(Array.isArray(row.rejectedOnVerify), `${at}/rejectedOnVerify`, 'must be an array');

    const actual = items
      .filter((item) => item && item.status === 'pending' && item.axis === axis && typeof item.slug === 'string')
      .map((item) => item.slug)
      .sort();
    const declared = Array.isArray(row.surviving) ? row.surviving : [];
    const declaredStrings = declared.filter((slug) => typeof slug === 'string').sort();
    declared.forEach((slug, index) => {
      need(typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(slug), `${at}/surviving/${index}`, 'must be a kebab-case item slug');
    });
    need(new Set(declaredStrings).size === declaredStrings.length, `${at}/surviving`, 'must not contain duplicate slugs');
    need(JSON.stringify(declaredStrings) === JSON.stringify(actual), `${at}/surviving`, `must exactly match admitted items for this axis (${actual.join(', ') || 'none'})`);

    const rejected = Array.isArray(row.rejectedOnVerify) ? row.rejectedOnVerify : [];
    if (actual.length === 0) {
      need(rejected.length > 0, `${at}/rejectedOnVerify`, 'must contain explicit evidence when zero items survive verification');
    }
    rejected.forEach((entry, index) => {
      const entryAt = `${at}/rejectedOnVerify/${index}`;
      need(entry && typeof entry === 'object' && !Array.isArray(entry), entryAt, 'must be an object');
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      need(typeof entry.slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(entry.slug), `${entryAt}/slug`, 'must be a kebab-case identifier');
      need(typeof entry.premise === 'string' && entry.premise.trim(), `${entryAt}/premise`, 'must be a non-empty string');
      need(typeof entry.evidence === 'string' && entry.evidence.trim(), `${entryAt}/evidence`, 'must be a non-empty string');
    });
  }
  for (const axis of Object.keys(coverage)) {
    need(CANONICAL_AUDIT_AXIS_SET.has(axis), `/axisCoverage/${axis}`, 'is not a canonical audit axis');
  }
  return errors;
}

// CANON-028 — founder identity must NEVER be committed. The /audit pipeline was
// leaking carterglotz@gmail.com into committed sidecars (S142 audit item 3), so
// every sidecar write is now scrubbed at the source. Substitutions mirror
// scripts/check-founder-identity-leak.mjs FORBIDDEN_PATTERNS.
const FOUNDER_IDENTITY_SUBS = [
  [/carterglotz@gmail\.com/g, 'founder@vaultsparkstudios.com'],
  [/Carter\s+G\.\s+Riven/g, 'the Founder'],
  [/\bCarter\s+Riven\b/g, 'the Founder'],
];

function redactFounderIdentity(value) {
  if (typeof value === 'string') {
    let out = value;
    for (const [re, sub] of FOUNDER_IDENTITY_SUBS) out = out.replace(re, sub);
    return out;
  }
  if (Array.isArray(value)) return value.map(redactFounderIdentity);
  if (value && typeof value === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = redactFounderIdentity(v);
    return o;
  }
  return value;
}

export { redactFounderIdentity };

export function sidecarPath(repoRoot, date) {
  return path.join(repoRoot, 'docs', `AUDIT_${date}.json`);
}

export function readAuditSidecar(repoRoot, date) {
  try { return JSON.parse(fs.readFileSync(sidecarPath(repoRoot, date), 'utf8')); } catch { return null; }
}

export function writeAuditSidecar(repoRoot, date, audit) {
  if (!isRoutinePacket(audit)) {
    const focus = profileFor(repoRoot).lifecycleFocus;
    if (audit.lifecycleFocus && audit.lifecycleFocus.stage !== focus.stage) {
      throw new Error('audit lifecycle stage changed: review the plan against current registry/status before writing');
    }
    if (audit.lifecycleFocus && ['health', 'audience', 'releaseTarget', 'mode'].some((key) => audit.lifecycleFocus[key] !== focus[key])) {
      throw new Error('audit lifecycle status or release focus changed: review the plan against current registry/status before writing');
    }
    // Apply the new proof requirement to public readiness plans at write time;
    // historical sidecars and routine evidence packets remain readable.
    if (/^public/i.test(focus.audience) && focus.readiness) audit.lifecycleFocus = focus;
  }
  audit.schemaVersion = SCHEMA_VERSION;
  audit.generatedAt = audit.generatedAt || new Date().toISOString();
  const safe = redactFounderIdentity(audit);  // CANON-028 scrub at the source
  // Non-enumerable so the hint reaches the contract without landing in the JSON.
  Object.defineProperty(safe, '__writeDate', { value: date, enumerable: false, configurable: true });
  const contractErrors = validateAuditContract(safe);
  if (contractErrors.length) {
    throw new Error(`audit sidecar contract invalid:\n${contractErrors.map((e) => `  - ${e}`).join('\n')}`);
  }
  const writeErrors = validateAuditWriteContract(safe);
  if (writeErrors.length) {
    throw new Error(
      `audit sidecar proof contract invalid:\n${writeErrors.map((e) => `  - ${e}`).join('\n')}\n` +
      '  New audits must prove all nine axes; legacy sidecars remain readable.'
    );
  }
  // S284 [audit #1] — refuse to WRITE a premise no adapter can read. A claim that
  // cannot be checked is worse than no claim: it reads as verification and is not.
  const premiseErrors = validateAuditPremiseContract(safe, { includeVolatile: true });
  if (premiseErrors.length) {
    throw new Error(
      `audit sidecar carries premises that cannot be verified:\n${premiseErrors.map((e) => `  - ${e}`).join('\n')}\n` +
      '  A premise no adapter can resolve stays `unverified` forever and silently weakens the audit.'
    );
  }
  const p = sidecarPath(repoRoot, date);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const bytes = JSON.stringify(safe, null, 2) + '\n';
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, bytes, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, p);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.rmSync(tmp, { force: true }); } catch { /* preserve original error */ }
    throw error;
  }
  return p;
}

/**
 * Find the newest audit sidecar in docs/ — ANY variant. Returns { date, audit } or null.
 *
 * This is the documented `/implement` source (docs/SESSION_PROTOCOL.md §/go). Until S312
 * it filtered `/^AUDIT_\d{4}-\d{2}-\d{2}\.json$/`, i.e. bare-date names only, while its
 * docblock claimed "the latest AUDIT_*.json" — a claim strictly wider than the code's
 * scope. With `AUDIT_<date>-S311.json` and `AUDIT_<date>-routine.json` both present, the
 * newest matchable file was three sessions old, so `/implement` could execute a stale
 * plan. Selection now delegates to lib/audit-selector.mjs, the one component that scans
 * every variant, so this and check-audit-premises can no longer disagree about which
 * audit is in play.
 */
export function findLatestAuditSidecar(repoRoot) {
  const dir = path.join(repoRoot, 'docs');
  if (!fs.existsSync(dir)) return null;
  const { newest } = selectSessionAudit({ repoRoot });
  if (!newest) return null;
  const file = path.join(repoRoot, newest.relPath);
  let audit = null;
  try { audit = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  // Two sidecar kinds, two contracts (S303): a `-routine` packet is a typed evidence
  // packet, not an /implement plan, and must not be judged by the executable-item
  // contract it never owed.
  const isRoutine = audit?.kind === 'routine' || /-routine\.json$/.test(newest.file);
  const contractErrors = isRoutine ? validateAuditPremiseContract(audit) : validateAuditContract(audit);
  return {
    date: newest.date,
    audit: contractErrors.length ? null : audit,
    contractErrors,
    path: file,
    file: newest.file,
    isRoutine,
  };
}

/**
 * Merge: if a sidecar exists for the same date, preserve executionLog and
 * status of items whose slug matches; new items append.
 */
export function mergeAudit(existing, incoming) {
  if (!existing) return incoming;
  // The deterministic reference runner intentionally has no LLM-authored items.
  // Exercising its plumbing on a day that already has a real audit must never
  // replace project/profile/axis/skipped truth with placeholder metadata.
  if ((incoming.items || []).length === 0 && (existing.items || []).length > 0) {
    return { ...existing, sample: incoming.sample || existing.sample };
  }
  const bySlug = new Map(existing.items.map(it => [it.slug, it]));
  const merged = {
    ...incoming,
    items: incoming.items.map(it => {
      const prior = bySlug.get(it.slug);
      if (!prior) return { ...it, status: it.status || 'pending', executionLog: [] };
      bySlug.delete(it.slug);
      return {
        ...it,
        status: prior.status === 'shipped' ? 'shipped' : (it.status || 'pending'),
        executionLog: prior.executionLog || [],
      };
    }),
  };
  // Preserve items that were in prior audit but not in incoming (already-shipped, etc.)
  for (const surplus of bySlug.values()) {
    merged.items.push(surplus);
  }
  return merged;
}

export function appendExecution(audit, slug, entry) {
  const it = audit.items.find(i => i.slug === slug);
  if (!it) return null;
  it.executionLog = it.executionLog || [];
  const normalized = normalizeEntry({ at: new Date().toISOString(), ...entry });
  it.executionLog.push(normalized);
  if (normalized.status) it.status = normalized.status;
  return it;
}

export default { sidecarPath, readAuditSidecar, writeAuditSidecar, findLatestAuditSidecar, mergeAudit, appendExecution };
