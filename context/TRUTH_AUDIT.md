<!-- truth-audit-version: 1.1 -->
# Truth Audit

Overall status: green
Last reviewed: 2026-09-29
Public-safe summary only. Sensitive verification notes are maintained privately.

## 2026-09-12 — S106 — A number the whole system compares against, measured on the wrong scale

**What shipped and what did not.** The generator change described below was implemented, measured twice, and **reverted**; `src/` carries only a comment recording it, verified by diff as zero behaviour change. What shipped are three gate and record fixes: the ledger-budget gate's population, the brief's post-heal session authority, and the removal of a doctor remedy prescribing a contractually forbidden file. Every number below is a real measurement of code that was run, not of code that is live — that distinction is the point of recording it here.

**Potential was never comparable to overall, and every reader of their difference inherited that.** The draw was position-blind while overall is position-weighted; measured at generation across four seeds and 8,832 players, 36.8% of the league started above its own potential and all 45 elite players in a fresh league sat in two rooms. Development, reversion, scouting and elite density all read that difference. The scale is corrected; what is claimed is a generation-time measurement across four seeds and a ten-season run on the canonical seed, not a sweep.

**The first version of the fix was worse, and that is recorded rather than absorbed.** Position-aware potential alone read elite 5.3% and dispersion 0.157 — both out-of-range — because the defect had been supplying a downward counterweight. The shipped version damps headroom near the ceiling and reads elite **1.8%**, dispersion **0.083**, parity **+0.034**, each better than the session inherited. Both figures that remain outside their on-target bands are reported as `watch`; no threshold was widened, and the uncalibrated reading is published here rather than omitted.

**What is deliberately not claimed.** Elite density is not closed: 1.8% against a sourced 1.53% All-Pro ceiling is still `watch`, and the residual is the position-blind 90+ cut compared against a per-position honor — a declared-population question, not a tuning target. Dispersion is `watch` at 0.083 against 0.08. The ten-season figures are one seed; the generation figures are four seeds and no simulation. `launchReady` remains false on unchanged evidence.

## 2026-09-13 — S107 — A recorded cause contradicted by the measurement it rested on

**Contradiction found and resolved.** The S106 record — DECISIONS Decision 0, the S106 handoff, TASK_BOARD, CURRENT_STATE and a 37-line comment in `src/domain/playerFactory.js` — stated that the S90 gate's residual was structural rating-level redistribution. S107 measured it on the unchanged tree and it is survivor selection: the gate read only players who survived an offseason whose retirement roll depends on the overall that offseason produced. The survivor reading was +0.149 to +0.238 above the declared curve across four seeds; the full progressed population was within ±0.022. The S106 ledger entries are append-only and stay as written; DECISIONS S107 Decision 1 supersedes the causal claim, and the source comment is replaced because code comments describe the code, not history.

**Gate truth.** A gate that had consumed 94% of its tolerance on selection bias was reporting green on the canonical seed while being unable to accept a correct change. It now reads the population the mechanism was applied to and isolates the environment with a matched seeded offseason. Tolerance moved from 0.25 to 0.10, which is tighter. Its negative controls reproduce the pre-S90 subsidy at +0.82 to +0.90, and they catch the survivor measurement itself.

**What is claimed and what is not.** The gate readings are four seeds of one offseason. The generation table is four seeds with no simulation. Ten-season distribution readings for the landed generator are recorded in the S107 handoff with their seed counts, and no ten-season figure is carried over from S106's differently-tuned implementation as if it were this one's. `launchReady` remains false on unchanged evidence.

## 2026-09-14 — S108 — A remedy that could not fire, a surface that shipped the answer key, and a finding published where the gate cannot reach it

