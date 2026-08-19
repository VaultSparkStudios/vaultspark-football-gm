# Session 91 Closeout — The League Stops Losing Its Shape

## Session Intent — S92

**One item is owed, and it is a measurement, not a fix.**

Build a real **NFL elite-density baseline** into `src/data`, then re-source both ends of the S91 distributional gate from it. Right now `LEAGUE_DISTRIBUTION_TARGET.elite90PlusPctCeiling` is 1.6% (watch 2.4%) and carries `elite90PlusPctProvenance: "judgement-not-measured"` because no such authority exists anywhere in this project. The post-fix league measures **2.07%** across 12 seasons before the camp-cuts fix and **2.6%** across the 10-season decade regression after it — that fix culls weak rosters, so it shrinks the denominator and raises density. **The gate's verdict is therefore `out-of-range`, and it was left that way deliberately.**

Two things S92 must not do with that:

1. **Do not close it by tuning `POTENTIAL_REVERSION_PROFILE.rate`, and do not close it by moving the ceiling.** Both routes were available in S91 and both were explicitly refused: either manufactures a pass against a number the project authored itself. The gate keeps its teeth and its negative control; what changed instead is that `test/realism-career-regression.test.js` asserts only measurement-anchored claims — the mean is calibrated, and elite density is ≥20% below the 4.03% measured on live pre-fix code.
2. **Do not assume the ceiling is the wrong end.** A freshly generated league opens at **0.32%** — five players rated 90+ across 32 clubs — which is a very flat league to start from. If the *generator* is wrong then both ends of this measurement are wrong, and a rate tuned against a bad ceiling would bake that in permanently. Establish the baseline first, then decide which end moves.

Everything else on the board is launch-gated and unchanged. Preserve the public-launch HOLD; nothing in S91 touched it.

## Where We Left Off (Session 91)

S90 made the league hold its **level**. S91 makes it hold its **shape**.

### The probe S90 asked for, and the answer it did not expect

S90 disclosed its elite-tail figure as confounded by free-agent-pool growth and instructed the next session to separate the two *before* ranking anything. That instruction was the most valuable thing it left — and the probe inverted the assumption behind it.

Holding the denominator structurally fixed at the ~2,180 roster slots S89 pinned, so population growth cannot move it:

| | season 0 | season 12 |
|---|---|---|
| 90+ among **rostered** | 5 (**0.32%**) | 88 (**4.03%**) |
| 90+ among all active | 5 (0.32%) | 89 (3.36%) |
| rostered mean overall | 76.90 | 77.97 |
| median overall | 77 | **77** |
| free-agent pool | 0 | 466 (mean OVR 66.9, age 29.1) |

Only **1 of 89** elite players was unrostered. The pool was *diluting* the elite-density figure, not inflating it. The recorded suspicion was that the measurement overstated the problem; it understated it.

### What that exposed

**The parity gate measured a population the game is not played in.** `summarizeLeagueProgression` filtered on `status !== "retired"`, blending the rostered league with an unbounded pool whose size is a free parameter. Rostered mean overall rises **+0.089/season** while the blended mean falls **−0.072/season** — and that blended number is exactly the **−0.073 S90 certified as steady state and shipped as proof its own fix worked**. Third time this project has shipped two errors of opposite sign cancelling; second time inside a gate built to prevent it.

**Underneath it: potential never bounded anyone.** `developmentDelta` used `(potential − 80)/20` — a constant for the life of the player, with nothing depending on his current rating. So development was a random walk a player took straight past his own potential, and selection filtered it on one side only: drift down and the S89 roster bound releases you, drift up and you are retained and keep drawing. 32–38% of rostered players sat above their own declared potential. A shape defect with almost no first-moment signature, which is why four sessions of **mean** gates (S71, S72, S89, S90) went straight over it.

### What shipped

- `src/domain/potentialReversion.js` — the missing reversion, **zero-centred by construction** against the league's own measured gap, and measured over *exactly* the population it is applied to. The obvious `rate * (potential − overall)` was rejected by measurement: a generated league sits 2.86 points below its own mean potential, so it would have paid every player ≈+0.46 OVR per offseason forever. Wired at the `applyAgingProgressionAndRetirements` seam, not through `developmentContext`, because the headless `runOffseason` façade passes no context and the career-realism regression runs that path.
- `src/stats/progressionParity.js` — gated population is rostered; pool and blend still reported. New distributional gate reads **dispersion drift and elite density together**, folded into the receipt verdict.
- `src/runtime/GameSession.js` + `src/engine/capCompliance.js` — camp cuts now actually cut (see below).

