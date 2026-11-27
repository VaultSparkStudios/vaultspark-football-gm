## S133 Wave status

Session Intent: /start, audit, implement the plan in efficiency order, close out, push to main and deploy.

- [x] Phase 0: verify and release the cut-off 2026-11-22 tree; the edge policy admits the Turnstile origin by default.
- [x] Phase 1: Gridiron Census (default-on, ID-free, opt-out; schema 4); report:visits landing-to-game ratio; agents.json and llms.txt.
- [x] Phase 2: Frame Matters, RAS / Speed Score / catch radius, combine fixes, body programmes (golden master s133-v8).
- [x] Phase 3 (reduced): club-coloured uniforms with pads on portraits.
- [x] Phase 4 (reduced): four pages folded with 301s, footer 19 → 13, landing Census panel and tagline, stale copy.
- [x] Phase 5 (reduced): drive chart, four franchise scenarios.
- [x] Released at c7c7c44c: CI 11/11, staging 14/14 and 10/10, production 10/10, API schema 4, performance, visual review (owner-approved) and release authority.
- [x] Second wave released at a8b46bb3: aging by frame (golden master s133-v9), game kit with helmet and 3D club colour, steal-or-bust draft stories, a GM legacy across saves, archetype scenario codes, animated field strip, screenshot feature cards, Gridiron Census title, trimmed landing footer. CI green, staging 14/14 and 10/10, production 10/10, API schema 4, performance, visual review (owner-approved), authority reconciled, doctor 0 failing.
- [x] Third wave released at 14b50e4d: player-card image, About & Press merge (10-link footer), saves and backups hidden for new visitors with a named Continue button, Census scenario board, public stylesheet subset (45 of 178 KB). CI green, staging 14/14 and 10/10, production 10/10, API pulse live, performance, visual review (owner-approved), authority reconciled, doctor 0 failing.
- [x] Public pages load a stylesheet subset; the game keeps the full sheet (boot JS unchanged at 649,989 of 650,000 bytes).
- [x] The acceleration spec accepts either the reset state or the first speed-building frame.
- [ ] [S133 carried] Realism Sweep job budget raised to 150 minutes (long smoke step 45); confirm on the next scheduled run.
- [ ] [S133 carried] Read the first Census totals and npm run report:visits before deciding on landing changes; check the EU consent position for default-on counters before launch.

## S132 Wave status

Session Intent: audit toward public beta, implement the plan in efficiency order, close out, push to main and deploy.

- [x] Wave 0: startup, canon sync, audit sidecar with 20 ranked items and verified premises.
- [x] Wave 1: one copy per mount in the build; site matches the shipped game.
- [x] Wave 2: minified scripts and styles with an engine parity check (bundling and hashed chunks not done).
- [x] Wave 3: in-game feedback form, opt-in error reports, first-steps milestones with a consent prompt.
- [x] Wave 4: Guides, How It Compares and Screenshots pages; grouped footer; breadcrumb and FAQ structured data.
- [x] Wave 5: faster first week; highlights offered on the week result.
- [x] Wave 6: owner can fire the general manager, job market, Sandbox-only club switching; rival clubs draft through scouting fog (golden master s132-v5).
- [x] Independent review: six defects found and fixed (three ways around the career rules, a crash path, an error-scrub gap, collapsed background-task reports).
- [x] Released at 7f389bdd — hosted CI 7/7 (run 44300045275), staging 14/14 and 10/10, production promotion run 44301777428 10/10, API run 44301772817 ready, performance and release authority verified.
- [x] [S132 follow-up] Guides, How It Compares and Screenshots added to the public capture inventory.
- [ ] [S132 follow-up] The setup form starts from the active league's settings, so a Sandbox league carries into the next new league; decide whether that is intended.
- [x] [S132 second release] GM Profile tab (career, trophies, share cards, save health); Settings split.
- [x] [S132 second release] Weekly challenge with a goal, a score and a shared board (community schema 3).
- [x] [S132 second release] Desk in four groups, game-plan dials (golden master s132-v6), plain football wording.
- [x] [S132 second release] Bundled fonts, retaken screenshots, per-page share images.
- [x] [S132 second release] Staging noindex, import size cap, escape helpers, IPv6 /64 limits, retention timer. Least-privilege database role prepared in ops/sql, not applied.
- [x] [S132 second release] Browser gates as four shards in CI and promotion.
- [x] Second release at 75829192 — hosted CI 11/11 (run 44681573534), staging 14/14 and 10/10, production promotion run 44682173048 10/10, API run 44682169583 ready on schema 3, performance and release authority verified.
- [ ] [S132 follow-up] Apply the least-privilege database role once migrations run as the owner role instead of at service start.
- [ ] [S132 follow-up] Gist import refuses files over 10 MB, which is smaller than a one-season save; the server save route accepts 64 MiB. Align the three limits.
- [ ] [S132 follow-up] Canvas share cards still name Bahnschrift; the dev server serves no font files (the built site does).
- [ ] [S132 follow-up] Move the screenshot and share-image capture scripts into the repo; they were run from a scratch folder.
- [ ] [S132 follow-up] Trade screenshots show a one-for-one swap scored 0 / 100 beside the old "B, even trade" card. The card now follows the score; retake the four trade images with a fair deal, and check whether a 47-point value gap should score 0.
- [ ] [S132 follow-up] One 14-3 season reached GM Legacy 92 "Immortal" in one capture run and 30 in another; measure the legacy score over many first seasons.
- [ ] [S132 follow-up] First Season Contract rows run the label into its detail with no space; the default club differs on every new league; the identity screenshot is mostly footer.
- [ ] [S132 follow-up] The capture script waits 120 s for the one-year realism check, which took about 115 s locally and timed out five times; give the wait room (and print the stack on failure) or find why one simulated year takes that long.
- [ ] [S132 follow-up] The opening checklist still says "Earn the first receipt" (src/runtime/GameSession.js); rewording it changes the golden baseline.
- [ ] [S132 follow-up] Read the weekly challenge board after a week of real posts; the five-browser threshold and the step of five are untested against real traffic.
- [ ] [S132 carried] Career limits: owner mode off, a permanent move to Sandbox and a rewind all avoid dismissal; a difficulty change resets owner patience. Decide which are intended.
- [ ] [S132 carried] Draft follow-ups: projected round reveals true potential order; scouting accuracy is permanent per club; rival GM personas may be identical across leagues (unconfirmed); check champion concentration over 30 seasons.
- [ ] [S132 carried] Launch hold: email-delivery check and founder approval packet (founder-run).
- [ ] [SIL:132] Run a new browser spec before reporting it; three GM-career tests had never passed.
- [ ] [SIL:132] Any test or fixture that patches shipped script text must match minified output.

