# Latest Handoff — Session 103 → Session 104

## Where We Left Off

S103 opened by recovering S102, whose engine work was committed and verified on both staging and production at `30572068` but whose closeout-artifact commit never landed. The tree looked clean above an uncommitted proof layer — receipts, captures, the rendered brief, the status board — which is precisely the state a tree-only triage calls "not cut off". The per-surface ledger showed all eight core surfaces already written in S102's own feature commit, so recovery was one commit (`5cde423`), not a re-implementation.

**The denominator question S102 deferred has a factual answer.** `LEAGUE_PROGRESSION_PARITY_TARGET` measures `rostered`. A generated league is built at 53 players per club with an **empty practice squad**, and fills its 16 practice slots per club over the following decade — so this gate's denominator gains roughly a quarter of itself, and everything it gains sits about ten points below the roster it is being averaged into, across exactly the window it measures. **A drift statistic requires a population that exists at both ends of its window, and `rostered` does not.** That is not a preference about which league to police; it is a prior test `rostered` fails.

Decomposed on the canonical seed 20260306 over ten seasons — the same path `realism-career-regression` asserts on:

```
within-group   (players actually developing)      +0.269/season   "watch"
between-group  (practice weight 0% -> 22.7%)      -0.197/season
blended        (what the gate asserts)            +0.072/season   "on-target"
```

Two effects of opposite sign cancelling inside a gate built to catch exactly that. S91 found this shape with the free-agent pool in this same denominator; S102 found it on the dispersion arm; this is the third.

## The decision that matters, and why the population did not move

**The re-point was implemented and reverted.** Pointing the target at `activeRosterOnly` reads **0.303/season** on the canonical seed — `out-of-range` against `watchMaxAbs` 0.3, not `watch`. A red gate has two honest exits: fix the defect it found, or weaken the gate. Weakening is forbidden here and the defect is real, so shipping the re-point would have forced a threshold change in the same commit — which from outside is indistinguishable from moving a threshold until the number fits, and would have converted a correct diagnosis into the exact failure S102 wrote its deferral to avoid. `onTargetMaxAbs` and `watchMaxAbs` are untouched.

**What shipped instead is the finding, gated.** `buildCompositionShift` decomposes the gate's own blended mean on every run (midpoint weights and means, so the parts sum to the whole exactly), and `realism-career-regression` now asserts it reports **`verdict-changed-by-composition`** on the canonical path. **This gate can no longer report `on-target` without also reporting, in the same receipt, that its verdict was produced by its denominator moving.** That cost nothing in thresholds and cannot be argued away.

Its criterion is a **changed verdict**, not a tuned magnitude, and that matters: the first draft flagged composition when `|between| > |within|`, and run against the very measurement that motivated the item it returned `development-dominated`, because 0.197 is not larger than 0.269. It would have shipped green on the defect it was written for. It now classifies both terms against the target's own existing bands and reports disagreement — no new free parameter.

## Next work

**Fix the roster's position composition first; the re-point follows it, not the other way round.** The same receipt hands over the root-cause candidate, and it is a strong one. `normalizeRosterSlots` ranks a club's entire roster by `overall` with no positional structure at all, so over ten seasons:

```
Quarterback     64 -> 195 players   (11.3% of them 90+)
Specialists     64 -> 155
Offensive Line 288 -> 258
Front Seven    480 -> 407
```

Six quarterbacks and five kicker/punters per club, while the line and the front seven are stripped. High-rated, cheap positions crowd out linemen, which inflates the active-roster mean for a **compositional** reason one level below the practice-squad one this session was about. That is a live candidate for both the 0.303 parity reading and the standing elite-density `watch`, and it wants a fieldable-depth-chart constraint rather than a pure overall ranking. Budget a 10-season re-measurement across seeds against the career-length bands, and re-run the parity re-point after it.

**Do not close the parity item by widening `onTargetMaxAbs`/`watchMaxAbs`, and do not close it by re-pointing the population a second time.** Everything needed to finish it properly is on the receipt now.

