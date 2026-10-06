# Task Board — Franchise Architect: Football

Public-safe roadmap. Session 8 audit + implementation sprint (2026-04-13). Session 9: test coverage (2026-04-13).

## Now

- [ ] Observe the first real opted-in cohort and verify freshness, suppression, deletion and abuse ceilings without manufacturing activity.
- [ ] Reconcile launch authority only from delivered/reply-as email evidence, SHA-bound founder launch approval, and the authoritative lifecycle registry.


<!-- s112-closeout:tasks -->

<!-- s112-closeout:cpu-market-evidence-correction -->
### S112 CPU-market evidence correction

S112 evidence correction to the older CPU–CPU market task: test/session111-cpu-trade-market.test.js proves a matched-seed single-week enabled/disabled transaction control, plus a separate three-year market-volume bound. It does not contain a matched three-season disabled-market comparison. The older wording remains historical and is superseded by this correction.
<!-- /s112-closeout:cpu-market-evidence-correction -->

## Session 116 — Multi-sport platform: guardrails and the first six seams (2026-10-04)

- [x] Phase 0: football golden master (scripts/golden-master.mjs; a real behavior change flips 94 sections) and the sport conformance kit (determinism, score, period and stat closure, trademark vocabulary; fails closed).
- [x] Step 1: sport rules registry (src/sport/registry.js); no NFL constants are read by core code with a league in scope.
- [x] Step 2: the match engine returns statDeltas, appearances and snapCounts, and the core applies them (src/stats/applyGameStats.js).
- [x] Step 3: football stats become a pack schema; statBook.js names no football category.
- [x] Step 4: the season calendar and offseason stages become pack data.
- [x] Steps 5–6: schedule and postseason become pack competition; registerSport lets a runtime pack join.
- [x] Verify and deliver: Source d913b9f9c0043d00131506c0d4271034a15fc169. All six shards green at this commit, run shard by shard and in runtime chunks under host memory pressure (studio 365, sim-contract 122, sim-realism 9, long 3, core 290, runtime 1013). Football golden master identical at every extraction step. Stable staging 14/14 (artifact b4acf986…), promotion https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/37200292923 success, production and staging provenance 10/10, hosted performance verified, Doctor blockingFailing 0. Public launch remains HOLD.

