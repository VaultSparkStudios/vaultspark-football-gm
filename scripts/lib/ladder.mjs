// lib/ladder.mjs — CANON-052 Launch Ladder shared constants (S242; v2 at S358).
// Single home for the stage model; consumers: set-vault-status.mjs (write path),
// ladder-court-dispatch.mjs (verdicts), render-ladder-health.mjs (dashboard),
// check-beta-duration.mjs (beta clock).
//
// v2 — founder lifecycle policy (docs/LIFECYCLE_RELEASE_POLICY_2026-10-01.md, S357
// direction, implemented S358). Beta and unannounced releases are FORGE: SPARKED
// means a stable release that passed its release contract AND was announced.
//
//   F0 concept · F1 building · F2 preview · FB beta · F3 release candidate
//   S1 released (announced) · S2 growing · V0 paused · V1 archived
//
// LEGACY stages SB (old "SPARKED · BETA", D-S294.5) and S0 (soft-live, unannounced)
// stay readable so existing registry rows keep their meaning until an owner-evidenced
// migration moves them; they can only be LEFT, never entered. No label changes here.
export const LADDER_VERSION = 2;

export const STAGES = ['F0', 'F1', 'F2', 'FB', 'F3', 'S1', 'S2', 'V0', 'V1', 'SB', 'S0'];

export const LEGACY_STAGES = {
  SB: { interpretation: 'beta migration candidate (v1 SPARKED · BETA)', migrateTo: ['FB', 'F3', 'S1'] },
  S0: { interpretation: 'pre-announcement / release-evidence review candidate (v1 soft-live)', migrateTo: ['F3', 'FB', 'S1'] },
};

export const STAGE_VAULT = {
  F0: 'forge', F1: 'forge', F2: 'forge', FB: 'forge', F3: 'forge',
  S1: 'sparked', S2: 'sparked', V0: 'vaulted', V1: 'vaulted',
  SB: 'sparked', S0: 'sparked', // legacy rows keep their recorded brand word until migrated
};

/** Display form: the three brand words plus the useful maturity detail. */
export const STAGE_DISPLAY = {
  F0: 'FORGE · CONCEPT', F1: 'FORGE · BUILDING', F2: 'FORGE · PREVIEW', FB: 'FORGE · BETA', F3: 'FORGE · RELEASE CANDIDATE',
  S1: 'SPARKED · RELEASED', S2: 'SPARKED · GROWING', V0: 'VAULTED · PAUSED', V1: 'VAULTED · ARCHIVED',
  SB: 'SPARKED · BETA (legacy — migration candidate)', S0: 'SPARKED · UNANNOUNCED (legacy — review candidate)',
};

/** Beta clock (days) — applies to FB (and legacy SB). Overrun is a finding, never an auto-move. */
export const BETA_MAX_DAYS = 90;
export const BETA_STAGES = ['FB', 'SB'];

// Allowed edges. Downward moves inside FORGE are free (reality regressed — record it).
// A new beta track for a supported stable release does NOT relabel it: S1 has no
// edge back into FORGE. V1 is terminal (un-archive is founder registry surgery).
export const EDGES = {
  F0: ['F1', 'V0'],
  F1: ['F0', 'F2', 'V0'],
  F2: ['F1', 'FB', 'F3', 'V0'],
  FB: ['F2', 'F3', 'V0'],
  F3: ['F2', 'FB', 'S1', 'V0'],
  S1: ['S2', 'V0'],
  S2: ['V0'],
  V0: ['F1', 'F2', 'F3', 'V1'],
  V1: [],
  SB: LEGACY_STAGES.SB.migrateTo.concat('V0'),
  S0: LEGACY_STAGES.S0.migrateTo.concat('V0'),
};

// Launch-class edges run the full release/cost gate stack. Entering public beta is a
// public act; F3→S1 is the release itself.
export const LAUNCH_CLASS_EDGES = ['F2→F3', 'F2→FB', 'F3→S1', 'SB→S1', 'S0→S1', 'V0→F2', 'V0→F3'];

// SPARKED acceptance contract (policy §"SPARKED acceptance contract"). A release
// receipt carries one dated result per area, tied to the release source/deployment.
export const RELEASE_AREAS = ['product', 'identity', 'email', 'operations', 'release', 'posting'];
const OK_STATES = new Set(['pass', 'not-applicable', 'exempt']);
// Internal infrastructure: public marketing is not applicable, but an exemption still
// needs a reason and an owner; product/identity/operations must pass outright.
const INTERNAL_MUST_PASS = ['product', 'identity', 'operations'];

export function validateReleaseReceipt(receipt, { audience = 'public', now = Date.now(), maxAgeDays = 30 } = {}) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return { ok: false, errors: ['receipt unreadable'] };
  if (!receipt.source || !receipt.deployment) errors.push('receipt must name the release source and deployment');
  const checks = Array.isArray(receipt.checks) ? receipt.checks : [];
  for (const area of RELEASE_AREAS) {
    const c = checks.find(x => x && x.area === area);
    if (!c) { errors.push(`${area}: missing (missing is not the same as not-applicable)`); continue; }
    if (!OK_STATES.has(c.status)) errors.push(`${area}: ${c.status || 'no status'} — only pass, not-applicable or exempt can release`);
    const at = Date.parse(c.at);
    if (!Number.isFinite(at)) errors.push(`${area}: undated result`);
    else if (now - at > maxAgeDays * 86400000) errors.push(`${area}: stale (${Math.round((now - at) / 86400000)}d > ${maxAgeDays}d)`);
    if (['not-applicable', 'exempt'].includes(c.status) && (!c.reason || !c.owner)) errors.push(`${area}: ${c.status} needs a reason and an owner`);
    if (audience === 'internal' && INTERNAL_MUST_PASS.includes(area) && c.status !== 'pass') errors.push(`${area}: internal releases must pass this area`);
    if (audience !== 'internal' && area === 'release' && c.status !== 'pass') errors.push('release: a public SPARKED release needs a published stable-release announcement');
  }
  return { ok: errors.length === 0, errors };
}