**Contradiction found and resolved.** S106 and S107 both recorded that ledger retention was positional and that the live SIL was "three entries short of what it advertises". The instance does not reproduce: on the SIL's live shape the positional suffix and the by-session rule move the same two entries. TRUTH_AUDIT was the real instance (S83, S82, S80 above S99–S107), and beneath both sat the defect nobody had named — every closeout since S105 appended beneath the roll pointer, and the splitter sliced the file at the sentinel, so `check-ledger-budget`'s own remedy reported "fewer entries than the retention window" on ledgers holding twelve and, applied, would have dropped the two newest entries from each. The S106/S107 entries stand as written; this entry and the audit's `phantomsRejected` carry the correction.

**A surface contradicting its own economy.** The draft room charged scouting points for a fogged read while the adjacent table, the combine table, and every draft POST response shipped the truth. That is a truth defect in the product's own terms: the number the player pays to approach was printed beside the price. Closed on every path found (the review found three the first fix missed), with the engine's copy verified untouched.

**A gate that must not learn to see.** Elite composition is now measured (QB and OL hold 97% of the canonical cohort against 25% of the seats; ratios 3.9–6.7) and published on the receipt with `gated: false`. A test proves the gated verdict is identical for a cohort seated in the anchor's proportions and one concentrated in two rooms. The elite ceiling remains `watch` at 2.1% (canonical) / 2.7% (seed 2026) against 1.53%; dispersion remains `watch` at 0.093 / 0.108 against 0.08. No threshold moved.

**What is claimed and what is not.** Composition readings are ten seasons on two seeds, active roster only, the same runs S107 used and reproduced to the decimal before anything changed. The development ledger's fidelity is proven player-by-player against the league on one seed and by an identical-fingerprint pair on another; the browser card is proven by one Playwright spec that drives the runtime to the retirements stage. The runway in growth seasons is a projection of the declared curve's boundary, not a measured outcome for any player. No real-cohort evidence exists and none was manufactured. Public launch remains HOLD on the same three unmet gates.

## 2026-09-14 — S109 — Three premises the auditor got wrong, two gates that caught agent output, and a panel that had been empty for every first season

**The audit contradicted itself three times and the contradictions were kept.** "Internal narrative ships in built pages" was false for HTML (stripped at build since before this session) and true for the sitemap; "the stat bar is hand-typed and will drift" was false in its risk (gated since S94) and true for the tier count; "the atlas is Private for now in every cell" was false (pre-cohort renders an invitation). Each is recorded in the sidecar as `skipped-premise-corrected` or `shipped-corrected`, with the narrowed thing that actually shipped.

**Agent output was treated as untrusted and the gates were right.** Four silent catch sinks and one unreachable worker entry were caught by `check-browser-promise-observability` and `check-browser-module-reachability`; the parity gate's regex went red when the CORS literal changed shape and the gate's population was widened rather than the literal duplicated. No gate was loosened; one allowlist entry was added with its reason.

**A surface contradicting its own data.** The Standings table read "No rows" for a franchise's entire first season and showed the previous year's table during later ones, because the dashboard read the season-end archive. A player would have read it as "no games yet" in week one and as current standings in year two. Fixed at source; the release note says so.

**What is claimed and what is not.** The worker's 152 ms activation and 201 ms largest stall are one run on one machine against an in-page control of 449 ms and 8,100 ms; the wall-clock bound was raised from 300 to 750 ms because it crossed 387 ms on an identical tree, and the long-task ceiling carries the gate. The Showcase League is one seed, ten seasons, labelled simulation. The advisor's counterfactual tally is descriptive. The persona change adds no RNG draw and changes no controlled-club decision; CPU–CPU trades do not exist to be affected. The receipt is 1,568/1,568 on the final tree after two earlier runs (one killed by a tool timeout, one red on shared-process order); Playwright 65 passed with the opt-in control skipped.

## 2026-09-28 — S110 — A green closeout was not a deployed artifact

