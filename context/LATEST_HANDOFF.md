# Session 93 Closeout — The Owner's Console Stops Being a Cheat Panel

## Session Intent — S94

**Nothing is owed as a single blocking item.** The genius hit list is exhausted again; the board's `Next` section still waits on external state this project cannot manufacture (a real opted-in cohort, delivered email, founder approval). Run a fresh `/audit` against live code.

Three things worth checking early, in rough order of value:

1. **The facility equilibrium has evidence but no gate.** Measured seasons 0/3/8/15 show standard deviation falling to a floor and then **turning back up** — 5.658 → 4.015 → 3.655 → **4.050** — with the league maximum finally moving past the generated band (82 → 85) and minimum club cash falling 114M → 40M. That is the equilibrium the upkeep was added to produce, not merely a slower collapse. But **no test asserts any of it.** No gate says the league still has facility spread at season 25 or 40. That is exactly the shape of defect this project keeps finding — a system whose long-horizon behaviour is argued from a probe rather than gated by a test. A cheap, honest gate would assert a floor on facility standard deviation after a long seeded run, and it belongs in the `long` shard. This is the single highest-value item on the board.
2. **`owner.cash` is now load-bearing and was not designed to be.** Before S93 it had two sinks (staff-budget upkeep, coach-firing dead money) against unbounded price-linear revenue, so nobody had reason to check whether its scale is right. It now gates facility construction and upkeep, and `cashPressure` thresholds (35M / 80M) that were previously unreachable are now reachable. Whether those thresholds are calibrated for a league where cash actually moves is an open question nobody has measured.
3. **The `facilityAppetite` policy is judgement, not measurement.** `FACILITY_MARKET_PROFILE` declares its weights from reasoning about owner personalities, in the same category the S91 elite-density ceiling was in before S92 sourced it. It is honest about that, but it is the newest un-sourced constant in the codebase and should be treated as such.

## Where We Left Off (Session 93)

**Deploy: deployed to production.** Candidate `fe39e5fc3a30d9841eade107264d087d792596f5` verified 14/14 on stable staging at artifact `38ce0fa9`, promoted via `workflow_dispatch` run 32627736043 (gate → build → deploy all success), live origin confirmed serving the exact revision, staging and production provenance 10/10 each against the same expected revision with byte-identical artifact fingerprints, hosted performance VERIFIED, visual receipt bound to 84 captures from the workflow's own responsive-evidence artifact for this candidate. Unified release authority reconciled 7/7 (`sourceRevision == publicationRevision`), staging authority reconciled from the receipt captured on the first deploy, doctor `blockingFailing 0` score 92 with warnings 2 → 1. `launchReady` stays **false** — untouched.

The audit came from a sweep S90's self-improvement loop had explicitly booked and no session had performed: *"a modifier documented as a differentiator must have a league-wide mean of zero and a test that says so. Two occurrences of this class (S71, S90) is a pattern; sweep for a third before it is found by a symptom."*

### The third occurrence was not a constant

`GameSession.updateStaff` still carries the note S63 left: the Coaching Staff sheet "used to accept playcalling / development / discipline and write them straight into the simulation, clamped 40-99. That made the Coaching Staff panel a god-mode surface: three number boxes, free, any value." **Eight lines below that fix, `updateOwnerState` did the identical thing to `owner.facilities`**, and `public/game.html` shipped it as three bare number inputs with no min, max or price. S63 closed one of the two god-mode panels and left its twin.

All three wings are live simulation inputs — training feeds the S90 development environment at `trainingDivisor: 10`, rehab feeds injury probability and recovery, analytics feeds `scoutingWeeklyBonus` and therefore draft reveal. `buildFranchiseEconomics` generates every club in **[64, 82]**; the panel's legal range was **[40, 99]**.

Franchise authority was checked and is **not** the hole: `/api/owner` correctly 403s for a rival club. The authority seam guards *whose* club you edit; nothing guarded whether the edit was earned.

### Measured, not argued

Seed 20260307, team BUF, ten seasons, control vs one free click on turn one:

| | control | one free click |
|---|---|---|
| cost charged | — | **0M** (cash 177M -> 177M) |
| facilities | 70 / 65 / 73 | 99 / 99 / 99 |
| club mean development tilt, season 0 | 0.322 | **2.847** (clamp ceiling 3.0) |
| roster overall after a decade | 77.10 | 79.73 |
| **league roster rank** | **23rd** | **1st** |