**Elite density remains `watch` at 3.3% of the active roster at 90+ against a sourced 1.53% All-Pro ceiling, and S102's recommended fix for it is now known not to work.** Age-indexed potential decline was built exactly as recommended — onset 27, 0.35 points per year past prime, capped at 3.0, RNG-free, applied at the reversion seam — and run against a matched control on seed 2026:

| | control | age-indexed decline |
|---|---|---|
| active-roster mean drift | +0.265/season | **+0.298/season** |
| elite 90+ share at season 10 | 3.80% | **3.92%** |
| active-roster mean potential | 83.78 | 82.91 |
| active-roster dispersion | 4.837 | 4.830 |

The cost is real — mean potential falls 0.87 — and it lands on the wrong cohort. Measured age mix at season 8: the active roster's mean age has fallen 27.38 → 26.0, the elite cohort averages 26.6, and only 34% of it is past the decline onset at all. What the rule does reach it replaces with younger, higher-potential intake, accelerating the turnover that drives the ratchet. **Check a proposed cost's incidence — who actually pays, as a share of the cohort you are trying to move — before building it.** Reverted whole; no dead module left behind.

**Per-franchise identity is done, and worth knowing about.** `staffSeedKey` and `coachingMarket`'s `leagueSeed` both fell back to a key built from the league's start year when a league carried no `leagueId`/`franchiseId` — which is every single-player league, because only the multiplayer lobby path sets those fields. `derivedRng` was working perfectly and being handed the same seed by every franchise, so head coaches, coordinators and coaching-market candidate pools were byte-identical across seeds 8121 / 2026 / 4242. `leagueIdentity` derives a per-league value from persisted content and the normalizer assigns it once so it persists from the first load. It fingerprints **player ids**, not team identities, because `buildRandomizedTeamIdentities` takes only the year — a team-derived fingerprint would have reproduced the exact bug it fixes.

Two claims attached to that item were checked rather than inherited. The "changing the seed key regenerates staff for every existing save" migration cost is **false**: `buildStaffProfile` preserves any stored name that is not the old role-label fallback and any finite stored attribute, asserted on a real snapshot with its identity stripped to look pre-S103. And the third fallback site, `gmDecisionAuthority.normalizedFranchiseId`, is **not** in this defect class — it keys an occurrence ledger held inside a single save's own state, so two franchises cannot collide through it. It was left untouched deliberately.

The authoritative registry still reads `sparked` against a local contract of FORGE. An Ark `registry-delta` was shipped to studio-ops in S101 with the reasoning; do NOT resolve this by flipping the local contract — three blocking lifecycle checks are written as `expected !== "FORGE" || …` and would become silent auto-passes.

Delivered/reply-capable project-domain email, candidate-bound public-launch approval, and authoritative lifecycle reconciliation remain independent launch evidence. Public launch remains **HOLD**.

## Verification boundaries

The parity decomposition and the roster-composition figures are a **single-seed, ten-season** reading on the canonical seed 20260306, taken from `runRealismVerification({ seasons: 10 })` — the path `realism-career-regression` itself asserts on. The elite-density comparison and the ratchet control arm are single-seed ten-season readings on seed **2026**. The league-identity result is a three-seed reading (8121 / 2026 / 4242) for staff names, with one market call per seed for the candidate pool; a broader sweep of the market's candidate quality distribution has not been run.

Two things in this session were wrong before they were right, and the class matters more than the instance. The composition guard's first criterion **passed its fixture negative control and then returned the wrong verdict on the production numbers** — a magnitude threshold invented to describe the defect missed it by 0.072. A negative control proves a gate sees the defect in a fixture; it does not prove the gate sees the defect *as it was actually measured*. Assert the finished gate on the observed numbers too. And the re-point itself looked finished until it was run against the canonical gate — measure a target change against the gate it will be judged by **before** committing it, not after.

SIL scores are engineering assessments, not measured player outcomes. No real-cohort evidence exists.