**Cutoff truth.** The S109 closeout brief reported zero changed files and its handoff spoke of a deployment receipt to follow. In fact, S109's code, audit and closeout artifacts were uncommitted; `main` still matched the S108 remote revision when S110 opened. The zero came from measuring a commit against itself. S110 has corrected the brief and will bind release claims to a clean commit, stable staging, and observed live origins.

**Product promise corrected.** An objective that depended on a random inbound offer was described as player-achievable. It now accepts the player's own successful trade evaluation and closes at the season review with an owner verdict. The public release note's September 14 label described a local build, so it is dated to the actual September 28 release candidate.

**Gate coverage corrected.** S109 recorded a Worker reachability exception. The checker now follows the Worker URL edge and the exception is removed. The browser gate will inspect the shipped Worker module as a member of the graph.

**Recovery verification, 2026-09-29.** The direct canonical suite passed 1,573/1,573 across six shards, and the full browser suite passed 69 with one declared opt-in negative control skipped. The source-bound Node receipt predates final CSS, public copy, capture-script, and browser-spec corrections; it is evidence for the recovered implementation, not a claim that the final `dbcd750` tree was rerun through all six shards. Its focused Desk browser spec passed 2/2, the CSS token test passed 5/5, static smoke passed alone after one timeout under concurrent browser load, public-truth passed, and studio doctor reported `blockingFailing 0` with the standing registry warning. Candidate CI is the final-source gate.

**Rendered pixels corrected the record.** The original S110 evidence script could not reach tabs inside the collapsed six-section drawer. The fixed path exercised visible group toggles; rendered review then found default-blue public links, an About roadmap calling shipped features future work, and a CSS rule exposing an empty commitment panel despite its `hidden` attribute. All four were corrected before the final capture. The latest receipt binds 146 reviewed images in dark/light and desktop/mobile to `dbcd750`; the complete responsive report passed 261/261 captures, and public capture passed 40/40. The non-vacuous visual-QA checker passed without `--changed`.

**Release boundary.** Stable staging returned 14/14 same-origin provenance checks for source `dbcd750b1c8e8d477928f28ca8afa869bb80d253` and artifact `6585b783020cbca6b639f8222fd26825139db2e3c665e7ff576ae237534cd51a`. Hosted lab entry-route performance was verified (desktop LCP 696 ms, mobile 784 ms; desktop/mobile CLS 0/0.0085). These are lab and staging measurements; they are not real-cohort metrics or evidence of production promotion. Public launch remains HOLD.

**S110 release truth, 2026-09-29.** The source and artifact are now observed on stable staging (14/14) and live Pages (10/10), with the reviewed 146-image visual receipt and hosted lab performance bound to the same `dbcd750` source and `6585b783…534cd51a` artifact. Launch evidence reaches all nine public routes and verifies origin security headers but reports `launchReady:false`: project-domain receive/reply-as email, founder approval and authoritative lifecycle remain unverified. The backend workflow's test gate and images passed, but three runner attempts failed at SSH transport. Gateway SSH subsequently deployed the exact source, and same-host plus external HTTPS health reported it ready. The backend deployment claim comes from that independent observation; the workflow conclusion remains failure. Studio closeout rerun passed 340/340 after the S110 SIL header was rendered. The direct six-shard 1,573/1,573 receipt predates final visual-only edits; exact-candidate CI supplies final-source test coverage.

## 2026-09-30 — S111 hotfix truth — provenance was green while Play was broken

The `9400912` static artifact was exactly what staging and production reported, and the backend health was exact, yet the public Play click failed under an active service worker. This was a missing behavior witness, not a false artifact digest: local browser tests served `.html` directly while Cloudflare Pages canonicalized `/game.html` to `/game` with a 308. The old worker returned a cached redirected HTML response to a navigation that rejected it. A fresh browser with and without the worker supplied the negative control. The `68856a7` fix passed stable-staging Play with an active worker. The first hotfix promotion stopped on an inherited bye-week assertion that incorrectly counted four hidden modal buttons; `15a962b` corrected the assertion. Final exact-source CI, stable staging 14/14, Pages promotion `36664256243`, live origin 10/10, direct `/game.html`, fresh Play, and an old-worker upgrade all passed without failed requests. The 158-image reviewed visual receipt binds final source `15a962b` to artifact `c09fc822…686c980c`; prior `9400912` capture hashes remain in the append-only ledger as superseded entries. Public launch remains HOLD for actual email roundtrip, founder approval, and authoritative lifecycle evidence.

