# Audit — Franchise Architect: Football — Session 93

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay (retention, emotional payoff, decision pressure) and app-release-gate; staging: Cloudflare Pages staging must prove the exact immutable candidate before direct-to-main production promotion; public sanitization mandatory
- Profile source: arc profile, skill-profile audit overlay, S92 handoff/task board, live source tree, five seeded engine probes
- Game-loop review: tightness 7 · progression 8 · session engagement 7 · retention 7 · soul fidelity 6 · overall 7
- Evidence caveat: Soul fidelity is marked DOWN from S92's 8 on evidence, not mood. This project's central promise is that the numbers can be trusted and that a franchise is built by decisions under constraint. Three sessions of calibration work (S90, S91, S92) hardened the talent curve against drift the player cannot see — while the shipped Settings tab lets the player overwrite the strongest input to that curve, for free, to a value no club in the league can be generated with. The guarantee is real but conditional on the player not using the interface the game ships. Separately, owner.cash has exactly two sinks (staff-budget upkeep and coach-firing dead money) against unbounded, price-linear revenue, so the franchise economy is a scoreboard rather than a constraint. The three ranked items are one system: they turn the owner's console from a cheat panel into the capital-allocation loop the franchise fantasy is missing, which is the first player-visible decision pressure added since S89.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | Simulation integrity / game-loop authority | 6.0h | 10 | 8 | 9.8 | **facilities-are-a-free-permanent-power-up** — Price facilities as capital against owner.cash with a superlinear cost curve and a per-year build allowance, close the raw write behind a readonly reasonCode, and invalidate the development-centres cache on facility change. |
| 2 | HIGH | Franchise economy / decision pressure | 4.0h | 9 | 8 | 9.1 | **ticket-price-has-no-demand-curve** — League-centred bounded price elasticity on attendance plus a fan-interest gouging penalty, producing an interior revenue optimum. |
| 3 | HIGH | League liveness / AI parity | 4.0h | 8 | 9 | 8.7 | **no-ai-club-ever-invests** — A real AI investment policy driven by owner personality, priorities and cash, consuming the same priced path as the human. |

Combined priority: **9.6**.

## Premise verification and rejected phantom work

- Rejected/deferred “development-tilt-clamp-asymmetry”: REFUTED BY MEASUREMENT. Not ranked. Two independent seeds, full decade. Seed 20260307, seasons 0/3/6/10: league-wide mean APPLIED (post-clamp) tilt 0.00000, 0.00026, 0.00008, -0.00000; players clamped 0, 5, 1, 0 out of 1,568-2,178. Seed 4040, same marks: 0.00000, 0.00018, 0.00007, 0.00000; clamped 0, 1, 1, 0. Raw centred mean holds at ~1e-16 throughout on both. sdRaw runs 0.79-1.06 against a +/-3 clamp, so the clamp sits roughly three standard deviations outside the distribution and effectively never binds. The hypothesis was sound from a code read and wrong in the league; the honest outcome is a rejected item with its measurement recorded, not a quietly dropped one. The same probe run is what surfaced the frozen-facilities finding (probe-2) — the column next to the one it was written to test.
- Rejected/deferred “rostered-population-reused-elsewhere”: CHECKED, NO DEFECT FOUND. Not ranked. `rostered` appears in exactly four source files. Two are the S92 fix itself (`src/stats/progressionParity.js`, `src/data/nflEliteDensityBaseline.js`). `src/domain/potentialReversion.js` uses the word only in documentation explaining why it deliberately measures over the progressed population instead. `src/domain/developmentEnvironment.js` measures its centres over active-plus-practice-squad, which is correct there and is not the S92 shape: the centre is applied to exactly the population it is measured over, which is the conservation identity `potentialReversion.js` documents as the whole guarantee. A wider population is only a defect when it is a REPORTING denominator compared against an external anchor, which is not the case here.
- Rejected/deferred “nfl-ratings-distribution-upgrade”: NO ACTION AVAILABLE. Not ranked. No such distribution is citable in a form this project can consume, which is exactly why S92 shipped the analogy with its limits documented in the module rather than claiming precision it did not have. Raising this as an item would be booking work that cannot be started; the module already names where a better source would be substituted. Deferring it honestly is the correct outcome, not a skipped item.

## Three recommended design moves

1. Price facilities as capital against owner.cash with a superlinear cost curve and a per-year build allowance, close the raw write behind a readonly reasonCode, and invalidate the development-centres cache on facility change.
2. League-centred bounded price elasticity on attendance plus a fan-interest gouging penalty, producing an interior revenue optimum.
3. A real AI investment policy driven by owner personality, priorities and cash, consuming the same priced path as the human.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| facilities-are-a-free-permanent-power-up | shipped | — |
| ticket-price-has-no-demand-curve | shipped | — |
| no-ai-club-ever-invests | shipped | — |
