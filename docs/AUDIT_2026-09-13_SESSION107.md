# Audit — Franchise Architect: Football — Session 107

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product; game-loop payoff, truthful feedback, static-host safety and measured release readiness; staging: Stable Cloudflare staging before authorized main promotion and production deployment
- Profile source: context/PROJECT_STATUS.json, context/LATEST_HANDOFF.md, arc-profile (studio-ops copy, registry-matched)

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | HIGH | Gate truth; the defect that blocked S106's headline change | 2.0h | 9 | 8 | 36.0 | **s90-gate-conditions-on-its-own-outcome** — L1 plus a matched counterfactual on the same seed — wired environment against an identical offseason with the tilt zeroed — so the environment's contribution is isolated without re-implementing any of the engine inside the test. |
| 2 | HIGH | Simulation truth; feature depth; the generation-side root of the elite-density watch | 3.0h | 9 | 8 | 31.0 | **potential-is-drawn-on-a-scale-overall-does-not-share** — L1 plus the corrected item-1 gate green on the new generator, and a ten-season canonical-seed receipt compared with the matched control on this tree (elite density, dispersion drift, parity) — no threshold moved. |
| 3 | MEDIUM | Record truth | 0.5h | 6 | 5 | 22.7 | **s106-record-carries-a-refuted-causal-diagnosis** — L1 plus replace the source comment with the landed design and its measurement, and record the pattern in agent memory: a residual that moves when the population changes is a population effect before it is a mechanism. |
| 4 | MEDIUM | Gate population; realism | 3.0h | 7 | 7 | 21.1 | **elite-density-cut-is-position-blind-against-a-per-position-anchor** — L1 across two further seeds, with the declared-population question written first in DECISIONS and a stated reason for either answer. |

Combined priority: **111.0**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. L1 plus a matched counterfactual on the same seed — wired environment against an identical offseason with the tilt zeroed — so the environment's contribution is isolated without re-implementing any of the engine inside the test.
2. L1 plus the corrected item-1 gate green on the new generator, and a ten-season canonical-seed receipt compared with the matched control on this tree (elite density, dispersion drift, parity) — no threshold moved.
3. L1 plus replace the source comment with the landed design and its measurement, and record the pattern in agent memory: a residual that moves when the population changes is a population effect before it is a mechanism.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| s90-gate-conditions-on-its-own-outcome | implemented | L3 shipped. test/session90-development-environment.test.js now measures every progressed player (captured before the call, retirees included) against the declared curve at the engine's measured potential centre, and isolates the environment with a matched seeded offseason (wired vs zeroed tilt). Tolerance tightened 0.25 -> 0.10 on the readings: largest curve gap 0.056 and largest environment contribution 0.035 across four seeds on both the old draw and the shipped generator. Negative controls: the pre-S90 environment through the same matched offseason reads +0.82 to +0.90 and fails; the survivor reading of the same run exceeds the progressed reading by more than the tolerance. The old survivor gate on the new generator reads 0.301 (S106's red reproduced) while the environment contributes 0.002 in that run. 20/20 in the two affected files. |
| potential-is-drawn-on-a-scale-overall-does-not-share | implemented | L3 shipped. Potential is trait-sized headroom above the player's own overall (SUPERSTAR 6-18, HIDDEN 3-14, NORMAL 0-9, BUST 0-3), whole at 23, closed by 31, tapered over the 55 points below 99, in the same single rng.int slot, finite inputs asserted. Generation, four seeds: above own potential 36.0-37.6% -> 0.0%; mean potential tracks the room (QB 82.1-83.3, TE 74.3-75.2); every mean overall and 90+ count unchanged to the decimal. The first calibration (span 25) was measured and rejected: ten seasons on the canonical seed read elite 2.4% but dispersion 0.112 against the old draw's 2.8% / 0.095 / parity +0.043. Span 40 read 3.0% / 0.101 / +0.032; span 55 read 2.1% / 0.093 / -0.001 — better than the old draw on all three arms, no threshold moved, each arm still reported as its status. Chosen on the monotone dispersion arm; elite density was non-monotone across the sweep and not used to choose. The corrected item-1 gate is green on it. test/session107-position-relative-potential.test.js covers the generation property, room tracking, resolvePotential rules and finite guards, profile surfacing, and a negative control reconstructing the position-blind draw. Player-facing: POT columns and the profile narrative's development runway, which is no longer negative for generated players; release note on public/status.html. |
| s106-record-carries-a-refuted-causal-diagnosis | implemented | L3 shipped. DECISIONS S107 Decision 1 supersedes S106 Decision 0's causal claim with both measurements side by side (S106 entry untouched, append-only). The randomPotential doc comment is replaced with the landed design and its measurement. TRUTH_AUDIT S107 names the contradiction. Agent memory records the pattern (survivor population is selection on the outcome). |
| elite-density-cut-is-position-blind-against-a-per-position-anchor | deferred | L1 measured, ungated, on the landed generator; L2/L3 deferred to their own session by design (the question must be stated first and must not be adopted as a route to a green gate). End-of-window 90+ cohort by room, rostered basis: canonical seed 20260306 (span 55) — Offensive Line 29, Quarterback 6, Secondary 1, every other room 0 (QB+OL 35 of 36, 97%). Seed 2026 — old draw: OL 30, QB 11, Secondary 8, Receivers 4, Backfield 2, Front Seven 1, Specialists 1 (QB+OL 41 of 57, 72%); span 55: OL 29, QB 13, Receivers 2, Secondary 2 (QB+OL 42 of 46, 91%). Position-relative potential shrank the cohort and concentrated it further in the two rooms with the highest overall scale, which sharpens the position-blind-cut question rather than answering it. No per-position arm added; no ceiling moved. |
