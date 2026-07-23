# Audit — Franchise Architect: Football — Session 53

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game/app
- Rubric: founder-requested infrastructure-grade product rubric; staging: GitHub Pages artifact plus canonical-origin verification
- Profile source: live code, direct 420-test baseline, game-loop review, application release gate, infrastructure debt sweep, and public-safe context
- Game-loop review: tightness 8.4 · progression 8.5 · session engagement 8.6 · retention 8.2 · soul fidelity 8.7 · overall 8.5
- Evidence caveat: Executable-contract review only: 34/34 focused contracts and 1/1 Playwright play-mode smoke. No GAME_LOOP document, checked-in playtest corpus, or private SOUL ledger exists here; no claim about fun, churn, pacing, or sentiment is made.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Infrastructure / transactional integrity / observability | 2.0h | 10 | 8 | 40.0 | **post-commit-hydration-truth** — Create one post-commit hydration coordinator that accepts the authoritative command receipt, applies state exactly once, runs named secondary loaders with all-settled diagnostics, returns a committed/degraded receipt, keeps failed panels retryable, and makes desktop/mobile action text distinguish committed state from refresh degradation; add focused failure-injection tests. |
| 2 | FIRE | Infrastructure / test truth / automation | 1.5h | 9 | 7 | 34.9 | **direct-test-receipt-authority** — Teach run-test-shard to aggregate direct per-shard pass/fail counts into a versioned atomic .cache/test-count.json receipt only when every requested shard exits; add refresh-test-count as a truthful verifier/repair entrypoint; scan real test and tests-ui mtimes; make startup and closeout renderers consume the receipt with digest/freshness checks; add fixture tests for pass, fail, stale, and partial runs. |
| 3 | FIRE | Game depth / progression / tactical identity | 3.0h | 9 | 9 | 34.9 | **tactical-identity-arc** — Build a deterministic Tactical Identity ledger from executed film receipts: classify offensive/defensive doctrine, count recent commitment and observed alignment separately, expose a bounded three-tier mastery with explicit non-causal language, preserve it through snapshots because receipts are persisted, render progression and tradeoffs in Overview, and add same-seed/save-restore/browser tests without creating a new currency. |
| 4 | FIRE | UI/UX / command clarity / desktop-mobile parity | 2.5h | 9 | 8 | 33.2 | **shared-franchise-command-center** — Extract one viewport-neutral franchise command selector that ranks blocking, before-advance, and optional actions from live dashboard/news/pending-choice state; feed both mobile and a new accessible Overview command center; deep-link to exact tabs/actions, visibly gate Advance when a controlled blocking choice exists, and add selector, browser, keyboard, and parity tests. |
| 5 | HIGH | Feedback loop / privacy / evidence quality | 2.0h | 8 | 8 | 32.0 | **contextual-evidence-moments** — Add a deterministic, frequency-capped contextual evidence prompt after three receipt-backed milestones; reuse the existing four ratings and local-only store, prefill only public-safe milestone context, support dismiss/snooze without dark patterns, never auto-send, and keep export explicit; add storage, frequency, accessibility, and milestone-dedup tests. |
| 6 | HIGH | Legal/IP / public compliance | 0.5h | 8 | 3 | 18.9 | **exact-proprietary-footer-contract** — Add one canonical auto-year proprietary footer helper/contract across game, index, landing, contact, privacy, terms, and IP surfaces; preserve brand links and navigation; extend public-compliance tests to fail on missing or open-source language. |

Combined priority: **193.9**.

## Premise verification and rejected phantom work

- Rejected/deferred “Promote launch/SPARKED posture”: Deferred honestly: canonical health is 404, HSTS/frame/CSP are incomplete, deploy provenance and received email proof are absent, literal CI last-five is 3/5, and founder approval is not recorded.
- Rejected/deferred “Repair the authoritative registry or apex host directly”: Rejected as sibling-owned work. This repo may emit evidence and Ark cargo but cannot edit another repository to make its gate green.
- Rejected/deferred “Add generic retention widgets, achievements, saves, or telemetry”: Rejected as false premise: return digest, inbox, challenges, rivalry, replay, history, epilogues, exports, and local receipts already exist; no measured need justifies new custody or variable cost.
- Rejected/deferred “Treat prior failing CI history as fixable local work”: Rejected: current HEAD is green. Historical failures remain truthful inputs to the literal 5/5 gate and cannot be rewritten.
- Rejected/deferred “Rewrite GameSession or install a bundler”: Culled as unsafe decomposition or unmeasured dependency work. The verified defects have narrower, testable authority boundaries.
- Rejected/deferred “Claim player delight or retention efficacy”: Rejected because there is no real receipt corpus. The implementation may improve evidence discoverability but impact scores remain zero until actual receipts exist.

## Three recommended design moves

1. Make successful franchise mutations irrevocably legible even when secondary panel hydration degrades.
2. Give desktop and mobile one shared ranked command authority so every blocking decision points to the exact next action.
3. Turn repeated tactical intent into a source-derived identity progression and ask for bounded local evidence only at real milestones.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| post-commit-hydration-truth | implemented | Implemented: authoritative state applies once; named secondary loaders settle independently; degraded committed actions remain successful and retryable; focused hydration/browser tests pass. |
| direct-test-receipt-authority | implemented | Implemented: direct TAP aggregation writes an atomic digest-bound receipt only after a complete green run; stale/partial/failure fixtures and Studio shard pass. |
| tactical-identity-arc | implemented | Implemented: persisted film receipts derive a deterministic bounded three-tier identity ledger; repetition and alignment remain distinct; save/restore and non-causal copy tests pass. |
| shared-franchise-command-center | implemented | Implemented: desktop and mobile consume one ranked selector; controlled decisions gate the terminal advance action; parity, deep-link wiring, and selector tests pass. |
| contextual-evidence-moments | implemented | Implemented: authoritative opening/draft/season milestones trigger a seven-day-capped local-only receipt prompt with persistent snooze/dismiss and no network path; focused tests pass. |
| exact-proprietary-footer-contract | implemented | Implemented: all public HTML carries the exact proprietary line; the Pages build asserts the shared contract; public compliance, bundle build, and static smoke pass. |
