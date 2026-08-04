# Audit — Franchise Architect: Football — Session 71

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric (CANON-009) with app-release-gate and web-canon overlays, plus a game-loop review lens; staging: cloudflare-pages at https://staging.playfranchisearchitect.com, verified 11/11 provenance at 870382c
- Profile source: live code, in-process engine probes over 10 simulated seasons, a direct probe of the approximate-value authority with NFL-realistic season lines, and the committed realism-verification baselines
- Game-loop review: tightness 8 · progression 4 · session engagement 8 · retention 5 · soul fidelity 6 · overall 6.2
- Evidence caveat: Structural scores only; no cohort evidence is claimed. Progression and soul fidelity are marked down on measured findings, not impressions: across 10 simulated seasons a tight end won MVP, Offensive Player of the Year and Offensive Rookie of the Year in 10 of 10 years, and 23.2% of all retirees entered the Hall of Fame. A franchise game whose highest honours are decided by a formula artefact cannot tell a credible long-term story.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Simulation authority / statistical truth | 4.0h | 10 | 9 | 38.8 | **approximate-value-line-share-authority** — Distribute linePoints across the team's line weight exactly as defensiveValue distributes defenseTotal: offensiveLineValue takes the bucket and the accumulated olLineWeight + weighted teLineWeight denominator, returns the player's proportional share, and the tight-end branch draws its blocking share from the same bucket at its existing 0.2 weight instead of adding an absolute. Add a cross-position AV comparability test asserting that a full-season line starter cannot out-value an MVP-calibre quarterback. |
| 2 | FIRE | Progression / narrative authority | 3.0h | 9 | 9 | 36.5 | **award-ballot-position-integrity** — Re-measure post-fix, then add a multi-season award-integrity test asserting no single position may take MVP in every season of a simulated run, and that OROY winners are actually rookies. Surface the MVP's AV and the runner-up gap in the season awards payload so the ballot is inspectable rather than assertable. |
| 3 | FIRE | Progression / legacy scarcity | 3.0h | 9 | 8 | 32.4 | **hall-of-fame-scarcity-authority** — Re-derive the default threshold from the corrected AV distribution and add a bounded class-size cap per induction year so scarcity holds even if a future scale change drifts. Assert an induction-rate band in a multi-season test rather than a fixed number. Surface the class of each year in the Hall so induction reads as an event. |
| 4 | HIGH | Observability truth / shareable surface | 2.0h | 8 | 7 | 28.0 | **champion-scoreline-orientation** — One exported championScoreline(superBowl) authority that orients on championTeamId and is used by all four writers, plus a read-side orientation helper applied where stored champion rows are rendered so existing saves display correctly. The Super Bowl is a neutral-site game (S62), so home/away is presentation-meaningless and must never leak to a player-facing surface. Cover with a test that fails when either conference wins and the orientation is wrong. |
| 5 | HIGH | Simulation authority / long-run balance | 3.0h | 8 | 7 | 26.2 | **development-variance-bias** — Make the draw mean-zero at the same width, verify with a direct distribution probe rather than by inspection, re-measure the multi-season league-overall trend, and add a progression-drift regression test that bounds league mean overall movement across a simulated decade so the bias cannot silently return. |
| 6 | HIGH | Cross-repo coherence / release authority | 1.5h | 7 | 6 | 24.5 | **registry-authority-drift-cargo** — Ship signed Ark cargo carrying the verified local values, their provenance receipts, and the exact fields to reconcile; record the receipt id in the task board and decisions so the request is auditable, and keep the doctor warning honest rather than suppressing it. |

Combined priority: **186.4**.

## Premise verification and rejected phantom work

- Rejected/deferred “Roster sizes grow unbounded across seasons”: Rejected as a phantom. Measured per-team totals converge on exactly 69 (53 active + 16 practice), which is the intended limit. The apparent growth is practice squads filling from an initial ~54, not a leak.
- Rejected/deferred “Season statistics are unrealistic”: Rejected on evidence. The realism calibrator holds QB/RB/WR/TE season lines at 0.0-2.3% drift against the Pro Football Reference weighted baseline over 20 observed years. The statistics are sound; only the value formula that reads them is not.
- Rejected/deferred “Flip lifecycle to SPARKED / claim launch readiness”: Rejected. Delivered on-domain email, SHA-bound founder approval, and authoritative registry lifecycle are unchanged human gates. No code-side fabrication attempted.

## Three recommended design moves

1. Distribute the offensive-line value bucket the way the defensive buckets are already distributed — the denominators for it are already accumulated and have never been read.
2. Re-derive Hall of Fame scarcity from the corrected value scale rather than re-tuning a threshold against a broken one.
3. Publish the championship scoreline from one champion-oriented authority, because it is the single most-shared line the game produces.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| approximate-value-line-share-authority | shipped | — |
| award-ballot-position-integrity | shipped | — |
| hall-of-fame-scarcity-authority | shipped | — |
| champion-scoreline-orientation | shipped | — |
| development-variance-bias | shipped | — |
| registry-authority-drift-cargo | shipped | — |
