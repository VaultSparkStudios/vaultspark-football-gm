<!-- generated-by: /audit arc session24 -->
<!-- generated-at: 2026-06-30 -->
<!-- project: vaultspark-football-gm · type: public-unlaunched game/internal protocol surface -->

# Project Audit - VaultSpark Football GM Session 24

> Live-code audit focused on protocol honesty, expansion-command completeness, Windows no-window safety, and source-of-truth drift. Premises were checked against current repo files and test output before implementation.

## Top-line

- Total items: 4 shipped, 3 deferred/rejected honestly
- Baseline verification before changes: `npm test` passed 165/165
- Primary blocker preserved: external GitHub Pages custom-domain certificate/routing remediation

## Ranked Plan

| # | Tier | Axis | Effort | Impact | Innov. | Priority | Item |
|---|---|---|---|---:|---:|---:|---|
| 1 | fire | automation/process | 45m | 9 | 7 | 29.4 | **protocolize-innovation-pack** - `node scripts/ops.mjs innovation-pack` was required by SESSION_PROTOCOL but absent, forcing manual second-order passes. Add a project-local generator with dry-run support and focused smoke coverage. |
| 2 | fire | security/process | 20m | 8 | 6 | 25.6 | **catch-dynamic-child-process-imports** - The Windows no-window guard caught static imports but missed `await import('node:child_process')` in the startup v5 branch. Route that branch through `safe-spawn` and extend the guard regex with a regression test. |
| 3 | high | observability honesty | 30m | 8 | 5 | 24.0 | **repair-startup-sil-zeroes** - Startup brief rendered Dev Health/Alignment/Momentum/Engagement/Process as zero while the same source reported 921/1000 and `PROJECT_STATUS.json` had real v3 categories. Fall back to `silCategoriesV3` for the first five rows. |
| 4 | high | source-of-truth hygiene | 20m | 7 | 4 | 19.6 | **clear-stale-task-board-open-rows** - Old rows for Pages CI, GameSession lookup indexes, and closeout renderer shims still parsed as open despite later entries proving them done. Correct the stale statuses so generated queues stop resurrecting completed work. |

## Deferred / Rejected

- **client-runtime-501-sweep** - rejected as a bad audit item today. The generic 501 fallback is honest unsupported-route behavior; no specific missing endpoint was verified.
- **latest-session23-audit-follow-through** - closed as already satisfied after re-checking the execution log, code, and baseline suite.
- **custom-domain-certificate-remediation** - remains external/human-blocked after secrets audit and blocker preflight; do not fabricate launch readiness.

## Execution Log

- **protocolize-innovation-pack** - shipped. Evidence: `scripts/generate-innovation-pack.mjs`, `ops.mjs` dispatch, and `test:studio` dry-run shim coverage.
- **catch-dynamic-child-process-imports** - shipped. Evidence: raw dynamic import removed from `render-startup-brief.mjs`; `scanDirectChildProcessImports()` now detects dynamic imports; focused regression added.
- **repair-startup-sil-zeroes** - shipped. Evidence: first five score rows now fall back to `PROJECT_STATUS.json.silCategoriesV3` values.
- **clear-stale-task-board-open-rows** - shipped. Evidence: corrected stale status rows in `context/TASK_BOARD.md`; innovation-pack dry run dropped those false open items.

Verification so far: `node --check scripts/generate-innovation-pack.mjs`; `node --check scripts/render-startup-brief.mjs`; `node scripts/check-windows-hide.mjs`; `node scripts/ops.mjs innovation-pack --dry-run`; `npm run test:studio` 6/6; baseline `npm test` 165/165 before implementation.