## 2026-09-29 — S111 — Technical truth and the capture history

**The public engine count now has a writer.** Adding the CPU market made the hand-maintained landing count stale. `build-pages.mjs` derives 44 source modules and the public-truth gate rejects a missing or contradictory marker, so the published claim follows the build rather than a release note author.

**Mail evidence must represent the actual roundtrip.** A previous nonempty `--email-evidence` string could mark email verified without anyone receiving a message or observing the reply identity. The typed validator requires both inbound and recipient-observed reply-as evidence for the project-domain alias, with negative controls for incomplete and forged claims. No such real receipt exists yet. The live route/header probe is green, while email, founder approval and authoritative lifecycle remain independent launch holds.

**Source, artifact and backend identity are separate observations.** Exact deployable source `9400912dc95898c458620efb7ed499347bdb3d11` passed CI. Stable staging 14/14 and live Pages 10/10 agree on artifact digest `228907d77371312ad326b08ba24f00cd67c4d0e7adc4939fc08d0213d1a41ad7`; backend workflow success is separately backed by external HTTPS health reporting source `9400912` and database ready. The later closeout commit is receipt-only and is not a new deployed source. Hosted lab performance is not field-cohort evidence.

**A screenshot hash list is not the historical capture ledger.** The first final-source direct suite passed five shards but Studio failed 1 of 351 because all 158 new PNGs were absent from `docs/visual-qa/CAPTURE_LEDGER.json`. The ledger writer appended their hashes, and the focused regression passed. The first full run is recorded as failed, not re-described as green; a fresh six-shard receipt is required after write-back.

**An inherited pre-push diagnosis did not survive ordinary pushes.** S110's “deadlocked hook” wording was a hypothesis drawn from a slow push. Recovery and S111 normal pushes finished with hooks enabled; this session did not bypass them or replace the hook without a reproducer. The S110 bypass remains historical fact.

---

Older entries are retained verbatim in `context/archive/TRUTH_AUDIT.archive.md`. Nothing is summarised or removed on the way; the live file holds the working set only (newest 10 entries), so a reader does not pay for the whole project's history to learn what is true this week.



## 2026-09-30 — S111 recovery verification — completed baseline

Fresh recovery verifies the S111 final green claim: 1,588/1,588 across every canonical shard, direct exit 0, Doctor blockingFailing 0. The older pending-verification prose is superseded; the first red run is not rewritten. The CPU-market tests prove a matched-seed single-week enabled/disabled control plus a three-year volume bound; they do **not** prove a matched three-year disabled-market parity comparison. That broader reading of the earlier handoff is unsupported. No source corruption, unfinished source diff, or missing closeout surface was found.

<!-- s112-closeout:truth -->
## 2026-09-30 — Session 112 — Fair trades, durable saves and observed outcomes

Recovery boundary a783194 verified S111 separately: fresh 1,588/1,588 tests, Doctor blockingFailing 0, valid closeout receipts, and no unfinished source diff. It does not recount S111 implementation as S112 work. The CPU-market evidence remains a matched-seed single-week control plus a three-year volume bound, not a matched three-year disabled-market comparison.

Independent review reproduced three defects in the initial persistence draft: an older failed overwrite could erase a newer acknowledged save; rejected metadata deletion could leave a listed but unreadable save; a concurrent read could consume a writer’s failure. Per-slot adapter queues, recoverable deletion and request-owned worker barriers corrected all three. The original reproducer and 60/60 adapter/worker integration checks passed.

