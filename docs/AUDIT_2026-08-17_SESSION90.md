# Audit — Franchise Architect: Football — Session 90

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay and app-release-gate; staging: GitHub Pages staging must prove the exact immutable candidate before direct-to-main production promotion; public sanitization mandatory
- Profile source: arc profile, S89 handoff/closeout brief and task board, live source tree, four seeded engine probes, the canonical realism regression run directly
- Game-loop review: tightness 7 · progression 7.5 · session engagement 7 · retention 6.5 · soul fidelity 8 · overall 7.2
- Evidence caveat: Up from S89's 6.0 on measured evidence. Progression is the category that moves most: the league's talent economy now holds its level across a simulated decade (annual mean overall drift -0.073 against a 0.15 on-target ceiling, from +0.228), which means a General Manager's roster decisions are made against a league that stays recognisable rather than one that inflates past the cap S89 repaired. Loop tightness and retention rise because the long-horizon franchise — the reason to play a fortieth season — is no longer built on a drifting baseline. Session engagement is unchanged; nothing about the moment-to-moment loop moved. Soul fidelity rises: a club's facilities and coaching now genuinely matter *relative to rivals*, which is the fantasy, instead of paying everyone the same invisible dividend.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | Simulation truth / player progression | 5.0h | 10 | 8 | 9.6 | **development-environment-authority** — Make the club environment a single authority whose centres are measured from the league being simulated and whose league-wide mean is zero by construction, so a good building is worth what it is worth relative to rivals rather than paying every club an invisible dividend. |
| 2 | HIGH | Simulation truth / observability | 1.0h | 8 | 6 | 8.4 | **parity-receipt-modelled-a-different-function** — Make the receipt and the engine the same function again by zero-centring the term the receipt cannot see, rather than adding a second model of it that would then have to be kept in sync. |
| 3 | HIGH | Process quality / receipt integrity | 1.0h | 8 | 5 | 8.0 | **long-shard-into-canonical-receipt** — Fold the long shard into DEFAULT_SHARDS and raise the shard timeout so the canonical receipt covers the project's most behavioural regressions and an honest slow shard is never misreported as a failure. |
| 4 | MEDIUM | UI truth | 0.5h | 6 | 4 | 6.5 | **development-outlook-centre-parity** — Build the player-facing outlook from the same centres object the offseason progresses on, and gate the agreement so the surface and the mechanism cannot silently diverge again. |

Combined priority: **8.7**.

## Premise verification and rejected phantom work

- Rejected/deferred “Swept the rest of the codebase for the same stale-centre pattern; did not churn the matches”: About thirty call sites use the `(value - 70)/k` or `(value - 72)/k` shape. Nearly all are *within-play relative* comparisons in gameSimulator.js and aiTeamStrategy.js where both sides of a contest use the same formula, so a miscentred constant cancels rather than accumulates. The distinguishing property of the rank-1 defect is that it mutated persistent state every offseason and therefore compounded. The one other asymmetric accumulator considered, `scoutingWeeklyBonus` (clamp -2/+8, unconditional +2 for developmental culture), was traced to scouting confidence and draft-board accuracy only — it never mutates player ratings, so it does not compound into league talent. Recorded rather than fixed: changing thirty relative comparisons on suspicion would be churn, and the S89 SIL follow-up asked for a sweep, which is what this is.

## Three recommended design moves

1. Hold every league-wide modifier to the same standard this session applied to one: if it is documented as a differentiator, its league mean must be zero, and a test must say so.
2. Keep the canonical receipt wide enough to be uncomfortable — the tests most likely to be excluded for slowness are the ones most likely to be load-bearing.
3. When two large errors of opposite sign nearly cancel, the observable looks like a small calibration miss; decompose before believing the size of a problem.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| development-environment-authority | shipped | test/session90-development-environment.test.js — 12 focused tests including a negative control that reconstructs the pre-S90 formula and proves the zero-centring tolerance rejects it, a constant-stub guard asserting club-to-club spread survives, an RNG-stream parity assertion, a fromSnapshot centre-parity assertion, and a direct one-offseason proof that the engine moves the league by the declared curve and nothing else. |
| parity-receipt-modelled-a-different-function | shipped | test/realism-career-regression.test.js — 'a deterministic decade satisfies progression parity and finite-number integrity' now passes, asserting progression.status === 'on-target' and \|annualMeanOverallDrift\| <= 0.15 over ten simulated seasons. |
| long-shard-into-canonical-receipt | shipped | `long` folded into DEFAULT_SHARDS. The sequencing this was waiting on — recorded on the task board as a founder call precisely so it would not be flipped silently — has now happened: rank 1 repaired the inflation at its source and the realism regression passes, so inclusion no longer turns the receipt red. The shard timeout was raised 20 -> 45 minutes in the same change, because the realism decade alone runs ~12 minutes and a 20-minute ceiling made an honest slow shard a coin flip; a timeout reads as a failure, and a receipt that sometimes lies is worse than one that is slow. |
| development-outlook-centre-parity | shipped | A gate asserts the surfaced development bonus equals the engine's for a sampled spread of players, so the two cannot silently diverge again. |
