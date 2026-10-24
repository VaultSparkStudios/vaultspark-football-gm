# Audit — Franchise Architect: Football — Session 121

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched —
- Rubric: product; staging: independent stable staging
- Profile source: S121 fresh nine-axis source review
- Game-loop review: tightness 7 · progression 7 · session engagement 7 · retention 6 · soul fidelity 7
- Evidence caveat: Source review only, not measured player enjoyment. GAME_LOOP contract and existing decision, timeline and moment surfaces reviewed. Next actions: preserve decision loop, repair reliable moment evidence, ship visible footer polish without adding another overlay.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | 🔥 | observability-honesty | 2.0h | 8 | 3 | 12.0 | **backend-failure-evidence** — Preserve bounded SSH retries and host identity; attach sanitized remote failure diagnostics to the error, test credential redaction and non-retry of application failures, inspect current host admission through the existing gateway diagnostic, then promote the exact passing candidate. |
| 2 | 🔥 | sil-debt | 1.0h | 7 | 3 | 13.3 | **goal-lock-anchor** — Write and preserve the session start commit using safe-spawn; test the real writer in an isolated git fixture through bindArcGoal, including repeated startup and forced rotation. Repair this S121 lock from its observed original HEAD and bind this native goal. |
| 3 | 🔥 | ui-ux-feedback | 1.0h | 6 | 3 | 11.4 | **public-footer-gutter** — Capture before images on desktop/mobile in dark/light; add a scoped shared-footer gutter that also fits already constrained parents; inspect all shared-footer routes after build and capture the four variants. Preserve links and legal text. |
| 4 | 🔥 | speed-organization-efficiency | 2.0h | 6 | 4 | 12.0 | **capture-render-readiness** — Replace the arbitrary public-page delay with bounded layout and image readiness; scroll normally through lazy content before full-page capture. Add a browser regression with a delayed off-screen image. S121 mobile moment-card baseline passed 24 captures and visual inspection: carried framing defect not reproduced, no speculative fix. |

Combined priority: **48.6**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. Preserve bounded SSH retries and host identity; attach sanitized remote failure diagnostics to the error, test credential redaction and non-retry of application failures, inspect current host admission through the existing gateway diagnostic, then promote the exact passing candidate.
2. Write and preserve the session start commit using safe-spawn; test the real writer in an isolated git fixture through bindArcGoal, including repeated startup and forced rotation. Repair this S121 lock from its observed original HEAD and bind this native goal.
3. Capture before images on desktop/mobile in dark/light; add a scoped shared-footer gutter that also fits already constrained parents; inspect all shared-footer routes after build and capture the four variants. Preserve links and legal text.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| backend-failure-evidence | shipped | — |
| goal-lock-anchor | shipped | — |
| public-footer-gutter | shipped | — |
| capture-render-readiness | shipped | — |
