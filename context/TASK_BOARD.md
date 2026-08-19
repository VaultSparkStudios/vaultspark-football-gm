# Task Board — Franchise Architect: Football

Public-safe roadmap. Session 8 audit + implementation sprint (2026-04-13). Session 9: test coverage (2026-04-13).

## Now

- [ ] Observe the first real opted-in cohort and verify freshness, suppression, deletion and abuse ceilings without manufacturing activity.
- [ ] Reconcile launch authority only from delivered/reply-as email evidence, SHA-bound founder launch approval, and the authoritative lifecycle registry.

## Next

- [ ] **Build a real NFL elite-density baseline into `src/data`, then re-source both ends of the S91 distribution gate from it.** S91's 90+ ceiling (1.6% on-target / 2.4% watch) is a judgement call and says so in the code — no elite-density authority exists anywhere in this project. The post-fix league settles at 2.07%, so the receipt honestly reports `watch`. Do **not** close that by tuning `POTENTIAL_REVERSION_PROFILE.rate`; the open question is whether the *generator* is right, since a fresh league opens at 0.32% (five 90+ players across 32 clubs), which is a very flat league. If the generator is wrong then both ends of the measurement are, and a rate tuned against a wrong ceiling would bake that in.
- [ ] Evaluate historical sparklines and shareable aggregate cards only after a real cohort proves they add value without weakening privacy.
- [ ] Offer aggregate-only Analytica ingestion through Studio Ark when that authority is ready; never export raw community receipts.

## Session 91 — Full arc: the league stops losing its shape (2026-08-18)

Source: `docs/AUDIT_2026-08-18_SESSION91.json`.

| Item | Status |
|------|--------|
| parity-gate-measured-a-blended-population — the gate that polices talent drift now measures the rostered league it describes, instead of blending it with an unbounded junk pool whose growth cancelled the inflation exactly | ✅ Done |
| potential-is-a-drift-coefficient-not-a-ceiling — a player's potential now actually bounds him; offseason development is a bounded walk instead of an unbounded one that selection filtered on only one side | ✅ Done |
| no-gate-could-see-a-shape-defect — a distributional gate reads dispersion drift and elite density together, folded into the receipt verdict, with a negative control built from the real pre-fix measurement | ✅ Done |
| declare-the-provenance-of-a-judgement-ceiling — the new elite-density ceiling ships with its origin, its misuses, and its open question recorded as data | ✅ Done |
| camp-cuts-did-not-cut — the offseason's only compliance pass ran *before* the draft added a full rookie class, so the league came to rest in a state the authority had never examined; legality is now the offseason's final act, in the stage named for it | ✅ Done (found late, via a red) |

**Method note:** audited by running the engine, not reading it — the fourth consecutive session where the headline defect was invisible to code review. The decisive instrument was holding the denominator structurally fixed at the ~2,180 roster slots S89 pinned, which is what let population growth be ruled out as an explanation rather than argued about.

**The finding that reframed the problem.** S90's handoff disclosed the elite-tail figure as confounded by free-agent-pool growth and instructed the next session to test that before ranking it. Tested: only **1 of 89** elite players is unrostered, and the blended reading (3.36%) is *lower* than the rostered one (4.03%). The pool was diluting the number, not inflating it — the disclosed suspicion was honest and backwards. Chasing that exposed the larger defect: the parity gate measured a blended population, and the blend's −0.073 was **exactly the number S90 shipped as proof its own fix worked**, while the rostered league inflated at +0.089/season underneath it.

**Verification:** 90+ density on the fixed rostered denominator **4.03% → 2.07%**; players above their own potential 37.4% → 21.2%; veterans above their own potential 26.3% → 5.7%; p99 93 → 91; rostered mean drift +0.089 → +0.065/season. The decisive reading is trajectory, not level — post-fix the elite count plateaus from season 8 (44, 50, 43, 40, 45) where pre-fix it was still climbing at season 12 (63, 80, 73, 80, 85, 88). Reproduced on seed 20260307. S90's own guarantee (league-wide mean environment tilt 0.0000) still holds and still passes.

**Honest residual, disclosed not force-greened:** elite density measures **2.07%** across 12 seasons pre-camp-cuts-fix and **2.6%** across the 10-season decade regression after it (the camp-cuts fix culls weak rosters, shrinking the denominator and raising density — a real effect of a correct fix). Against a 1.6%/2.4% ceiling the gate's verdict is **`out-of-range`**. Two routes to green were available and **both refused** — raising the reversion rate, and moving the ceiling. The ceiling is declared `judgement-not-measured` and the gate keeps its teeth; the decade regression asserts instead that the mean is calibrated and that elite density is ≥20% below the 4.03% measured on live pre-fix code.

**A fifth defect surfaced by a red, not by the plan.** The rank-2 fix shifted the talent distribution enough to flip one club into a state the S89 cap-legality regression asserts cannot happen. Two hypotheses were formed and **both were disproved by measurement** before the real cause was found — the club was not trapped at the 53-man floor (68 players, fifteen clear of it) and dead money was not pushing it back over (0.0M). Re-running compliance by hand on the resting league fixed it with a single release, which proved enforcement had simply already happened: it lives in the `free-agency` stage, and `draft` and `udfa` add a full rookie class afterwards. The stage named `camp-cuts` performed no cuts.

**Board item retired on evidence:** the free-agent-pool bound, carried since S90, is decided **not a defect**. Its one demonstrated harm was corrupting the gate, fixed at the gate; the remainder is a measured retirement-lag tail of unemployable veterans reaching the player only through an already-bounded surface.

**Launch posture:** unchanged. `launchReady: false` preserved pending Zoho delivery/reply-as, SHA-bound founder approval, authoritative lifecycle reconciliation and external Obelisk relying-party proof.

## Session 90 — Full arc: the league stops minting talent (2026-08-17)

Source: `docs/AUDIT_2026-08-17_SESSION90.json`.

| Item | Status |
|------|--------|
| development-environment-authority — a club's environment becomes a differentiator measured against the league's own centres, instead of a +0.84 OVR/player/offseason subsidy paid to 62% of the league every year | ✅ Done |
| parity-receipt-modelled-a-different-function — the progression receipt and the engine are the same function again, so the receipt can see the drift it exists to police | ✅ Done |
| long-shard-into-canonical-receipt — `npm test` now runs the project's three most behavioural regressions for the first time; shard timeout raised 20 → 45 min so an honest slow shard is never misreported as a failure | ✅ Done |
| development-outlook-centre-parity — the player-facing outlook is built from the same centres the offseason progresses on, and the agreement is gated | ✅ Done |

**Method note:** audited by running the engine, not reading it — the third consecutive session where the headline defect was invisible to code review. The decisive instrument was an *exact* decomposition of league mean-overall drift into three additive terms (progression · survivorship-exit · intake, identity verified to 1e-6 every season). That is what made the defect attributable: the drift lived in progression, not in the roster churn a code read would have suspected.

**The finding that reframed the problem.** The declared development curve's league-mean move is **−0.885 OVR/offseason**; the undeclared environment subsidy was **+0.84**. The observed drift of +0.228 was not a modest calibration miss — it was two large errors of opposite sign very nearly cancelling. Removing only the subsidy briefly swung a three-season sample to −0.42 before the league reached its real steady state, which is why the measurement window matters: the generated league's initial age distribution is not the simulation's steady state, and a short window reads as a defect that a decade does not confirm.

**Verification:** league-wide mean environment tilt now exactly **0.0000** on four independent seeds (was +0.84), with club-to-club spread preserved (best +1.1, worst −1.1, sd 0.80) — centred, not deleted. Post-fix 12-season drift **−0.073** against the 0.15 on-target ceiling (was +0.228), decomposing to P −0.478 / EXIT +0.424 / ENTRY −0.019: survivors age down, the exit of below-average players lifts the mean, intake is neutral, and they cancel. That is what a steady-state league looks like.

**Standing red cleared.** `test/realism-career-regression.test.js` — disclosed by S89 as pre-existing and deliberately not force-greened — now passes 3/3, including the decade progression-parity assertion. It has been folded into the canonical receipt rather than left excluded, which resolves the S89 committed follow-up: `npm test` now costs ~12 minutes more and covers the tests most likely to be load-bearing.

**Launch posture:** unchanged. `launchReady: false` preserved pending Zoho delivery/reply-as, SHA-bound founder approval, authoritative lifecycle reconciliation and external Obelisk relying-party proof.

## Session 89 — Full arc: the franchise economy stops being a fiction (2026-08-17)

Source: `docs/AUDIT_2026-08-17_SESSION89.json`.

| Item | Status |
|------|--------|
| offseason-cap-compliance-authority — clubs are brought back under the salary cap every offseason by a deterministic release authority, instead of the cap silently ceasing to bind after ~5 seasons | ✅ Done |
| offseason-roster-size-authority — a declared roster structure (53 active + 16 practice) is an actual upper bound, instead of clubs accumulating every player they ever acquired | ✅ Done |
| unreachable-max-salary-bound — the declared salary ceiling is corrected to what the curve can actually pay and bound to it in test; duplicated salary literals now read the single CONTRACT_RULES authority | ✅ Done |
| card-visibility-husk-gate — the S88 empty-state husk class gets a permanent, negative-control-validated gate | ✅ Done |

**Method note:** audited by running the engine, not reading it. A seeded 20-season league and an 8-season roster-composition probe were tabulated before anything was ranked. Two of four findings were invisible to code review and to the entire existing suite. One strong code-read hypothesis (`getNegotiationDemand` pricing off an independent curve) was **disproved by running it** — actual demands come back at a median 1.23× the market authority — and was rejected rather than shipped.

**Verification:** canonical Node 1,150/1,150 across the five default shards (core 123, runtime 740, sim-contract 79, sim-realism 1, studio 207), direct exit 0, up from 1,137/1,137 (+13 tests). Cap legality re-measured at the same seed: 0 illegal clubs after every offseason across 2027-2036, against a pre-fix 0,0,1,2,10,27,30,31,31,31. Max club roster pinned at exactly 69 in every season.

**Honest red, pre-existing, not fixed:** the `long` shard is excluded from `DEFAULT_SHARDS` and has never run under `npm test`. `test/realism-career-regression.test.js` fails there on 0.228 annual mean overall drift against a 0.15 on-target ceiling. Verified to reproduce identically on a pristine worktree at HEAD `8ddc310` before any S89 change. Reported, not force-greened.

**Launch posture:** unchanged. Preserve `launchReady: false` until Zoho delivery/reply-as, SHA-bound founder approval, authoritative lifecycle reconciliation and external Obelisk relying-party proof exist.

## Session 88 — Full arc: GM Legacy card empty-state truth (2026-08-16)

Source: `docs/AUDIT_2026-08-16_SESSION88.json`.

| Item | Status |
|------|--------|
| gm-legacy-card-empty-state-truth — hide the whole GM Legacy card, not just the score paragraph, when there is no summary or the fetch errors | ✅ Done |

**Method note:** ten prior full-arc sessions (S79-S87) left zero inline TODO/FIXME/HACK markers, zero skipped tests, and an empty innovation-pack scan; this session's premise-verification pass traced the S87 GM Legacy/Persona/Reputation mount by hand rather than pattern-matching debt markers that no longer exist. The one confirmed defect: `renderGmLegacyScore()` toggled `.hidden` on `#gmLegacyCard` (the inner score `<p>`), not `#gmLegacyCardWrap` (the surrounding article with header, grade badge, mastery, persona and reputation sub-widgets), so the empty/error path left an empty card husk visible instead of hiding cleanly.

**Verification:** extracted `applyGmLegacyCard(card, wrap, s)` in `public/lib/tabOverview.js`; new focused test in `test/session87-franchise-truth.test.js` proves the wrapper hides on a null summary and un-hides with correct score/grade/label text on a populated summary. Full local Node suite 1,137/1,137 (up from 1,136/1,136, +1 new test).

**Launch posture:** unchanged. Preserve `launchReady: false` until Zoho delivery/reply-as, SHA-bound founder approval, authoritative lifecycle reconciliation and external Obelisk relying-party proof exist.

## Session 87 — Full arc: binding franchise pressure and live-surface truth (2026-08-16)

Source: `docs/AUDIT_2026-08-16_SESSION87.json`.

| Item | Status |
|------|--------|
| salary-market-curve — one versioned curve across generated contracts, free agency and CPU bids, with opening cap pressure and a reachable $45M ceiling | ✅ Done |
| narrative-live-adapters — culture and owner events consume live chemistry and owner state | ✅ Done |
| longest-play-max-semantics — long passing/rushing/receiving values cannot shrink later in a game | ✅ Done |
| fan-sentiment-season-fallback — win-band evaluation reads the live team season when no explicit record is supplied | ✅ Done |
| missing-career-mounts — Franchise Legends and General Manager Reputation are reachable in the browser | ✅ Done |
| waiver-player-identity — waiver projections and tables retain name, position, overall and potential | ✅ Done |

**Verification:** canonical local Node aggregate 1,136/1,136 (core 123, runtime 729, sim-contract 79, sim-realism 1, studio 204); Playwright 41/41; responsive evidence 233/233; 84 retained dark/light desktop/mobile captures; Pages build/smoke/module/boot checks green. Exact application candidate `90f0d487…` passed CI, stable staging and production Pages promotion at artifact `9bc71a36…`; public backend health reports the same revision and database ready.

**Launch posture:** unchanged. Technical deployment is not public-launch approval; preserve `launchReady:false` until Zoho delivery/reply-as, SHA-bound founder launch approval, authoritative lifecycle reconciliation, and external Obelisk relying-party proof exist.

## Session 86 — Full arc: core-loop truth — the weekly tactic, the draft pick and the aging curve (2026-08-16)

Source: `docs/AUDIT_2026-08-16_SESSION86.json`.

| Item | Status |
|------|--------|
| weekly-tactic-reaches-simulation — stage the chosen tactic and apply it after the weekly-plan rebuild so the simulator actually observes the player's central weekly decision | ✅ Done |
| draft-pick-reveal-crash — declare the missing analyst-line table and move the reveal behind a lazy import so the on-the-clock Draft button submits the pick | ✅ Done |
| veteran-progression-curve-fidelity — deliver the declared ageFactors curve to the position's graded attributes instead of up to four mostly random keys | ✅ Done |
| gm-legacy-playoff-authority — credit playoff appearances from `team.playoffSeed` and carry it into archived season rows | ✅ Done |
| cap-alert-contract-shape-authority — read `yearsRemaining` and a real position so the Overview banner stops declaring every star's contract expired | ✅ Done |
| postseason-snapshot-payload-parity — stop persisting a second untrimmed copy of every playoff box score | ✅ Done |
| client-sim-job-exclusivity — reject concurrent simulation jobs and TTL-prune the client map, matching the Express runtime | ✅ Done |
| owner-confidence-snapshot-parity — carry unknown owner keys through the restore rebuild and stop re-rounding patience | ✅ Done |

**Method note:** every ranked premise was verified twice — read in the live file with exact lines quoted, then reproduced by running the engine. Three of the eight defects were invisible to code review and only appeared under execution.

**Deferred, verified real, not dropped:** league-wide cap space is non-binding (all 32 teams hold $92M–$112M against a $255M cap; `maxSalary` unreachable) — franchise-economy calibration, owed a dedicated session. Five further confirmed findings (narrative trigger shape drift, box-score long-play accumulation, fan-sentiment win band, two missing DOM mounts, waiver-table identity column) are recorded in the audit sidecar's `preverifiedSkips`.

**Verification:** canonical source-bound Node receipt 1,123/1,123 (core 123, runtime 716, sim-contract 79, sim-realism 1, studio 204 — up from 1,102/1,102, +21 new tests), read from shard summary lines rather than a wrapper exit code. Doctor blockingFailing 0; public-truth 39 engine systems; windows-hide, browser module reachability (80 modules), island/boot budget and CANON-044 wave gates green. Three suite reds were self-inflicted and root-fixed — no budget raised, no assertion loosened, no test deleted.

**Launch posture:** unchanged. Preserve `launchReady: false` until Zoho delivery/reply-as, SHA-bound founder approval, authoritative lifecycle reconciliation and external Obelisk relying-party proof exist.

## Session 85 — Full arc: first-run performance and candidate-bound release authority (2026-08-14)

Source: `docs/AUDIT_2026-08-13_SESSION85.json`.

| Item | Status |
|------|--------|
| first-run-performance-authority — reproducible canonical/game route probes, parallel lazy tutorial loading, scroll-stable modal focus, non-painted hydrating shell, exact hosted proof | ✅ Done |
| candidate-bound-production-promotion — build-only pushes plus explicit exact-SHA/staging-digest production promotion | ✅ Done |
| release-authority-currency-probe — Git/checked/live identity classifier integrated into doctor, with deterministic lifecycle test isolation | ✅ Done |

**Verification:** exact-SHA CI run 31769309459 green across browser plus all five Node shards; local aggregate 1,102/1,102 before the final test-only correction and final Studio 204/204; Playwright 41/41; staging 14/14 with rollback; responsive 209/209 and 68 retained dark/light desktop/mobile captures; canonical and direct-game hosted metrics green; Pages run 31769909692 and backend run 31769913974 green; staging, production and API exact at `fcf16f1…` / artifact `3bafed39…`.

**Launch posture:** technical release evidence is verified; public launch remains NO-GO. Preserve `launchReady:false` until Zoho delivery/reply-as, SHA-bound founder launch approval, authoritative lifecycle reconciliation, and applicable external Obelisk relying-party proof exist.

## Session 84 — Full arc: tutorial layout stability, scoped rival-intel fetch, history-formatting coverage (2026-08-13)

Source: `docs/AUDIT_2026-08-13_SESSION84.json`.