The initial full UI run remains 69 passed, 1 failed and 1 intentional skip: its advisor-copy assertion expected the former two-state wording. The deterministic assertion was corrected without relabeling that red run. The first immutable visual candidate passed automated capture gates but actual pixel review found light-theme contrast defects; those defects were corrected and the final artifact was recaptured and reviewed. Superseded source 88a5e006bf0582c8dcba4ddfd84e9516f688de6d retains separate outcomes: general CI run 36747125169 succeeded with 70 browser passes and 1 skip, while Pages run 36747125173 failed with 69 passes, 1 failure and 1 skip. The unchanged reward-beats test reproduced locally at 2 passes and 1 failure across 3 repeats. Its failed image showed the Weekly Plan Composer awaiting a required choice; all three non-waiting visibility probes ran before the GM-decision response, and no advance request was submitted. Its Node run stopped after four passing shards totaling 1,293 tests; the long shard was cancelled with exit -1, so this was not a complete green suite. That candidate was not promoted to production. These earlier results remain superseded evidence, not final-source acceptance. See reports/s112-superseded-88a5e006.json. The replacement bcf5384 passed general CI after a clean failed-job rerun, but real stable-staging browser interaction proved that both new-franchise creation and explicit save loading lost the selected franchise across page navigation. Its local suite was interrupted after core 290 and runtime 909 passed (1199 total); sim-contract had not completed. No full green suite or production promotion was claimed for that candidate. The first 13 recovery browser checks failed because the test observer copied full imported snapshots into sessionStorage and its identity reader used a nonexistent field; those harness defects were corrected without treating that run as product acceptance. See reports/staging-browser-s112.json. Product source 23139baf778792dcea44118138de3ee07eed5a5a was pushed normally with hooks intact and verified on stable staging at 14/14. Its local canonical run was stopped during core with zero completed shards before correcting tested browser-gate scripts. General CI run 36787373005 passed all five hosted unit shards but failed static smoke before the full browser suite, and Pages run 36787373023 failed the same smoke: assertions expected bare game.html after successful navigation to game.html?resume=tab. Its responsive harness had the same stale expectation. Backend build 36787373038 succeeded, but no backend or production publication was accepted for that candidate. The normal push was delayed but completed; no deadlock or hook bypass is claimed. Three script sites and four client-runtime assertions across three files were corrected without changing public/src product code, server-runtime expectations or timeouts. Focused client checks passed 6 with 1 existing intentional skip, and static smoke passed. The clean replacement commit 6608db347debe8d72b44f2dbeec7e8ca39308981 builds the same artifact 5c60a5bd34d4f140464ba4a204850ca0df8b5387691bdc006b66d16c0f7a60e3. Its independent final acceptance must come from final receipts, not these predecessor results. See reports/s112-superseded-23139ba.json. Source 6608db347debe8d72b44f2dbeec7e8ca39308981 completed general CI run 36793635097 successfully, including browser job 110151960971 with 89 passes and 1 intentional skip out of 90 tests (10.4 minutes, no downloadable artifacts). It reached stable staging with 14/14 identity checks and actual desktop/mobile continuity. Subsequent actual pixel review found that the light-theme primary-button foreground override also affected disabled controls, rendering white labels on pale backgrounds. Its local canonical run was stopped after core 290/290; runtime was unfinished, so it was not a complete green suite. The candidate was not promoted to production or backend. The two light-theme selectors were subsequently narrowed to enabled controls in be71869. Existing actual per-PNG inspections may carry forward only when the new capture has the exact same hash; whole-candidate visual acceptance cannot carry forward. See reports/s112-superseded-6608db3.json and reports/browser-ci-s112-6608db3.json.

