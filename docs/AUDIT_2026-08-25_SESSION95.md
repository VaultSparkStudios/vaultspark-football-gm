# Audit — Franchise Architect: Football — Session 95

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product, game-loop, realism, and release gates; staging: Exact immutable candidate on staging before production.
- Profile source: S95 evidence

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | Release integrity | 3.0h | 10 | 6 | 10.0 | **release-train-can-publish-a-browser-red-candidate** — Fix assertion and make browser CI a deploy prerequisite. |
| 2 | CRITICAL | Game loop | 12.0h | 10 | 9 | 9.7 | **postseason-collapses-the-weekly-decision-loop** — Implement round-by-round postseason state and tests. |
| 3 | HIGH | UI/UX routing | 5.0h | 9 | 7 | 9.1 | **next-action-routing-drifted-from-live-surfaces** — Centralize exact destinations and prove every target exists. |
| 4 | HIGH | Simulation realism | 14.0h | 10 | 10 | 9.0 | **facility-capital-policy-is-neither-differentiated-nor-stationary** — Recalibrate capital policy, add a sink, receipts, and distribution gates. |
| 5 | HIGH | Release evidence | 8.0h | 9 | 8 | 8.8 | **release-proof-is-bound-to-an-orphaned-history** — Bind visual, mobile, staging, and production proof to one SHA. |
| 6 | MEDIUM | Security truth | 4.0h | 7 | 6 | 8.0 | **gist-checksum-claims-forgery-detection-without-authentication** — Honest copy plus versioned optional HMAC and legacy support. |
| 7 | MEDIUM | CI evidence | 3.0h | 7 | 6 | 7.5 | **deep-realism-workflow-times-out-at-the-evidence-boundary** — Preserve partial evidence and align timeout contracts. |

Combined priority: **62.1**.

## Premise verification and rejected phantom work

- Rejected/deferred “rival-ai-frozen”: REFUTED Recurring AI investment and degradation exist.
- Rejected/deferred “facility-writes-free”: REFUTED Upgrades already debit cash.
- Rejected/deferred “paid-llm-required”: REFUTED Deterministic factors suffice.
- Rejected/deferred “local-receipts-prove-retention”: REFUTED No real longitudinal cohort exists.
- Rejected/deferred “deploy-equals-launch”: REFUTED Deployment authorization is not a lifecycle flip.

## Three recommended design moves

1. Fix assertion and make browser CI a deploy prerequisite.
2. Implement round-by-round postseason state and tests.
3. Centralize exact destinations and prove every target exists.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| release-train-can-publish-a-browser-red-candidate | shipped | deploy-pages now runs the full Playwright browser suite before artifact upload; the profile assertion reads PLAYER_DEVELOPMENT_PROFILE.version; focused workflow/security checks, 54/54 browser tests, and the 1,280/1,280 canonical receipt pass. |
| postseason-collapses-the-weekly-decision-loop | shipped | Postseason state persists by round, resolves one controlled-team game per command, preserves exact plans across save/resume, and batch delegation loops through every gate; focused postseason tests and the canonical matrix pass. |
| next-action-routing-drifted-from-live-surfaces | shipped | public/lib/gameplayNavigation.js is the shared phase-to-surface authority consumed by decision, consequence, chapter, and weekly-plan routes; exact-target focused tests and browser routing pass. |
| facility-capital-policy-is-neither-differentiated-nor-stationary | shipped | Owner capital now models football-operations liquidity, obligations, runway, trait-weighted appetite, bounded distributions, and factor receipts. Year-zero willingness calibrates to 19/32 and year-40 cash p90/max to $152.0M/$201.2M with no club at the facility ceiling; deterministic 1/8/15/40-year gates pass. |
| release-proof-is-bound-to-an-orphaned-history | verification-in-progress | Source and browser suites are green. Final immutable desktop/mobile/theme visual receipt, stable staging provenance, and exact production identity are pending in the active release wave. |
| gist-checksum-claims-forgery-detection-without-authentication | shipped | Public copy now distinguishes accidental-corruption checks from authorship authentication; optional PBKDF2-derived HMAC verification is versioned, legacy-compatible, and covered by focused security tests plus the canonical matrix. |
| deep-realism-workflow-times-out-at-the-evidence-boundary | shipped | The scheduled realism job now has aligned 125/90-minute budgets, writes incremental progress, and uploads progress/report/JSON artifacts under always(); workflow contract tests and the canonical matrix pass. |