### Measured after, two seeds, 12 seasons

| | pre-fix | post-fix |
|---|---|---|
| 90+ density (rostered) | 4.03% | **2.07%** |
| 90+ trajectory s8→s12 | 80 → **88**, still climbing | 44 → **45**, flat |
| above own potential | 37.4% | **21.2%** |
| veterans above own potential | 26.3% | **5.7%** |
| p99 | 93 | 91 |
| rostered mean drift | +0.089/season | +0.065/season |

The decisive reading is **trajectory, not level**: the elite count plateaus from season 8 where pre-fix it was still climbing at season 12. A bounded walk, not merely a slower one. S90's own guarantee (league-wide mean environment tilt 0.0000) still holds and still passes.

### The fifth defect, which arrived as a red

The canonical receipt went red in the `long` shard: IND $3.3M over the cap after the 2028 offseason, in the S89 regression that asserts this cannot happen. **Two hypotheses were formed and both disproved by measurement** — the club was not trapped at the 53-man floor (68 players, fifteen clear) and dead money was not pushing it back over (0.0M). Re-running compliance by hand fixed it with one release.

Cause: the offseason's only compliance pass lives in the `free-agency` stage, and `draft` and `udfa` add a full rookie class *after* it. The stage named **`camp-cuts` performed no cuts.** That is the S89 defect shape one seam later — S89 recorded that a limit enforced only at the moment of addition is not enforcement; this is its mirror. `GameSession.enforceLeagueLegality()` is now the offseason's final act, holding the same controlled-franchise boundary as every other automated roster move. A second, independent defect was fixed alongside it: the trim loop took the worst-value-per-dollar player unconditionally, but a contract whose cap hit is entirely this year's prorated bonus frees nothing when released, and the loop has only a bounded number of releases before it hits the floor.

### And a sixth, found by the next red

With camp cuts fixed, the decade regression failed again — this time on numeric integrity. `scanFiniteSimulationState` had hit its 4,000,000-node budget and reported `incomplete` with `issueCount: 0`: the guard working exactly as designed, saying it ran out of budget rather than that the league was clean. A simulated decade now needs ~4.1M nodes (a season-stats record per player per year, plus the larger unrostered population camp cuts produce). Ordinary growth, not corruption — but the check was one league-growth step from becoming a permanent `incomplete`, which is the same as deleting it. Budget raised to 12M; the truncation behaviour itself is still gated, because that test drives the scan with an explicitly small budget rather than the default.

### Two things refused, on the record

- **Tuning the reversion rate until the gate said `on-target`, and moving the ceiling until it did.** Both were available; both refused. The gate's verdict stands at `out-of-range` and is disclosed in the receipt, the truth audit, the board and the regression test's own comment.
- **Carrying the free-agent-pool bound a third time.** Retired as **decided-not-a-defect** with evidence: its one demonstrated harm was corrupting the gate, fixed at the gate; what remains is a retirement-lag tail (493 players by season 12, 306 below 68 overall, 428 aged 26+) reaching the player only through `getFreeAgents`, already bounded at 500 and sorted by overall.

### One error made in flight, recorded rather than hidden

The reversion centre was first measured over **rostered** players while being applied to **all active** players. Because the pool sits far below its own potential, that would have handed every unemployed player a standing raise — the S71/S90 subsidy, rebuilt inside its own fix. Caught by reasoning about the population identity before commit, not by a test.

## Known Traps For Next Session

- **The write-back-currency probe (F7) false-positives here every session.** It anchors on the newest commit touching `SELF_IMPROVEMENT_LOOP.md`, but this project's closeout commits the SIL *before* the rendered artifacts, so there is always a later substantive commit. S91 saw it flag `fb3833f`, S90's own closeout artifact. Confirm against clean tree + `0/0` sync + no lock + all ten surfaces current before believing it.
- **`npm test` is ~50 minutes** and the `long` shard alone is ~5 minutes for the cap regression and ~11 for the realism decade. The long shard is in `DEFAULT_SHARDS` since S90 — that is deliberate, and it is what caught the fifth defect.
- **A fresh league carries 49 players per club**, below the 53-man floor the trim loop refuses to cut past. Any cap-compliance fixture must first push a club clear of that floor or it silently tests the trapped path instead.