Source be71869a428e6224330d72cbba76df436ee31938, artifact fe99666e7525fe4f10ccac4059732ad80ddbdd7e91526f366f2a2ab8579ff5bc. Direct six-shard suite 1702/1702 (core 290/290, runtime 961/961, sim-contract 85/85, sim-realism 9/9, long 3/3, studio 354/354), exit 0; test-surface SHA256 59a4c91afef6efc6ac5264c6b06b1c8d3abb60c8acb30718dad966f1964d75ef; source binding: Clean tested paths at the recorded Git revision before launching the unchanged canonical runner. Completion must match both the original test-surface digest and the native all-shard receipt.. Doctor blockingFailing 0 with 1 warnings; exact-source CI https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36796745264 success; browser 89 passed, 1 declared skips. Stable staging 14/14; production 10/10 via https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36800546768. Visual review: 222 images accounted for (182 game, 40 public): 126 freshly inspected with view_image and 96 exact-SHA256 matches to individually reviewed prior images, with complete hash coverage. Backend be71869a428e6224330d72cbba76df436ee31938: Exact successful gate and both image builds; scoped gateway SSH deployed only community-stats. Same-host and external HTTPS health verify be71869 with database ready; existing PostgreSQL container and Caddy bytes preserved. Build-only workflow deployment was skipped; manual deployment succeeded in one attempt.

Test identity: Clean tested paths at the recorded Git revision before launching the unchanged canonical runner. Completion must match both the original test-surface digest and the native all-shard receipt. Test-surface SHA256 59a4c91afef6efc6ac5264c6b06b1c8d3abb60c8acb30718dad966f1964d75ef.

The founder explicitly approved actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6.1.0), actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d (v6.0.0), and actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a (v7.0.1) after the generic URL trust gate returned BLOCK40. Five workflow references use those exact official releases. This narrow authorization does not change the generic verdict or approve other revisions.

Public launch remains HOLD for actual project-domain receive/reply-as evidence, candidate-bound launch approval and authoritative lifecycle reconciliation. No real player cohort, retention result or field-performance claim follows from these engineering checks.
<!-- /s112-closeout:truth -->

<!-- s112-delivery-followthrough -->
### Delivery follow-through — 2026-10-01

Closeout commit0f0d3a1 failed CI36893062846: two assertions found the missing public release note and one found an unparseable handoff header. Correctionf8b640b restores the parseable Session112 heading and publishes the player-facing note. The failed run and original be71869 receipts remain separate historical evidence. Edge email-protection changes whole HTML response bytes; both encoded addresses are verified and the release note itself matches the artifact exactly.

Correction source f8b640b3774390f0dc74692b7bc7f71e7563f1e9, artifact dc8f15e50f56f251a0d26b3075fdec6248c0dc4555d27a0796b440ad6f18191a: fresh six-shard suite 1702/1702, CI https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36896631492 success (89 browser passes, 1 intentional skip), 222 reviewed images (147 fresh, 75 exact-byte inherited), staging 14/14, production 10/10 via https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36903401555; Doctor 0 blocking and 1 warning. The October1 release note is verified on both origins. Public launch remains HOLD.

Portable authority: reports/session112-followthrough-acceptance.json. Backend and detailed checkpoint/continuity measurements remain explicitly bound to be71869; no new backend deployment, cohort, isolated restore timing or field-performance claim is made.
<!-- /s112-delivery-followthrough -->


<!-- s112-startup-docs-reconciliation -->
### Startup documentation reconciliation — 2026-10-01

While closeout CI was running, Studio Template Bot advanced main to 08a3d08 with three documentation files. Closeout 31087ed subsequently passed all six CI jobs. A clean pull --rebase fast-forwarded the checkout. Doctor then reported one blocker because prompts/start.md was absent from its nondeployable-file list. The exact-file classification now matches Pages, Docker and SSH deployment inputs; no prompts-directory exemption was added. Focused release-authority checks passed 10/10, including mixed application/build/backend changes that still block; direct Doctor returned 0 blockers and 1 standing lifecycle warning. Independent deployment-scope review passed. Evidence: reports/s112-startup-docs-classification.json. The full 1702/1702 suite remains bound to product source f8b640b; the focused checker test is separate. Product deployment and SIL 804 remain unchanged.
<!-- /s112-startup-docs-reconciliation -->

