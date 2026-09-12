# Audit — Franchise Architect: Football — Session 106

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product; game-loop payoff, truthful feedback, static-host safety and measured release readiness; staging: Stable Cloudflare staging before authorized main promotion and production deployment
- Profile source: context/PROJECT_STATUS.json, context/LATEST_HANDOFF.md, arc-profile (studio-ops copy)

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | HIGH | Simulation truth; feature depth; the root of the standing elite-density watch | 3.0h | 9 | 8 | 31.0 | **potential-is-drawn-on-a-scale-overall-does-not-share** — Make potential position-aware: derive it on the same scale overall is measured on (headroom above the player's own generated overall, sized by development trait and age) so a rookie is never generated past his ceiling, and re-measure the generation table plus elite density. |
| 2 | HIGH | Observability truth; gate population | 1.0h | 7 | 6 | 26.5 | **ledger-budget-gate-does-not-police-its-two-largest-ledgers** — Add WORK_LOG and TASK_BOARD to ROLLABLE_LEDGERS with their own entry patterns and order, and roll them — WORK_LOG is newest-last like the others; TASK_BOARD is newest-first with standing Now/Next sections that must stay live. |
| 3 | MEDIUM | Observability truth; renderer ordering | 0.5h | 5 | 4 | 15.1 | **brief-prints-session-authority-from-pre-heal-status** — Recompute the authority after a successful heal so the rendered line and the committed value agree in one pass, with a test that renders against a lagging status and asserts the emitted line reports the healed state. |
| 4 | LOW | Ecosystem; propagated machinery vs project contract | 0.5h | 4 | 3 | 9.1 | **doctor-remedy-names-a-contractually-forbidden-writer** — L1 plus a test asserting no doctor remedy names a path in forbiddenFiles, so propagation cannot reintroduce one silently. |

Combined priority: **82.0**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. Make potential position-aware: derive it on the same scale overall is measured on (headroom above the player's own generated overall, sized by development trait and age) so a rookie is never generated past his ceiling, and re-measure the generation table plus elite density.
2. Add WORK_LOG and TASK_BOARD to ROLLABLE_LEDGERS with their own entry patterns and order, and roll them — WORK_LOG is newest-last like the others; TASK_BOARD is newest-first with standing Now/Next sections that must stay live.
3. Recompute the authority after a successful heal so the rendered line and the committed value agree in one pass, with a test that renders against a lagging status and asserts the emitted line reports the healed state.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| potential-is-drawn-on-a-scale-overall-does-not-share | deferred | MEASURED, IMPLEMENTED, RE-FIXED, MEASURED AGAIN AND REVERTED. Position-aware potential (trait-sized headroom above the player's own overall, same stream slot, damped near the 99 ceiling) measured better than the session inherited on every distribution arm: generated-above-own-potential 36.8% to 0.0%, elite density 2.8% to 1.8%, dispersion drift 0.095 to 0.083, parity +0.043 to +0.034. It was still reverted: test/session90-development-environment.test.js asserts one offseason moves the league by its declared curve and nothing else, and read 0.285 against a 0.25 tolerance - then 0.289 after the obvious follow-up fix (per-room trait centres) was also implemented and measured. Reversion's mean contribution measured exactly 0.000 and the engine's measured trait centre made the gap slightly worse (0.297), so the residual is structural: development deltas land on ratings and overall is recomputed with position weights, so changing WHICH players move changes aggregate OVR at zero mean delta. Closing the gate would have required duplicating the engine inside the test or widening its tolerance; both refused. src/ differs from HEAD by 37 lines, all comment, verified by diff. Next session's item is the test's declared curve, not the generator. |
| ledger-budget-gate-does-not-police-its-two-largest-ledgers | implemented | ROLLABLE_LEDGERS now carries a per-ledger dir and includes logs/WORK_LOG.md (newest-last, both heading eras) and context/TASK_BOARD.md (newest-first, standing Now/Next sections above the first entry stay live). Rolled: WORK_LOG 213 KB -> 41 KB (78 archived), TASK_BOARD 206 KB -> 50 KB (93 archived), total 572 KB -> 244 KB, S105 entries intact in both. The budget test reads each ledger from its own directory, and a new test derives the population from disk - any context/ or logs/ markdown with 12+ dated session headings must be registered - so the list cannot silently omit a ledger again. |
| brief-prints-session-authority-from-pre-heal-status | implemented | sessionAuthority is now a let, and the self-heal block re-resolves it from the healed status immediately after updateProjectStatus writes, so all three emit sites (the warning, the brief row and the session-authority comment) report the state that exists on disk. Two tests: a behavioural one asserting a lagging status diverges and the healed one does not, and a structural one asserting the recompute sits between the heal write and the emitted comment - read rather than executed, because the ordering is the property. |
| doctor-remedy-names-a-contractually-forbidden-writer | implemented | The last-session-summary entry is removed from HEAL_MAP with the contract history recorded in its place, and a test asserts no HEAL_MAP remedy names any basename in PROJECT_AUTHORITY_CONTRACT.forbiddenFiles. doctor.mjs defines no last-session-summary check here, so the remedy was inert advice to violate the contract. |