Two more defects in the same system. Gate revenue measured **4.61x for a 4.59x price multiple** with fan interest ending at 97 in every scenario — `attendanceFactor` carried no price term at all. And the league-wide standard deviation of `owner.facilities.training` measured **exactly 5.66 at seasons 0, 3, 6 and 10 on two independent seeds**: no club had ever changed a facility in the project's history.

### The fix

`src/domain/facilityInvestment.js` prices construction with a pure superlinear cost function — pure so every level in every existing save already has a well-defined price and **no snapshot migration is needed**, the same trick `coachSalary` uses — plus a three-point-per-wing annual build allowance and recurring annual upkeep. `src/domain/ticketDemand.js` gives attendance a bounded linear demand curve measured against the league's own mean price. `src/engine/facilityMarket.js` runs an offseason AI investment round through the same priced domain functions, so there is exactly one cost model in the codebase.

Post-fix: the demand factor at the league centre is exactly **1.000**, gate revenue peaks at 1.409x the mean, and the legal maximum returns **0.191x** — worse than pricing at the mean, so the exploit is inverted rather than capped. Reaching the facility ceiling costs **357.8M** and takes at least **nine league years**.

### A defect in the fix, caught before shipping

The first implementation — priced construction plus a deficit-driven AI policy — measured mean 71.72 -> 72.97 -> 74.81 and sd 5.658 -> 4.398 -> 3.729 at seasons 0/2/5. Every club climbing, none ever falling: a **+0.6/season ratchet** that reaches the ceiling and zero spread well inside the forty-season franchise this project builds for, which would have deleted the S90 development environment as completely as a constant stub. A purchase price cannot supply the counterforce because it is paid once from a cash pile that regrows; **annual upkeep can**, because it is a recurring claim on revenue. With upkeep, extended to season 15: sd 5.658 → 4.015 → 3.655 → **4.050** at seasons 0/3/8/15 — dispersion bottoms out and then turns back up, which is an equilibrium rather than a slower collapse — the league maximum moves past the generated band for the first time (82 → 85) as clubs with real gate revenue pull ahead of clubs that cannot fund what they hold, minimum club cash falls 114M → 40M, and the S90 league-wide mean tilt stays 0.00000 at every mark. Spread now rests on live economics instead of a generation-time roll.

## Known Traps For Next Session

- **The write-back-currency probe (F7) false-positives here every session.** It anchors on the newest commit touching `SELF_IMPROVEMENT_LOOP.md`, but this project's closeout commits the SIL *before* the rendered artifacts, so there is always a later substantive commit. Confirm against clean tree + `0/0` sync + no lock + all ten surfaces current before believing it.
- **`npm test` is ~50 minutes** across six shards, two of which run 10-season decade simulations. Check `.cache/test-progress.json` for non-authoritative live shard progress before concluding a run is stuck.
- **A decade probe takes 10-20 minutes per seed.** Budget for it, and write probe output incrementally — a probe that only prints after both arms finish gives you nothing to check while it runs.
- **Check a probe's columns before trusting any of them.** This session's decade probe reported wins/losses/titles as 0 for both arms because the `teamSeasonArchive` field names guessed in the probe do not exist. Three of six reported columns were meaningless; the finding survived only because the columns that mattered (roster overall, roster rank) were correct.
- **Check the boot budget before adding UI, not after.** The settings island holds a 15% headroom floor. Adding a panel inline took it to 11.6% and the fix was to move the markup behind a dynamic import — the right answer, but cheaper to reach if the budget is checked first.
- **Prose about a defect trips the innovation-pack scanner, and the studio shard runs that scanner.** `/not implemented|\bstub\b/i` matched the words "a constant stub" in a doc comment and turned a shipped audit into "1 open candidate", which `test/studio-protocol-smoke.test.js` fails on. The declared fix is a file-level `innovation-pack:ignore`, scoped to the "unfinished behavior" class only — do not reword good documentation and do not loosen the pattern. Note that the pardon genuinely is scoped: spelling out the explicit inline marker tokens in the opt-out note itself fired the *other* pattern. Run `node scripts/ops.mjs innovation-pack --dry-run` before closeout, not after.
- **A test can assert the defect as a feature.** `test/feature-pack-v1.test.js` required that `training: 88` landed through `updateOwnerState`. It had passed for ninety sessions and was pinning the exploit in place. When closing a hole, grep the suite for tests that assert the old behaviour before assuming a red is your bug.
- **Facilities are now a live quantity, so anything caching them must say so.** `developmentEnvironmentCentres` keyed its cache on `year:players:teams`, which was sufficient only while facilities could never move. It now includes a facilities revision. Any new cache over league state needs the same audit.
- **Recorded, not fixed: both new cache revisions are unweighted sums and can alias in principle.** `developmentEnvironmentCentres`'s facility revision sums training levels and `ticketPriceCentre`'s sums prices, so one club +1 and another −1 in the same year would produce an identical key. This is *not* a live defect: every writer of either quantity also explicitly clears the revision (`investInFacility`, and the offseason round on both investment and deferred-maintenance degradation), so the sum is belt and the explicit invalidation is braces. It was left as-is deliberately rather than fixed mid-run, because the canonical suite was already executing against this exact source and a defence-in-depth tweak did not justify discarding a ~50-minute receipt. A future writer of facilities or ticket prices that forgets to clear the revision would expose it — weight each term by team index if you touch this.

