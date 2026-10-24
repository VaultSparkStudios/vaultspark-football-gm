<!-- truth-audit-version: 1.1 -->
# Truth Audit

Overall status: selected S121 production verified; broader historical truth remains partial
Last reviewed: 2026-10-24
Public-safe summary only. Sensitive verification notes are maintained privately.



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

<!-- s116-addendum:truth -->
### 2026-10-05 — S116 addendum — inbound proved, reply-as not

Inbound football@ delivery is proved: a test was sent from an external Gmail address, delivered with no bounce, and replied to from the founder's Zoho mailbox. The reply came from founder@, so "reply as the project address" is **not** proved, and no email round-trip receipt has been written. The launch evidence report correctly still reads "email: unverified". The registry is still S0/sparked until the founder applies FB.
<!-- /s116-addendum:truth -->

## S117 — 2026-10-08 — Explicit partial closeout

Founder requested “finish up and /closeout and deploy.” Demographic research and the implementation plan now cover probabilistic birthplace/background, diaspora and mixed heritage; correlated skin, hair and eye appearance; varied grooming; and body proportions tied to saved measurements. Race/background never determines gameplay ability. Population datasets retain their country-specific instruments and limitations.

Accepted portrait changes are scoped foundations, including the face sculpt and modern eyes; they do not establish whole-person naturalism. The unadopted trunk experiment is preserved in agent scratch storage, outside production and portable tests.

Verification: full core attempt 712/713; the historical modern grooming comparison was corrected to its immutable pre-sculpt authority and its focused rerun passed 3/3. No full-core green rerun is claimed. Runtime timed out at 45 minutes and independently reproduces a 16.2 MB six-week raw snapshot against the unchanged 16 MB bar. Visual QA retains one blocking craft defect. Fresh final 30-season GM verification and remaining NFL benefits/policy scope are pending.

Deploy: deferred because applicable checks are nonpassing. Cloudflare credential discovery is READY; this is agent verification work, not a missing-credential or founder-approval dependency. No release gate override, production promotion, public launch, or completed-goal claim. Evidence: docs/visual-qa/PLAYER_PARTIAL_CLOSEOUT_2026-10-08.json.

## 2026-10-22 — S118 — Candidate evidence remains distinct from delivery

Focused character, family and save checks pass; full engine/browser and exact deployment acceptance remain pending. Characters remain stylized, and modeled body volume does not prove complete physical tissue mass or population calibration. Emulated mobile captures do not prove physical-device frame rates. Historical golden and visual records remain historical. New test inventory gaps are repaired without removing assertions; interrupted and failed runs are not counted as full acceptance. The public status preview describes implemented candidate behavior and does not establish production delivery.


<!-- s118-final:truth -->
## 2026-10-22 — Session 118 — Release verified, limits and failed evidence preserved

Exact application candidate 863ea60e61398fa149d0e5715f15341a57337df5; artifact 2e2973ec0bdfedfc6f5e0b099f4031e796df6b3abbe744f55783e92db2f12737. CI39796952874 verified all six canonical unit shards and the complete browser job/test step. Pages39797016574 and backend39797029101 promoted the exact candidate. Stable staging14/14 and production14/14 provenance passed; hosted performance passed desktop/mobile. Provider/public source identities match. Previous Pages deployment and API image are available for rollback. Database container, image/start/mount identity and routing files/service identity are unchanged. No aggregate core/runtime case count is invented from truncated TAP output.

The old browser235pass/28fail/3skip diagnostic and first-candidate262pass/5fail/3skip and second-candidate266pass/1fail/3skip remain historical nonpassing runs. Core/runtime successful executed test steps are verified, but their missing/truncated aggregate TAP counts remain unmeasured. Current visual receipt includes preserved history and fresh actual hosted pixels; identical source hashes do not manufacture new image inspections. Synthetic fixtures never become actual-user career or played-injury evidence.

The shared closeout-autopilot target flag does not isolate every child writer; it was not run and is not labeled passed. Native project-only equivalents preserve the actual checks. The legacy check-secrets --audit alias only performs advisory capability discovery, not independent gateway health certification; actual staging deployment exercised the gateway.

