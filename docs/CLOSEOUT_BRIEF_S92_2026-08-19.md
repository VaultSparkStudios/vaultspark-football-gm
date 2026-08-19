# Closeout Brief — franchise-architect-football — S92

> A sourced elite-density baseline, and the population bug it uncovered — the S91 distributional gate now reads real NFL All-Pro/Pro-Bowl honor counts against the correct active-roster population, resolving the disclosed watch without tuning the engine.

## Shipped

- **nfl-elite-density-baseline-and-population-fix** (9/10 project, 3/10 ecosystem): src/data/nflEliteDensityBaseline.js sources the ceiling from real NFL honor-slot counts (AP First-Team All-Pro 26, Pro Bowl 88) against the real 53x32=1,696 active-roster population; progressionParity.js adds population.activeRosterOnly/practiceSquad and buildDistributionReceipt prefers it. Measured live, two seeds: practice squad holds 0/496 elite players both seeds; the same 57-58 elite players read 3.4% on activeRosterOnly vs 2.6-2.7% on the old blended population. eliteStatus moves out-of-range -> watch without tuning POTENTIAL_REVERSION_PROFILE.rate or the ceiling.

## Follow-ups

- **check-other-population-rostered-usages**: The new activeRosterOnly/practiceSquad split is only wired into the S92 distributional gate; check whether any other real-world-comparison surface uses population.rostered and would have the same dilution.
- **replace-honors-analogy-if-a-real-distribution-surfaces**: NFL_ELITE_DENSITY_BASELINE is an honors-slot-count analogy, not a live measured ratings distribution; upgrade if one is ever found citable.

## Blockers

- **public-launch-hold**: launchReady: false — email-delivery-unverified, founder-approval-unverified, lifecycle-authority-unverified. Unchanged by this session.

## Honesty Ledger

- **reconstructed-negative-control-value-rejected**: A hand-reconstructed pre-fix activeRosterOnly estimate (5.16%) landed within noise of the new 5.19% watch line and on the wrong side of it. Rather than nudge the estimate across the boundary, the fixture was rewritten to an explicitly synthetic, unambiguous value; the real evidence is carried by a separate live two-seed measurement test.

## Proof

- Files changed: 18
- Insertions: 264
- Deletions: 173
- Suite: npm test 1,189/1,189, direct exit 0, six shards; doctor blockingFailing 0