## S131 Wave status

Session Intent: /arc, then the authorized direct main push and full staging and production deployment.

- [x] Wave 1: S131 startup and fresh nine-axis audit (docs/AUDIT_2026-11-13_SESSION131.json); premise gate 4 verified, 0 contradicted; plan admission ok.
- [x] Wave 2: injury-clock-truth — recovery ticks after the week's games; labelled injuries cost that many team games; negative control red on the old engine.
- [x] Wave 3: questionable-status-visible — shared injuryStatus label on roster, depth chart and dossier; browser spec 4/4 desktop+mobile, dark+light.
- [x] Wave 4: released at 0c6fa04c — hosted CI 7/7, staging 14/14, production promotion 327/327 responsive, API ready, release authority verified; reports/s131-release-acceptance.json.
- [x] Wave 5: closeout write-back, SIL, commit and push.
- [x] Wave 6: final release of the closeout commit 86291dc4 — CI 7/7 (attempt 2), staging and production 10/10, promotion run 44030178849, API run 44030182664 ready, release authority verified, doctor 0 blocking (finalRelease in the acceptance report).
- [ ] [S131 follow-up] Flaky browser gate: tests-ui/player-acceleration-study.spec.js failed CI 44013420568 attempt 1 — after reduced motion was emulated, the movement caption kept animating for 10s instead of resetting to "Ready (0%)". Find why the loop in public/lib/playerMotion.js mountPlayerMovement survives the reduced-motion change (a remounted dossier is one candidate) and fix the cause, not the wait.
- [ ] [S131 follow-up] Postseason medical clock (src/domain/postseasonMedicalClock.js) still ticks before each playoff game; align it with the regular-season order and test it against box-score game-day rosters.
- [ ] [S131 follow-up] Questionable game-day odds (audit L3 rung): a Questionable tag currently never costs a game; decide whether it should carry a measured chance to sit.
- [ ] [S131 note] An elevated player's last injured week now earns an elevation-injury-continuation pension game (first ledger entry in the play-4113-CHI golden scenario); confirm the pay rule intends this.
- [ ] [SIL:131] Assign a new test file to a shard in the same edit that creates it; shard-coverage only caught it in the full suite.
- [ ] [SIL:131] The startup canon sync drops gitignored scripts/run-tests.mjs and scripts/check-last-session-summary.mjs into this repo, which redden two studio gates locally; remove them before the suite (or fix the sync's exclusions in studio-ops).
- [ ] Unselected S131 candidates: axe accessibility tests, minifying shipped modules, a faster first week, community API fog hardening.

## S130 Wave status

Session Intent: Complete five selected improvements, their authorized technical release and full closing records.

- [x] Wave 0: S129 recovery published and read back at c5290c3d; scoped Studio 398/398, application hosted CI 7/7 and frontend provenance are separate evidence.
- [x] Wave 1: Full S130 startup and native goal binding; canon reconciliation, offline conformance, adoption, radar, credentials discovery and validated startup brief. Beacon unconfigured; owner propagation exclusions remain unverified.
- [x] Wave 2: Fresh nine-axis audit, readiness matrix, five strict premises, pre-implementation timing and fixture/real admission verified.
- [x] Wave 3: All five selected S130 improvements and the complete 327-record responsive inventory are verified; reports/s130-c4-release-acceptance.json.
- [x] S130 — Coaching boot headroom: defer staff-management rendering until needed; preserve club authority, retry and failure recovery.
- [x] S130 — Community participation: failed consent persistence keeps sharing off; pending deletion remains off and retry-first.
- [x] S130 — Player availability: show simultaneous suspension, reserve, roster and medical facts without inventing eligibility.
- [x] S130 — Co-GM exports: visible failure, truthful clipboard download fallback, valid retry and temporary download cleanup.
- [x] S130 — Responsive capture inventory: source-bound mobile/tablet/desktop evidence in dark/light, complete coverage and omission guards.
- [x] Closing records: accepted technical evidence and ordered records are prepared; their containing commit must pass final checks and remote readback.

# Task Board — Franchise Architect: Football

## S129 Wave status
<!-- s129-closeout -->

- [x] Wave 0: recovery. Cut-off S129 reconstructed (audit written, depth-chart rebuild mid-flight, no lock); JSON integrity checked; recovered work verified, then committed alone as c2e5a5ca.
- [x] Wave 1: audit refresh. Premises re-run against live code: 24 verified, 1 contradicted only by the recovered fix.
- [x] Wave 2: weekly-challenge (implemented), agent-surface (implemented), site-truth-pass (reduced), player-identity L1 (reduced); committed as 51701878.
- [x] Wave 3: closeout write-back, SIL, push to main. Staging/production release not attempted this session.
- [x] [SIL:129] Boot budget headroom — resolved by S130: coaching loads on demand; isolated foundation headroom is 5,344 bytes under the unchanged 650,000-byte ceiling. The full candidate footprint is verified separately; reports/s130-release-acceptance.json.
- [ ] [SIL:129] Checkpoint before you continue: commit a cut-off session's tree on its own before the first new edit. This session had to rebuild that boundary from -U0 hunks.
- [ ] S129 audit follow-ups: release (staging then production) fulfilled by S130 — reports/s130-release-acceptance.json; remaining: site-truth releaseLabel + privacy single source, player-identity L2 (personality, college, hometown, roster/depth display), depth-chart menu entry, and the 14 pending items in docs/AUDIT_2026-11-10.json.


## S128 Wave status

- [x] Wave 1: fresh startup, goal binding, live audit and pre-edit admission.
- [x] Wave 2: both selected L2 repairs, C3 focused49/49, local browser4/4 and18 reviewed captures; rejected candidates retained.
- [x] Wave 3: exact C3 technical release, ordered records, accepted metadata398/publication/readback, signed impact and owned cleanup verified; reports/s128-closeout-completion.json. Final containing receipt publication/readback and only original bound S128 lock release remain native guards.

## S128 future discipline — explicitly unselected

- [ ] [SIL:128] Future discipline — unselected; current arc unauthorized: Future discipline: cache admission tests must prove identity-only or whitespace payloads cannot reserve a real source event ID; then verify the next authoritative action.
- [ ] [SIL:128] Future discipline — unselected; current arc unauthorized: Future discipline: before cutting a candidate, reconcile selected code tests, visible mobile target states and every source/artifact-bound receipt; preserve failed candidates and cancelled jobs as historical.

## S127 Wave status

- [x] Wave 1 — Fresh native goal S127 binding, startup checks, nine-axis audit and pre-edit admission. Startup held-source-absent and missing-helper limits remain recorded.
- [x] Wave 2 — Both selected recovery outcomes independently reviewed; scoped focused/local browser evidence remains distinct from exact release proof.
- [x] Wave 3 — Exact source CI7, source Studio398, staging and production frontend/API technical release accepted at 8ab05e49d658e512e03614bd5cc12f6f85a5a75f; reports/s127-release-acceptance.json.
- [x] Wave 4 — Ordered records, corrected exact metadata398, first containing publication/readback, signed impact and owned cleanup verified; reports/s127-closeout-completion.json. Final containing receipt publication/readback and ONLY original bound S127 lock release remain native completion guards.

## S127 future discipline — unselected follow-ups

- [ ] [SIL:127] Future discipline: when changing a recovery runway, test mixed or future dates, inherited full storage and acknowledged worker failures together before declaring retention safe.
- [ ] [SIL:127] Future discipline: verify each named mobile capture contains its target headings/actions before cutting a candidate, and preserve transient overlay and failed-fixture evidence instead of silently replacing it.

## S126 Wave status

- [x] Wave 1 — Fresh startup, goal/session binding, nine-axis audit, pending admission and pre-implementation premise timing.
- [x] Wave 2 — Mobile control recovery, prediction corruption safety and trophy continuity; local143/143 focused, client7/7 browser,32 selected final images and independent reviews accepted.
- [x] Wave 3a — Exact source staging, required CI, main source publication and actual frontend/API technical production accepted.
- [x] Wave 3b — Exact closing metadata, first containing publication/readback, signed impact and owned cleanup verified; final containing receipt push and original-lock release remain native completion guards.

Historical release dependency — resolved by C2: candidate `1c73ef6` passed all seven CI jobs and was deployed to the frontend/API, but desktop entry LCP missed the unchanged1,800ms limit in two native runs (1,824ms and2,088ms). The required entry-only bundling repair is now accepted at exact C2 source `309bb0f`, deployed to both frontend and API, with CI7/7, provenance14/14 and browser7/7 at each origin, and passing five-run desktop/mobile performance. See reports/s126-c2-release-acceptance.json. Baseline4, pre-implementation evidence and both C1 misses remain historical in reports/s126-entry-performance-premise.json and the original performance receipts. Wave3b proof is recorded in reports/s126-c2-closeout-completion.json; final containing publication is guarded separately.

## S126 future discipline — unselected follow-ups

- [ ] [SIL:126] Verify container shapes and resolved grade fields together; include quota-failed invalidation before accepting optional-state recovery.
- [ ] [SIL:126] Bind pixel matrices to source hashes and actual themes before cutting the candidate; keep captured fixture failures distinct from product defects.

## S125 Wave status

- [x] Wave 1 — Fresh audit and pre-implementation admission/timing; startup sync delivery/order limitation retained.
- [x] Wave 2 — Optional journey, safe Inbox and tab-local First Season Contract repairs, independently reviewed.
- [x] Wave 3 — Exact accepted candidate CI/images, staged/client proof and actual frontend/API technical promotion.
- [x] Wave 4 — Accepted game/note delivery, ordered writeback, first containing publication, signed GAME impact and initial cleanup verified; final candidate records await exact native Studio/publication/service guard.


## S125 future discipline — unselected follow-ups

- [ ] [SIL:125] Validate real client authority and optional per-key storage failure boundaries before hosted acceptance.
- [ ] [SIL:125] Check current session projections, exact committed source bytes and complete image-ledger hash coverage before the next candidate; retain original failed observations.

## S124 Wave status

- [x] Wave 1 — Fresh startup, native goal binding, nine-axis audit and pending-candidate admission.
- [x] Wave 2 — Three selected storage recovery outcomes; focused45/45, browser9/9, independent round2approve and24reviewed captures.
- [x] Wave 3 — Exact candidate, staging, required checks and actual frontend/API production verified.
- [x] Wave 4 — Closeout artifacts verified: ordered records, metadata389/389, first receipt publication/readback, signed impact and owned checkout cleanup. Final native publication/job/original-lock guard remains required before goal completion.

## S124 future discipline — unselected follow-ups

- [ ] [SIL:124] Check native premise-recorder CLI compatibility before future implementation; require complete staged/untracked timing evidence.
- [ ] [SIL:124] Use real product themes and complete callback/receipt paths in future storage-fault capture matrices; preserve raw structured browser results.


## S123 Wave status

- [x] S123 closeout artifacts: metadata389/389, first receipt publication, HMAC impact and owned checkout cleanup verified. Native completion requires final containing-commit readback and owned job/lock release.

- [x] Wave 1 — Cloud storage resilience: focused and real-browser denied-storage POST/PATCH/clear checks pass locally and on staging.
- [x] Wave 2 — Owner ultimatum opens Boardroom: corrected async ownership guard passes26units and local browser5/5 including8cross-franchise boundary cases;16images inspected/hash-bound. Hosted corrected-source proof remains in Wave3.
- [x] Wave 3 — Candidate456682bf withheld from production after the introduced ownership race; corrected candidate 49035219b7511bb5a54c438eba73f62798f0e072 verified on exact CI, staging and production. Ordered writeback recorded; final metadata checks, receipt publication and cleanup are tracked below.

<!-- ledger-roll:pointer -->
---

Older entries are retained verbatim in `context/archive/TASK_BOARD.archive.md`. Nothing is summarised or removed on the way; the live file holds the working set only (newest 10 entries), so a reader does not pay for the whole project's history to learn what is true this week.
