# Audit — Franchise Architect: Football — Session 91

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay and app-release-gate; staging: Cloudflare Pages staging must prove the exact immutable candidate before direct-to-main production promotion; public sanitization mandatory
- Profile source: arc profile, S90 handoff/closeout brief and task board, live source tree, four seeded 12-season engine probes run pre- and post-fix
- Game-loop review: tightness 7 · progression 8 · session engagement 7 · retention 7 · soul fidelity 8 · overall 7.4
- Evidence caveat: Progression rises again, and for a reason distinct from S90's. S90 made the league hold its LEVEL; S91 makes it hold its SHAPE. Pre-fix, a GM who played a long franchise watched scarcity quietly evaporate — 90+ players went from 5 to 88 on a roster count that never grew — so the central fantasy of the genre, that a superstar is rare and worth building around, decayed season by season while every calibration gate reported the league healthy. Post-fix the elite tier reaches a steady state by season 8, so a fortieth-season league is still recognisably the league the player started in. Retention rises with it: the long-horizon franchise is the product, and it was the part quietly rotting. Soul fidelity holds — a player's potential now means what the game says it means, rather than being a drift coefficient he outruns. Loop tightness and session engagement are unchanged; nothing about the moment-to-moment loop moved this session.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | Observability / gate integrity | 3.0h | 10 | 8 | 9.7 | **parity-gate-measured-a-blended-population** — Measure the gate on the rostered population it is supposed to describe, and report the pool alongside it rather than inside it, so pool size can never again pay for rostered inflation. |
| 2 | CRITICAL | Simulation truth / player progression | 5.0h | 10 | 9 | 9.5 | **potential-is-a-drift-coefficient-not-a-ceiling** — Give development an actual reversion toward potential, centred on the league's own measured gap so it bounds the walk without minting talent, and wire it at the single seam both the interactive and headless offseasons share. |
| 3 | HIGH | Observability / gate coverage | 2.0h | 9 | 8 | 8.8 | **no-gate-could-see-a-shape-defect** — Gate on dispersion drift and elite density together, folded into the receipt verdict, with a negative control built from the real pre-fix measurement. |
| 4 | MEDIUM | Process quality / honest provenance | 0.5h | 6 | 6 | 6.8 | **declare-the-provenance-of-a-judgement-ceiling** — Record the provenance as a structured field plus the reasoning, the misuses to avoid, and the open question that would resolve it. |
| 5 | HIGH | Simulation truth / roster and cap legality | 2.0h | 8 | 6 | 8.2 | **camp-cuts-did-not-cut** — Make legality the offseason final act in the stage named for it, holding the same controlled-franchise boundary, and select releases that actually free current-year cap space. |

Combined priority: **8.9**.

## Premise verification and rejected phantom work

- Rejected/deferred “Bounding the free-agent pool, carried on the task board since S90”: Rejected as an item this session, on evidence rather than by deferral. The pool's one demonstrated harm was corrupting the progression-parity gate, and rank 1 removes that harm at the gate instead of by changing league calibration. What remains is measured and benign: the pool holds 493 players at mean overall 65.8 and mean age 28.9 by season 12, of whom 306 are below 68 overall and 428 are 26 or older — a retirement-lag tail of unemployable veterans, not a talent reservoir. It reaches the player through `getFreeAgents`, which is already bounded at 500 and sorted by overall, so the surface is unaffected. Bounding it would be a calibration change with wide blast radius made against no proven defect, which is the phantom item this project's audit method exists to prevent. Recorded as decided-not-a-defect with the evidence, rather than carried forward a third time as a standing suspicion.
- Rejected/deferred “Raising POTENTIAL_REVERSION_PROFILE.rate until the distributional gate reports on-target”: Refused, twice over. Elite density measures 2.07% across 12 seasons before the camp-cuts fix (item 5) and 2.6% across the 10-season decade regression after it — that fix culls weak rosters, shrinking the rostered denominator and raising measured density, which is a real effect of a correct fix rather than a regression. Against a 1.6% on-target / 2.4% watch ceiling the gate's verdict is out-of-range. TWO routes to green existed and both were rejected: raising POTENTIAL_REVERSION_PROFILE.rate until the engine cleared a self-authored ceiling, and moving the ceiling until the engine cleared it. Either manufactures a pass against a number this project authored itself, in the session whose whole subject is gates reporting what they were built to report — and the ceiling is declared judgement-not-measured precisely because there is no baseline to appeal to. The gate keeps its teeth and its negative control still rejects the pre-fix league; test/realism-career-regression.test.js instead asserts only measurement-anchored claims, that the mean is calibrated and that elite density is at least 20% below the 4.03% measured on live pre-fix code this same session.

## Three recommended design moves

1. A gate must name the population it measures, and that population must be the one the product is experienced in — a denominator nobody declared is a free parameter that will eventually pay for a defect.
2. Mean gates cannot see shape defects. When a system evolves state over many steps, gate a dispersion statistic and a tail statistic together: this session measured them failing apart, so either alone certifies a broken league.
3. When a constant cannot be sourced from an authority, ship its provenance next to it. Three defects in this repo have now been literals whose origin nobody recorded.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| parity-gate-measured-a-blended-population | shipped | src/stats/progressionParity.js — gated population is rostered; population.rostered/unrostered/blended all reported; declared metric string corrected. Verified by two tests in test/session91-potential-reversion.test.js. |
| potential-is-a-drift-coefficient-not-a-ceiling | shipped | src/domain/potentialReversion.js (new authority), src/domain/ratings.js (reversion folded into the single unbiased rounding, profile version 2026-s91-reverting), src/engine/offseasonSimulator.js (measured once per offseason at the shared seam). 6 tests. |
| no-gate-could-see-a-shape-defect | shipped | src/stats/progressionParity.js — LEAGUE_DISTRIBUTION_TARGET, buildDistributionReceipt, distribution folded into status and into appendProgressionHistory. 4 tests including the negative control. |
| declare-the-provenance-of-a-judgement-ceiling | shipped | src/stats/progressionParity.js — LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctProvenance and its documentation block. |
| camp-cuts-did-not-cut | shipped | src/runtime/GameSession.js — enforceLeagueLegality() wired into the camp-cuts stage. src/engine/capCompliance.js — currentYearCapSaving() and savings-aware release selection, shared proration helper. |