---

# Session 92 Closeout — A Sourced Elite-Density Baseline, and the Population Bug It Uncovered

## Session Intent — S93

**Nothing is owed as a single blocking item.** The genius hit list is exhausted again after this session; the board's `Next` section (community-cohort observation, launch-authority reconciliation, and Analytica ingestion) all wait on external state this project cannot manufacture — a real opted-in cohort, delivered email, founder approval. Run a fresh `/audit` against live code.

Two things worth checking early, not urgent but cheap to verify:

1. **The `activeRosterOnly`/`practiceSquad` split is new this session** (`src/stats/progressionParity.js`). It is currently consumed only by the S92 distributional gate's elite-density reading. If a later session finds another place `population.rostered` is used to represent "the league the GM competes in" for a real-world comparison, the same practice-squad-dilution shape may be present there too — check before assuming `rostered` is always the right population.
2. **`NFL_ELITE_DENSITY_BASELINE` is a structural analogy, not a live feed** (`src/data/nflEliteDensityBaseline.js`). If a genuinely citable measured NFL ratings distribution is ever found, it would be a strictly stronger authority than the honors-slot-count anchor currently in place — the module's own doc comment says so and names where to replace it.

## Where We Left Off (Session 92)

S91 booked one item: build a real NFL elite-density baseline into `src/data`, then re-source both ends of the S91 distributional gate from it. It also drew two hard boundaries — do not close the gap by tuning `POTENTIAL_REVERSION_PROFILE.rate`, and do not assume the ceiling is the wrong end without checking whether the *generator* (or the *measurement*) is wrong too.

### Building the anchor

`src/data/nflEliteDensityBaseline.js` sources the ceiling from real, structurally stable NFL honor formats: **AP First-Team All-Pro** (26 seats — one per position, the tightest honor the league gives) as the ceiling, and the **Pro Bowl** (88 seats — the broader "very good this season" honor) as the watch line. Both are divided by the real active-roster population those honors are drawn from: **53 players × 32 clubs = 1,696**. That denominator is not a coincidence — it is exactly what this project's own `ROSTER_STRUCTURE.activeLimit` already encodes, so the anchor and the measured population line up by construction. The module documents its own honest limits: it is an analogy between a real season-*performance* honor and a declared talent *rating*, not an identity, which is why it ships as a band rather than a false-precision point.

### Checking the population match found the real bug

Before wiring the new ceiling in, the natural question was whether the population the S91 gate measures actually matches the population those honors are drawn from. It did not. `population.rostered` — S91's gated population — is `teamIds.has(player.teamId)`: the active roster (53/club) blended with the practice squad (16/club, S89's `ROSTER_STRUCTURE`). Practice-squad players are structurally ineligible for either real honor.

Measured live, two independent seeds, 10-season decade:

| | rostered (blended) | activeRosterOnly (corrected) |
|---|---|---|
| count, end of decade | 2177-2181 | 1681-1683 |
| elite (90+) count | 57-58 | 57-58 (same players) |
| elite density | 2.6-2.7% | **3.4%** |
| practice-squad elite count | — | **0 / 496, both seeds** |