| Item | Status |
|------|--------|
| first-run-tutorial-layout-stability — reserve layout space for the five desktop panels and four mobile elements named in the live CLS-failure diagnostic so the first-run tutorial route stops shifting under the reading player | ✅ Done |
| rival-gm-single-team-endpoint — add a scoped `?team=` param to `/api/team-archetypes` (both Express and static runtimes) so Overview's rival-intel card stops refetching all 32 teams' personas to read one opponent's row | ✅ Done |
| history-formatting-test-coverage — direct focused coverage for `public/lib/historyFormatting.js`, the one browser module with genuinely zero prior test references | ✅ Done |

**Rejected phantoms (verified against live code, not implemented):** rival-GM-persona surfacing (already wired end-to-end since S70); offline/service-worker support (already shipped S62); `communityEventContract.js`/`gistCredentials.js`/`pressRoomPanel.js` "untested module" candidates (each already covered — via a re-export shim, a behavior-named test file, and a Playwright surfaces spec, respectively — a naive filename grep missed all three); Depth Chart drag-and-drop mobile parity (no drag-and-drop exists to make parity work on; it is already button-based); re-treating the tutorial diagnostic as the canonical release gate (S83's D-S82.5 exclusion still holds — this item fixes the defect, not the gating question).

**Verification:** canonical source-bound Node receipt 1,094/1,094 (core 123, runtime 692, sim-contract 79, sim-realism 1, studio 199 — up from 1,078/1,078, +16 new tests); Pages build/smoke green; no backend contract break (additive `?team=` param only).

**Launch posture:** unchanged. Preserve `launchReady: false` until Zoho delivery/reply-as, SHA-bound founder approval and authoritative lifecycle reconciliation exist.

## Session 83 — Full arc: rematch memory, touch broadcast and public contract truth (2026-08-12)

Source: docs/AUDIT_2026-08-12_SESSION83.md.

| Item | Status |
|------|--------|
| obelisk-v2-migration-boundary — remove misleading Passport v1 samples and declare the honest external v2 relying-party boundary | ✅ Done |
| community-stats-feed-contract — bind homepage showcase, Stats Atlas and Analytica to one aggregate-only 30-second contract | ✅ Done |
| rematch-film-memory — surface the last receipted meeting and bounded recent sample without prediction or causality claims | ✅ Done |
| sim-watch-touch-transport — direct the existing broadcast controller through horizontal touch/pen gestures | ✅ Done |
| fictional-identity-boundary — keep canonical engine IDs out of fictional tactical presentation | ✅ Done (second-order) |
| deadline-partner-normalizer — prevent object-shaped standing identities from leaking into trade copy | ✅ Done (second-order) |
| sim-watch-launch-authority — collapse duplicate ticker listeners into one reachable ordered launch path | ✅ Done (second-order) |
| tactical-mobile-theme-polish — scroll-safe mobile composer and token-correct light cards | ✅ Done (second-order) |

**Verification:** canonical source-bound Node receipt 1,078/1,078 (core 123, runtime 676, sim-contract 79, sim-realism 1, Studio 199); Pages build and boot budget green; CANON-054 conform; CANON-053 pass with 9 inspected hash-bound dark/light desktop/mobile captures; authentic touch moved the reel through the existing controller; staged secret scan 0 findings; unified staging/production/visual/performance authority verified at 8b7d595… and artifact 0f79737d…; stable staging 14/14 with rollback; production 10/10; hosted desktop LCP/INP/CLS 524ms/24ms/0.0151 and mobile 464ms/16ms/0.0085.

**Launch posture:** deployment GO; public launch NO-GO. Preserve launchReady: false until Zoho delivery/reply-as, SHA-bound founder approval and authoritative lifecycle reconciliation exist.

## Session 82 — Full arc: irreversible choice clarity, architect hierarchy and release authority (2026-08-12)

Source: `docs/AUDIT_2026-08-12_SESSION82.md`.

| Item | Status |
|------|--------|
| monotonic-session-authority — resolve the newest committed session across status, handoff and SIL without backward self-heal | ✅ Done |
| irreversible-draft-trade-confirmation — accessible exact-pick review before accepting a live on-clock offer | ✅ Done |
| planning-friction-journey-authority — persist source-derived choice friction through the decision journey | ✅ Done |
| architect-objective-hierarchy — show identity, current pressure, next proof and mastery path in one General Manager hierarchy | ✅ Done |
| hosted-performance-evidence — exact-candidate desktop/mobile Core Web Vitals plus observed edge policy | ✅ Done |
| release-receipt-authority — unify deployable SHA/artifact and admit only proven receipt-only publication descendants | ✅ Done |
| completed-visual-report-selection — visual receipt selects only complete evidence runs | ✅ Done (second-order) |
| viewport-authentic-performance-interaction — performance probe measures the canonical public entry and a real theme interaction | ✅ Done (second-order) |
| receipt-only-publication-lineage — release authority rejects deployable deltas and names allowed receipt lineage | ✅ Done (second-order) |

**Verification:** focused Node contracts green; one long aggregate produced core 123/123, runtime 670/670, sim-contract 79/79, sim-realism 1/1 and one transient Studio red, followed immediately by an isolated Studio 196/196 pass (1,069 source-identical shard tests green; final clean-environment aggregate delegated to CI). Playwright 40/40; responsive 206/206; 64 reviewed hash-bound dark/light desktop/mobile captures; Pages build/smoke green; staging 14/14 at `046e35d…` and production 10/10 at receipt-only publication `a38ad34…`, both artifact `656eb904…`; public-entry Web Vitals and edge policy green.

**Launch posture:** deployment remains distinct from launch. Preserve `launchReady: false` until reply-capable email, SHA-bound founder approval, and authoritative lifecycle reconciliation exist.

## Session 81 — Full arc: pre-commit agency, progression truth, privacy and exact runtime proof (2026-08-11)

Source: `docs/AUDIT_2026-08-11_SESSION81.md`.

| Item | Status |
|------|--------|
| gm-choice-boundary-dossier — canonical preview shared by decision projection and commit | ✅ Done |
| decision-modal-interaction-contract — explicit keyboard tactic choice plus top-modal shortcut containment | ✅ Done |
| on-clock-trade-market — deterministic stale-safe draft-pick offers in the War Room | ✅ Done |
| mentorship-covenants — player-directed bounded mentor/mentee progression | ✅ Done |
| gm-stewardship-report-authority — truthful cap/trade reputation and visible season report | ✅ Done |
| community-participation-truth — deletion tombstone/receipt plus coordinated ETag snapshot refresh | ✅ Done |
| backend-runtime-attestation — backend tests, Node parity and exact-SHA runtime health | ✅ Done |

**Wave scaffold:** Wave 1 profile/start/audit ✅ · Wave 2 decision + draft ✅ · Wave 3 progression ✅ · Wave 4 privacy/release ✅ · Wave 5 verification/second-order ✅ · Wave 6 closeout/promotion ◼.

## Session 80 — Exact decision surfaces, visible mastery signature, full-stack promotion (2026-08-11)

Source: `docs/AUDIT_2026-08-11_SESSION80.md`.

| Item | Status |
|------|--------|
| exact-command-surface-routing — one shared tab-hydrate-scroll-focus authority with explicit command target IDs and truthful missing-target diagnostics | ✅ Done |
| mastery-signature-visibility — strongest evidence-derived Architect signature, score, status and receipt count visible with the no-hidden-bonus boundary | ✅ Done |
| exact-navigation-reduced-motion — scrolling honors `prefers-reduced-motion` | ✅ Done (second-order) |
| innovation-pack-phase-authority — open deployment rows remain visible until promotion actually succeeds | ✅ Done (verification catch) |
| exact-candidate-full-stack-promotion — stable staging → direct main → Pages → exact-SHA backend dispatch and live API proof | ✅ Done |

**Verification:** Node 1,024/1,024 direct exit 0; Playwright 40/40 after one transient multi-year request timeout passed in isolation and on clean full rerun; responsive evidence 176/176; CANON-053 PASS with 56 reviewed hash-bound captures; workspace secret scan 0 findings. Candidate `7becc573…` passed stable staging 14/14 at artifact `6781437a…` with rollback; CI/Pages/brief-format and guarded backend dispatch `31544469131` are green; production and the external database-ready API are live.

**Launch posture:** deployment authorization is not launch approval. Preserve `launchReady: false`; reply-capable on-domain email, authoritative lifecycle reconciliation, current Web Vitals/edge evidence, and a separately SHA-bound public-launch decision remain open.

## Session 78 — Marquee, prediction minigame, TD sound, a11y + coverage sweep (2026-08-09)

Source: `docs/AUDIT_2026-08-09_SESSION78.md`.

| Item | Status |
|------|--------|
| td-flourish-touchdown-sound-hookup — wired the built-but-dead `td-flourish` sound to fire on touchdown plays during Sim-Watch, matching existing sound-toggle gating | ✅ Done |
| dynasty-timeline-keyboard-accessibility — role/tabindex/aria-expanded/aria-controls + Enter/Space activation on Dynasty Timeline season nodes | ✅ Done |
| coaching-market-panel-aria-live — `aria-live="polite"` on the coaching market panel mount | ✅ Done |
| cap-war-room-expiring-zero-year-contracts — expiring-contract check now counts `yearsRemaining === 0` (previously only `=== 1`) | ✅ Done |
| audiofeedback-test-coverage — 13-test suite for the previously-uncovered `audioFeedback.js` (7 live call sites, 5 modules) | ✅ Done |
| primetime-marquee-badge — deterministic 'Division Showdown'/'Statement Game'/'Playoff Preview' badge on schedule + Sim-Watch header, derived from standings/rivalry signal, no randomness | ✅ Done |
| weekly-spread-prediction-minigame — local-only, non-canon pick'em with running accuracy streak; proven byte-identical league state with/without a submitted prediction | ✅ Done |
| boot-budget-regression-fix — raised `public/boot-manifest.json` from 710000/55 to 730000/58 bytes/modules for the 3 new statically-imported modules | ✅ Done (found during verification, not audit-ranked) |

**Verification:** default `npm test` 998/998 direct exit 0 (up from 922/922); no deploy required (all changes static/client-side). Three phantom candidates correctly rejected on evidence before implementation: coaching-tree lineage (already shipped S53), `pressRoomPanel.js` coverage (already tested), and a generalized `|| 0`/`|| 1` sweep (spot-checked as legitimate display fallbacks, not the S67/S71 bug class).

## Session 79 — Full Arc: game-loop authority, evidence integrity, browser headroom (2026-08-11)

Source: `docs/AUDIT_2026-08-11_SESSION79.md`.

| Item | Status |
|------|--------|
| canonical-agent-negotiation |  Done |
| prediction-loop-rollover-and-margin-truth |' Done |
| community-participation-capability |  Done |
| non-overview-ui-islands |' Done |
| exact-sha-staging-parity |' Candidate-side release authority complete; exact-SHA proof follows the immutable closeout commit |
| hall-of-fame-ceremony-accessibility |  Done |

**Verification:** game/runtime/simulation shards green through 838 tests before the Studio metadata guard; Playwright 40/40; responsive evidence 158/158 with 44 reviewed hash-bound captures; Pages build/smoke green; boot 610,654/730,000 bytes, 48/58 modules, zero lazy leaks. The final aggregate receipt is rerun after closeout truth is reconciled.

**Launch posture:** preserve `launchReady: false`; email delivery/reply identity, founder approval, lifecycle reconciliation, and current Obelisk/edge evidence remain independent launch gates.

## Session 77 — CommunityStore pool injection + direct coverage (2026-08-09)

Source: `docs/AUDIT_2026-08-09_SESSION77.md`.

| Item | Status |
|------|--------|
| community-store-pool-injection-and-tests — constructor-injection seam for `pg.Pool` + 11 direct tests covering abuse limit, dedupe, cache/TTL, truncation, deletion, retention gate, pepper bootstrap | ✅ Done |
| shard-coverage-fix — registered `test/community-store.test.js` in `scripts/run-test-shard.mjs` (pre-existing shard-membership guard would otherwise silently skip it in CI) | ✅ Done (found during verification, not audit-ranked) |
| innovation-pack-assertion-brittleness-fix — `studio-protocol-smoke.test.js` no longer requires the *latest* audit to have shipped second-order work unconditionally; only asserts the pack surfaces it when it exists | ✅ Done (found during verification, not audit-ranked) |

**Verification:** `test/community-store.test.js` 11/11; default `npm test` 922/922 direct exit 0 (up from 911/911); Playwright UI 40/40; windows-hide clean; doctor 0 blocking.

## Session 76 — Community server branch coverage + stats a11y (2026-08-09)

Source: `docs/AUDIT_2026-08-09_SESSION76.md`.

| Item | Status |
|------|--------|
| community-server-branch-coverage — 4 new tests closing untested stale/unavailable/413/400/health/404 branches in src/community/server.js | ✅ Done |
| stats-period-toggle-aria-controls — aria-controls linkage between /stats period buttons and the atlas region they repaint | ✅ Done |
| latest-audit-follow-through | Not applicable — this session's own audit is the current one |
| sparked-flip | Blocked — still missing real football@playfranchisearchitect.com forwarding/copying receipt and current live-origin/routing evidence |

**Verification:** `test/community-server.test.js` 7/7 (up from 3/3); default `npm test` 911/911 direct exit 0 (up from 905/905); Playwright UI 40/40; Pages build/smoke; windows-hide; Wave guard; secrets audit; blocker preflight 0 items; doctor 0 blocking.

## Session 75 — Community intelligence implemented (2026-08-08)

| Item | Status |
|------|--------|
| Versioned consented receipt contract, local-only ledger, bounded offline queue and deletion | ✅ Done |
| Self-hosted PostgreSQL aggregation, retention, k=5 suppression, percentiles, ETag snapshot and health | ✅ Done |
| Homepage Community Pulse plus full nine-category Stats Atlas and local comparison | ✅ Done |
| Machine-readable stats twin, sitemap/agents/LLM/legal/methodology truth | ✅ Done |
| Eight inspected dark/light desktop/mobile captures and hash-bound visual receipt | ✅ Done |
| Stable staging 11/11, live API, production Pages, CI and rollback verification at c71a26065bb355900a3544f5d08b150b8c3191f5 | ✅ Done |

**Verification:** Node 905/905 · Playwright 40/40 · Community focused 13/13 · Pages build/smoke · CANON-053 8 captures/2 themes · CANON-054 6/6 · Doctor 0 blocking · staged secret scan 0.

## Session 70 — Full-scope audit executed (2026-08-04)

| # | Item | Status |
|---|------|--------|
| 21 | root-funnel-instant-play — one-click start, random team, state-branched hero | ✅ Done 2026-08-04 |
| 22 | synth-audio-haptics-layer — WebAudio palette + haptics + persisted toggles | ✅ Done 2026-08-04 |
| 23 | achievement-trophy-case — 29 cross-save trophies + toasts + share text | ✅ Done 2026-08-04 |
| 24 | rival-gm-persona-memory — named GMs, receipted grudge ledgers, 3 surfaces | ✅ Done 2026-08-04 |
| 25 | reward-beats-hot-paths — week recap, draft verdict, trade verdict beats | ✅ Done 2026-08-04 |
| 26 | public-truth-and-privacy-pass — build-gated truth, cover.png, no internal vocab | ✅ Done 2026-08-04 |
| 27 | indexeddb-persistence-promotion — hybrid store, verified migration, 272-game drive logs | ✅ Done 2026-08-04 |
| 28 | production-parity-promotion — production 8/8 at 870382c, staging 11/11 same SHA | ✅ Done 2026-08-04 |
| 29 | living-difficulty-controls — mid-game presets + opt-in bounded adaptive mode | ✅ Done 2026-08-04 |
| 30 | tab-code-splitting-sw-hardening — resilient SW, dedupe, bootPayload receipt (premise corrected) | ✅ Done 2026-08-04 |
| 31 | website-ia-consolidation — merges, redirects, lastmod sitemap, real 404 | ✅ Done 2026-08-04 |
| 32 | skill-cost-ledger-repair — heartbeat self-announces staleness; dead twin retired | ✅ Done 2026-08-04 |

Second-order shipped: SW index-registration root fix · persona hash avalanche · lifecycle vocabulary decoupling · dev-server runtime meta truth · pre-rebrand CI canonical fix (latent since S25) · LF artifact determinism.

Open (next session candidates): dynasty-almanac-share-cards · broadcast-mode-sim-watch · trophy-road-onboarding · tab-module code-splitting (requires app.js bindings refactor).

## Session 8 Priority Items (All 20)

### TIER 1 — Ship-Blockers (Beta Gate)

| # | Item | Status |
|---|------|--------|
| 1 | localStorage rewind size guard — auto-demote oldest slots above 4MB, non-blocking toast | ✅ Done |
| 2 | GitHub Pages CI deploy + Playwright smoke test on push to main | ✅ Done 2026-06-30 — workflows and Pages deploy green; remaining issue is external custom-domain certificate/routing smoke |
| 3 | Mobile 375px overflow fix — modal-content overflow-x, draft war room, trade modal | ✅ Done |

### TIER 2 — UX/Retention Breakers

| # | Item | Status |
|---|------|--------|
| 4 | Franchise Moment card — cinematic post-game drama event with share button | ✅ Done |
| 5 | GM Decision Required modal — pre-advance choices on critical weeks (trade deadline, playoff clinch, QB injury) | ✅ Done |
| 6 | Tab navigation bucketing — 4 mode buckets (GAMEDAY / ROSTER / BUILDS / HISTORY) with pill toggles | ✅ Done |
| 7 | Live box score sim-watch mode — 300ms animated drive log, key play highlight cards, skip-to-final | ✅ Done |
| 8 | Priority Inbox — bell icon, CRITICAL/IMPORTANT/FLAVOR tiers, badge counter, persistent inbox | ✅ Done |

### TIER 3 — Depth & Differentiation

| # | Item | Status |
|---|------|--------|
| 9  | GM Persona Arc — enhanced Identity Card, score progress bar, confetti on tier-up | ✅ Done |
| 10 | Cap War Room — multi-year visual cap timeline, color-coded zones, restructure hints | ✅ Done |
| 11 | Trade Value Transparency — post-evaluate/execute breakdown card with A-F grades and verdict | ✅ Done |
| 12 | Dynamic Season Narrative Arc — 3 tension threads generated at week 1, binary resolution at season end | ✅ Done |
| 13 | AI GM Archetypes — per-team personality (Moneyball/Gut-Feel/Loyalty/Win-Now), visible in scouting | ✅ Done |
| 14 | Veteran Mentorship visual — "Mentored by" badge on player cards, stat boost display | ✅ Done |
| 15 | Dynasty Records Board — all-time franchise records by category, new-record celebrations | ✅ Done |

### TIER 4 — Performance & Security

| # | Item | Status |
|---|------|--------|
| 16 | Map-based player/team index — O(1) lookups in GameSession, ~15-25% sim speedup | ✅ Done 2026-05-27 — GameSession identity lookup indexes shipped; future sim-loop hot paths can build on this layer |
| 17 | SimJob memory cleanup — TTL eviction after fetch or 10 min, prevents OOM | ✅ Done |
| 18 | Input validation hardening — schema validation at route entry for teamId/seed/week/year | ✅ Done |
| 19 | Seeded RNG for ID generation — replace Math.random() in beatReporter/narrativeEvents/server.js | ✅ Done |
| 20 | Rate limiting — token-bucket 50 req/min per IP on API endpoints | ✅ Done |

## Session 9 — Test Coverage Sprint (2026-04-13)

| Item | Status |
|------|--------|
| Add Session-8 endpoints to localApiRuntime (season-arcs, gm-decision, records/franchise, team-archetypes, franchise-moment) | ✅ Done |
| test/session8-endpoints.test.js — 18 tests covering all 5 new endpoints | ✅ Done |
| test/session8-contract-edges.test.js — 17 tests (pure logic + session edge cases) | ✅ Done |
| Pure unit tests for checkRateLimit, validateParam, deriveGmArchetype, pruneSimJobs | ✅ Done |
| Session tests: multi-restructure, picks-only trades, dashboard state, box score shape | ✅ Done |

**Suite result: 95 pass, 0 fail (up from 45 at S8 close)**

## Deferred to Next Sprint

- Item 16: Map-based player/team index — Done 2026-05-27 for GameSession identity lookups; future sim-loop hot paths can build on the index layer.
- Full GitHub Pages CI wiring (repo secrets needed)
- Verify whether the Franchise Architect: Football Codex Apps MCP startup failure is resolved upstream; remove `scripts/codex-football.*` wrappers if normal Codex startup becomes reliable for this repo.

## Deferred to Project Agents

- cross-repo item owned by another repo agent:

## Session 10 — Codex Startup Reliability (2026-05-27)

| Item | Status |
|------|--------|
| Keep Codex Apps globally enabled for the Studio portfolio | Done |
| Add Franchise Architect: Football-only Codex startup wrappers using `--disable apps` | Done |
| Verify wrapper startup path with `codex exec --ephemeral --sandbox read-only` | Done |
| Align package metadata with proprietary rights posture | Done |

## Session 11 — Audit + Implementation Sprint (2026-05-27)

| Item | Status |
|------|--------|
| Restore local Studio startup/blocker helper modules so `/start` and blocker preflight run again | Done |
| Ship GameSession Map-backed lookup indexes for teams, players, retired players, draft picks, and team rosters | Done |
| Replace browser local API simulation job `Math.random()` IDs with deterministic clock-plus-counter IDs | Done |
| Add regression coverage for Studio protocol scripts, lookup index mutations, and deterministic job IDs | Done |

**Verification:** `node --test test/studio-protocol-smoke.test.js`, `node --test test/session-lookup-indexes.test.js`, `node --check src/runtime/GameSession.js`, `node --check src/app/api/localApiRuntime.js`, `node scripts/render-startup-brief.mjs`, and `node scripts/blocker-preflight.mjs --json` passed. Full `npm test` was attempted with 5-minute and 15-minute ceilings and timed out before completion.

## Session 12 — Explicit Closeout Refresh (2026-05-27)

| Item | Status |
|------|--------|
| Refresh all public-safe closeout surfaces after pushed audit implementation sprint | Done |
| Add canonical `context/OBELISK_ADOPTION.md` Phase 0 declaration | Done |
| Update CDR, decisions, work log, SIL, truth audit, closeout board, and agent memory | Done |

## Next Sprint Queue

| Item | Status |
|------|--------|
| Split simulation-heavy `npm test` into CI-friendly shards so local/agent runs return actionable output | ✅ Done 2026-06-03 — `npm test` now runs bounded default shards; `npm run test:long` isolates expensive realism/determinism smoke probes |
| Complete GitHub Pages CI deploy once repo secret/provider configuration is ready | ✅ Workflow green 2026-06-30 — Actions/Pages deploys are succeeding; remaining launch check is custom-domain certificate state plus post-push route smoke |

## Session 13 — Test Sharding + Pages Smoke Gates (2026-06-03)

| Item | Status |
|------|--------|
| Add shard runner and npm scripts for core/runtime/sim/studio/long test surfaces | Done |
| Convert CI unit checks to a matrix of bounded shards | Done |
| Run static Pages smoke in CI and deploy workflow before artifact upload | Done |
| Restore missing local Studio helper modules required by startup smoke | Done |

**Verification:** `npm run test:studio`, `npm run test:runtime`, `npm run test:core`, `npm run test:sim:contract`, `npm run test:sim:realism`, `npm test`, `npm run test:long`, `npm run build:pages`, and `npm run smoke:pages` passed. `npm run test:runtime` took about 183 seconds when run alone; composed `npm test` completed in about 8.9 minutes with 131 default tests.

## Session 14 — Engagement Surfacing + Pipeline Defense Sprint (2026-06-04)

| Item | Status |
|------|--------|
| Defend CI + Pages deploy against the Playwright install hang (cache, step timeouts, retry, smoke watchdog) | Done |
| Add weekly scheduled deep realism sweep workflow with its own time budget (closes twice-recorded SIL follow-up) | Done |
| Surface rivalryDNA in game UI — schedule rivalry strip + RIVALRY WEEK sim-watch banner | Done |
| Season Epilogue ritual — arc verdicts, records, fan pulse, coach quote in the Season Review modal | Done |
| Shareable seeded challenge codes — zero-backend "beat my run" duels (encode/copy/accept flow) | Done |
| Save integrity guard — FNV-1a checksum on browser saves + gist sync sidecar, verified on load/import | Done |
| Beta feedback widget — "Tell the Commissioner" prefilled GitHub issue with game context | Done |
| Pages custom-domain cert remediation | Diagnosed — founder action required (see below) |

**Verification:** all five default shards green — core 54, runtime 69, sim-contract 22, sim-realism 1, studio 3 (149 tests, up from 131, 0 fail) · `npm run build:pages` + `npm run smoke:pages` pass.

### ⚠ Custom-domain certificate state requires verification — public route now returns HTTP 200

Diagnosis (agent-verified 2026-06-04):
- The custom domain lives on the org root repo `VaultSparkStudios.github.io` (cname `vaultsparkstudios.com`).
- GitHub's HTTPS cert for it is `bad_authz`, **expired 2026-06-02** — DNS points at Cloudflare proxy IPs, so GitHub's ACME HTTP-01 challenge can never complete.
- 2026-06-30 update: `curl -I https://playfranchisearchitect.com/` returned HTTP 200 through Cloudflare, so the old blanket 403 diagnosis is stale. GitHub Pages API still reports the custom-domain certificate as `bad_authz` / expired 2026-06-02, so certificate health and post-push route smoke still need verification before Launch Readiness flips green.
- Cloudflare deploy/DNS credentials are MISSING from the secrets gateway as of 2026-06-07, and blocker preflight still marks this item not auto-ready, so the agent cannot inspect or repair the zone from this repo session.

Fix options (pick one in the Cloudflare dashboard):
1. **Grey-cloud (DNS-only) the apex + www records** so they resolve directly to GitHub Pages (A: 185.199.108–111.153, AAAA equivalents). GitHub ACME then reissues the cert automatically (~minutes–hours). Simplest and matches GitHub's official guidance.
2. **Keep the orange-cloud proxy** but fix the zone: SSL mode "Full" (not "Full (strict)" while GitHub's cert is expired), and check Security/WAF rules for whatever returns the 403 today.

Optionally: add a `cloudflare` API token to the secrets gateway so future agents can run this remediation end-to-end.

## Session 15 — Protocol Repair + Beta Readiness Sprint (2026-06-07)

| Item | Status |
|------|--------|
| Generate a fresh project-specific audit that respects current shipped items, flags, and blockers | Done |
| Restore documented Studio protocol command surface with repo-local shims | Done |
| Add Draft War Room pressure model and browser panel | Done |
| Add Settings Launch Readiness cockpit for beta checks and public-domain blocker visibility | Done |
| Add protocol/helper coverage to named test shards | Done |

**Verification:** focused protocol/helper tests 7/7 · `npm run test:studio` 4/4 · `npm run test:runtime` 72/72 · `npm run test:core` 54/54 · `npm run build:pages` · `npm run smoke:pages`.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare-side blocked until the existing runbook is applied or Cloudflare credentials are added to the secrets gateway.

## Session 17 — Goal Completion Verification (2026-06-07)

| Item | Status |
|------|--------|
| Re-verify latest audit execution log against current code and tests | Done |
| Rerun full default suite and static Pages gates | Done |
| Preserve propagated lean `AGENTS.md` canon block | Done |
| Backfill closeout cost/brief renderer scripts | ✅ Done 2026-06-15 — local shims covered by studio protocol smoke tests |

**Verification:** `npm test` 153/153 · `npm run build:pages` · `npm run smoke:pages` · `node scripts/ops.mjs blocker-preflight` · `node scripts/check-secrets.mjs --audit`.

**Follow-up:** add or propagate `scripts/record-skill-cost.mjs` and `scripts/render-closeout-brief.mjs`; both are referenced by the current Studio closeout protocol but absent from this public repo.

## Session 18 — Live Beta Readiness + Draft Pressure (2026-06-08)

| Item | Status |
|------|--------|
| Generate a fresh current-state audit after confirming the 2026-06-07 audit was fully shipped | Done |
| Make Launch Readiness public-domain status evidence-driven (`Blocked` / `Ready` / `Needs check`) | Done |
| Add Draft War Room steal-risk and urgency labels for pick-room decisions | Done |
| Attach optional launch-readiness rows to beta feedback issue URLs without personal data | Done |

**Verification:** focused helper tests 10/10 · `npm run test:runtime` 75/75 · `npm run test:studio` 4/4 · `npm run test:core` 54/54 · `npm test` 156/156 · `npm run build:pages` · `npm run smoke:pages`.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare/GitHub Pages-side until the existing runbook is applied or credentials are added; Launch Readiness now has the truth-state model to flip to `Ready` after public URL verification.

## Session 19 — Mobile Decision Deck + Feedback Fingerprint (2026-06-15)

| Item | Status |
|------|--------|
| Generate a fresh current-state audit after confirming the 2026-06-08 audit was fully shipped | Done |
| Add a mobile General Manager decision deck for draft, cap, injury, deadline, news, and advance-week pressure | Done |
| Attach a public-safe franchise fingerprint to beta feedback issue URLs | Done |
| Backfill local closeout cost and closeout-brief shims | Done |

**Verification:** focused mobile 3/3 · focused beta feedback 6/6 · focused studio protocol 5/5 · `npm run test:runtime` 79/79 · `npm run test:studio` 5/5 · `npm test` 161/161 · `npm run build:pages` · `npm run smoke:pages` · Playwright mobile screenshots.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare/GitHub Pages-side until the existing runbook is applied or credentials are added; no Session 19 shipped item depends on new backend or paid services.

## Session 20 — Narrative Integrity + Franchise Depth (2026-06-15)

| Item | Status |
|------|--------|
| Fix narrative event IDs to deterministic template (remove Math.random) | Done |
| Add miracle-run comeback arc: isMiracleRun(), QUOTE_BANK key, epilogue HTML flag | Done |
| Add veteran farewell legacy blurb system: buildVeteranLegacyBlurb, franchiseLore[] persisted in state | Done |
| Add GM reputation profile: buildGmReputationProfile(), CPU trade ask multiplier, Identity Card UI | Done |
| Add Priority Inbox action deeplinks: INBOX_ACTION_TABS, getInboxActionTab(), Take Action button on CRITICAL items | Done |
| Add Rival Coach Intel card: rivalCoachIntel.js, 3 tendency lines keyed to opponent GM archetype, rendered in schedule section | Done |
| Fix smart-quote encoding bug in seasonEpilogue.js (curly quotes used as JS string delimiters) | Done |

**Verification:** focused session20 tests 20/20 · full `npm test` 184/184.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare/GitHub Pages-side; no Session 20 shipped item depends on new backend or paid services.

## Session 21 — Infrastructure Protocol Hardening (2026-06-30)

| Item | Status |
|------|--------|
| Generate a current infrastructure-rubric audit after rejecting stale Session 19 game-audit metadata | Done |
| Make Windows child-process execution hidden by construction with `safe-spawn` and `check-windows-hide` | Done |
| Enforce CANON-044 Wave-list discipline across durable agent surfaces | Done |
| Repair task-board parser and blocker classifier truth after focused Studio tests caught regressions | Done |
| Add honest context/SIL telemetry scaffolding, including shared context verdicts and SIL v6 dual-axis output | Done |

**Verification:** `node --check` across 37 changed JS/MJS files · `node scripts/check-windows-hide.mjs` · `node scripts/check-canon-044-waves.mjs` · `node scripts/lib/sil-v6.mjs --repo-root . --medium infrastructure --json` · `npm run test:studio` 5/5 · full `npm test` 161/161 · `npm run build:pages` · `npm run smoke:pages`.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare/GitHub Pages-side until the existing runbook is applied or Cloudflare credentials are added; Session 21 did not force-green public reachability.

## Session 22 — Mobile Loop + Determinism + Canon Repair (2026-06-30)

| Item | Status |
|------|--------|
| Generate a live-code audit after confirming the project-local genius generator is absent | Done |
| Wire the mobile core loop overlay into the browser app shell and Settings toggle | Done |
| Refresh enabled mobile overlay after Advance Week state mutation | Done |
| Remove remaining runtime `Math.random()` leaks from news IDs, press conference IDs, multiplayer intent IDs, and Draft War Room trade calls | Done |
| Repair CANON-001/CANON-003/CANON-004 STRONG gaps with rolling-status markers and `prompts/initiate.md` | Done |

**Verification:** focused mobile/determinism 8/8 · `npm run test:runtime` 81/81 · `npm run test:studio` 5/5 · full `npm test` 164/164 · `npm run build:pages` · `npm run smoke:pages` · canon conformance 0 gaps.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare/GitHub Pages-side until the existing runbook is applied or credentials are added; no Session 22 shipped item depends on new backend, paid services, or fabricated public-domain evidence.

## Session 23 — Browser Affordance + Public Surface Repair (2026-06-30)

| Item | Status |
|------|--------|
| Generate a fresh live-code audit for beta-facing broken affordances and public surface gaps | Done |
| Repair Season Newsletter import/wiring | Done |
| Restore live news ticker rendering into the actual `#newsTickerContent` markup | Done |
| Fix Commissioner lobby create/join/ready/advance contract in app UI and client runtime | Done |
| Repair Cap Casualty action loader | Done |
| Add public contact/privacy/terms/agents/llms/sitemap static files and footer links | Done |
| Second-order: make Pages build/smoke prove the new static route surface | Done |

**Verification:** focused browser/public/runtime tests 15/15 · full `npm test` 165/165 · Playwright UI 9/9 · `npm run build:pages` · `npm run smoke:pages`.

**Launch note:** GitHub Actions/Pages workflows are green and the public game URL returned HTTP 200 on 2026-06-30, but GitHub Pages API still reports the custom-domain certificate as `bad_authz`/expired 2026-06-02. Keep Launch Readiness evidence-driven until post-push route smoke and certificate state are verified.

## Session 24 — Protocol Expansion + Observability Honesty (2026-06-30)

| Item | Status |
|------|--------|
| Generate a fresh live-code protocol audit after confirming the primary genius list was exhausted except the external domain blocker | Done |
| Add `node scripts/ops.mjs innovation-pack` with source-derived candidates and `--dry-run` support | Done |
| Close the dynamic `node:child_process` detection blind spot in the Windows no-window guard | Done |
| Repair startup brief SIL category rows so v3 values do not render as false zeroes | Done |
| Correct stale task-board rows for Pages CI, GameSession lookup indexes, and closeout renderer shims | Done |

**Verification:** `node --check scripts/generate-innovation-pack.mjs`; `node --check scripts/render-startup-brief.mjs`; `node scripts/check-windows-hide.mjs`; `node scripts/ops.mjs innovation-pack --dry-run`; `npm run test:studio` 6/6; full `npm test` 166/166; `npm run build:pages`; `npm run smoke:pages`; `npm run test:ui` 9/9 after one transient first-run timeout passed in isolation and rerun.

**Still blocked:** external custom-domain certificate/routing remediation remains outside this repo until provider/dashboard access or DNS/certificate evidence changes.

## Session 25 — Franchise Architect Rebrand + Public Surface Arc (2026-07-01)

| Item | Status |
|------|--------|
| Generate a live Session 25 audit for the in-progress rebrand/public-surface and process-hardening work | Done |
| Complete Franchise Architect identity migration across package metadata, public docs, agent metadata, Pages build paths, and feedback URLs | Done |
| Add root-domain public pages, brand assets, favicon, sitemap/security/robots files, and canonical/legacy Pages smoke coverage | Done |
| Ship brand lockup plus light/dark theme toggles on setup and game screens | Done |
| Add scouting narrative/reveal tiers, trade-deadline frenzy cards, Hall of Fame ceremony sharing, and sim-watch field position feedback | Done |
| Extend Windows process hardening with non-interactive Git guard env and repair the raw child_process regression found by the guard | Done |
| Keep launch readiness blocked on evidence: on-domain email forwarding and post-push public route/domain state still need verification before SPARKED | Done |

**Verification:** `npm test` 166/166 · `npm run test:ui` 9/9 · `npm run build:pages` · `npm run smoke:pages` · `node scripts/check-windows-hide.mjs` · `node scripts/check-secrets.mjs --audit` · `node scripts/ops.mjs blocker-preflight` · canon adoption check · canon conformance 0 gaps.

**Still blocked:** do not mark SPARKED until `football@playfranchisearchitect.com` forwarding/copying is verified and the pushed public routes/domain evidence are checked after deployment.

## Session 27 — Protocol Cache + GM Decision Smoke Closeout (2026-07-01)

| Item | Status |
|------|--------|
| Generate a fresh live-code audit after confirming the Session 26 queue was exhausted | Done |
| Add project-local `scripts/cache-genius-list.mjs` and `ops cache-genius-list` so `/go` cache checks no longer fail as a missing command | Done |
| Render the canonical HUMAN PRESSURE startup block at zero pressure so the brief validator is clean and truthful | Done |
| Repair the advance-week Playwright smoke for expected GM Decision prompts without treating the expected modal as a hung advance-week simulation | Done |
| Keep launch readiness blocked on evidence: on-domain email forwarding and post-push public route/domain state still need verification before SPARKED | Done |

**Verification:** `npm test` 172/172 · `npm run test:ui` 9/9 · `node --test test/browser-wiring.test.js test/studio-protocol-smoke.test.js test/session8-endpoints.test.js` 34/34 · `npm run build:pages` · `npm run smoke:pages` · `node scripts/check-windows-hide.mjs` · `node scripts/check-canon-044-waves.mjs` · startup brief validation · secrets audit · blocker preflight.

**Still blocked:** do not mark SPARKED until `football@playfranchisearchitect.com` forwarding/copying is verified and the pushed public routes/domain evidence are checked after deployment.

## Session 28 — Launch Evidence + Tutorial Truth Arc (2026-07-01)

| Item | Status |
|------|--------|
| Inject first-run tutorial styles through the app bootstrap so the tutorial overlay is real browser UI, not dead exported code | Done |
| Correct `context/STUDIO_MANIFEST.json` launch posture from `SPARKED` to `FORGE` while public launch blockers remain open | Done |
| Add `scripts/launch-evidence-report.mjs` and `ops launch-evidence` so route/email launch readiness is evidence-gated | Done |
| Exhaust latest-audit innovation-pack follow-through after Session 28 implementation | Done |

**Still blocked:** Launch/SPARKED is blocked until `football@playfranchisearchitect.com` forwarding/copying to Studio operations is verified with real delivery evidence and the public route smoke remains green after push.

## Session 29 — Saturated Genius Arc: Story, Retention, Sim Depth + Truth Repairs (2026-07-01)

Source: `docs/AUDIT_2026-07-01_SESSION29.md` (17 ranked items, combined priority 280.1). Ladders in the JSON sidecar.

| Item | Status |
|------|--------|
| time-capsule-receipts — preseason predictions graded by the Season Epilogue with reporter self-roast | Done |
| return-hook-digest — zero-backend "While you were away" digest + attention badge for lapsed saves | Done |
| narrative-continuity-engine — press-conference memory + narrative events feeding morale/hot-seat | Done |
| what-if-replay — once-per-season non-canon Monday Morning QB replay of the most painful loss | Done (Session 30) |
| situational-playcalling — down/distance/clock playcall leans, 4th-down brain, game-plan tendencies | Done |
| scouting-skill-reveal — scouting allocation drives pro-day reveal precision + gated flags | Done |
| genius-cache-truth — cache status must read the Execution Log, not mtimes/prose substrings | Done |
| orphan-test-shards — shard the 5 unsharded test files + no-orphan guard | Done |
| landing-front-door — un-orphan landing.html (links + sitemap + CTA + compliance test) | Done |
| launch-evidence-redirect-truth — follow redirect chains; judge final status | Done |
| test-spawn-window-guard — safe-spawn in studio smoke test + guard scan root includes test/ | Done |
| tabs-aria-modal-focus — ARIA tab semantics, shared modal focus manager, 44px touch targets | Done |
| silent-error-surfacing — panelGuard() inline failure states replacing empty catch blocks | Done (Session 30) |
| ci-deploy-gating — fast test prerequisite inside deploy workflows | Done |
| determinism-smoke-on-push — fast same-seed comparison test in a push-path shard | Done |
| theme-parity-static-pages — shared theme bootstrap across static pages | Done |
| service-scaffold-honesty — truth-align or prove the stalled service extraction | Done (Session 30) |

**Notes:**
- tabs-aria-modal-focus: ARIA tab semantics (roles, aria-selected sync, roving tabindex, 44px touch targets) are fully wired. `modalManager.js` is a complete, tested focus-trap/Escape/restore utility but is not yet adopted at each of the 14 modal call sites in `public/app.js` — ready-to-adopt follow-up, not silently claimed as fully wired.
- Session 30 follow-through: what-if-replay, silent-error-surfacing, and service-scaffold-honesty are now shipped and verified. The historical Session 29 deferral was honest; it is no longer current open work.
## Session 30 — Deferred Genius Follow-Through + UI Truth Repair (2026-07-02)

Source: carried items from `docs/AUDIT_2026-07-01_SESSION29.md` plus `docs/INNOVATION_PACK.md` latest-audit follow-through.

| Item | Status |
|------|--------|
| what-if-replay — non-canon Monday Morning QB replay for the controlled team's most painful archived loss | Done |
| silent-error-surfacing — visible panel failure states for season arcs, mentorship, cap war room, records, archetypes, sim-watch, and background spotlight hydration | Done |
| service-scaffold-honesty — bind service bundle on GameSession and truth-align service extraction docs/comments | Done |
| return-digest-overlay-truth — Playwright-caught blocking overlay converted to non-modal status UI so navigation is never trapped | Done |
| latest-audit-follow-through innovation-pack candidate | Done |

**Verification:** `npm test` 273/273 · `npm run test:ui` 9/9 · `npm run build:pages` · `npm run smoke:pages` · `node scripts/check-windows-hide.mjs` · `node scripts/check-canon-044-waves.mjs` · startup brief validation · secrets audit · blocker preflight · canon conformance 0 gaps.

**Still blocked:** Launch/SPARKED remains blocked until `football@playfranchisearchitect.com` forwarding/copying to Studio operations is verified with real delivery evidence and post-push public route/domain state remains green.

## Session 32 — Tutorial Focus Trap + Launch Evidence Closeout (2026-07-02)

Source: `docs/AUDIT_2026-07-02_SESSION32.md`.

| Item | Status |
|------|--------|
| tutorial-focus-trap-adoption — first-run tutorial overlay uses shared modal focus trap and closes it before skip/complete removal | Done |
| latest-audit-follow-through — re-check Session 29/30 queue before new work | Rejected on evidence — already exhausted |
| sparked-flip — public launch status change | Blocked — missing real on-domain email forwarding/copying receipt |

**Verification:** focused browser/modal 16/16; named default shards 275/275 (core 64, runtime 110, sim-contract 63, sim-realism 1, studio 37); Playwright UI 9/9 on rerun; Pages build/smoke; cache check; windows-hide; Wave guard; startup brief validation; secrets audit; blocker preflight; canon conformance 0 gaps; release/cost gates allow under registry slug `vaultspark-football-gm`; live routesOk=true but launch evidence remains blocked on email proof.

## Session 33 — Premium Visual Theme Overhaul (2026-07-02)

Source: founder goal — "fix the entire visual website theme; the color scheme is not readable and is all conflicting; premium elite UX, cohesive UI, engaging feel, real user loop working end-to-end across all modes and through saves/load."

| Item | Status |
|------|--------|
| light-theme-broken-fix — light mode rendered dark panels/topbar/sidebar/hero with dark text (invisible); introduced surface-token system + complete [data-theme=light] override via reviewable codemod | Done |
| conflicting-accents-fix — overview identity labels routed off raw --team-secondary (alarm-red) onto cohesive --section-accent-strong; per-tab section accents given readable light values | Done |
| identity-object-object-bug — overview IDENTITY card no longer renders [object Object] (scheme fallback string-guarded) | Done |
| svg-mime-logo-bug — dev server served .svg as octet-stream so brand logo was a broken image; added image/font MIME types | Done |
| theme-regression-coverage — tests-ui/theme.spec.js (4) asserts opposite-luminance text/surface per theme, no [object Object], theme persists across reload | Done |
| end-to-end-loop-verification — full user loop incl. save/load re-verified green in both themes | Done |

**Verification:** node shards 275/275 (core 64, runtime 110, sim-contract 63, sim-realism 1, studio 37); Playwright UI 13/13 (9 existing incl. scouting-lock save/load persistence + 4 new theme); npm run build:pages; npm run smoke:pages. Visual QA via scripts/capture-theme.mjs across all tabs + setup + marketing pages in both light and dark.

**Still blocked:** Launch/SPARKED remains blocked only on real football@playfranchisearchitect.com forwarding/copying delivery evidence (unchanged). Follow-up (non-blocking): harmonize the blue-branded landing marketing page (public/landing.html) with the app gold/teal brand language for full cross-page cohesion.

## Session 33 part 2 — Live cache-bust + Theme Customizer + JSON-LD (2026-07-02)

Source: founder follow-up (live screenshot still dark-on-dark) + "build the theme design customization changer button" + "check website scaffolding via vaultspark-studio-ops."

| Item | Status |
|------|--------|
| live-theme-cache-bust — content-hashed styles.<hash>.css in build-pages.mjs so Cloudflare 4h edge cache (ignores query strings) can never serve stale theme after deploy | Done |
| theme-customizer-control — popover button: Appearance (System/Light/Dark) + 5 theme-aware Accent presets, persisted + pre-paint restore; replaces single toggle in setup + game | Done |
| primary-cta-accent-driven — btn-primary no longer hardcodes gold; light-mode white text keeps all presets legible | Done |
| jsonld-scaffolding — VideoGame JSON-LD on index + landing; studio-ops sitemap audit 9/10 -> 10/10 | Done |
| vendored-mirror-sync | Skipped — vaultsparkstudios.com/vaultspark-football-gm 403s (not served) + stale engine-only mirror; playfranchisearchitect.com uses this repo's Pages |

**Verification:** node shards 275/275; Playwright UI 15/15 (incl. 6 theme tests + save/load persistence); build:pages; smoke:pages; studio-ops sitemap audit 10/10.

## Session 34 — Launch Truth + Theme Customizer Accessibility (2026-07-03)

Source: `docs/AUDIT_2026-07-03_SESSION34.md`.

| Item | Status |
|------|--------|
| launch-readiness-email-gate-row — show the real on-domain email receipt gate in Launch Readiness and beta feedback, with current `playfranchisearchitect.com` copy | Done |
| theme-customizer-keyboard-polish — `aria-controls`, focus handoff/restore, and arrow/Home/End navigation for Appearance/Accent controls | Done |
| latest-audit-follow-through | Rejected on evidence — latest Session 32 audit already exhausted |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt and current live origin/routing evidence |

**Verification:** focused launch/feedback tests 10/10; Playwright theme 7/7; default `npm test` 276/276; Playwright UI 16/16; Pages build/smoke; sitemap compliance 10/10; release/cost gates; canon conformance 0 gaps; windows-hide; Wave guard; secrets audit; blocker preflight; PROJECT_STATUS SIL invariant clean.

## Session 35 — Modal Contract Completion + Inbox Truth

Source: `docs/AUDIT_2026-07-03_SESSION35.md`.

| Item | Status |
|------|--------|
| modal-contract-completion — finish shared modalManager lifecycle across high-frequency game overlays and add missing dialog semantics | Done |
| priority-inbox-modal-truth — make the Priority Inbox drawer's `aria-modal` claim truthful with focus trapping/restoration | Done |
| latest-audit-follow-through | Rejected on evidence — Session 34 audit cache and execution log are exhausted |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt and current live origin/routing evidence |

**Verification:** default `npm test` 278/278; Playwright UI 16/16; focused modal wiring 8/8; modal manager 10/10; Pages build/smoke; sitemap compliance 10/10; release/cost gates; canon conformance 0 gaps; windows-hide; Wave guard; secrets audit; blocker preflight.

## Session 36 — Tutorial Theme Parity + Genius Cache Exhaustion

Source: `docs/AUDIT_2026-07-04_SESSION36.md`.

| Item | Status |
|------|--------|
| tutorial-theme-token-parity — first-run tutorial overlay/modal/choices inherit the shared light/dark/accent theme token system | Done |
| tutorial-light-readability-regression — Playwright proves the first-run tutorial is readable in light mode | Done |
| latest-audit-follow-through | Rejected on evidence — Session 35 audit cache and execution log are exhausted |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt despite live routesOk=true |

**Verification:** default `npm test` 278/278; Playwright UI 17/17; focused browser wiring 8/8; focused theme 8/8; Pages build/smoke; genius cache exhausted 0 open; windows-hide; Wave guard; secrets audit; blocker preflight.

## Session 37 — Mobile Pressure Stack Recovery Closeout

Source: `docs/AUDIT_2026-07-04_SESSION37.md`.

| Item | Status |
|------|--------|
| mobile-pressure-stack — mobile mode surfaces source-derived owner, fan, cap, injury, deadline, headline, or calm-state pressure above the decision deck | Done |
| mobile-pressure-navigation-affordance — pressure cards are buttons that route to the relevant tab and emit `vsfgm:mobile-pressure` for future telemetry/tests | Done |
| latest-audit-follow-through | Rejected on evidence — Session 36 audit/cache are exhausted |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt despite live routesOk=true |

**Verification:** direct default shards 280/280 (core 64, runtime 115, sim-contract 63, sim-realism 1, studio 37); focused mobile-loop 7/7; `node --check public/lib/mobileLoop.js`; doctor returned no items. The aggregate `npm test` wrapper timed out twice and is not counted as green.
## Session 38 — Mobile GM Decision First (2026-07-04)

| Item | Status |
|------|--------|
| Generate a fresh live-code audit after Session 37 recovery closeout | Done |
| Surface pending `/api/gm-decision` prompts as the first mobile decision card | Done |
| Refresh mobile pending-decision state while mobile mode is active in regular season | Done |
| Add focused mobile-loop/app-shell regression coverage | Done |

**Verification:** direct default shards 282/282 (core 64, runtime 117, sim-contract 63, sim-realism 1, studio 37), focused mobile-loop 9/9, `node --check public/lib/mobileLoop.js`, `node --check public/app.js`, Pages build/smoke, doctor no items, windows-hide, Wave guard, secrets audit, blocker preflight.

**Still blocked:** Launch/SPARKED remains evidence-gated until `football@playfranchisearchitect.com` forwarding/copying is verified with a real received-message receipt and current live origin/routing proves `playfranchisearchitect.com` serves the latest build.

## Session 39 — Mobile Inline GM Decision Choices

Source: `docs/AUDIT_2026-07-04_SESSION39.md`.

| Item | Status |
|------|--------|
| Generate a fresh live-code audit after confirming the Session 38 queue was exhausted | Done |
| Render pending `/api/gm-decision` option choices inline inside the mobile decision deck | Done |
| Submit selected mobile choices through the existing `/api/advance-week` `gmDecisionChoice` consequence path | Done |
| Add focused mobile-loop/app-shell regression coverage | Done |
| latest-audit-follow-through innovation candidate | Done |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt and current live-origin/routing evidence |

**Verification:** `node --check public/lib/mobileLoop.js`, `node --check public/app.js`, focused `node --test test/mobile-loop.test.js` 10/10, default `npm test` 283/283, Playwright UI 17/17, Pages build/smoke, doctor no items, windows-hide, Wave guard, secrets audit, blocker preflight, genius cache exhausted 0 open.

**Still blocked:** Launch/SPARKED remains evidence-gated until `football@playfranchisearchitect.com` forwarding/copying is verified with a real received-message receipt and current live origin/routing proves `playfranchisearchitect.com` serves the latest build.

## Session 40 — Mobile GM Decision Truth Guard

Source: `docs/AUDIT_2026-07-04_SESSION40.md`.

| Item | Status |
|------|--------|
| Generate a fresh live-code audit after confirming the Session 39 queue was exhausted | Done |
| Guard mobile `/api/gm-decision` refreshes with a phase/year/week/team snapshot so stale async results cannot repaint the current mobile deck | Done |
| Clear and repaint stale pending mobile decisions when the decision refresh fails | Done |
| Second-order innovation: use quote-safe `_escAttr()` for generated mobile overlay data attributes/classes | Done |
| latest-audit-follow-through innovation candidate | Done |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt and current live-origin/routing evidence |

**Verification:** `node --check public/lib/mobileLoop.js`, `node --check public/app.js`, focused `node --test test/mobile-loop.test.js` 12/12, default `npm test` 285/285, Playwright UI 17/17, Pages build/smoke, doctor no items, windows-hide, Wave guard, secrets audit, blocker preflight, genius cache exhausted 0 open.

**Still blocked:** Launch/SPARKED remains evidence-gated until `football@playfranchisearchitect.com` forwarding/copying is verified with a real received-message receipt and current live origin/routing proves `playfranchisearchitect.com` serves the latest build.


## Session 41 — Mobile GM Fallback Actionability

Source: `docs/AUDIT_2026-07-04_SESSION41.md`.

| Item | Status |
|------|--------|
| Generate a fresh live-code audit after confirming the Session 40 queue was exhausted | Done |
| Route generic mobile `choose-gm-decision` cards through the existing GM Decision modal and consequence path | Done |
| Add focused mobile-loop/app-shell regression coverage for the fallback event binding | Done |
| latest-audit-follow-through innovation candidate | Done |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt and current live-origin/routing evidence |

**Verification:** `node --check public/app.js`, `node --check public/lib/mobileLoop.js`, focused `node --test test/mobile-loop.test.js` 12/12, default `npm test` 285/285, Playwright UI 17/17, Pages build/smoke, doctor no items, windows-hide, Wave guard, secrets audit, blocker preflight, cache check fresh/exhausted, and canon conformance 0 gaps.

**Still blocked:** Launch/SPARKED remains evidence-gated until `football@playfranchisearchitect.com` forwarding/copying is verified with a real received-message receipt and current live origin/routing proves `playfranchisearchitect.com` serves the latest build.

## Session 42 — Audit Sampler + Genius List Truth

Source: `docs/AUDIT_2026-07-06_SESSION42.md`.

| Item | Status |
|------|--------|
| Generate fresh infrastructure-rubric audit after Session 41 queue exhaustion | Done |
| sample-codebase-protocol-sampler — add deterministic `scripts/sample-codebase.mjs` for `/audit` live-code sampling | Done |
| ops-genius-list-cache-bridge — make `node scripts/ops.mjs genius-list` emit the cache-backed latest-audit queue instead of a dead-end message | Done |
| latest-audit-follow-through innovation candidate | Done |
| compound refinement — assert `ops genius-list` emits parseable cache JSON | Done |
| sparked-flip | Blocked — still missing real `football@playfranchisearchitect.com` forwarding/copying receipt and current live-origin/routing evidence |

**Verification:** syntax checks for touched scripts/tests; focused studio smoke 18/18; default `npm test` 287/287; Playwright UI 17/17; Pages build/smoke; windows-hide; Wave guard; secrets audit; blocker preflight; genius cache exhausted 0 open; canon conformance 0 gaps.

## Session 43 — Draft Prospect Backstory Pressure

Source: docs/AUDIT_2026-07-06_SESSION43.md.

| Item | Status |
|------|--------|
| Generate fresh live-code audit after confirming Session 42 queue exhaustion | Done |
| prospect-backstory-pressure-read — deterministic proving-ground and pressure-trait backstory for draft prospects | Done |
| Surface prospect backstory in Draft War Room target cards | Done |
| latest-audit-follow-through | Rejected on evidence — Session 42 audit/cache were already exhausted |
| sparked-flip | Blocked — still missing real football@playfranchisearchitect.com forwarding/copying receipt and current live-origin/routing evidence |

**Verification:** direct shards 288/288 (core 64, runtime 121, sim-contract 63, sim-realism 1, studio 39); focused draft-war-room 4/4; Playwright UI 17/17; Pages build/smoke; windows-hide; Wave guard; secrets audit; blocker preflight; genius cache exhausted 0 open.

## Session 44 — Deadline Offer Ritual

Source: `docs/AUDIT_2026-07-06_SESSION44.md`.

| Item | Status |
|------|--------|
| Generate fresh live-code audit after confirming Session 43 queue exhaustion | Done |
| deadline-offer-ritual — deterministic structured Trade Deadline Frenzy offers with partner, need, ask, cap, rule, and risk fields | Done |
| deadline-action-accessibility-refinement — second-order offer action metadata and `aria-label` coverage | Done |
| latest-audit-follow-through | Rejected on evidence — Session 44 audit/cache were already exhausted after implementation |
| sparked-flip | Blocked — still missing real football@playfranchisearchitect.com forwarding/copying receipt and current live-origin/routing evidence |

**Verification:** direct shards 292/292 (core 64, runtime 125, sim-contract 63, sim-realism 1, studio 39); focused trade-deadline-frenzy 4/4; Playwright UI 17/17; Pages build/smoke; windows-hide; Wave guard; secrets audit; blocker preflight; canon conformance 0 gaps; release/cost gates allowed cost-neutral; doctor no items.

## Session 45 — League Story Card Export

| Item | Status |
|---|---|
| Generate fresh live-code audit after confirming Session 44 queue exhaustion | Done |
| league-story-card-export — visible zero-backend League Story Card derived from dashboard champion, record, awards, leaders, cap, General Manager legacy, and time-capsule receipts | Done |
| league-story-card-wiring-regression-net — browser wiring and shard coverage prove the new export path is included in CI/default shards | Done |
| latest-audit-follow-through | Done — accepted and completed via live code re-check plus regression-net hardening |
| launch/SPARKED email and live-origin evidence | Blocked on real received-message receipt plus current live origin/routing proof; no code-side fabrication attempted |
## Session 46 — Player Truth, Usage Realism, and Broadcast Depth

| Item | Status |
|---|---|
| Trusted Tell the Commissioner popup/navigation contract | Done |
| Availability-aware OVR/POT/fit/morale snap engine | Done |
| Healthy QB1/K1/P1 100% role volume with injury substitution/restoration | Done |
| Potential beside Overall across player surfaces and APIs | Done |
| Expanded observed team/player box-score statistical matrix | Done |
| Living player dossiers with personalized bios, facts, achievements, and traits | Done |
| Static button/action contract inventory and Agent Negotiation ID repair | Done |
| Second-order broadcast Impact Index and quarter command center | Done |
| Second-order position-aware career milestone questlines | Done |

**Verification:** direct canonical shards 317/317 (core 64, runtime 146, sim-contract 67, sim-realism 1, studio 39); Playwright 18/18; focused Session 46 suites 24/24; JavaScript syntax checks; Pages build/smoke; windows-hide; Wave guard; secrets audit; blocker preflight; canon conformance 0 gaps; release/cost gates allow cost-neutral; doctor no items; genius cache exhausted 0 open.

## Session 47 — Decision Authority + Fast-Sim Checkpoints (2026-07-16)

Source: `docs/AUDIT_2026-07-15_SESSION47.json`.

| Item | Status |
|---|---|
| audit-renderer-protocol-bridge | Done — deterministic sidecar validation/render/check path with focused tests |
| startup-brief-truth-contract | Done — modern SIL/profile/compliance/cost/Genius sources render truthfully |
| save-scoped-franchise-inbox | Done — per-franchise persistence, idempotent reconstruction, unread and resolution state |
| matchup-aware-tactical-film-room | Done — opponent-aware pregame brief plus source-derived postgame receipt |
| gm-decision-commitment-engine | Done — safe immediate actions or measurable expiring obligations with receipts and consequences |
| checkpoint-aware-fast-sim | Done — material checkpoint classifier, digest, pause, and one-action resume |
| latest-audit-follow-through | Done — live execution log/code/tests rechecked; Genius cache exhausted 0 open |
| runtime-switch-stale-save-guard | Done — second-order Playwright-discovered cross-runtime race fixed and verified |
| launch/SPARKED evidence | Blocked — requires real received-message proof plus current live-origin proof; no fabrication |

**Verification:** direct canonical shards 337/337 (core 64, runtime 162, sim-contract 67, sim-realism 1, studio 43); focused consequence/checkpoint 10/10; Playwright 18/18; Pages build/smoke; syntax/integrity sweep; doctor no items with `blockingFailing: 0`; Genius cache exhausted 0 open. Aggregate `npm test` produced no output for five minutes and is not counted as green.

## Session 48 — Rehab Authority, Secure Sync, and Lifecycle Truth (2026-07-16)

Source: `docs/AUDIT_2026-07-16_SESSION48.json`.

| Item | Status |
|---|---|
| injury-authority-rehab-command | Done — one recovery authority, facilities/age/reinjury probability, three persistent rehab plans, dual-runtime API, responsive command center, clearance receipts |
| lifecycle-source-coherence-guard | Done — machine contract, checker, doctor/studio coverage, local FORGE truth, signed Ark correction request |
| secure-gist-sync-custody | Done — memory/tab-only token custody, legacy cleanup, bounded import, integrity verification, accurate privacy copy |
| rehab-comeback-journal | Done — source-derived clearance events publish into the canonical Priority Inbox ledger |
| live-doctor-freshness | Done — `doctor --update-json` writes live lifecycle health through the SIL-invariant status writer |
| offseason-progress-fence | Done — stale-index camp-cut loop root-fixed with batched indexes and truthful progress/stall receipts |
| authority-preserving-runtime-transport | Done — established server sessions cannot silently fork to local state on transient timeout |
| latest-audit-follow-through | Rejected on evidence — latest audit execution log and live code agree; report churn would add no value |
| launch/SPARKED flip | Deferred honestly — live routes pass, but no real project-domain email forwarding/copying receipt exists |

**Verification:** direct canonical plus long shards 358/358 (core 64, runtime 175, sim-contract 68, sim-realism 1, long 3, studio 47); Playwright 18/18; Pages build/smoke; live routes 8/8; sitemap 10/10; current-repo secret scan 0; canon conformance 0 gaps; Windows/Wave guards green; doctor `blockingFailing: 0`; Genius cache exhausted 0 open.

## Session 49 — Release, Runtime, Persistence, and Hydration Authority (2026-07-19)

Source: `docs/AUDIT_2026-07-19_SESSION49.json`.

| Item | Status |
|---|---|
| public-origin-release-contract | Done — canonical identity, repository links, health/deploy/footer/parity/rollback/provenance evidence; external gates stay red |
| weekly-command-parity-envelope | Done — one validated executor across both adapters, deterministic receipts, tactic cleanup, fallback coalescing |
| save-compatibility-integrity-boundary | Done — version/shape/integrity transaction, stable recovery envelopes, legacy compatibility, active-league preservation |
| hydration-authority-epochs | Done — authority/filter/sequence fences plus visible actual-discard telemetry and Playwright root fix |
| release-provenance-attestor | Done — exact live revision, hashed asset, repository, health, and launch-truth comparison |
| transactional-save-preflight | Done — read-only compatibility inspection before local-file and Gist imports |
| latest-audit-follow-through | Done — rendered sidecar and Genius cache agree at 0 open / 4 closed |
| launch/SPARKED evidence | Deferred honestly — requires complete live edge headers, real on-domain forwarding receipt, and sibling registry reconciliation |

**Verification:** aggregate canonical suite 370/370 with direct exit 0; long-run 3/3; Playwright 18/18; Pages build/smoke; Windows/Wave guards; canon conformance 51 applicable/0 gaps; blocker preflight empty; doctor `blockingFailing: 0`; Ark receipt `01JTUQRA8780576DEF65968F04`.

## Session 50 — Decision, Transaction, Diagnostics, and Deploy-Mount Authority (2026-07-20)

Source: `docs/AUDIT_2026-07-20_SESSION50.json`.

| Item | Status |
|---|---|
| gm-decision-authority-contract | Done — one scoped occurrence authority across every runtime, decision surface, defer path, and Commissioner retry |
| atomic-weekly-command-transaction | Done — clone-then-commit session promotion plus keyed single-flight browser mutations |
| browser-degradation-ledger | Done — bounded sanitized diagnostics, visible Settings/status truth, retry/clear/events |
| browser-module-reachability-guard | Done — 39 reachable modules, orphan fixtures block, three proven orphans removed |
| revision-stamped-responsive-evidence | Done — 20 dark/light mobile/tablet/desktop captures; overflow, contrast, runtime errors, and touch targets green |
| production-asset-mount-contract | Done — `/games/franchise-architect/` CSS/JS/favicon emitted and every manifest mount MIME-verified |
| commissioner-transaction-authority-refinement | Done — refusal is non-mutating, gate reopens, valid retry reports committed state |
| responsive-root-cause-ranking | Done — evidence ranks widest offenders and shared grid/table constraints are corrected |
| latest-audit-follow-through | Done — audit JSON, Markdown execution log, Innovation Pack, Genius cache, and live tests agree |
| launch/SPARKED evidence | Deferred honestly — requires complete edge headers, received on-domain forwarding proof, current deploy provenance, and sibling-owned registry reconciliation |

**Verification:** full canonical Node suite 390/390 with direct exit 0; Playwright 18/18; Pages build plus all-mount MIME smoke; responsive evidence 20/20 captures; no new dependency or variable-cost service.

**Apex follow-up:** revision `f5ecde2` and Pages run `29805477684` are green with mount-relative assets. The separate `VaultSparkStudios.github.io` Cloudflare Pages copy still serves the stale hard-coded base; Ark receipt `01JU1K4LB3C3400F371FD77B32` requests the sibling-owned full-mount ingestion. Live styling is not claimed fixed until that deploy lands.

## Session 51 — Progression, Onboarding, Runtime, and Public-Boundary Truth (2026-07-21)

Source: `docs/AUDIT_2026-07-21_SESSION51.json`.

| Item | Status |
|---|---|
| public-process-ledger-quarantine | Done — forbidden private CDR path removed; focused test 8/8; live post-index sanitization scan 0 critical / 0 warning |
| gm-legacy-truth-engine | Done — title records credit once; progress derives from tier authority; +4 earned destination pull reaches the controlled-team offer command; recognition-only benefits say so; 48 focused tests pass |
| browser-promise-observability-contract | Done — 39 modules / 0 unallowlisted parameterless catches; truthful fallbacks plus sanitized retry-aware ledger; Pages build and Studio 59/59 pass |
| consequence-bearing-franchise-contract | Done — all nine choices reach real scheme/owner/scouting state; versioned receipt is persisted/idempotent; no prospect fabricated; final tutorial + Overview visible; 27 focused tests pass |
| dual-runtime-route-authority | Done — 111 contracts cover 140 browser calls and both adapters; all 26 enabled server gaps are closed; live shape/state parity passes 3/3; rewind and DELETE CORS drift are fixed |
| opening-contract-response-attestation | Done — first-run receipt/state success shape now fails closed and passes live server/static parity in the 3-test route-contract suite |
| launch/SPARKED evidence | Deferred honestly — live staging/origin/email/edge/approval/registry evidence remains incomplete and sibling-owned where noted |
## Session 52 — Agency, Command Parity, Evidence Authority, and Playtest Truth (2026-07-21)

Source: `docs/AUDIT_2026-07-21_SESSION52.json` plus generated `docs/INNOVATION_PACK.md`.

| Item | Status |
|---|---|
| controlled-draft-agency-checkpoint | Done — accelerated simulation stops at controlled picks and offseason stages; explicit Finish Draft remains the only delegation path |
| mobile-weekly-intent-parity | Done — mobile stages decisions without mutation and shares the desktop tactic-plus-decision weekly command coordinator |
| opening-contract-playable-prologue | Done — source-derived pressure→plan→actual-result receipt survives save/restore and uses the production weekly flow |
| single-task-board-parser-authority | Done — local, cross-repo, and Genius cache readers share one normalized latest-status authority |
| same-origin-staging-receipt-authority | Done — fixture-tested staging command rejects unreachable/cross-origin or identity-mismatched receipts; live staging remains red |
| local-playtest-receipt-loop | Done — explicit 1–5 clarity/agency/pace/return receipts stay local, bounded, anonymous, exportable, and attach only by player choice |
| truthful-bundle-fallback | Done — absent esbuild now executes and verifies canonical Pages build instead of exiting 0 without an artifact |
| retire-dead-v5-renderer-path | Done — removed two branches to nonexistent render-startup-brief-v5.mjs and locked the invariant in tests |
| latest-audit-follow-through | Done — live code, focused tests, audit execution log, and Genius cache agree at 0 open audited items |
| Pages custom-domain cert remediation | Done — stale June certificate diagnosis superseded; current blocker is unreachable revision-stamped staging evidence, not the old certificate claim |
| vendored-mirror-sync | Done — rejected on evidence; sibling mirror is not the canonical served product and is not edited to make this repo green |
| sparked-flip | Deferred honestly — no reachable same-origin staging receipt, current canonical provenance/edge evidence, real received-message receipt, or founder launch approval |
| launch/SPARKED email and live-origin evidence | Deferred honestly — Brevo credential files exist, but inbound mailbox connection/verification is an interactive provider flow and no received-message proof exists; no fabrication |

**Focused verification:** parser 22/22; draft/checkpoint 14/14; mobile/browser 24/24; opening prologue/start scenario 9/9; playtest/feedback/studio innovation 31/31; canonical bundle fallback produced the Pages artifact with direct exit 0.

---

## Session 53 — Infrastructure-grade public game arc (2026-07-22)

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Infrastructure / transactional integrity / observability | Done | 2.0h | post-commit-hydration-truth |
| FIRE | Infrastructure / test truth / automation | Done | 1.5h | direct-test-receipt-authority |
| FIRE | Game depth / progression / tactical identity | Done | 3.0h | tactical-identity-arc |
| FIRE | UI/UX / command clarity / desktop-mobile parity | Done | 2.5h | shared-franchise-command-center |
| HIGH | Feedback loop / privacy / evidence quality | Done | 2.0h | contextual-evidence-moments |
| HIGH | Legal/IP / public compliance | Done | 0.5h | exact-proprietary-footer-contract |

Premises and implementation recipes: docs/AUDIT_2026-07-22_SESSION53.json (sole source of truth).

## Session 53 — Second-order innovation saturation

| Rank | Candidate | Status | Evidence |
|---:|---|---|---|
| S53-I1 | Explainable command authority | Done | Deterministic reason codes, rationale, and versioned command receipts |
| S53-I2 | Tactical execution preview | Done | Staged calls preview identity direction; only execution mutates film |
| S53-I3 | Local evidence trend | Done | Three-sample floor plus small/self-selected/non-causal warnings |
| S53-I4 | Innovation-premise integrity | Done | Comment-only scanner with fixture exclusions and regression coverage |
| S53-I5 | Public-boundary cleanup | Done | Unreachable private-policy broker removed from public tree |
| S53-I6 | Launch evidence bundle | Deferred honestly | Hosted revision/health/headers, CI 5/5, received email, approval, and registry reconciliation remain incomplete |

Unified Genius List: **0 open / 6 primary closed**. Viable second-order innovation list: **0 open / 5 closed**.

## Session 54 — Source Authority and Franchise Architecture (2026-07-23)

Source: `docs/AUDIT_2026-07-23_SESSION54.json`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Infrastructure / observability / source authority | Done S54 | 2.0h | session-truth-coherence-authority |
| FIRE | Game depth / learning loop / observability | Done S54 | 3.0h | architect-ledger |
| FIRE | Progression / UI-UX / command clarity | Done S54 | 2.5h | three-horizon-blueprint |
| HIGH | Infrastructure / decomposition / contract authority | Done S54 | 2.0h | contract-service-cap-authority |
| HIGH | Legal-IP / branding / public compliance | Done S54 | 0.75h | studio-linkback-all-routes |

## Session 54 - Second-order innovation saturation

| Rank | Candidate | Status | Evidence |
|---:|---|---|---|
| S54-I1 | Adaptation loop closure | Done | Latest committed next-adaptation informs the non-blocking Now horizon without displacing command authority |
| S54-I2 | Non-causal decision-memory signal | Done | Bounded tactic consistency and film alignment with sample size, honest empty state, and explicit no-causation copy |

Unified Genius List: **0 open / 5 primary closed**. Viable second-order innovation list: **0 open / 2 closed**.

## Session 55 — Infrastructure, Architect Policy, and Mastery (2026-07-23)

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Game loop / command parity / observability | Done S55 | 3.0h | fast-sim-architect-policy |
| FIRE | Infrastructure / game depth / domain authority | Done S55 | 4.0h | coaching-lineage-authority |
| FIRE | Progression / engagement / source-derived intelligence | Done S55 | 3.0h | architect-mastery-portfolio |
| FIRE | Infrastructure / parser authority / model routing | Done S55 | 1.5h | session-intent-task-authority |
| FIRE | Infrastructure / CI observability / security | Done S55 | 0.5h | realism-workflow-exit-truth |

## Session 55 — Second-order innovation saturation

| Rank | Candidate | Status | Evidence |
|---:|---|---|---|
| S55-I1 | Adaptive Architect checkpoint | Done | Regular-season checkpoint continuation reopens the scoped plan for reinforce/change/remove |
| S55-I2 | Mastery focus coach | Done | Lowest evidence path and next receipt milestone are explicit; strongest signature remains separate |

Unified Genius List: **0 open / 5 primary closed**. Viable second-order innovation list: **0 open / 2 closed**.
Launch remains **HOLD** on external hosted/email/edge/approval/registry evidence; no launch evidence was fabricated.

## Session 58  -  Exact franchise scope and return continuity (2026-07-26)

Source: `docs/AUDIT_2026-07-26.json`.

| Tier | Category | Status | Item |
|---|---|---|---|
| FIRE | Infrastructure / async authority / observability | Done S58 | exact-franchise-authority-epoch |
| FIRE | Infrastructure / privacy / browser persistence | Done S58 | franchise-scoped-browser-memory |
| FIRE | Engagement / progression / UI-UX | Done S58 | actionable-return-horizon |
| HIGH | Game loop / evidence / product truth | Done S58 | falsifiable-game-loop-contract |

## Session 58  -  Second-order innovation saturation

| Rank | Candidate | Status | Evidence |
|---:|---|---|---|
| S58-I1 | Semantic innovation candidate dedup | Done S58 | Four launch-evidence wording variants collapse into one canonical gate with merged provenance and an explicit duplicate count |
| S58-I2 | Franchise-scope contract guard | Done S58 | Static regression contract covers app authority plus tutorial, Return Digest, and trade-block persistence owners |
| S58-I3 | Truthful Return target fallback | Done S58 | Exact panel focus and tab-only fallback produce distinct source-true messages |
| S58-I4 | Launch readiness evidence gate | Deferred honestly | Hosted revision/asset parity, edge health/headers, received email, approval, and lifecycle evidence remain incomplete; no fabrication |

Unified Genius List: **0 open / 4 primary closed**. Viable second-order innovation list: **0 open / 3 closed**.

## Session 59 — Consent, Plan Rehearsal, and Demand Hydration (2026-07-27)

Source: `docs/AUDIT_2026-07-27.json`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Feedback loop / privacy / observability truth | Done S59 | 2.0h | consented-feedback-receipt-boundary |
| HIGH | Security / resilience / static-host input boundary | Done S59 | 1.0h | bounded-challenge-code-parser |
| FIRE | Game depth / UI-UX / explainable intelligence | Done S59 | 3.5h | architect-plan-rehearsal |
| FIRE | Speed / organization / request authority | Done S59 | 3.0h | tab-demand-hydration-authority |

### Session 59 — second-order innovation wave

| Tier | Category | Status | Item |
|---|---|---|---|
| FIRE | Self-validating request authority | Done S59 | hydration-topology-sentinel |
| HIGH | Privacy / bounded disclosure | Done S59 | feedback-disclosure-budget |
| HIGH | Explainable feedback loop | Done S59 | rehearsal-provenance-loop |
| FIRE | Test truth / CI ownership | Done S59 | truthful-shard-termination-and-ownership |

## Session 60 — Canonical Truth and Player-Authored Architecture (2026-07-28)

Source: `docs/AUDIT_2026-07-28.json`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Security / credential truth / observability | Done S60 — canonical map fallback, local override, and corrupt-map fail-loud fixtures 3/3; live Brevo/Cloudflare status matches canonical authority | 1.5h | canonical-capability-map-authority |
| FIRE | Game depth / progression / explainable intelligence | Done S60 — player-selected focus remains distinct from the recommended-lowest path; source-bound adaptation hypotheses persist through both adapters, surface in rehearsal, resolve descriptively in the next ledger receipt, and pass focused domain/browser/live parity checks | 5.0h | player-authored-architect-thesis |
| FIRE | Infrastructure / startup truth / lifecycle coherence | Done S60 — lifecycle/Genius fingerprints, stale profile labeling, Ark-only drift, and exact queue rendering verified 12/12 plus brief validators | 2.5h | startup-brief-authority-drift-contract |
| HIGH | Infrastructure / model routing / observability | Done S60 — single router authority plus boundary, Sonnet guardrail, notional-cost, and direct exit-code fixtures 4/4 | 2.0h | context-meter-model-authority |
| HIGH | Infrastructure / closeout process / test depth | Done S60 — isolated clean/dirty/ahead/stale/malformed/no-write fixtures pass 3/3 and validate canonical board shape | 2.5h | closeout-board-truth-fixtures |
| INNOVATION | Explainable authority / concurrency | Done S60 — monotonic thesis revisions and expected-revision mutations prevent stale tabs from overwriting newer intent; both adapters return the same fail-closed 409 authority | 1.0h | conflict-aware-architect-thesis-authority |
| INNOVATION | Observability / evidence lineage | Done S60 — pending sources and resolved observations self-validate against the live Architect ledger; visible lineage verdict and tamper fixtures prevent plausible-but-false receipts | 1.0h | self-auditing-architect-thesis-lineage |

## Session 57 — Exact authority and season coherence (2026-07-25)

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Infrastructure / observability / dual-runtime contract | Done S57 | 2.0h | api-contract-bidirectional-authority |
| FIRE | Infrastructure / agent parity / routing observability | Done S57 | 2.0h | session-routing-agent-neutral-truth |
| FIRE | Infrastructure / architecture truth / attack-surface reduction | Done S57 | 1.25h | contract-service-exact-authority |
| FIRE | Game depth / progression / explainable intelligence | Done S57 | 2.5h | adaptive-identity-mastery |
| FIRE | Engagement / progression / UI-UX | Done S57 | 3.0h | source-derived-season-chapters |
| HIGH | Automation / feedback loop / playable proof | Done S57 | 1.5h | first-session-playable-proof |

Unified Genius List primary pass: **0 open / 6 closed**. Release remains **HOLD** on external hosted/email/edge/approval/registry evidence; no launch evidence was fabricated.

## Session 57 — Second-order innovation saturation

| Rank | Candidate | Status | Evidence |
|---:|---|---|---|
| S57-I1 | latest-audit-follow-through | Done S57 | Six execution receipts rechecked; browser proof explicitly observes the Season horizon transition |
| S57-I2 | single-human-action-parser-authority | Done S57 | One shared parser plus persisted age-ledger fixture; Studio protocol 22/22 |
| S57-I3 | retire-destructive-split-rewriter | Done S57 | Obsolete no-caller app/module rewrite path removed and guarded against return |
| S57-I4 | responsive-theme-evidence-authority | Done S57 | Stale external-server capture path removed; self-validating 53-capture matrix found and closed the 34px tutorial action defect |
| S57-I5 | launch evidence duplicates | Deferred honestly | Hosted provenance, received email, approval, and sibling lifecycle evidence remain incomplete; no fabrication |

Unified Genius List: **0 open / 6 primary closed**. Viable second-order innovation list: **0 open / 4 closed**.

## Session 56 — Weekly Authority, Evidence, and Progressive Week Room (2026-07-25)

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Feedback loop / privacy / source-derived evidence | Done S56 | 2.5h | consented-session-evidence-packet |
| FIRE | Game loop / command parity / transactional UX | Done S56 | 3.0h | weekly-plan-composer-authority |
| FIRE | Infrastructure / architecture truth / attack-surface reduction | Done S56 | 1.5h | delegated-service-authority-only |
| FIRE | UI/UX / progression / mobile parity | Done S56 | 3.5h | progressive-week-room |

## Session 56 — Second-order innovation saturation

| Rank | Candidate | Status | Evidence |
|---:|---|---|---|
| S56-I1 | Cold-start authority continuity | Done | A 6.9-second cold league hydration remains server-owned under a 15-second bootstrap budget; timeout cannot silently fork into browser state |
| S56-I2 | Dual browser-module roots | Done | The server now resolves both `/src/` and `/public/` module graphs; live smoke returns JavaScript HTTP 200 for the formerly missing tactical module |
| S56-I3 | True session evidence boundary | Done | Journey storage is tab-scoped and the successful opening contract is an explicit allowlisted checkpoint |

Unified Genius List: **0 open / 4 primary closed**. Viable second-order innovation list: **0 open / 3 closed**.
Launch remains **HOLD** on external hosted/email/edge/approval/registry evidence; no launch evidence was fabricated.

## Session 61 — Runtime Authorities, Stale-Plan Safety, and Edge Attestation (2026-07-29)

Source: `docs/AUDIT_2026-07-29.json`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Infrastructure / credential operations / observability | Done S61 — canonical definitions, status, probes, and remediation share one authority; focused and live status-only evidence pass | 2.0h | canonical-capability-operations-authority |
| FIRE | Infrastructure / dual-runtime API authority | Done S61 — server and local adapter delegate identical GET/POST behavior to one Architect Thesis handler; parity is green | 2.0h | shared-architect-thesis-handler |
| FIRE | Game depth / progression / UI-UX | Done S61 — declared focus is compared with source-derived current mastery, with exact next action, explicit empty state, and no causal claim | 3.0h | architect-declaration-to-now-review |
| FIRE | Infrastructure / transaction authority / maintainability | Done S61 — trade evaluation and commit moved behind an exact TradeService seam; GameSession is a thin delegator | 4.0h | trade-service-authority |
| FIRE | Security / deploy observability / static hosting | Done S61 — build emits exact CSP hashes, security headers, security.txt, and a fingerprinted edge receipt | 3.0h | generated-edge-security-contract |
| INNOVATION | Transaction integrity / concurrency | Done S61 — evaluation fingerprints bind roster, pick, cap, rule, and phase truth; stale commits return 409 before mutation | 2.0h | stale-trade-plan-receipt |
| INNOVATION | Release truth / hosted attestation | Done S61 — live verifier joins artifact fingerprint, revision, health, and response headers and emits an Ark-ready owning-host request | 1.5h | hosted-edge-policy-attestation |
| INNOVATION | Security / generated-policy completeness | Done S61 — every emitted inline script and style block receives an exact hash while style attributes remain separately scoped | 1.0h | inline-style-policy-saturation |

Unified Genius List: **0 open / 5 primary closed**. Viable second-order innovation list: **0 open / 3 closed**.

Launch remains **HOLD** on live health/header/revision, delivered-email, founder-approval, and sibling-owned lifecycle evidence; no launch evidence was fabricated.

## Session 62 — Rival Agency, Living Pressure, and Instant Boot (2026-07-31)

Source: `docs/AUDIT_2026-07-31.json`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Gamification / AI adversaries / decision pressure | Done S62 — rival GMs generate bounded deterministic inbound trade offers endorsed by TradeService; accept/counter/decline with fresh-fingerprint discipline; 9/9 focused tests | 4.0h | cpu-inbound-trade-offers |
| FIRE | Feedback loop / decision catalog / narrative agency | Done S62 — catalog doubled to 6 archetypes fed by live narrative events with deterministic visible consequences; icon/tone maps match the live engine set | 3.5h | decision-pressure-catalog-expansion |
| FIRE | Feature depth / AI market competition | Done S62 — premium FAs (74+) are market property; CPU teams bid archetype-shaped offers weekly; outbid receipts name winning terms; FA tab market surface + years selector | 5.0h | cpu-free-agency-market-competition |
| FIRE | Gamification / owner pressure / failure legibility | Done S62 — patience drifts weekly with receipts; always-on Owner Confidence meter; ultimatum reachable from every opening plan and resolves on the commitment board | 3.0h | owner-pressure-live-loop |
| HIGH | Speed / mobile boot / offline | Done S62 — build-generated precache service worker on every mount; 137 assets / 2020 KB served from cache on repeat loads; freshness surfaces stay network-only | 3.0h | service-worker-instant-boot |
| HIGH | Gamification / celebration / retention payoff | Done S62 — one shared moment authority (adapter drift twin removed); statement wins, playoff games, titles, eliminations, HoF inductions, and jersey retirements all announce themselves | 2.5h | celebration-milestone-authority |
| HIGH | Feature depth / simulation realism | Done S62 — calibrated home edge + bye rest with explicit venue receipts; Super Bowl neutral site; realism shards green | 1.5h | home-field-advantage |
| HIGH | UX / dead-end recovery / onboarding | Done S62 — skip records deferral; Overview CTA + Settings + command palette recovery paths; palette dispatch itself was dead UI and is repaired | 1.0h | opening-contract-recovery |
| HIGH | Security / save integrity | Done S62 — gist remote-import verification fails closed on forged/unreadable sidecars in exact parity with the canonical store | 0.75h | gist-integrity-fail-closed |
| HIGH | Correctness / injury eligibility | Done S62 — only dressed players can suffer in-game injuries; deterministic regression over a 60+ demoted sample | 1.0h | injury-eligibility-dressed-only |
| INNOVATION | Infrastructure / payload truth | Done S62 — one dashboard authority for both adapters; getAugmentedState is a passthrough; fromSnapshot latent TradeService crash root-fixed | 1.5h | dashboard-payload-parity |
| INNOVATION | Feedback loop / storyline visibility | Done S62 — open continuity threads render with source-derived close conditions | 1.0h | continuity-threads-visible |
| INNOVATION | Speed / hot paths | Done S62 — AI-maintenance FA pool cached per invalidation with scan-counter receipts; eight linear player scans routed through the Map index | 1.5h | hot-path-index-adoption |

## Next (carried from S62 second-order pool, honest deferrals)

- [ ] Mobile nav + 481–980px tablet parity with touch affordances — deferred S62: needs a dedicated visual-evidence re-baseline budget for the 53-capture responsive authority.
- [ ] Interactive press conference consuming the existing press-memory ledger — deferred S62: creative design surface pending founder direction.
- [ ] GM firing / terminal game-over state — founder creative direction required (recorded in DECISIONS 2026-07-31); the owner-pressure loop ships the pressure without inventing the ending.
- [ ] Opponent-aware gameplanning (buildTeamContext never sees the opponent) — needs its own realism-tolerance budget.

Unified Genius List: **0 open / 10 primary closed**. Viable second-order innovation list: **0 open / 3 closed, 2 honestly deferred to Next**.

Launch remains **HOLD** on external hosted/email/edge/approval/registry evidence; no launch evidence was fabricated.

## Session 63 — Franchise Authority, Press-Room Truth, and a League That Was Secretly Flat (2026-08-01)

Source: `docs/AUDIT_2026-08-01_SESSION63.json` · analysis companion: `docs/AUDIT_2026-08-01_SESSION63_ANALYSIS.md`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Security / competitive integrity / multiplayer | Done S63 — one seam classifies all 58 POST routes (22 guarded, 36 exempt with reasons), enforced pre-dispatch in both adapters; multiplayer intents bound to the author's slot; completeness test fails on any unclassified new route; CPU AI unaffected | 3.5h | franchise-authority-boundary |
| FIRE | Correctness / narrative fidelity | Done S63 — degenerate char-sum quote seed replaced with a real hash over gameId+year+week+tone; topPerformer reads the true box-score shape via a shared impact authority that also replaces the inline MVP scorer | 2.0h | press-room-truth |
| FIRE | Simulation realism / depth | Done S63 — bounded, coaching-gated soft-side read drives run/pass lean with a visible receipt; 12-season measurement both ways shows career out-of-range 3 → 1, season unchanged at 44/0 | 3.5h | opponent-aware-gameplanning |
| FIRE | Engagement / narrative agency | Done S63 — three postures plus an honest skip with deterministic receipted consequences; a promise made after a loss is what next week's follow-up resolves against | 3.5h | interactive-press-conference |
| HIGH | Game depth / progression / integrity | Done S63 — numeric staff editor replaced by a deterministic priced market of named candidates; ratings are now read-only; root-fixed the coaching-tree name resync that would have reverted every new hire | 4.0h | coaching-market-authority |
| HIGH | UX / mobile and tablet reach | Done S63 — decision-deck auto-enable widened 480 → 980px, explicit override authoritative both ways, gate re-evaluates on resize | 1.5h | tablet-decision-deck-parity |
| INNOVATION | Simulation integrity / league generation | Done S63 — the normalizer's constant-returning stub RNG made all 32 teams identical in coaching and owner economics across the entire deployed browser game; replaced with a shared derived RNG and per-club derived economics, holding league averages while restoring spread | 2.5h | flat-league-generation |

## Next (carried honest deferrals)

- [ ] GM firing / terminal game-over state — founder creative direction required (recorded in DECISIONS 2026-07-31; re-verified live S63: patience still floors at 0.05 with no terminal consequence). Item 5 was deliberately scoped to stop short of it rather than let it drift in through the coaching market.
- [ ] Tablet touch affordances — `grep touchstart|swipe|pointerdown|touchend public/` returns 0 hits (verified S63). Needs a dedicated visual-evidence re-baseline budget for the 53-capture responsive authority. The *reachability* half of S62's `mobile-nav-tablet-parity` shipped as S63 item 6; this is the remainder, at its true size.
- [ ] Interactive press conference is shipped, so S62's carried entry for it is closed.
- [ ] Opponent-aware gameplanning is shipped, so S62's carried entry for it is closed.

Unified Genius List: **0 open / 6 primary closed**. Viable second-order innovation list: **0 open / 1 closed, 2 honestly deferred to Next**.

Launch remains **HOLD** on external hosted/email/edge/approval/registry evidence; no launch evidence was fabricated.

## Session 64 — Production-readiness audit: CI repair, dead surfaces, and the save-size blocker (2026-08-01)

### Fixed

| Severity | Item | Evidence |
|---|---|---|
| BLOCKER | Deploy Pages CI failed on the S63 push | S63 widened the mobile deck auto-enable band to ≤980px; the overlay is `position:fixed; inset:0; z-index:1000`, so it covered the 768px responsive capture and intercepted every tab click. Band narrowed to **640px** (where `styles.css` actually collapses `.side-menu`), which also restores the full game UI to tablets and small laptops that S63 had taken it from. `evidence:responsive` now passes 53/53 locally. |
| HIGH | `/api/press-conference` POST returned HTTP 500 on the server adapter | `sendJson(status, payload)` was called without its `res` argument — surfaced only as `res.writeHead is not a function` in a real browser. Every node test passed over it because they exercise the browser adapter. Swept all `sendJson` call sites: no others affected. |
| HIGH | The S63 matchup-edge receipt never rendered | `toDashboardTeam` projects a reduced team shape that omitted `runDefenseRating`/`passDefenseRating`, so `buildMatchupEdgeRead` always returned its honest "unknown" state and the pre-game brief showed nothing. The engine half worked; the player-facing half was dead. Split ratings added to the projection. |

### Test coverage added

| Surface | Gap it closes |
|---|---|
| `test/server-routes.test.js` (6) | **`src/server.js` had no executing coverage at all** — other tests only grep it as source text. Boots the real server on a free port and speaks HTTP: core routes, both S63 route families, authority-boundary parity with the browser adapter, non-mutation after denial, and a guard that no mutating route answers with a leaked runtime exception. This is the gap that let the 500 ship. |
| `tests-ui/s63-surfaces.spec.js` (6) | The press room and coaching market shipped with **no browser coverage**, despite the market *replacing* a live control. Proves candidates render with real money, the numeric editor is gone, a hire reaches the staff sheet, a rival's staff is view-only, the podium opens and records a receipt, and the matchup-edge line reaches the player. Two of these failed on first run and found the two HIGH defects above. |
| `test/save-payload-budget.test.js` (5) | Pins snapshot/weeklyHistory/per-game weight so the blocker below cannot get worse. |
| `test/tablet-decision-deck.test.js` (+1) | Binds the deck's auto-enable band to the responsive-evidence viewports, so the two can never drift apart and repeat the CI failure. |

### BLOCKER — save payload exceeds a browser storage budget

Measured 2026-08-01, `mode: "play"`, after 6 regular-season weeks:

- full snapshot **~30.7 MB**
- `league.weeklyHistory` **~7.9 MB** (**~24 MB** projected across an 18-week season)
- per retained game **~84 KB**, of which `boxScore` (with full play-by-play) is **~98%**

A typical localStorage origin budget is 5–10 MB, so **a franchise cannot finish one season inside it**. The symptom is already visible in test output as `Auto-backup skipped: Browser storage is full`. For a zero-backend browser game whose whole premise is local saves, this is the single largest thing standing between the current build and production.

Two structural causes, both guarded by `test/save-payload-budget.test.js`:

1. `boxScore` including full play-by-play is retained for every game in `league.weeklyHistory` for the entire season, while `gameArchive` already keeps a capped (800) box-score archive for the history UI.
2. `weekResultsCurrentSeason` persists a **second copy** of the same current-season games `league.weeklyHistory` already holds.

**Deliberately not fixed this session.** Reshaping persistence touches replay, what-if, box-score and history surfaces and needs its own session with explicit save-migration handling and a compatibility path for existing saves. Doing it unscoped at the end of an audit would risk the very saves it is meant to protect. Ceilings are pinned just above today's numbers so the problem cannot quietly worsen and the fix has a number to beat.

### Deferred / external (unchanged, re-verified)

- `/_health` returns **404** on `playfranchisearchitect.com`, along with `deploy-manifest.json` and `edge-policy-receipt.json`. Root cause re-confirmed as the S33 finding, not an in-repo bug: the live origin serves a build from between 2026-07-02 and 2026-07-20 (it has S33's JSON-LD but not S62's `sw.js`). Resolving it needs Cloudflare zone access for that domain, which is not in the secrets gateway.
- Email-forwarding receipt, founder approval, and registry lifecycle reconciliation remain external authorities.

### Session 64 addendum — a shared-global `fetch` leak in the test suite

The new live-server tests passed in isolation and failed six-for-six inside the runtime shard. Three hypotheses were tried and discarded by measurement (per-test server boots exhausting the readiness window; an undrained stdout pipe blocking the child; CPU saturation). The real cause:

`test/create-api-client.test.js` and `test/gist-sync-security.test.js` replace `globalThis.fetch` with stubs and **never restore it**. The runtime shard runs all 78 files in a single process (`--test-isolation=none`), so those stubs leaked into every file loaded afterwards. `test/server-routes.test.js` then "fetched" a stub, resolving in under a millisecond with an empty body — `SyntaxError: Unexpected end of JSON input`.

Fixed on both sides:
- Both stubbing files now capture and restore `globalThis.fetch` in an `after` hook. This was a latent defect that would have silently broken any future test needing real network, not just this one.
- `test/server-routes.test.js` binds the real implementation at module load, so it cannot be poisoned by a future stub that forgets to restore.

Also hardened while diagnosing: the file now boots **one** shared server rather than one per test (six full league generations on a shared event loop), and discards the child's stdout rather than piping a stream nobody drains.

Runtime shard after the fix: **457 pass / 0 fail, exit 0.**

## Session 65 — Save-payload blocker cleared (2026-08-01)

The S64 blocker is **closed**. A full season of realistic play (advance + rolling backup every week, plus a named save) now occupies **3.95 MB** of localStorage, inside the smallest common 5 MB origin budget.

| Layer | Change | Measured |
|---|---|---|
| Stored week records | `weeklyHistory` / `weekResultsCurrentSeason` / `league.history[].weekly` keep only identity + scoreline fields; box scores live once in `gameArchive` | per retained game **84,747 → 215 bytes**; weeklyHistory **7.93 MB → 0.020 MB** |
| Weekly-history retention | pruned to the active season at season start (completed seasons already served from `league.history`) | unbounded growth → one season |
| Game archive | cap 800 → 272; play-by-play retained for the most recent 48 only, trimmed entries marked and disclosed in the box-score modal | archive entry ~84 KB → ~24 KB once trimmed |
| Snapshot encoding | gzip+base64 via `snapshotCodec.js`, legacy plain-JSON decoded transparently, plain-JSON fallback when `CompressionStream` is absent | **16.83 MB → 1.97 MB (8.5×)** |
| Backup retention | 40 full snapshots → count **and** byte bounded, always keeping at least one | the dominant quota multiplier removed |

Root-fixed while here: `/api/rewind/restore` loaded a persisted snapshot **without** going through `migrateSnapshot`, so an older-schema rewind point restored unmigrated. It now uses the same seam, which also means legacy franchises reclaim their space the moment they are opened.

Coverage added: `test/snapshot-codec.test.js` (8) and a rewritten `test/save-payload-budget.test.js` (6) that now guards the fix instead of characterizing the defect — including an end-to-end test that plays a full season, backs up every week, and asserts the whole footprint stays under 5 MB and still loads back into a working session.

**Deliberate trade, disclosed:** older archived games no longer store a drive log. Their statistical box score is complete, and the modal says so rather than showing an empty table. A degraded historical detail is the right price for a save system that works.

Verification: `npm test` **746/746** direct exit 0 · Playwright **26/26** · `evidence:responsive` **53/53** · Pages build + smoke · 54 browser modules · doctor `blockingFailing` 0.

## Next

- [ ] GM firing / terminal game-over state — founder creative direction required (carried, unchanged).
- [ ] Tablet touch affordances and a dedicated tablet layout — needs its own visual-evidence baseline (carried, unchanged).
- [ ] External launch gates remain owned elsewhere: `/_health` 404 on the live domain (stale origin binding, needs Cloudflare zone access), delivered-email receipt, founder approval, registry lifecycle reconciliation.

## Session 66 — CANON-041 landed, duplicate-PR loop closed (2026-08-01)

### The finding

42 open PRs, **33 of them the same feature**, opened one per day at ~08:15 UTC between 2026-06-16 and 2026-07-31 by a scheduled agent. The PRs **passed CI**. Nothing ever merged or closed them, so each new day's branch left the previous day's PR conflicting — 31 of 33 ended `DIRTY`, and **93 of the last 200 workflow runs** were spent re-validating rejected-by-inaction work.

Root cause: an open-loop automation with a *create* step, no *land* step, and no *stop* condition. It could not detect that thirty-two identical PRs already existed.

Two contributing factors worth recording:
- **CANON-041 appeared nowhere in this task board**, so `/audit` and `/go` never saw it. Two automations were working the same repo with no shared backlog — which is why ~65 sessions of audit cycles never touched mobile nav while an external agent hammered it daily.
- The gap was genuinely real. No drawer existed in main; below 980px the 14-button `.side-menu` rendered as a static grid *above* content.

### Shipped

| Item | Detail |
|---|---|
| CANON-041 mobile nav drawer | Landed on main as `2bdde85`, not merged from any single PR — the best candidate (#40) predated the S65 decision-deck work and would have collided |
| Breakpoint reconciliation | 980px, not the PRs' 768px; `.side-menu` stays a two-column static grid to 980px, so 769–980px was still stacking nav above content |
| Deck coexistence | Drawer stacks at z-index 1100 vs the deck overlay at 1000; when `body.mobile-loop-active` the toggle hides and the drawer is forced shut, and the deck clears `mobile-nav-open` so exiting via "Full View" reveals a closed drawer |
| Accessibility (kept from the PR series) | `aria-expanded`/`aria-controls`, label swap, `inert` on the off-screen drawer, inert re-sync on resize, scrim + Escape dismiss, close-on-tab-selection |
| `scripts/responsive-evidence.mjs` | Opens the drawer before driving tabs below 980px — the real journey on those viewports |
| `scripts/check-duplicate-prs.mjs` | The stop condition the loop never had. Clusters open PRs by title **token overlap** (exact signatures fail: the same feature arrived as "nav drawer", "bottom nav", "nav strip") and fails when a group exceeds a threshold |
| PR queue | **42 → 9 open.** All 33 duplicates closed with a comment crediting the series and explaining the two reconciliations |

Coverage: `tests-ui/mobile-nav.spec.js` (7) and `test/duplicate-pr-guard.test.js` (6, seeded with the real duplicate titles).

Verification: `npm test` **746/746** exit 0 · Playwright **33/33** · `evidence:responsive` **53 captures**, 0 runtime errors / 0 overflow / 0 undersized touch targets · Pages build + smoke · 54 browser modules.

### Owner action required

- **Retire or gate the scheduled agent that opens CANON-041 PRs.** It is external to this repo — the only cron workflows here are `brief-format-check` and `realism-sweep`, neither of which opens PRs. Now that the feature has landed, a daily job re-implementing it is pure waste.

### Still open, and worth triage rather than another daily attempt

9 PRs remain, several genuinely useful: #35 (`CLEAN`, landing brand harmonization + Playwright), #30 (wires dead analytics), #11 (mobile-loop import fix), #9/#15 (press-conference determinism — likely superseded by S63's press-room work), #50 (superseded by S65 on main; recommend closing).

## Session 67 — the offseason was a facade (2026-08-01)

### The finding, in one line

`normalizeContract` read `Number(contract.yearsRemaining || 1)`. Zero is falsy. **No contract in this game had ever expired.**

The clamp on that same line floors at 0, so zero was always meant to be legal — the falsy default just made it unreachable. Because normalize runs on every read, `advanceContractYear`'s expiry branch and `expireContracts`' `<= 0` check were both dead code, and everything downstream had been quietly inert for the project's whole history:

- The free-agent pool measured **0 players at all seven offseason stages**, so the entire S62 competing-offer market — CPU archetype bidding, outbid receipts, the `legal-tampering` → `post-draft` stage machine — was structurally unreachable in an offseason. It filters on `teamId === "FA"`.
- `listExpiringContracts` and the Re-sign action had nothing at stake since S8.
- The compensatory ledger measured departures that never happened.

The audit's stated premise (ordering) was real but **secondary**, and is recorded that way rather than retrofitted.

### Shipped — six ranked items

| # | Item | Detail |
|---|---|---|
| 6701 | Offseason calendar order | `runOffseason` decomposed into named exported phases; the composed façade preserved **verbatim** for `leagueSimulator` and the 100-year career regression. Each stage bound to the phase it is named for. The `retirements` stage retired nobody — its entire body was `processStaffLifecycle()` plus a news line, the same call the next stage made again. A new `free-agency` stage sits between pro-days and the draft. A pre-S67 snapshot resuming at `udfa` reconciles idempotently. |
| 6702 | Free agency exists | Root fix above, plus a 3-wave window that **holds for the GM between waves** (`blockingReason: "free-agency-open"`). Premium signings gated through the market in the window, not just the regular season. `submitCpuFreeAgencyOffers` gained a `poolSize` (40 in-window, 10 in-season) and a one-pass position index replacing an O(candidates × teams × players) scan. **0 → 36 competitive signings.** |
| 6703 | Draft honours the pick ledger | `buildDraftOrder(year)` emits one slot per **owned** pick, ordered by the original club's finish, comp picks closing their round, `totalPicks` derived not the 224 constant. Every `(currentPick - 1) % 32` became a direct index — including two in `public/lib/tabDraft.js` that had been reading the wrong team for every round after the first. Picks consumed on selection. Standings fallback keeps pre-ledger saves drafting. |
| 6704 | Compensatory picks can be awarded at all | Loss value read `player.value \|\| player.capHit / 120_000` off a projection carrying **neither** field → NaN → `sum + (v \|\| 0)` laundered it to 0 → `net <= 0` always continued. The gains side divided by a *different* denominator, so the two were never comparable even before the NaN. One finite-validated scale, reconciled against where the player actually finished, capped at 4/club. **0 → 19 awards**, totalPicks 224 → 243. |
| 6705 | Offseason actor authority | `runFreeAgencyBackstop` takes an explicit authority parameter; the controlled team is excluded. **5 players per offseason used to arrive on the GM's roster with no command issued** — the S63 boundary guards the command seam and this engine is not a command. Every backstop signing logged one aggregated row per club (not 200+ rows that would evict real history from a 5,000-entry log inside 25 seasons). Unfilled controlled roster → actionable inbox shortfall receipt. |
| 6706 | Pick assets bounded | Consumed on selection, elapsed drafts retired self-healingly, floored at `year > currentYear` in both the trade desk and `TradeService`. Before: **42 BUF assets across six years, 21 for drafts already held**, against a 1,344-row ledger growing 224/season forever — inside the save budget S65 spent a session reclaiming. |

### Second-order — four shipped

- **Contract-expiry root cause** (above) — the finding the audit's premise was standing on.
- **CPU retention window.** With contracts finally expiring, every club read as a catastrophic net loser because no CPU team could re-sign its own. Rival clubs now keep their own first, weighted by quality/age/strategy — and the controlled franchise is deliberately excluded, because who to keep is the GM's decision. **295 expiring → 169 retained → 126 genuine free agents (97 premium).** Comp net distribution went from +906..−129 (everyone a loser) to +787..−461, median 356.
- **Free-agency market index** — see item 2.
- **Player-facing surfaces**, per the S64 lesson that an engine half can ship green with its UI half dead: Free Agency season chapter with live wave/premium counts routing to the FA tab, inbox announcement when the market opens, roster-shortfall chapter, war-room chips naming an acquired or compensatory pick. Covered by tests driving the browser modules against **live dashboard state**.

Coverage: `test/offseason-calendar.test.js` (22) and `test/offseason-surfaces.test.js` (7), both registered in the `core` shard.

### Honest deferrals — recorded, not skipped

- **`indexedDbSaveStore.js` / `modLoader.js` / `rewindManager.js` have zero importers.** The audit listed deletion as a second-order candidate. Reading them first showed that is the wrong call: `indexedDbSaveStore` is a complete, working **~250 MB** persistence layer against the 5–10 MB localStorage ceiling S65 spent an entire session fighting, and S65's move to async store methods made it architecturally reachable for the first time. `modLoader` is a complete public mod/plugin API. **Assets, not debt.** Wiring IndexedDB is a dedicated session with migration and fallback handling.
- **`getDashboardState()` memoization** — deferred with its measurement rather than its guess: **24.7 ms** per build. Real, not player-visible at current polling rates, and a cache runs straight into the S49 authority-keyed hydration fences.
- **GM firing / terminal game-over** — founder creative direction, carried unchanged from S62/S63.

### Rejected as phantom work

- *"`runCpuDraft` auto-picks for the user when `allowTop10PickTrading` is false — inverted logic."* Read in isolation it looks inverted; `GameSession.js` blocks the **user** from selecting inside the top 10 under the same flag with an explicit "trade down or let the CPU resolve the pick" message. The branches agree. (Noted separately and not raised as work: no `CHALLENGE_MODES` entry actually sets it false, so the restriction is unreachable configuration.)
- *"Playoff seeding and tiebreakers are naive."* `src/engine/seasonSimulator.js` implements head-to-head, division and conference tiebreakers with a proper tie-group walk. Premise false against live code.

## Session 68 — Unit-Safe Strategy, Season Thesis, and Observable Proof (2026-08-02)

Source: `docs/AUDIT_2026-08-02.json`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Simulation authority / core loop | Done | 3.0h | weekly-tactic-unit-authority |
| FIRE | UI/UX / engagement / decision compression | Done | 3.0h | standing-plan-red-flag-rehearsal |
| FIRE | Progression / narrative authority | Done | 4.0h | season-thesis-ledger |
| HIGH | Infrastructure / test observability | Done | 2.0h | test-shard-progress-proof |
| HIGH | Release observability / coherence | Done | 2.5h | structured-release-truth |

### Session 69 preload (not part of the exhausted Session 68 Genius List)

- [ ] Establish a valid independent staging origin at the exact candidate revision, then replay the structured release contract against it.
- [ ] Provision and prove on-domain email delivery/forwarding through the canonical Brevo path, retaining a received-message receipt without exposing message content.
- [ ] Reconcile registry SPARKED/local FORGE and refresh stale IGNIS through the Studio Ops Ark owner; request receipt `01JV2S5KC5235D4C02269A28B4`.

## Session 69 — Evidence Semantics, Propagation Safety, and Independent Staging (2026-08-03)

Source: `docs/AUDIT_2026-08-03.json`.

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Progression / narrative authority | Done | 3.0h | phase-aware-season-thesis-evidence |
| FIRE | Retention hook / temporal authority | Done | 2.5h | session-bound-return-digest |
| FIRE | Infrastructure / propagation safety | Done | 4.0h | project-propagation-compatibility-firewall |
| FIRE | Release architecture / staging | Done | 4.0h | independent-cloudflare-staging-authority |
| HIGH | Progression / mathematical truth | Done | 2.0h | multi-path-gm-persona-progress |
| HIGH | Release observability / freshness | Done | 2.5h | expiring-release-evidence-snapshot |

## Session 71 — The Value Scale: what the league's numbers were worth (2026-08-04)

Source: `docs/AUDIT_2026-08-04_SESSION71.json` (6 ranked items, combined priority 186.4).

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Simulation authority / statistical truth | Done | 4.0h | approximate-value-line-share-authority |
| FIRE | Progression / narrative authority | Done | 3.0h | award-ballot-position-integrity |
| FIRE | Progression / legacy scarcity | Done | 3.0h | hall-of-fame-scarcity-authority |
| HIGH | Observability truth / shareable surface | Done | 2.0h | champion-scoreline-orientation |
| HIGH | Simulation authority / long-run balance | Done | 3.0h | development-variance-bias |
| HIGH | Cross-repo coherence / release authority | Done | 1.5h | registry-authority-drift-cargo |

### The finding, in one line

`resetTeamSeasonState` rebuilt `team.season` without `drivesFor`/`drivesAgainst`, so the first `+=` of every
season pinned both at `NaN` — and **every offensive player's approximate value had been ~0 for the project's
entire history.**

The shape of a team's season record was declared twice, in `createTeam` and in `resetTeamSeasonState`, and the
two drifted. Every reader took the counters as `x || 0`, which laundered the NaN into a **zero drive count**
rather than raising it. Downstream, `offensivePoints` collapsed to ~2 and the defensive multiplier pinned at its
`0.15` clamp floor, inflating the defensive bucket to ~426. Measured league-wide: **QB AV 2, WR AV 0, RB AV 0,
OL AV 0 — against LB AV 76.**

That is why a tight end won MVP in ten of ten simulated seasons. `offensiveLineValue` returned an *absolute*
instead of a share of the team's line bucket, and `offensiveSkillValue` added it to every tight end — so a tight
end with **zero catches** scored 32 while an MVP-calibre quarterback scored 16. It was the only nonzero
offensive value left in the league.

The bucket and both denominators for the missing normalization — `linePoints`, `team.olLineWeight`,
`team.teLineWeight` — already existed and had **never been read anywhere in the repository**. The line branch
was scaffolded on both sides and never connected; every other position group was normalized correctly.

### Shipped — six ranked items

| # | Item | Detail |
|---|---|---|
| 7101 | Value scale | `offensiveLineValue` distributes the line bucket through the accumulated denominators, the same bucket ÷ team-total shape `defensiveValue` always used; the tight-end branch draws its blocking share from that bucket at its existing 0.2 weight. Season record declared once via `createTeamSeasonState`, counters accumulate through a finite guard so a damaged save self-heals. Measured on NFL-realistic lines: **OL starter 96 → 8**, TE with no catches **32 → 2**, elite TE **41 → 11**, MVP QB **16** unchanged. Live in-engine: **QB 2 → 25, WR 0 → 17, LB 76 → 24.** |
| 7102 | Award ballot | A quarterback now wins MVP in **10 of 10** seasons at AV 16–24 (the real award sits at 18–22). Rookie eligibility root-fixed: `seasonsPlayed <= 1` admitted second-year players — the MVP also won Rookie of the Year in **7 of 8** seasons — and now derives from the player's first recorded season, which cannot drift against the offseason. |
| 7103 | Hall of Fame | Rebuilt rather than accumulated, so a corrected value scale repairs an existing save instead of freezing its mistakes. Admission runs year by year under a class-size cap with a deterministic tie-break, so a candidate who misses his first ballot stays eligible and a backlog forms. **24.5% of all retirees → 1.4%**; the real Pro Football Hall of Fame holds ~1.36% of everyone who has played. Threshold re-derived to 450, new `hallOfFameMaxClassSize` (default 6), both player-adjustable. |
| 7104 | Championship scoreline | Assembled home-first (AFC first) at four sites and published as champion-first, so **any title won by an NFC club read as the champion losing its own final** — 8 of 10 measured seasons, including the shareable League Story Card. One `championScoreline()` authority; nine player-facing readers repair stored scorelines on read, so existing saves display correctly with no migration. |
| 7105 | Progression drift | Three defects, not the one audited: `rng.int(-2, 3)` is inclusive so the "variance" averaged **+0.5**; `traitFactor` referenced potential 70 against a measured league mean of **79.92**, a second **+0.50** for every player; and an integer variance meant rounding discarded every fractional term, so a prime-age player's +0.4 rounded away to nothing. 90-plus players across 10 seasons **117 → 79**. |
| 7106 | Registry drift | Four fields in the authoritative registry contradict verified local evidence (`stagingType`, `stagingUrl`, `liveUrl`, `vaultStatus`). Shipped as signed Ark cargo **`01JV62KEPG9B017D2712C0F8F5`** with provenance receipts. No sibling tree edited (CANON-018). |

### Second-order — four shipped

- **Hall of Fame induction classes.** Only reachable once induction became scarce: at ~2.5 a year with a dated
  `classYear`, the Hall reads the way a real Hall reads — by the class you went in with. Inductees from saves
  written before classes existed keep their place in an undated group rather than being given an invented year.
- **The season record is declared once** — the drift that produced the NaN is now structurally impossible.
- **Rookie eligibility derives from the stat record**, not a counter advanced elsewhere in the calendar.
- **Cross-runtime scoreline parity**, held identical by test, the same discipline the API adapters already use.

### Honest deferrals — recorded, not skipped

- **Residual overall inflation.** After all three progression fixes the league mean still rises 77.25 → 80.70
  across 10 seasons (**+0.38/season**, down from +0.43). The two unambiguous defects are fixed and guarded; what
  remains is a *balance* question — the age curve is net-positive across this league's real age distribution.
  That is a calibration exercise belonging with the realism profile and its own baseline, not a number quietly
  nudged at the end of a session. Recorded with its measurement so the next session starts from a number.
- **Long-run behaviour beyond 10 seasons is not measured.** A 25-season probe ran ~50 minutes without output and
  was stopped. The trend is reported only over the window actually observed, not extrapolated to 100 years.

### Rejected as phantom work

- *"Roster sizes grow unbounded."* Measured per-team totals converge on exactly **69** — 53 active + 16 practice,
  the intended limit. The apparent growth is practice squads filling from an initial ~54.
- *"Season statistics are unrealistic."* The realism calibrator holds QB/RB/WR/TE lines at **0.0–2.3% drift**
  against the Pro Football Reference baseline over 20 observed years. The statistics were never the problem;
  only the formula that valued them.

Coverage: `test/season-value-authority.test.js` (10), registered in the `core` shard.
## Session 72 — Deterministic Truth and Progression Parity (2026-08-04)

Source: `docs/AUDIT_2026-08-04_SESSION72.json` (5 verified primary items, all shipped).

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Infrastructure / simulation truth | Done | 2.0h | finite-simulation-truth-receipt |
| FIRE | Progression / mathematical authority | Done | 4.0h | league-progression-parity-contract |
| FIRE | CI reliability / reproducibility | Done | 2.0h | deterministic-browser-league-authority |
| HIGH | Observability truth / player tooling | Done | 3.0h | progression-verifier-observability |
| HIGH | Settings authority / legacy policy | Done | 1.5h | hall-policy-roundtrip-authority |

### The finding, in one line

The remaining development drift was real, but the system had no authority capable of proving either the correction
or its numeric integrity: browser fixtures were time-seeded, the Hall journey relied on statistical luck, the
commissioner form silently forgot class size, and the realism verifier omitted league progression entirely.

### Shipped — five ranked items

| # | Item | Detail |
|---|---|---|
| 7201 | Finite simulation truth | A cycle-safe, bounded scanner walks ten named critical league roots, rejects `NaN`/`Infinity`, reports redacted paths, and treats traversal truncation as incomplete rather than pass. Realism verification emits independent source and simulated receipts. |
| 7202 | League progression parity | The named `2026-s72-parity` profile calibrates developing/prime/veteran age factors to `+0.20/-0.55/-2.25`. A deterministic decade now clears a fixed ±0.15 overall/year band while preserving young upside, potential separation, and veteran decline. |
| 7203 | Deterministic browser authority | Every `app.spec.js` league fixture declares seed `20260306` unless explicitly overridden. The Hall rendering journey configures its permissive 120/0/40 policy through the public API, so CI tests rendering instead of luck. |
| 7204 | Observable progression | Commissioner Settings now publishes source-derived start/end player count, mean, median, elite count, age cohorts, annual drift, profile, target, status, seed, and both finite-number receipts. |
| 7205 | Hall policy round trip | All score/wait/class controls hydrate from normalized settings. Local and browser adapters prove 285/2/3 persists, reloads, and changes class size without overwriting the other policy values. |

### Second-order — two shipped after the primary list exhausted

- **Hall Ballot Watch.** One scoring authority now ranks the twelve strongest retired non-inductees, exposes exact
  gap/backlog/watch status, career value, titles and awards, excludes inductees, and renders the live ballot in
  History.
- **Roster Window Map.** Both runtimes derive seven position-room horizons from the declared development profile,
  potential, age and contract state. The Roster surface places OVR beside POT and adds projected direction, age mix,
  expiring count, standard bearer and an actionable succession/runway priority.

### Verification and visual truth

- Canonical Node aggregate **857/857**, including a direct deterministic ten-year gate.
- Playwright **40/40**; the prior Hall failure is deterministic and green.
- Responsive evidence **89 captures** across 390/768/1440, dark/light and every primary tab; 16 inspected
  progression/integrity/roster/Hall captures are SHA-256 bound in `docs/visual-qa/LATEST.json`.
- Pages build/smoke and **58 browser modules** are green.

### Honest deferrals / rejected phantoms

- Launch remains HOLD on delivered reply-capable on-domain email, SHA-bound founder approval and authoritative
  registry lifecycle. No readiness claim or received-message receipt was fabricated.
- A second season-stat retune was rejected: the existing verifier holds targeted season lines at 0.0–2.3% drift;
  league progression was the live defect.
- An early empty Hall was rejected as a defect: scarce induction makes it correct. The browser fixture now names the
  permissive policy it requires.
- A speedrun stored-XSS candidate was rejected after tracing escaping and server-authored numeric fields.

## Session 73 — Decision Payoff and Verification Integrity (2026-08-04)

Source: `docs/AUDIT_2026-08-04_SESSION73.json` (6 verified primary items, combined priority 425.5).

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Verification integrity / automation | Done S73 | 1.5h | hermetic-startup-brief-contract |
| FIRE | Feature depth / season payoff | Done S73 | 5.0h | architects-cut-season-reckoning |
| FIRE | Gamification / broadcast immersion | Done S73 | 4.0h | broadcast-director-sim-watch |
| HIGH | Retention / progression discovery | Done S73 | 3.0h | achievement-questline-authority |
| HIGH | Speed / browser architecture | Done S73 | 4.0h | lazy-ui-island-boot-contract |
| HIGH | Simulation intelligence / progression | Done S73 | 6.0h | position-group-progression-parity |

Execution order: hermetic verification → shared position-room authority → lazy UI boundary → broadcast, trophy,
and season-payoff surfaces → rendered-pixel and full-suite proof → second-order innovation pass.

### Shipped — six primary and three second-order innovations

- **Hermetic verification:** startup rendering accepts a validated test-owned output, rejects malformed/out-of-root targets before writing, and preserves tracked truth during aggregate tests.
- **Seven-room parity:** global success can no longer mask a room breach; bounded multi-seed history and Position Room Watch expose new/repeat drift without auto-tuning.
- **Lazy UI boot:** History, Settings, exports, and epilogue hydrate on demand; first decision is 697,424/710,000 bytes with 0 lazy leaks and 67 reachable browser modules.
- **Broadcast Director + Final Reel:** exact archived plays support pause, speed, key navigation, keyboard control, and a bounded high-impact replay with canonical score joins.
- **Trophy Road:** three nearest honest objectives render in Overview/mobile; event-only goals never fabricate a percentage and unlocks advance immediately.
- **Architect's Cut + Decision Anthology:** bounded weekly, trade, and draft receipts become an explicitly non-causal season reckoning and cross-season archive.

Verification: canonical Node **877/877** direct exit 0; Playwright **40/40**; responsive **125 captures**; visual QA **24 SHA-256-bound inspected captures**; browser boot **697,424/710,000 bytes**; Pages build/smoke; Doctor `blockingFailing: 0`; secret scan 0; JSON/NDJSON and 38-file JavaScript syntax sweeps green.

Unified Genius List: **0 open / 6 primary closed**. Viable second-order innovation list: **0 open / 3 closed**. Launch remains **HOLD** on delivered reply-capable email, SHA-bound founder approval, and authoritative lifecycle reconciliation.
## Session 74 — Durable Memory and Co-GM Authority (2026-08-06)

Source: `docs/AUDIT_2026-08-06_SESSION74.json` (3 verified primary items, combined priority 170.4).

| Tier | Category | Status | Effort | Item |
|---|---|---|---:|---|
| FIRE | Retention / dynasty memory / UI | Done S74 | 4.0h | persistent-decision-anthology |
| FIRE | Release evidence / CI reliability | Done S74 | 2.0h | deterministic-sim-watch-evidence |
| HIGH | AI collaboration / dual audience / privacy | Done S74 | 4.0h | co-gm-briefing-packet |

Execution order: deterministic visual authority → permanent Decision Archive → bounded Co-GM packet → second-order script smoke coverage → rendered-pixel proof → exact-revision release train.

### Shipped — three primary and four second-order improvements

- **Deterministic Sim-Watch evidence:** bounded real-runtime advances reject byes and incomplete games until an exact play-by-play plus high-impact Final Reel receipt exists; failure publishes its attempt ledger.
- **Permanent Decision Archive:** History now exposes year-selectable, source-covered decision volumes with sparse states, missing-evidence disclosure, and an explicit descriptive/non-causal boundary.
- **Co-GM Brief:** players can copy or download a versioned allowlisted JSON packet containing live authority, pressure, thesis, and at most three receipts; the packet excludes saves, credentials, full ratings, personal identifiers, and hidden state.
- **Operational smoke paths:** four innovation-pack scripts now expose side-effect-free usage paths under test.
- **Rendered-pixel evidence lens:** component captures exclude only unrelated overlapping fixed/sticky chrome and preserve the target plus ancestors.

### Verification and release truth

- Focused model/integration suites green; full aggregate and UI results are recorded at closeout.
- Responsive evidence **140 captures** across 390/768/1440, dark/light and every primary tab.
- Visual QA **32 SHA-256-bound inspected captures**; CANON-053 changed-surface check passes.
- Launch status remains independently gated by delivered reply-capable Zoho alias evidence and authoritative lifecycle reconciliation; neither is inferred from a production deploy.
