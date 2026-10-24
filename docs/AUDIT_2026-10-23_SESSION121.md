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
| 1 | 🔥 | ui-ux-feedback | 1.0h | 6 | 3 | 56.8 | **public-footer-gutter** — Capture before images on desktop/mobile in dark/light; add a scoped shared-footer gutter that also fits already constrained parents; inspect all shared-footer routes after build and capture the four variants. Preserve links and legal text. |
| 2 | 🔥 | speed-organization-efficiency | 2.0h | 6 | 4 | 48.0 | **capture-render-readiness** — Replace the arbitrary public-page delay with bounded layout and image readiness; scroll normally through lazy content before full-page capture. Add a browser regression with a delayed off-screen image. S121 mobile moment-card baseline passed 24 captures and visual inspection: carried framing defect not reproduced, no speculative fix. |
| 3 | 🔥 | observability-honesty | 2.0h | 8 | 3 | 36.0 | **backend-failure-evidence** — Preserve bounded SSH retries and host identity; attach sanitized remote failure diagnostics to the error, test credential redaction and non-retry of application failures, inspect current host admission through the existing gateway diagnostic, then promote the exact passing candidate. |
| 4 | 🔥 | sil-debt | 1.0h | 7 | 3 | 13.3 | **goal-lock-anchor** — Write and preserve the session start commit using safe-spawn; test the real writer in an isolated git fixture through bindArcGoal, including repeated startup and forced rotation. Repair this S121 lock from its observed original HEAD and bind this native goal. |

Combined priority: **154.0**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. Capture before images on desktop/mobile in dark/light; add a scoped shared-footer gutter that also fits already constrained parents; inspect all shared-footer routes after build and capture the four variants. Preserve links and legal text.
2. Replace the arbitrary public-page delay with bounded layout and image readiness; scroll normally through lazy content before full-page capture. Add a browser regression with a delayed off-screen image. S121 mobile moment-card baseline passed 24 captures and visual inspection: carried framing defect not reproduced, no speculative fix.
3. Preserve bounded SSH retries and host identity; attach sanitized remote failure diagnostics to the error, test credential redaction and non-retry of application failures, inspect current host admission through the existing gateway diagnostic, then promote the exact passing candidate.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| public-footer-gutter | shipped | Shared footer spacing and legal-line flow are implemented. LATEST.json binds64 inspected before/after images to exact candidate5410b8b5;56 public captures and staging14/14 pass. Frontend production readback and rollback verified. Exact candidate CI seven required jobs, Pages/API promotion, production14/14 provenance and hosted performance verified; reports/s121-release-acceptance.json. |
| capture-render-readiness | shipped | The delayed off-screen image regression passes in the canonical browser suite;56 immutable public captures pass. The carried mobile moment-card clipping did not reproduce in24 baseline captures and received no speculative code change. Exact candidate CI seven required jobs, Pages/API promotion, production14/14 provenance and hosted performance verified; reports/s121-release-acceptance.json. |
| backend-failure-evidence | shipped | Credential-safe refusal diagnostics are implemented and tested, including ANSI/NUL normalization. Reports/s121-backend-workflow.json verifies the exact API deployment, unchanged database/routing/process and retained rollback image. Exact candidate CI seven required jobs, Pages/API promotion, production14/14 provenance and hosted performance verified; reports/s121-release-acceptance.json. |
| goal-lock-anchor | shipped | The real writer fixture binds a native goal, preserves its start anchor on repeated startup, rotates the anchor on force and refuses a missing Git anchor. Current goal binds S121 at3a85f2bd; exact candidate CI passes the registered test. Exact candidate CI seven required jobs, Pages/API promotion, production14/14 provenance and hosted performance verified; reports/s121-release-acceptance.json. |