Blending in the practice squad only ever dilutes the ratio — never inflates it. This is the identical denominator-mismatch shape as the S91 free-agent-pool finding, one level deeper inside the fix S91 shipped for it.

### The resolution

Against the sourced band (1.53% ceiling / 5.19% watch line), the same live league now reads `eliteStatus: watch` instead of `out-of-range` (S91's self-authored 1.6%/2.4% ceiling compared against the diluted population). **Neither `POTENTIAL_REVERSION_PROFILE.rate` nor any ceiling literal was changed to reach that result** — the population correction and the external anchor did it together, and both were required.

`src/stats/progressionParity.js` adds `population.activeRosterOnly`/`population.practiceSquad` to `splitActivePopulation`/`summarizeLeagueProgression`, using the same `(player.rosterSlot || "active") === "active"` default convention the rest of the engine already uses. `buildDistributionReceipt` now prefers `activeRosterOnly` for elite density, with a fallback chain (`activeRosterOnly` → top-level `elite90PlusPct` → `population.rostered`) that keeps session91-era fixtures working unchanged.

### One error caught before it shipped

The first attempt at updating the S91 pre-fix negative-control fixture reconstructed an `activeRosterOnly`-equivalent pre-fix reading by ratio from S91's disclosed rostered figures: elite count `round(2182 × 4.0%) = 88`, corrected count `2182 × (1681/2177) ≈ 1685`, giving `88/1685 ≈ 5.16%`. That landed within noise of the new 5.19% watch line and on the wrong side of it — a full test run confirmed the fixture no longer produced `out-of-range`. Nudging the reconstruction until it crossed the boundary would have been exactly the fabricated-precision-to-pass-a-gate failure this project's own standing rule forbids, so the fixture was rewritten instead: an explicitly synthetic, unambiguously-bad value stands in for "a league this badly out of shape," and the real evidence is carried by a separate live two-seed measurement test that asserts the actual post-fix league lands in `watch`.

Two other new tests failed on first run for legitimate, recorded reasons: a freshly generated league carries 49 players a club (below the 53-man active floor) with **no practice squad at all** — it only populates once camp cuts / roster moves run — so the partition test needed a hand-built fixture rather than `createSession`. And a fallback-path test had over-specified an expected classification outcome that depends on the ceiling, which is unrelated to what the fallback wiring itself needed to prove.

### Verification

New `test/session92-nfl-elite-density-baseline.test.js` (9 tests: baseline derivation, gate wiring, population partition, a `rosterSlot`-default regression, a negative control proving a practice-squad-parked elite pool cannot move `activeRosterOnly` density, the `buildDistributionReceipt` preference/fallback chain, and a live two-season-decade resolution test), plus updated assertions in `test/session91-potential-reversion.test.js` and `test/realism-career-regression.test.js`. Targeted suite green 31/31 before the full canonical `npm test` run (six shards, all default).

Nothing player-visible changed this session — this was a calibration-authority fix. Public launch remains HOLD and `launchReady` stays false.

## Known Traps For Next Session

- **The write-back-currency probe (F7) false-positives here every session.** It anchors on the newest commit touching `SELF_IMPROVEMENT_LOOP.md`, but this project's closeout commits the SIL *before* the rendered artifacts, so there is always a later substantive commit. Confirm against clean tree + `0/0` sync + no lock + all ten surfaces current before believing it.
- **`npm test` is ~50 minutes**, and two of the six shards each run at least one 10-season decade simulation (multi-minute each). Do not assume a quiet terminal means a hang — check `.cache/test-progress.json` for live (non-authoritative) shard progress before concluding a run is stuck.
- **A fresh league carries 49 players per club** and zero practice-squad players. Any fixture that needs a populated practice squad, or needs a club above the 53-man active floor, must construct that state explicitly rather than relying on `createSession` alone.
- **Frozen exported profile objects** (`POTENTIAL_REVERSION_PROFILE`, `PLAYER_DEVELOPMENT_PROFILE`) cannot be monkey-patched for a one-off probe. To reproduce pre-S91 behaviour for comparison, the honest path is checking out the pre-S91 file version in isolation, not attempting to override a frozen export at runtime.