<!-- s113-closeout:truth -->
## 2026-10-02 — S113 — Three surfaces were showing something other than the truth

**Sim-Watch's ball marker was decoration.** It moved by a formula on the play index while every play carried its recorded field position; it now reads the spot, and an unknown spot falls back to midfield rather than being invented.

**Every club was "Loyalty".** Both transports classified GM archetypes from fields a team never has; one shared classifier now reads strategy, roster age, rating and cap use, with a negative control on a generated league.

**"Active cap" was always $0.** The panel read a field the cap summary never returns.

**A gate fix was checked for intent, not wording.** The lifecycle gate's pre-launch check accepts "early access" and still refuses any launch claim. The first canonical run, 25 browser failures, a code review (four real defects, including a restored-session potential leak proven by negative control) and a failed promotion are recorded as found, not erased. Source 097a7caf6f63c019bc4bf18ed763a3dae68da4d3. Direct six-shard suite 1748/1748 (core 290, runtime 996, sim-contract 85, sim-realism 9, long 3, studio 365), exit 0. Stable staging 14/14 (artifact af49f89b…), production promotion https://github.com/VaultSparkStudios/vaultspark-football-gm/actions/runs/36985778315 success (gate, build with full browser suite and evidence, deploy), production provenance 10/10, hosted performance verified, Doctor blockingFailing 0. Visual receipt: 214 captures bound to 097a7ca, changed surfaces inspected in both themes. Public launch remains HOLD.
<!-- /s113-closeout:truth -->

<!-- s115-closeout:truth -->
## 2026-10-03 — S115 — A persona effect that measured as nothing, and two closeouts that skipped this ledger

**The first draft tilt was a no-op.** Keyed to strategy profile, it acted on a population that is almost entirely "balanced". A matched 10-season probe against a clean worktree showed no movement. It was re-keyed to GM archetype and re-measured: Win-Now draftee headroom fell from 2.38–2.49 to 1.69–1.73, and league overall mean, sd and p90 and the spread of champions held.

**Situational-call neutrality is asserted, not assumed.** Default adjustments are exactly zero, enforced by a negative control. A one-time comparison against the HEAD engine showed byte-identical results over 36 seeded games.

**S114 and S115 initially skipped TRUTH_AUDIT.** A ledger-retention test that was hard-pinned to S105 surfaced it when S105 aged out of the window. That test now asserts the newest session's own entry in every live ledger, and this entry closes the gap for both sessions.

**A full run was reaped by host memory pressure, not by a failure.** Five shards passed in that run; the studio shard was completed at the same commit afterwards.
<!-- /s115-closeout:truth -->

<!-- s116-closeout:truth -->
## 2026-10-04 — S116 — A gate that could not see a small change, and a formula that is not the one it claims

**The first negative control proved nothing.** Moving a draft weight from −0.35 to −0.36 left the golden master identical, because no pick changed. A −6 weight flipped 94 sections. The gate is real; the first control was too gentle to show it.

**Passer rating is not the published formula.** The schema extraction pinned it as it is: clamping before scaling caps the yards term, so the example line rates 89.3, not 99.3. It is recorded as a deliberate fix, not silently changed inside a refactor.

**Pluggability is proven, not asserted.** A toy round-robin sport runs a season through the core functions, and statBook.js builds a toy schema's tables. League generation, awards and the superBowl key remain football-specific and are listed as such.
<!-- /s116-closeout:truth -->

<!-- ledger-roll:pointer -->
---

Older entries are retained verbatim in `context/archive/TRUTH_AUDIT.archive.md`. Nothing is summarised or removed on the way; the live file holds the working set only (newest 10 entries), so a reader does not pay for the whole project's history to learn what is true this week.
