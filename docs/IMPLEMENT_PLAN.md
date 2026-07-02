<!-- generated-by: /implement skill v1.0 -->
<!-- generated-at: 2026-07-01 · session 29 -->
<!-- source: docs/AUDIT_2026-07-01_SESSION29.json (17 items) -->

# Implement Plan — Session 29

Optimal-efficiency order (not raw priority): foundations and truth fixes burst in parallel on disjoint files; the four 🔥 game-story items run sequentially in the main loop where the engine context lives; UX adoption items follow once engine surfaces settle; CI gating last (benefits from the final test topology).

Local note: `sprint-runner.mjs` / `audit-sidecar.mjs` / `session-floor.mjs` / `medium-quality-gates.mjs` are not vendored in this public repo — manual fallback per skill spec, with `node scripts/context-meter.mjs --json` as the saturation gate and the game success bars ("visible in browser UI + focused test", "static-host-safe") applied per item.

## Wave A — parallel burst (disjoint files, in-process subagents, no OS windows)

| Lane | Items | Files owned |
|---|---|---|
| Alpha | genius-cache-truth (#7) + test-spawn-window-guard (#11) | scripts/cache-genius-list.mjs · scripts/check-windows-hide.mjs · test/studio-protocol-smoke.test.js |
| Beta | launch-evidence-redirect-truth (#10) | scripts/launch-evidence-report.mjs · test/launch-evidence-report.test.js |
| Gamma | orphan-test-shards (#8) + determinism-smoke-on-push (#15) | scripts/run-test-shard.mjs · test/shard-coverage.test.js (new) · test/determinism-smoke.test.js (new) |
| Delta | landing-front-door (#9) + theme-parity-static-pages (#16) | public/*.html · public/sitemap.xml · test/public-compliance.test.js |
| Epsilon | ci-deploy-gating (#14) | .github/workflows/deploy-pages.yml · .github/workflows/deploy-backend.yml |

Rules for lanes: no commits (main loop batches commits), no full-suite runs (focused `node --test <file>` only — §0 forbids concurrent N-child spawners), safe-spawn/windowsHide discipline, L2 rung by default.

## Wave B — game story arc (main loop, sequential; engine + UI context shared)

1. time-capsule-receipts (#1, L2) — src/engine/timeCapsule.js + Season Review receipts + preseason news
2. narrative-continuity-engine (#3, L2) — continuity ledger + pressConference memory + bounded morale/hot-seat feedback
3. scouting-skill-reveal (#6, L2) — allocation-driven pro-day precision + gated flags + war-room surfaces
4. situational-playcalling (#5, L2) — choosePlayCall module + 4th-down brain + game-plan honored + distribution tests

## Wave C — browser engagement + resilience (main loop)

5. return-hook-digest (#2, L2) — while-you-were-away card + attention badge
6. what-if-replay (#4, L2) — Monday Morning QB sandbox replay, non-persistence proven
7. silent-error-surfacing (#13, L2) — panelGuard() + adoption at cited sites
8. tabs-aria-modal-focus (#12, L2) — ARIA tabs + shared modalManager + touch targets

## Wave D — architecture truth

9. service-scaffold-honesty (#17, L1→L2 if budget) — truth-align notes + DECISIONS entry

## Verify + close

Full `npm test` (direct exit code), Playwright UI, build:pages + smoke:pages, windows-hide guard, wave guard, canon checks — then per-item Execution Log rows in the audit and TASK_BOARD status flips.
