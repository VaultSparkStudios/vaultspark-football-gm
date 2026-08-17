# Closeout Brief — Franchise Architect: Football — S89

> The salary cap was not a constraint — 31 of 32 clubs sat illegal from season 7 onward — and the engine had no way to release a player. It does now, and legality is measured every offseason.

## Shipped

- **The salary cap actually binds** (10/10 project, 8/10 ecosystem): Measured on a seeded 20-season run: clubs over the $255M cap went 0,0,1,2,10,27,30 then 31 of 32 for every remaining season, median $89M over by season 20, worst $226M. The cap was gated at exactly one seam while the draft added 224 unchecked contracts a year and nothing could release a player. Re-measured after the fix: 0 illegal clubs after every offseason across 2027-2036.
- **Rosters have an upper bound for the first time** (8/10 project, 6/10 ecosystem): normalizeRosterSlots marked the top 53 active and every remaining player practice forever, with no ceiling — the league grew 1,568 to 2,919 players and the practice squad 50 to 468 in eight seasons. Rosters are now pinned at exactly 53 active + 16 practice, with the surplus released to the free-agent pool.
- **A declared bound that was pure fiction is now real** (6/10 project, 7/10 ecosystem): CONTRACT_RULES.maxSalary declared a $45M ceiling the curve could never reach — its hard maximum is $43,320,000 at a perfect 100 overall — so the clamp was dead code and the S87 record's reachability claim was false. Corrected, bound to the curve in test, and the salary literals duplicated across eight sites now read the single authority.
- **The husk defect class gets a gate that is proved able to fail** (5/10 project, 8/10 ecosystem): Two earlier scanner versions were discarded — one with 39 false positives out of 48 toggled ids, one that returned clean on HEAD while failing to catch the real shipped S88 bug. The shipped gate reports the pre-S88 structure correctly and 0 suspects on HEAD, with both directions pinned in test.
- **Exact technical deployment** (9/10 project, 8/10 ecosystem): Candidate fc664864 verified on stable staging 14/14 at artifact 8ac6e8cf, promoted to production via workflow_dispatch run 32064758203, production provenance 10/10, hosted performance and 84 retained visual receipts rebound to the same candidate, unified release authority verified 7/7.

## Follow-ups

- **Calibrate league-wide talent inflation at the source**: Measured twice independently: league top-100 mean overall drifts 86.8 to 94.2 across 20 seasons, and the realism regression reports 0.228 annual drift against a 0.15 ceiling. S89 bounded the symptom only; this is owed a dedicated session.
- **Decide whether the long shard belongs in the canonical receipt**: It is excluded from DEFAULT_SHARDS, so its standing failure has been invisible behind every suite-green claim. Including it turns the receipt red until the calibration lands — a founder sequencing call, not a silent one.
- **Fix the receipt writer's session numbering**: write-visual-qa-receipt derives its label from currentSession + 1, which is only correct when run before the status update; it produced s90 filenames for an S89 session until overridden explicitly.

## Blockers

- **Public launch gate unchanged**: launchReady remains false on email-delivery, founder-approval and lifecycle-authority. Technical deployment authorization is not launch approval, and nothing this session touched those gates.
- **Pre-existing red outside the canonical receipt**: test/realism-career-regression.test.js fails in the excluded long shard on 0.228 annual overall drift. Verified to reproduce identically on a pristine worktree at HEAD 8ddc310, so it predates this session; reported rather than fixed or force-greened.

## Honesty Ledger

- **A code-read hypothesis was disproved by running it, and was not shipped**: getNegotiationDemand anchors on a literal overall squared times 510, which read as a violation of S87's independent-curve decision and would have ranked first. Sampling the top players across eight clubs showed demands actually return at a median 1.23x the market authority. The literal is a pre-blend anchor, not the effective price.
- **The first version of the fix was wrong, and measurement caught it**: Charging a released contract's full remaining dead cap against the current year exceeds its own cap hit for large contracts, so every release made the club less legal and 31 of 32 stayed illegal. Only re-running the probe revealed it; review would not have.
- **A suite red was fixed at the source claim, not by rewording the gate**: Adding a new engine module made the landing page's 39 Engine Systems claim false. check-public-truth failed correctly; the public claim was corrected to 40 and verified live.
- **No recovery commit was fabricated for a clean boundary**: Phase 0 found S88 fully closed out — clean tree, synced, all ten surfaces current. The write-back-currency warning was a known cross-repo false positive whose SHA does not resolve in this repository. A labelled recovery commit would have invented a boundary that did not exist.

## Proof

- Files changed: 21
- Insertions: 1266
- Deletions: 49
- Suite: Node 1,150/1,150 across the five default shards (core 123, runtime 740, sim-contract 79, sim-realism 1, studio 207), direct exit 0, up from 1,137/1,137 (+13 tests). SIL v3.0 971/1000, down from 995 — Dev Health 92 and Automation Coverage 80 mark the disclosed long-shard gap honestly rather than scoring it green.
