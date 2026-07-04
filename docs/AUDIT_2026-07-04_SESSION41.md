# Audit 2026-07-04 Session 41 — Franchise Architect: Football

Fresh `/goal /arc` audit after the Session 40 genius cache was exhausted. Premises were checked against live mobile overlay event wiring, the current `/api/gm-decision` contract, and focused mobile-loop tests. The local `scripts/sample-codebase.mjs` helper is absent, so this audit used targeted `rg` plus direct file reads instead of treating the missing sampler as a blocker.

## Summary

- Ranked items: 1
- Combined priority: 26.3
- Top item: mobile-gm-decision-fallback-modal-path
- Game-loop read: mobile mode already renders inline GM decision options from the current API; the remaining edge was that the generic mobile decision event had no app-shell listener.
- Release gate read: no SPARKED flip attempted; launch remains blocked on real received-message proof for `football@playfranchisearchitect.com` forwarding/copying and current live-origin/routing evidence.

## Ranked Plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Mobile core loop / fallback actionability | 0.5h | 7 | 6 | 26.3 | **mobile-gm-decision-fallback-modal-path** - `renderDecisionCard()` emitted `vsfgm:mobile-decision` for non-inline cards, but `syncMobileLoopOverlay()` only listened for inline choice submissions. **Recipe:** bind the generic mobile-decision event once, route `choose-gm-decision` through the existing `checkAndShowGmDecision()` modal, then submit any returned choice through the existing `submitMobileGmDecisionChoice()` consequence path. |

## Game-Loop Review

| Axis | Score | Notes |
|---|---:|---|
| Loop tightness | 10/10 | Pressure -> decision -> consequence is now covered for inline and fallback GM decision paths. |
| Progression curve | 9/10 | No economy/progression changes; the existing GM decision ledger remains the source of truth. |
| Session engagement | 10/10 | A phone user never gets a dead decision card if option details are temporarily unavailable. |
| Retention hooks | 9/10 | Mobile continuation remains low-friction and static-host-safe. |
| Soul fidelity | 10/10 | Preserves the serious General Manager ritual instead of adding a second mobile-only decision engine. |

## Rejected / Deferred With Evidence

- **sparked-flip** - still blocked on real received-message proof that `football@playfranchisearchitect.com` forwards/copies to Studio operations plus current live-origin/routing evidence. No fabricated launch evidence used.
- **new-mobile-decision-backend** - rejected because `/api/gm-decision`, `checkAndShowGmDecision()`, and `/api/advance-week` `gmDecisionChoice` already own the source-of-truth path.
- **sample-codebase-required** - rejected as a blocker. `scripts/sample-codebase.mjs` is absent in this repo; targeted grep and direct file reads supplied live evidence for this narrow audit.

## Execution Log

| Item | Status | Evidence | Verification |
|---|---|---|---|
| mobile-gm-decision-fallback-modal-path | Shipped | `public/app.js` now listens for `vsfgm:mobile-decision`, filters to `choose-gm-decision`, opens the existing GM decision modal path, and submits the returned choice through `submitMobileGmDecisionChoice()`. `test/mobile-loop.test.js` covers the app-shell binding. | `node --check public/app.js`; `node --check public/lib/mobileLoop.js`; `node --test test/mobile-loop.test.js` 12/12. |