### Next (Phase 1 continues — see the approved multi-sport plan)
- [ ] Championship data key: rename superBowl to championship with a snapshot migration and aliases for old saves, and give conferences display names that are not the real NFL's (AFC/NFC are stored ids).
- [ ] Step 7: position/roster catalog. Step 8: rating model. Step 9: value metric and calibration. Step 10: week event bus.
- [ ] Client shell versus pack UI islands, then the physical move to packages/core and packages/sport-football.
- [ ] Passer rating clamps before scaling (89.3 instead of the real formula's 99.3 on a 300/450, 3500-yard, 25 TD, 10 INT line). Fix it as a deliberate golden-master change.
- [ ] weeklySimulator still builds weekly standings with literal AFC/NFC keys.
- [x] Inbound project email: added the Cloudflare routing rule football@ → founder@vaultsparkstudios.com; test (3) delivered and the founder replied from Zoho (2026-10-05).
- [ ] Reply-as football@ (Zoho Send Mail As through Brevo SMTP, or the founder's custom email studio project): deferred by founder direction. Then build the project-email-round-trip receipt and rerun scripts/launch-evidence-report.mjs.
- [x] Founder applied S0→FB in vaultspark-studio-ops on 2026-10-06; registry-change cargo shipped; lifecycle coherence PASS (registry FORGE = local FORGE).
- [ ] Before S1 (public release): announcement on the current URL, a release receipt (product, identity, email, operations, release, posting), and a founder GO. The registry liveUrl and staging fields are stale.
- [ ] Studio-ops gaps: Analytica feed (baton 2026-10-02), Obelisk OIDC (handoff 2026-10-01), Studio OS map 14/15; decide hello@ (studio standard) vs football@.
<!-- /s116-closeout:tasks -->

## Session 115 — Situational calls, archetype drafting and a parallel deploy gate (2026-10-03)

- [x] Situational calls: a standing 4th-down and two-minute posture for the controlled club. Defaults are byte-identical to the previous engine over 36 seeded games, every posture uses one draw per decision, and the measured go rate is 0.078 / 0.125 / 0.188 with 245 vs 373 two-minute plays. Desk card, both transports, 2-MIN replay tag.
- [x] CPU drafting tilts by GM archetype. In a matched 10-season probe on two seeds, Win-Now draftee headroom was 1.69–1.73 vs 2.38–2.49, with league overall mean, sd and p90 and the spread of champions unchanged.
- [x] Deploy gate runs as parallel matrix legs; the promotion gate took 7.5 minutes instead of about 23.
- [x] Verify and deliver: Source 80125a0a5609be8a9fd7c01399e176ffe1b8e052. Six-shard suite 1765/1765 at this commit (core 290, runtime 1013, sim-contract 85, sim-realism 9, long 3 in one run; studio 365 re-run after the first run was stopped by host memory pressure). Stable staging 14/14 (artifact b4506762…), promotion https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/37141977109 success with the gate as four parallel legs (about 7.5 minutes, was about 23), production and staging provenance 10/10, hosted performance verified, Doctor blockingFailing 0. Visual receipt 214 captures bound to 80125a0. Public launch remains HOLD.

### Next
- [ ] Moneyball is never selected in generated leagues and Loyalty clubs barely move, because draft classes carry about 2 points of headroom. Revisit archetype spread or headroom variance only with a measured purpose.
- [ ] Launch stays HOLD: delivered on-domain email, candidate-bound founder approval and lifecycle reconciliation (registry SPARKED vs local FORGE).
<!-- /s115-closeout:tasks -->

## Session 114 — Release note, display codes and the server route split (2026-10-02)

- [x] Publish the S113 player-facing release note (2026-10-02 "The league talks back").
- [x] Stored headlines and four pure client modules use display codes (src/domain/teamLabel.js, public/lib/teamDisplay.js).
- [x] Split src/server.js into 11 domain route modules with a shared source reader for text-based checks; route-split test pins all 129 routes and forbids duplicates.
- [x] Retire the styles.css split on measurement: 207 KB raw, 38 KB gzip, 31 KB brotli, service-worker cached after the first visit.
- [x] Verify and deliver: Source 1c57a3beeb420001d6ba1611e027043df76f7d57. Direct six-shard suite 1752/1752 (core 290, runtime 1000, sim-contract 85, sim-realism 9, long 3, studio 365), exit 0. Stable staging 14/14 (artifact a878e519…), promotion https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/37054296649 success after run 37050905781 hit the gate job's 25-minute timeout on a slower runner, production and staging provenance 10/10, hosted performance verified, Doctor blockingFailing 0. Visual receipt 214 captures bound to 1c57a3b. Public launch remains HOLD.

### Next
- [x] Give the deploy gate job headroom: its four shards take ~23 of its 25 minutes, and a slower runner cancelled one promotion. Raise the timeout or split the gate into parallel jobs, and land the change with the next deployable candidate.
- [x] Persona-tilted CPU drafting and in-game 4th-down / two-minute calls behind a measured 10-season realism probe (needs founder go-ahead: changes simulation outcomes).
- [ ] Launch stays HOLD: delivered on-domain email, candidate-bound founder approval and lifecycle reconciliation (registry SPARKED vs local FORGE).
<!-- /s114-closeout:tasks -->

## Session 113 — Player language, League Pulse, scouting fog and the public site (2026-10-02)

- [x] Audit the public site, game shell and server/ops (three read-only sweeps); 18 ranked items in docs/AUDIT_2026-10-01_SESSION113.json.
- [x] Player-language pass across game and site, plus a marketing-vocabulary gate with a negative control.
- [x] Desk lead (calls beside the Advisor), progress rail, lazy Co-GM "bring your own AI" drawer, injuries once.
- [x] League Pulse, Advisor look-ahead, Boardroom operating statement, potential scouting fog, real-spot Sim-Watch.
- [x] GM archetypes from real inputs (every club had been "Loyalty"); Contracts active cap (always $0); distinct trade-builder defaults.
- [x] Public site: claims single source, five new pages, RSS, press kit, shared header/meta, landing rebuild.
- [x] Server hardening (413 stop, generic 500, path separator, clamps, proxy trust flags, headers); precache 3.21 MB → 2.84 MB.
- [x] Verify and deliver: Source 097a7caf6f63c019bc4bf18ed763a3dae68da4d3. Direct six-shard suite 1748/1748 (core 290, runtime 996, sim-contract 85, sim-realism 9, long 3, studio 365), exit 0. Stable staging 14/14 (artifact af49f89b…), production promotion https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36985778315 success (gate, build with full browser suite and evidence, deploy), production provenance 10/10, hosted performance verified, Doctor blockingFailing 0. Visual receipt: 214 captures bound to 097a7ca, changed surfaces inspected in both themes. Public launch remains HOLD.

### Next
- [x] Publish the S113 player-facing release note on status.html with the next deployable change (freshness gate tolerates one session; it lands with S114's candidate rather than forcing a docs-only promotion).
- [x] Split src/server.js routes after moving the API parity checker and the seven text-reading tests onto a route manifest.
- [x] Rival personas tilt CPU drafting (need-weighted today) behind a measured 10-season realism probe; in-game 4th-down / two-minute decisions in Sim-Watch.
- [x] News/milestone headlines stored with raw team ids (src) and four pure client modules still print ids; move display codes to creation time.
- [x] Split styles.css into critical + per-island sheets within boot-budget headroom. **Retired S114 on measurement: 31 KB brotli, cached after first visit.**
- [ ] Observe the first real opted-in cohort; launch stays HOLD for delivered email evidence, founder approval and lifecycle reconciliation.
<!-- /s113-closeout:tasks -->

## Session 112 — Fair trades, durable saves and observed outcomes (2026-09-30)

- [x] Recover S111 at a783194 with fresh 1,588/1,588 and zero blocking Doctor findings.
- [x] Price every pick in the complete trade package. 4/4 direct engine controls and 11/11 persona, trade-plan and CPU-market neighbors; repeated asset IDs refused without changing legal player-only trades or tolerance constants.
- [x] Acknowledge durable worker storage and retire failed workers. 23/23 focused worker, actual-runtime parity/fallback and observability checks. Includes independent-review regressions for held writer/concurrent read, request-owned failure attribution, initialization ordering and continuing after failure.
- [x] Publish saves only after IndexedDB commits. 55/55 adapter, codec and integrity controls; final adapter/worker integration 60/60. Transaction completion, bounded stalled/blocked operations, versioned payload publication, committed readback, and readable prior IDB records after write degradation verified. Independent concurrency and failed-delete reproducers now pass.
- [x] Deliver lazy-surface styles under the real production policy. Six module-injected style blocks moved into the themed stylesheet. Generated element-style policy remains self-only and is exercised by the immutable browser harness and actual staging/production. Selected-tip, inherited light-text and disabled-primary regressions were found by actual pixel review and fixed. Final222 reviewed images pass (126 fresh,96 exact-byte inherited), plus four freshly reviewed real held-I/O disabled Start/Create frames. Rejected before-images remain preserved.
- [x] Carry evaluated trade authority through both API routes. Real local and HTTP route scenario passed: stale evaluation returns409 without asset/log mutation; current plan succeeds and omitted fingerprint remains compatible.
- [x] Score only observed advisor actions from the matching checkpoint. 20/20 advisor, briefing and source-bound outcome checks, including no observed action, wrong decision occurrence, wrong franchise/checkpoint, replay and reload; unscored copy distinct from agreement/disagreement.
- [x] Keep the previous save when an overwrite fails. 55/55 adapter, codec and integrity controls; final adapter/worker integration 60/60. Per-slot serialization preserves newest acknowledged overwrite and prior readable save on payload, metadata or deletion failure. Busy/protected eviction and backup pruning tested. Irrecoverable rollback failures remain explicit.
- [x] Credit a winning player bid in the first-season contract. 18/18 new and existing first-season checks: pending/outbid/CPU/legacy/later-year/finalized exclusions and real winning player intent through restore/team switch.
- [x] Exercise both played-week and bye-week browser paths deterministically. 4/4 Playwright spec: seed20260306 BUF played-game and CHI bye, explicit schedule preconditions, actual onboarding, exactly one advance, bye modal absence, receipted ledger and reload coherence.
- [x] Adopt the available official Node 24 action majors. Founder approved the exact signed-release actions/cache6.1.0, configure-pages6.0.0 and upload-artifact7.0.1 SHAs after the generic URL package-trust BLOCK40. Five action references changed; Node24.14.0 and gates remain pinned. Exact final CI36796745264 completed successfully, including all five hosted unit shards and89 browser passes plus1 intentional skip.
- [x] Complete five second-order outcomes: advisor checkpoint/replay authority, readable saves after write degradation, real-policy artifact proof, automatic capture-ledger publication, and exact browser-session recovery across navigation.
- [x] Verify final source and technical publication. Source be71869a428e6224330d72cbba76df436ee31938, artifact fe99666e7525fe4f10ccac4059732ad80ddbdd7e91526f366f2a2ab8579ff5bc. Direct six-shard suite 1702/1702 (core 290/290, runtime 961/961, sim-contract 85/85, sim-realism 9/9, long 3/3, studio 354/354), exit 0; test-surface SHA256 59a4c91afef6efc6ac5264c6b06b1c8d3abb60c8acb30718dad966f1964d75ef; source binding: Clean tested paths at the recorded Git revision before launching the unchanged canonical runner. Completion must match both the original test-surface digest and the native all-shard receipt.. Doctor blockingFailing 0 with 1 warnings; exact-source CI https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36796745264 success; browser 89 passed, 1 declared skips. Stable staging 14/14; production 10/10 via https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36800546768. Visual review: 222 images accounted for (182 game, 40 public): 126 freshly inspected with view_image and 96 exact-SHA256 matches to individually reviewed prior images, with complete hash coverage. Backend be71869a428e6224330d72cbba76df436ee31938: Exact successful gate and both image builds; scoped gateway SSH deployed only community-stats. Same-host and external HTTPS health verify be71869 with database ready; existing PostgreSQL container and Caddy bytes preserved. Build-only workflow deployment was skipped; manual deployment succeeded in one attempt.

Public launch remains HOLD for actual project-domain receive/reply-as evidence, candidate-bound launch approval and authoritative lifecycle reconciliation. No real player cohort, retention result or field-performance claim follows from these engineering checks.
<!-- /s112-closeout:tasks -->

## Session 111 — Full arc: rival market, Team decisions, and exact-source technical promotion (2026-09-29)

- [x] Close the founder-reported Play outage on live Pages. The worker no longer intercepts document navigation or precaches HTML aliases; source `15a962b` passed exact-source CI, staging 14/14, live Pages 10/10, and promotion `36664256243`. An existing visitor upgraded from the old cache and clicked Play; direct `/game.html` and fresh Play also loaded without failed requests.
- [x] Audit the live product and release seams, reject five stale or unsupported premises, implement all six ranked items and the second-order derived public engine count.
- [x] Add a bounded deterministic CPU-to-CPU market through the existing trade authority, with matched seeded transaction controls and league news.
- [x] Join Roster and Depth under one Team destination, carry crests through League and Trades, and verify the changed states in dark/light desktop/mobile rendered pixels.
- [x] Replace freeform email assertions with typed inbound and reply-as evidence; negative controls reject forged or incomplete receipts. Actual delivery remains unverified.
- [x] Deploy through bounded pinned-host SSH; workflow `36652030133` passed gate, image builds and server deployment, and independent HTTPS API health reports source `9400912` with database ready.
- [x] The original feature source `9400912` passed CI, staging 14/14 and Pages provenance 10/10, but its live Play route failed under the installed worker. Final source `15a962b` supersedes that release at artifact `c09fc822…686c980c`; full browser CI and 158 reviewed hash-bound captures pass. Public launch remains HOLD.
- [x] Finish the direct six-shard closeout receipt and Doctor after ledger/status write-back. Final run passed 1,588/1,588 and Doctor has blockingFailing 0. The first run caught 158 omitted capture-ledger entries; the writer repaired them before the final receipt.

## Next

- [x] Make the first-week bye branch deterministic in the browser test so it always exercises the hidden tactic modal and receipt, rather than relying on a random bye. The production gate exposed the previous assertion's false assumption. **Completed S112: fixed played-week and bye fixtures verify one advance, modal visibility, receipt and reload.**
- [ ] Restore `/stats` to sitemap.xml the moment the community snapshot clears its suppression threshold. S94 withheld it so the first page indexed about this game is not a table of zeros; that is a temporary state with a defined exit condition, not a permanent decision.
- [x] Re-run `/code-review` against a session's own diff BEFORE the canonical receipt, not after. **Done S108: eight findings, all acted on before any shard ran.** S94 ran it late and it found ten real defects, which cost a full 45-minute shard re-run. The review is cheap relative to the receipt and should precede it.
- [x] Reconsider the mobile tab-target count on its own terms. S110 grouped the fourteen destinations behind six phone drawer sections while retaining direct desktop tab access; visual evidence is being re-baselined before release.
- [ ] Evaluate historical sparklines and shareable aggregate cards only after a real cohort proves they add value without weakening privacy.
- [ ] Offer aggregate-only Analytica ingestion through Studio Ark when that authority is ready; never export raw community receipts.
- [x] Upgrade `actions/cache`, `actions/configure-pages`, and `actions/upload-artifact` when their official Node 24-native major versions are available; current CI is green under GitHub's forced Node 24 runtime, so this is advisory rather than a release blocker. **Completed S112: three explicitly approved exact Node 24 release revisions update five workflow references; exact-source CI passed.**
- [x] [SIL:1] Reclassify the S110 Windows pre-push deadlock premise: ordinary recovery/source pushes completed without `--no-verify` (one was slow, later pushes took seconds). Preserve the existing hook and reopen only if a measured, reproducible hang occurs.
- [x] [SIL:1] Make backend runner SSH transport resilient to observed pre-auth resets. Reset-success and terminal controls pass, host-key checking stays strict, and the S111 deploy workflow plus external runtime probe succeeded.

## Session 110 — Recover S109 and finish the authorized release (2026-09-28)

- [x] Recover the uncommitted S109 implementation and verify that `main` still matches `origin/main`; preserve its work and the public launch HOLD.
- [x] Close the remaining player-facing S109 audit rungs: six-section mobile drawer and SVG icon sprite; make the First Season Contract trade objective player-controllable and show its season-end verdict.
- [x] Make the Worker entry discoverable by the browser-module reachability check rather than using a build-only allowlist; add a recorded audit-lane delta command.
- [x] Direct Node suite 1,573/1,573, full browser suite 69 pass with one intentional skip, final-candidate focused Desk browser tests 2/2, static smoke, boot/public truth, and public sanitizer green. The full Node receipt preceded the final visual-only corrections; candidate CI is the final-source gate.
- [x] Capture and inspect 261 responsive and 40 public rendered states; 146 hash-bound images in the S110 receipt pass CANON-053 across desktop/mobile and dark/light themes.
- [x] Commit/push deployable source `dbcd750`; deploy and verify its artifact on stable staging (14/14), hosted lab performance, and live Cloudflare Pages (10/10; promotion run `36613134108` success).
- [x] Backend run `36616242344` passed gate and image builds but failed its SSH transport over three attempts; recovered through Studio gateway SSH with workflow-equivalent compose pull/up, unchanged Caddy route, and exact-source same-host plus external HTTPS health. `reports/s110-backend-authority.json` records both truths.
- [x] Reconcile staging, live Pages, visual, performance, backend and launch-evidence receipts; public launch stays HOLD for email receive/reply-as, founder approval and lifecycle authority.

## Session 109 — Full arc: fifteen items, the Desk, the advisor, causal rivals, the worker, and the standings that were never there (2026-09-14)

- [x] **Front Office Advisor** — deterministic, packet-cited, scored at the weekly commit into a descriptive tally; lazy island on the Desk. L3 (user-keyed model voice) deliberately unshipped: zero project token spend is the contract.
- [x] **Rival personas are causal at the trade seam** — `evaluateTradeValue` with archetype tolerance, age horizon, need premium/surplus discount and rationale; CPU clubs only; stream invariance asserted.
- [x] **First Season Contract** — five objectives, three from actions and two from the dashboard at season close; collapses after week 6; fires one achievement.
- [x] **Moment cards** on trophies, epilogue, development report and first-round reveal, with the challenge code.
- [x] **Worker-hosted runtime** — module Worker with a storage mirror, in-page fallback with a diagnostic, byte-equal contract through both transports; long-task ceiling 1,000 ms is the gate, wall-clock 750 ms the bound.
- [x] **Token sweep and crests** — zero hex outside token blocks; `teamCrest.js` in the Desk spotlight. Icon sprite not shipped.
- [x] **Showcase League** on the stats page (committed JSON; the ten-season run took 26 minutes under load).
- [x] **Desk and League** — Overview split; tab ids unchanged; League hydrates news, analytics and sim jobs. Six-group drawer and Depth Chart merge not shipped.
- [x] **Public chrome** — one header, footer and theme toggle from the manifest on every page; two inert toggles repaired; About + FAQ; press kit; status archive; sitemap comment stripped; legacy-tier count gated; cover.png lossless 445 → 378 KB.
- [x] **Dev CORS fails closed**; parity gate reads `devCors.js`.
- [x] **Audit-lane cache** L1 — `docs/audit-lanes/` with the SHA described and the delta command for S110.
- [x] **Live standings** — `latestStandings` read the season-end archive, so year one showed "No rows" and later years last season's table; one shared `teamSeasonRow` now serves both.
- [x] **Icon sprite and six-group phone drawer** shipped in S110; S111 added one Team destination with Roster/Depth submodes.
- [x] **CPU–CPU trade market** shipped in S111 with a matched seeded three-season transaction control.
- [ ] **Alias mounts** (eight copies, 33.7 MB) wait on the Studio host contract before any alias becomes a 301.
- [ ] Never write a count premise as `[\s\S]*?){n}`; the checker hung twenty minutes when the fix made n unreachable. Use a non-overlapping separator.

## Session 108 — Full arc: the question answered first, the roll's remedy revived, and the offseason's verdict shown (2026-09-14)

- [x] **State elite density's declared-population question before any code, and answer it.** The ceiling stays position-blind because the anchor's total (26 of 1,696) is; composition is published on the receipt, never gated. Seats by room declared in the baseline (24 allocable of 26, two returner/special-teamer seats named unallocable); `activeRosterRooms` on the summary; `buildEliteCompositionReading` on the receipt. Canonical seed: OL 80.6% of the cohort against 20.8% of seats (ratio 3.87), QB 16.7% vs 4.2% (3.98); seed 2026: QB 6.74, OL 3.03; every other room 0–0.26. Room means QB 84.1–84.6 and OL 83.1–83.3 against 76.5–78.2 elsewhere: a position-blind 90 is +1.5–1.7 sd in two rooms and +3.0–4.0 sd in five. No per-room arm, no ceiling moved; a test proves `status` is identical for a proportional and a concentrated cohort.
- [x] **Ledger retention by session number — and the roll's remedy had been inert since S105.** Every closeout appended beneath the pointer and the splitter sliced at the sentinel: four ledgers "fewer than the window" while holding twelve, and an applied roll would have dropped S106/S107. Fixed at source (pointer found anywhere, re-appended at EOF, by-session retention in declared order, duplicate-session reason distinct, positional rule kept as negative control). Rolled live: 296 KB → 270 KB. The S106 evidence ("SIL three short") was a phantom; TRUTH_AUDIT was the instance.
- [x] **The offseason development ledger reaches the GM.** Engine returns every progressed player's move (retirees flagged); club report on the pipeline and the league; stage message, long-form feed, beat-reporter log (inbox IMPORTANT); History-tab card from a lazily imported module. No RNG draw added. Node 7/7, Playwright 2/2.
- [x] **The draft surface stops printing the truth the scouting board sells.** Overall, potential and ratings stripped from available prospects on every response (GET and the three POSTs, both API layers); fogged potential ±6 from a keyed generator; combine rows and reveal/reward beats read the scouted number. Engine copy untouched.
- [x] **The profile outlook reads headroom and trait; the runway is in growth seasons.** At-ceiling players cannot read past "steady". `GROWTH_WINDOW_MAX_AGE` exported from the curve's module (the generator's `closedHeadroomAge` is not the development boundary). Roster table shows the dev trait.
- [x] **Review before receipt** — eight findings, all acted on before a shard ran. The S94 Next item is struck.
- [ ] **The rating scale is the next honest question, not the gate.** Rooms sit seven overall points apart, so "90" is not the same claim in every room. Any change is a generator/scale change with the full distribution receipt as its control; do not add a per-room elite arm and do not move the 1.53% ceiling.
- [ ] Elite density `watch` at 2.1% / 2.7% (canonical / 2026) against 1.53%; dispersion `watch` at 0.093 / 0.108 against 0.08. Do not widen `stdDevDrift*`.
- [ ] The history island sits at 15.2% headroom against a 15% floor; the next History-tab change goes behind a dynamic import, never a raised `maxBytes`.
- [ ] Run `node scripts/ledger-roll.mjs --apply` at every closeout after appending; the live gate tolerates one session of debt, not two.

## Session 107 — Full arc: the gate measured who survived, and potential lands on the scale overall uses (2026-09-13)

- [x] **Re-derive S106's refused gate instead of inheriting its diagnosis.** `session90-development-environment` read the players who SURVIVED the offseason, and retirement is rolled on the overall that offseason just produced — selection on the outcome. Unchanged S106 tree, four seeds: survivor reading **+0.149 to +0.238** above the curve, full progressed population **±0.022**. The gate now measures every progressed player at the engine's measured centre, isolates the environment with a matched seeded offseason, and is **tightened 0.25 → 0.10**. Negative controls: the pre-S90 environment (+0.82 to +0.90) and the survivor reading itself.
- [x] **Land position-relative potential.** Trait-sized headroom above the player's own overall, closed by 31, tapered over the 55 points below 99, same RNG slot, finite inputs asserted. Above own potential **36.0-37.6% → 0.0%**, overalls unchanged to the decimal on four seeds. Focused test with a position-blind negative control; POT and the profile's development runway reflect it; release note written.
- [x] **Measure the calibration as a cost before believing it.** Taper 25 read dispersion 0.112 against the old draw's 0.095 and was rejected. Sweep 25/40/55 read dispersion 0.112/0.101/0.093 (monotone) and elite 2.4/3.0/2.1% (not), so the width was chosen on dispersion and confirmed against a restored old draw on seed 2026 (3.4%/0.125 → 2.7%/0.108). Canonical seed: **elite 2.1%, dispersion 0.093, parity -0.001**, all better than the old draw; no threshold moved.
- [x] Correct the S106 record: DECISIONS S107 Decision 1 supersedes the causal claim (S106 entry untouched), the source comment describes the landed code, and TRUTH_AUDIT names the contradiction.
- [x] **Home-field advantage asserts a population claim over a population.** One league at 220 games cannot resolve a 1.2-point boost (edge 0.705 vs neutral 0.714 there; +0.028 at 2,000 games; 7 of 8 leagues positive at 220). Pooled across three leagues; the per-league "stays small" bound is kept.
- [ ] Never export `TEST_SHARD_TIMEOUT_MS` for a canonical run: `test-shard-progress` asserts the default and the child tests inherit the environment. If a shard needs a longer bound under load, remove the load.
- [x] **Stop re-pinning the rival-offer negative control to one seed.** Third move (S103, S104, S107), each from a legitimate change to how leagues develop. Re-scanned 620101-620120; the control now walks 620111 / 620108 / 620114 / 620115 and requires one to surface an offer past the deadline.
- [~] **Elite density's position-blind cut — measured, still a question.** End-of-window QB+OL share of the 90+ cohort: canonical **97%** (35/36); seed 2026 old draw 72% (41/57) → span 55 **91%** (42/46). Position-relative potential made the cohort smaller and more concentrated. State the declared-population question in DECISIONS before any per-position arm; never as a route to a green gate.
- [ ] Elite density `watch` at 2.1% against the sourced 1.53% ceiling; dispersion `watch` at 0.093 against 0.08. Do not widen `stdDevDrift*` or move the elite ceiling.
- [x] Ledger retention by session number (carried from S106) — its own session. **S108.**

<!-- ledger-roll:pointer -->
---

Older entries are retained verbatim in `context/archive/TASK_BOARD.archive.md`. Nothing is summarised or removed on the way; the live file holds the working set only (newest 10 entries), so a reader does not pay for the whole project's history to learn what is true this week.
