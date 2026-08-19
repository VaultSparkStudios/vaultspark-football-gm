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
