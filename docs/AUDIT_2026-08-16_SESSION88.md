# Audit — Franchise Architect: Football — Session 88

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay and app-release-gate: consequential General Manager decisions, simulation truth, mobile/theme parity, static-host safety, exact staging identity, rollback, privacy, and honest independent launch holds; staging: stable GitHub/Cloudflare Pages staging must prove the exact immutable candidate before direct-to-main production promotion; public sanitization mandatory
- Profile source: arc profile, S87 handoff, live canon adoption, current source tree, direct DOM/render-path tracing of the S87 GM Legacy mount, doctor output, and current deployment receipts
- Game-loop review: tightness 6.5 · progression 6 · session engagement 7 · retention 6 · soul fidelity 7.5 · overall 6.6
- Evidence caveat: No new gameplay-loop premise was found broken this session; the S86/S87 findings already repaired the load-bearing fictions (weekly tactic, draft pick, aging curve, salary scarcity, narrative pressure). This session's finding is a UI-truth defect in the S87-shipped GM Legacy card empty/error state, not a loop-tightness regression, so the game-loop scores are carried forward unchanged from S87 pending the next dedicated game-loop-review pass.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | MEDIUM | UI/UX truth / empty-state honesty | 0.5h | 5 | 3 | 6.5 | **gm-legacy-card-empty-state-truth** — Extract the DOM-application logic into an exported, directly-testable applyGmLegacyCard(card, wrap, summary) that hides/shows the #gmLegacyCardWrap article (falling back to the score node if the wrapper id is absent) and keep renderGmLegacyScore as a thin fetch+delegate wrapper; add a focused Node test that exercises both the empty and populated paths against real DOM-stub elements. |

Combined priority: **6.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “raise/lower the salary cap or scarcity curve further”: Rejected. S87 already shipped a fixed-seed-verified versioned market curve with a reachable $45M ceiling and no illegal opening rosters; re-touching it without new distributional evidence would be force-green, not a fix.
- Rejected/deferred “new AI coach or paid inference layer”: Rejected. The game remains intentionally zero-backend for its core loop; no capability gap in this session's findings requires variable-cost inference.
- Rejected/deferred “rewrite the GM Legacy API contract or persona-tier scoring model”: Rejected. The backend summary (getGmLegacySummary/computeGmLegacyScore) is correct and always returns a real object once initGmLegacy has run; the defect was purely in the frontend's choice of DOM node to hide, not in the data contract.
- Rejected/deferred “add a new debt-marker/TODO sweep as an audit item”: Rejected as a phantom candidate. node scripts/generate-innovation-pack.mjs --stdout found 0 open ranked candidates and a repo-wide grep for TODO/FIXME/HACK across src, public/lib and test returned zero matches — there is no marker backlog to clear.
- Rejected/deferred “treat lifecycle-authoritative-registry (SPARKED vs local FORGE) as a fixable local item”: Rejected. This is a cross-repo authority drift between this tree's local contract and portfolio/PROJECT_REGISTRY.json in vaultspark-studio-ops; CANON forbids cross-repo tree edits from here, so it is correctly a warning (non-blocking) pending Studio Ark reconciliation, not a code defect.

## Three recommended design moves

1. Keep hardening empty/error states on every card that mixes a hide/show target with a text-content target — the GM Legacy card bug (hiding the score paragraph instead of the whole card) is the second instance of this exact class found across the audit history; a lint rule or shared card-visibility helper would catch the next one before a session has to.
2. Resolve the doctor release-authority staleness by running the full staging-verify -> production-promote -> reconcile pipeline against current HEAD before founder-authorized production promotion, rather than treating a fast-follow hotfix commit as exempt from the reconciliation step.
3. Continue deferring cohort-dependent items (Now/Next TASK_BOARD rows: real-cohort observation, launch-authority reconciliation) — they require actual opted-in users or founder/registry action and cannot be manufactured without violating the no-fabricated-data rule.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| gm-legacy-card-empty-state-truth | shipped | Extracted applyGmLegacyCard(card, wrap, s) in public/lib/tabOverview.js; wrap now resolves #gmLegacyCardWrap (falls back to card if absent) and both the empty-state and catch-block paths hide wrap, not card. New focused test in test/session87-franchise-truth.test.js proves the wrapper hides on a null summary and un-hides with correct score/grade/label text on a populated summary. Full local suite 1,137/1,137 (was 1,136/1,136). |