Characters remain stylized procedural art and movement studies; no photorealism, motion capture, complete physical tissue-mass calibration, physical-device frame-rate or actual-user long-career proof is claimed. Existing expanded-mobile Desk/card right-edge clipping remains recorded and does not obstruct the tested save-restoration controls. Broader S117 benefits/policy and actual-user career work remain outside this selected three-item scope. Technical promotion does not authorize a public launch or lifecycle transition; launch/email holds remain independent.


<!-- s118-final-publication -->
S118 selected character/family outcomes and full exact-candidate production delivery are complete. Closeout commit eb0ed0a6dfb018c2fd21aef090bb4f4325572186 is on remote main; independent review passed after one corrected receipt label. All seven CI jobs passed; hosted browser267pass/0fail/3existing opt-in skips and responsive327captures/312required passed. Actual production motion, family reload, save restoration and lab performance passed. Ark summary 01K5IB7Q1U348173B7DFE7C352 was shipped; delivery, application and recipient verification are not asserted. No configured session beacon exists. The containing receipt commit must be verified on origin/main after an ordinary push; native goal completion is withheld until that readback.

## 2026-10-23 — S119 — S118's "all seven CI jobs passed" was true of its candidate, not of main

- S118 recorded seven green CI jobs for candidate 863ea60e. Its own closeout commits (eb0ed0a6, 6e5b2351) then failed CI (studio: unregistered AGENT_MEMORY ledger; browser: one recovery case), and no surface recorded it. Corrected in S119; c0ce44b4 is green on all seven.
- The TASK_BOARD "reproducible 16.2 MB" payload regression no longer reproduced (15.305 MB); closed by measurement.
- The passer rating recorded as "pinned as shipped" in test/stat-schema-contract.test.js was a known deviation from the NFL formula; now corrected and attributed in docs/GOLDEN_BASELINE_S119.json.
- Backend host-level container/routing identity was not re-read over SSH in S119; workflow exact-SHA health and external health are the recorded evidence.

## 2026-10-23 — S120 — A "flaky" recovery case had a cause

- S119 recorded that S118's closeout commits failed CI's browser job on "one recovery case" without a cause. S120's Pages gate failed two client-session-recovery cases the same way; the cause is a race between tests-ui revealTable's read-then-click and setup.js opening Saved Leagues when deferred saves arrive. Fixed with a deterministic reproduction; the S118 failure was very likely the same race (not re-run to prove it).
- The S119 visual receipt said "no capture shows broken layout"; S120's inspection found the shared public footer has no left gutter on 11 of 14 public pages. It predates S120 (footer untouched) and was present in S119's captures; recorded, not fixed.
- Backend: the production API reports c0ce44b4, not S120's candidate. Pages production is 207159ea. The two deployed identities now differ, and both are recorded as observed.

## 2026-10-24 — Session 121 — Release identity and evidence boundaries

Four selected S121 outcomes are implemented and live at5410b8b5: persistent session start anchor, sanitized SSH diagnostics, shared footer gutter and decoded lazy-image captures. Exact CI7/7; browser271 passed/3 skipped; staging and production14/14; Pages/API health, rollback and hosted performance verified. Public launch remains HOLD. Twelve readiness areas retain eleven partial states.64 hash-bound images reviewed; production provenance14/14, provider rollback available. First failed candidate and overlapping-load performance sample preserved. Historical1802-test receipt is not re-dated; current unit aggregate unknown, exact CI7/7 and browser271/3 separately measured. No new creative direction; private CDR untouched. Final closeout publication remains a separate verified readback.

<!-- ledger-roll:pointer -->
---

Older entries are retained verbatim in `context/archive/TRUTH_AUDIT.archive.md`. Nothing is summarised or removed on the way; the live file holds the working set only (newest 10 entries), so a reader does not pay for the whole project's history to learn what is true this week.

S121 final publication: closeout 37cac258547aa23b8233c950ad9b314390f27db0 verified on remote main; frontend/API5410b8b5 remain verified. Ark 01K5LVUDRP9C130E63647C64C9 shipped. The containing receipt-only commit must be verified on origin/main before native goal completion.
