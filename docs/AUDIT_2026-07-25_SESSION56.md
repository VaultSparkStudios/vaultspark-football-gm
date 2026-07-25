# Audit — Franchise Architect: Football — Session 56

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game/app
- Rubric: founder-requested infrastructure-grade product rubric; staging: GitHub Pages artifact plus exact same-origin hosted verification
- Profile source: live code, game-loop review, application release gate, current CI/staging evidence, internal-tools registry, and public-safe context
- Game-loop review: tightness 8.7 · progression 9 · session engagement 8.1 · retention 8.3 · soul fidelity 9 · overall 8.6
- Evidence caveat: Implementation-contract review only. GAME_LOOP.md and checked-in playtests are absent, the public SOUL intentionally omits private pillars, and PROJECT_STATUS impact remains zero. Automated coverage proves contracts, not fun, pace, adoption, or retention.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Feedback loop / privacy / source-derived product evidence | 2.5h | 9 | 9 | 37.3 | **consented-session-evidence-packet** — Create a local-only journey ledger with allowlisted checkpoint names, relative durations, occurrence deduplication, a hard event cap, and no account/save payload. Join its summary into the existing explicit Copy Receipt Pack action, expose exactly what will be shared, and add privacy, determinism, cap, and browser-wiring tests. |
| 2 | FIRE | Game loop / command parity / transactional UX | 3.0h | 10 | 8 | 34.5 | **weekly-plan-composer-authority** — Create a pure weekly-plan composer that owns decision-first ordering, explicit defer/no-plan outcomes, versioned preview and commit receipts, and injected UI collectors. Route topbar, command center, and mobile through it; render one concise staged-plan status; preserve the transactional API boundary; add pure coordinator and browser-wiring tests. |
| 3 | FIRE | Infrastructure / architecture truth / attack-surface reduction | 1.5h | 9 | 6 | 29.9 | **delegated-service-authority-only** — Delete the four unreferenced divergent scaffolds, export and construct only characterized delegated services, add a machine-readable authority manifest plus a guard that rejects advertised-but-undelegated services, and cover the live bundle contract with focused tests. |
| 4 | FIRE | UI/UX / progression / mobile parity | 3.5h | 9 | 8 | 29.4 | **progressive-week-room** — Refactor Franchise Architecture into a responsive Week Room: keep exactly one Now call and its reason above the fold, show compact Season and Legacy horizon chips, move signal/ledger/mastery detail into one accessible Architecture Review, preserve deep links and all source authorities, and add empty-state, accessibility, mobile, and browser-wiring tests. |

Combined priority: **131.1**.

## Premise verification and rejected phantom work

- Rejected/deferred “Add another generic rivalry, inbox, challenge, recap, or achievement system”: Rejected as additive sprawl. Live code already contains each of those systems; the higher-value defect is inconsistent weekly-plan ritual and overly dense presentation.
- Rejected/deferred “Add a server-backed or large-language-model coach”: Rejected on cost, custody, and evidence. The product is intentionally static-host-safe and cost-neutral, and no player evidence supports a variable-cost advisor.
- Rejected/deferred “Redesign all fourteen gameplay tabs”: Rejected as an unbounded rewrite. Live evidence identifies the Overview decision hierarchy as the narrow, testable pressure point.
- Rejected/deferred “Claim retention or engagement lift from existing local receipts”: Rejected because no consented receipt pack is checked in and impact remains zero. Instrumentation is not outcome evidence.
- Rejected/deferred “Add rewards to force daily return”: Rejected as misaligned. The product promise is consequential franchise memory, not streak coercion; source-derived season and legacy arcs already exist.
- Rejected/deferred “Predict which tactic will win”: Rejected because the simulation has no causal experiment supporting that claim. Existing film and ledger signals correctly remain descriptive.
- Rejected/deferred “Launch or flip SPARKED after local green checks”: Deferred honestly: hosted health/provenance, edge hardening, received email, same-revision parity, founder approval, and lifecycle coherence remain red.
- Rejected/deferred “Complete the entire GameSession strangler in one pass”: Rejected as unsafe and unmeasured. Four service files are not delegated at all and advertise divergent shapes; removing that false surface is the bounded root fix.
- Rejected/deferred “Optimize model spend or add API response caching”: Rejected: gameplay has no model calls, Max Plan cost is flat-rate/notional, API parity is 139 calls / 111 contracts / 0 adapter gaps, and no measured hot path supports caching.
- Rejected/deferred “Treat the lifecycle registry mismatch as a current-repo edit”: Rejected by ownership. Registry truth belongs to Studio Ops and must move through signed Ark cargo, never a sibling tree edit.

## Three recommended design moves

1. Use one weekly-plan composition authority so every entry point follows pressure and General Manager choice, then tactic, then one explicit commit.
2. Export a bounded, consented session-evidence packet that joins local ratings to observed setup-to-plan-to-debrief timing without account or save data.
3. Turn Overview into a progressive-disclosure Week Room with one current call above the fold and architecture history behind an accessible review.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| consented-session-evidence-packet | done | journey checkpoints are allowlisted, bounded, local-only, and relative; the packet includes no account identifier, token, or save payload; export remains explicit and contains ratings plus journey evidence; no engagement or retention lift is claimed |
| weekly-plan-composer-authority | done | every single-week entry point uses one composition authority; General Manager choice resolves before tactic selection; defer and explicit no-plan paths remain non-mutating and honest; a versioned preview/commit receipt is visible and tested |
| delegated-service-authority-only | done | the service bundle exposes only contracts and coaching; no deleted service import or constructor remains; the authority manifest names exact delegated call sites; a regression test rejects future scaffold-only advertising |
| progressive-week-room | done | one source-derived Now action is primary; Season and Legacy remain visible but compact; history and mastery are available through one accessible disclosure; desktop and mobile retain deep-link and keyboard behavior |
