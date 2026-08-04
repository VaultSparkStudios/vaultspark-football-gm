# Closeout Brief — franchise-architect-football — S71

> A season record declared twice had drifted, so every offensive player's approximate value had been ~0 for the project's entire history — and every honour the game awards inherited it. All six ranked items plus four second-order items shipped; Node 851/851.

## Shipped

- **The offense had no value at all** (10/10 project, 7/10 ecosystem): resetTeamSeasonState rebuilt team.season without drivesFor/drivesAgainst, so the first += of every season pinned both at NaN; every reader took them as `x || 0`, laundering it into a zero drive count. offensivePoints collapsed to ~2 and the defensive multiplier pinned at its 0.15 clamp floor. Measured league-wide: QB AV 2, WR 0, RB 0, OL 0 against LB 76. Season record now declared once; counters accumulate through a finite guard.
- **Line value is a share of a bucket, not an absolute** (10/10 project, 6/10 ecosystem): offensiveLineValue returned an absolute while every other position group divided a team bucket by a team denominator. The bucket (linePoints) and both denominators (olLineWeight, teLineWeight) already existed and had never been read anywhere in the repo. OL starter 96 -> 8, TE with no catches 32 -> 2, elite TE 41 -> 11, MVP QB 16 unchanged; live in-engine QB 2 -> 25, WR 0 -> 17, LB 76 -> 24.
- **The awards mean what they say** (9/10 project, 4/10 ecosystem): A tight end won MVP, OPOY and Offensive Rookie of the Year in 10 of 10 simulated seasons; a quarterback now wins MVP in 10 of 10 at AV 16-24, where the real award sits at 18-22. Rookie eligibility root-fixed from seasonsPlayed <= 1 — a counter advanced in the offseason, so the MVP also won Rookie of the Year in 7 of 8 seasons — to the player's first recorded season.
- **The Hall of Fame is scarce, dated, and repairable** (9/10 project, 5/10 ecosystem): Admitted 24.5% of everyone who ever retired; now 1.4%, against the real Pro Football Hall of Fame's ~1.36% of all who have played. Rebuilt rather than accumulated so a corrected scale repairs an existing save, admitted year by year under a class-size cap with a deterministic tie-break, so a missed candidate stays eligible and a backlog forms. Second-order: the Hall now reads as dated induction classes, which only became meaningful once induction became scarce.
- **The champion no longer loses its own final** (8/10 project, 6/10 ecosystem): The scoreline was assembled home-first (AFC first) at four sites and published beside championTeamId as champion-first, so any NFC win read backwards — 8 of 10 measured seasons, including the shareable League Story Card, the newsletter, the History tab and the CLI. One championScoreline() authority writes winner-first; nine readers repair stored scorelines on read, with no save migration.
- **Progression stopped handing the league free points** (8/10 project, 5/10 ecosystem): Three constants, not the one audited: an inclusive rng.int(-2, 3) averaging +0.5; a trait reference of 70 against a measured league mean potential of 79.92, a second +0.50 for every player every offseason; and an integer variance whose rounding discarded every fractional term, so a prime-age player's +0.4 rounded away to exactly nothing. 90-plus players across ten seasons 117 -> 79.

## Follow-ups

- **Age-curve calibration**: Age-curve calibration against an explicit league-parity target in the realism profile — closes the measured +0.38/season residual drift and carries the long-run probe with it.
- **Per-position AV calibration report**: Per-position AV calibration report joined to the realism verifier, so the value scale is regression-guarded the way the season statistics already are.
- **Human launch gates (unchanged)**: Human gates for launch, unchanged: delivered on-domain email (zoho.mail.admin MISSING), SHA-bound founder approval, registry lifecycle reconciliation (Ark 01JV62KEPG9B017D2712C0F8F5).
- **Carried product candidates**: Carried product candidates: dynasty-almanac-share-cards, broadcast-mode-sim-watch, trophy-road-onboarding, tab-module code-splitting.

## Blockers

- **Launch HOLD on three human gates**: Launch HOLD — email-delivery-unverified, founder-approval-unverified, lifecycle-authority-unverified.

## Honesty Ledger

- **Item 1's audited premise was secondary**: The audit's premise for item 1 was real but SECONDARY: it named the unnormalized line formula and not the upstream NaN drive count beneath it. Recorded as premiseCorrection in the sidecar rather than retrofitted.
- **Item 5's causal weight was overstated**: The audit OVERSTATED item 5's causal weight. Removing the audited constant moved the 10-season drift only +4.34 -> +4.11, about 5% of the effect; chasing the gap found two further causes.
- **Residual inflation deferred, not closed**: Residual league inflation of +0.38/season is DEFERRED with its measurement, not claimed closed. It is an age-curve balance question for the realism profile, not a constant to nudge at session end.
- **Long-run behaviour not measured**: Long-run behaviour beyond 10 simulated seasons was NOT measured — a 25-season probe ran ~50 minutes without output and was stopped. The trend is reported only over the window observed and is not extrapolated to the stated 100-year horizon.
- **Two audit candidates rejected as phantoms**: Two plausible audit candidates were rejected as phantoms against live measurement: roster sizes converge on exactly 69 (53 active + 16 practice, the intended limit), and season statistics hold 0.0-2.3% drift against the Pro Football Reference baseline over 20 observed years.
- **Registry drift stays a visible warning**: Registry lifecycle drift is sibling-owned. It was returned as signed Ark cargo, and the doctor warning stays visible rather than suppressed, because it is true.

## Proof

- Files changed: 28
- Insertions: see git
- Deletions: see git
- Suite: Node 851/851 direct exit 0 (pre-final); final verification run recorded in PROJECT_STATUS
