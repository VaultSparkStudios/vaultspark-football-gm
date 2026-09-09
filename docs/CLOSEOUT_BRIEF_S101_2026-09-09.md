# Closeout Brief — franchise-architect — S101

> Completed the full arc. A four-lane live-code audit found that several rules the game advertises were never enforced and several gates reporting green had no ability to report red — the trade deadline the UI said would 'shut' was not checked anywhere in the engine, a capped-out club could re-sign everyone anyway, every rewind write exceeded the browser quota so a shipped feature never worked, and banked cap space quietly went to zero by season eight. All were fixed against measured evidence, and every new or repaired gate was given a negative control against the real pre-fix defect — which caught one of this session's own tests passing with the bug restored.

## Shipped

- **The trade deadline becomes an enforced rule** (8/10 project, 2/10 ecosystem): Three surfaces advertised three different windows (8-10, 9-11, a W12 mandate) for a rule TradeService never checked, so the same trade was legal in Week 17 and in the playoffs. One tradeDeadlineWeek in DEFAULT_LEAGUE_SETTINGS, enforced once at the shared command seam so CPU front offices obey it, derived once by the UI.
- **The salary cap can no longer be walked through** (8/10 project, 1/10 ecosystem): negotiateAndSign caught the cap authority's refusal and hand-wrote the contract with the OLD capHit, returning ok:true — a capped-out club could extend every expiring player forever while the client reported a flat 'accepted the offer'. The bypass is removed and the applied terms are reported; proven by a test that goes red with the bypass restored.
- **A restored franchise can no longer become unplayable** (9/10 project, 1/10 ecosystem): The restore normalizer rebuilt 2 of team.season's 12 declared keys (third drift site of the S71 shape), so a snapshot missing season restored with wins:null and threw on the next advanceWeek. fromSnapshot now normalizes the league before new StatBook, matching the constructor, so an omitted collection cannot throw after the compatibility check said compatible.
- **The rewind feature actually works** (8/10 project, 1/10 ecosystem): Rewind wrote raw JSON measured at 12.13 MB per payload against a 5-10 MB quota while saves used the 8.5x gzip codec, so every write failed in a real browser; the pre-restore safety checkpoint's failure was discarded before the live session was irreversibly replaced with a 200; a corrupt index reset to [] and committed the emptiness on the next write. All three fixed, legacy plain-JSON points still load, measured 14,892 KB to 1,808 KB across four payloads.
- **Banked cap space carries forward again** (7/10 project, 1/10 ecosystem): applyCapRollover was the only cap reader ignoring teamCapOverride, so rollover collapsed from ~30M to ~1.09M by simulated season 8 as the real cap grew. Re-measured over 10 seasons: rollover holds ~29-31M with capComplianceUnresolved empty every season.
- **Coaching staff stop being annual noise** (6/10 project, 1/10 ecosystem): processStaffLifecycle ran twice per offseason, burning contracts at 2x their declared term (a 2-year head coach gone after one), and is now guarded like its three pipeline neighbours. Four of seven staff roles never expired at all, freezing two of five inputs to every CPU club's coaching.development and 100% of coaching.wellness for the life of the franchise.
- **The publish path now runs the tests that cover it** (7/10 project, 5/10 ecosystem): deploy-pages and deploy-backend gated on the studio shard alone while src/** was a trigger path and full CI ran as a parallel workflow, not a needs: — an engine regression could reach the live origin unexercised and sit until the weekly sweep. Both now run the behaviour shards, guarded structurally by a test that fails on the pre-fix workflow.
- **Four gates that could not fail were made falsifiable** (6/10 project, 6/10 ecosystem): A drift test asserting a tautology; an authoritative-registry check that ceased to exist rather than failing whenever the sibling repo was absent (every CI run); git-head-covered-by-publication hardcoding contradiction:false so 'is main actually live?' could not block; and a release-freshness live arm no caller ever reached. Each now has a negative control against its real defect.
- **Dead controls and unreadable numbers** (5/10 project, 1/10 ecosystem): navigateToExactSurface reported focused:true while focusing an element in a display:none tab (two live call sites pointed at the wrong tab); three selects shipped permanently empty, two under copy telling the player to use them; the commissioner intent queue had no submit control despite a fully implemented, contract-registered endpoint; seven hardcoded reds had no light-theme path, including the Cap Space card and the draft clock.

## Follow-ups

- **Signing-bonus proration accelerates**: Recomputed over remaining years, so a contract gets more expensive every year it exists (+18.3% over 3y, +26.4% over 4y) and its final year is its most expensive. Needs a save-shape migration; deferred with measurements rather than half-fixed.
- **The free-agent pool is unbounded**: 0 to ~413 players by season 10, ~60/season with no exit path, displacing the reversion gap centre by 0.44-0.51 by season 10. Bound the pool; do not re-scope the centre.
- **The dispersion arm reads out-of-range on every seed**: The engine's own buildDistributionReceipt reports out-of-range while the suite asserts only the elite and mean arms, which pass. Wiring the assertion turns the suite red immediately, which is the point. Needs its own session with a 10-season re-measurement budget.
- **Real player evidence**: Wait for a genuine opted-in cohort; no manufactured activity.

## Blockers

- **Public launch remains HOLD**: Delivered reply-capable project-domain email, candidate-bound founder approval and authoritative lifecycle reconciliation remain unproved and unchanged this session.

## Honesty Ledger

- **One of this session's own new tests was a false green**: The cap-rollover regression passed with the pre-fix bug deliberately restored — the fixture left enough space that both readings clamped to the same ceiling. It was rewritten until it failed at 2.4M-against-146M and re-verified. Reported because the class is exactly what this session spent its effort on.
- **S99 and S100 never wrote their CURRENT_STATE entries**: The public-truth gate derives a session number from that file and blocked the Pages build, which is how the gap surfaced. The S101 entry is written; theirs are not back-dated, because reconstructing them would be fabrication.
- **Three engine defects are measured, not fixed**: Signing-bonus proration, the unbounded FA pool and the dispersion arm are deferred with their numbers recorded in TASK_BOARD and DECISIONS. Honest deferral, not a silent skip.
- **SIL scores are engineering assessments**: Not measured player outcomes. No real-cohort evidence exists, so engagement stays limited.
- **A probe column that looks like a regression is not one**: The over/spaceM columns in the rollover probe measure against the flat base cap — the same measurement error the audit lane retracted mid-audit — and are not evidence of a solvency change. capComplianceUnresolved is empty every season.

## Proof

- Files changed: 60
- Insertions: 6121
- Deletions: 367
- Suite: Node 1,369/1,369 across six shards; Playwright 60/60; studio shard rerun after two self-caused reds fixed at source
