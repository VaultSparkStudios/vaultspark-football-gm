<!-- truth-audit-version: 1.1 -->
# Truth Audit

Overall status: green
Last reviewed: 2026-08-17
Public-safe summary only. Sensitive verification notes are maintained privately.

## 2026-08-17 - Session 88 truth update

- **A defensive hide/show handler was hiding the wrong DOM node, and now hides the right one.** `renderGmLegacyScore()` toggled `.hidden` on `#gmLegacyCard` (the inner score paragraph), not `#gmLegacyCardWrap` (the surrounding article with header, grade badge, mastery, persona and reputation sub-widgets), so an unset or failed GM Legacy summary left an empty card husk visible instead of hiding cleanly. `applyGmLegacyCard(card, wrap, summary)` now resolves the wrapper (falling back to the card itself if the wrapper id is absent) and hides/shows it on both the empty-state and catch-block paths. This is the second instance of the same bug class found in this project's audit history (a hide/show target that doesn't match the intended visual boundary).
- **The empty/error path is verified by a DOM test, not a rendered screenshot, and that gap is stated rather than papered over.** A null-summary/failed-fetch state is a transient network-failure condition that the static-artifact responsive-evidence harness (which serves a real backing dataset) cannot reproduce. `test/session87-franchise-truth.test.js` instead directly asserts the wrapper hides on a null summary and un-hides with correct score/grade/label text on a populated one — this is the honest verification boundary for this specific fix, recorded explicitly.
- **A fast-follow hotfix commit no longer sits unreconciled against release authority.** The S87 closeout descendant `505c554` ("retry backend cold-start health") landed on `main` and was already live on staging/production, but the recorded release-authority evidence still named the earlier candidate `9801ac4`, tripping three blocking doctor checks. This session ran the full staging-verify → production-promote → reconcile pipeline against current HEAD rather than treat the small commit as exempt (D-S88.1); doctor now reports `blockingFailing: 0` with all three previously-failing checks green.
- **Deployment identity is exact and independently cross-checked, not asserted.** Candidate `48557d616260d18de07d187e79d099f13525b166` passed exact-SHA CI, stable staging 14/14 at artifact `112b6163f15367465618dbdaddffbf657820a89f510130c416a371a9656855a1`, production Pages promotion at the same artifact, and production provenance 10/10; unified release authority reports `status: verified` with all 7 identity/evidence checks green at this exact candidate.
- **The suite receipt is exact and was read directly.** Node passes 1,137/1,137 (up from 1,136/1,136, +1 test), direct exit 0.
- **Rejected phantoms, with evidence, before implementation.** Re-touching the salary-market curve (S87 already shipped a fixed-seed-verified versioned curve with a reachable $45M ceiling); a new AI coach or paid inference layer (the game remains intentionally zero-backend for its core loop); rewriting the GM Legacy API contract (the backend summary is correct — the defect was purely which DOM node the frontend hid); and a new debt-marker sweep (`generate-innovation-pack.mjs --stdout` found 0 open candidates and a repo-wide TODO/FIXME/HACK grep across `src`, `public/lib` and `test` returned zero matches).
- **Launch posture is unchanged and remains independently held.** Nothing this session touches Zoho delivery/reply-as, founder approval, lifecycle registry reconciliation, or Obelisk relying-party proof. `launchReady` stays false.

## 2026-08-16 - Session 86 truth update

- **Three shipped systems were not doing what the project said they did, and the record now says so.** All four weekly tactics were measurably inert (fixed seed 77123: each produced 8-week league results byte-identical to choosing no tactic); the on-the-clock Draft button threw a ReferenceError before issuing the pick request; and the declared veteran aging curve arrived at -0.46 OVR/yr against a declared -2.25. None of these were visible to code review, and all three passed the existing suite. Prior sessions' claims about these systems were made in good faith from the code; they were wrong about the behaviour, and that correction is recorded here rather than quietly overwritten.
- **The Session 85 game-loop score of 8.4 was measured against intent; Session 86's 6.2 is measured against behaviour.** The drop is not new pessimism about the design and not a regression — it is the first audit to execute the loop. The score should be read as a change in method, not a change in quality.
- **Every ranked premise this session was verified twice** — once by reading the live file and quoting exact lines, once by running the engine and measuring the defect — and the two independent audit lenses converged on the playoff-seed shape split, which is recorded as corroborated rather than counted twice.
- **The suite receipt is exact and was read directly.** Node passes 1,123/1,123 (core 123, runtime 716, sim-contract 79, sim-realism 1, studio 204; up from 1,102/1,102, +21 tests). The wrapper exit code reported success over a real failure twice during this session, so every count above comes from the shard summary lines, not from an exit status.
- **Three suite reds were self-inflicted and root-fixed, not force-greened.** No budget was raised, no assertion loosened, and no test deleted. Two pre-existing tests were corrected because they guarded implementation details rather than behaviour; both corrections are stated in DECISIONS.
- **No rendered-pixel capture pass was run locally this session.** Two shipped items change player-facing surfaces (the newly reachable draft reveal modal, and the Overview cap-alert banner text), so CANON-053 capture evidence is owed. It is delegated to the CI Playwright run on this candidate rather than claimed locally — recorded explicitly as a scope call, not silently skipped.
- **Launch posture is unchanged and remains independently held.** Nothing in this session touches Zoho delivery/reply-as, founder approval, lifecycle registry reconciliation, or Obelisk relying-party proof. `launchReady` stays false.
- **Known-real and deliberately deferred:** cap space is non-binding league-wide (measured: all 32 teams hold $92M-$112M against a $255M cap, and `maxSalary` is unreachable) — this is franchise-economy calibration, not a defect fix, and was deferred rather than smuggled into a correctness pass. Five further verified-real findings (narrative trigger shape drift, box-score long-play accumulation, fan-sentiment win band, two missing DOM mounts, waiver-table identity column) are recorded in the audit sidecar's `preverifiedSkips` so Session 87 can act without re-auditing.

## 2026-08-13 - Session 84 truth update

- **The tutorial layout-shift fix is verified as a static contract, not a live measurement.** `public/styles.css` now reserves the exact rendered height for every panel/element named in `docs/performance/GAME_SHELL_DIAGNOSTIC.json`'s shift log, and `test/tutorial-layout-stability.test.js` asserts the stylesheet declares it. No live-staging CLS re-measurement was performed this session — the diagnostic JSON still shows the pre-fix numbers until that re-measure runs. This gap is stated explicitly rather than implied closed.
- **`/api/team-archetypes?team=` is additive and exact.** Omitting the param returns the unchanged full 32-team response (both runtimes, regression-tested); supplying an unknown team returns an empty array, not an error.
- **`historyFormatting.js` coverage claim is exact.** All five exports (`formatAwardList`, `hallOfFameCareerLine`, `awardCountLine`, `hallOfFamePolicyLine`, `retiredNumberPolicyLine`) have direct assertions; three superficially similar "untested module" candidates surfaced by the audit turned out already covered on closer verification and were correctly not reimplemented as redundant work.
- **No rendered-pixel capture claim is made this session.** Both shipped changes were judged not to alter any themed visual state; this is recorded as a scope decision, not silently omitted.
- **Suite count is exact.** Node passes 1,094/1,094 direct exit 0 (up from 1,078/1,078, +16 tests); Pages build/smoke green.
- **Deployment is not launch.** Zoho delivery/reply-as, SHA-bound founder approval and authoritative lifecycle reconciliation remain unproved, unchanged. launchReady stays false.

## 2026-08-12 - Session 83 truth update

- **Rematch memory is bounded evidence.** Tactical Film Room reads only the canonical rivalry ledger, orients the last score to the controlled club, labels a bounded recent sample and denies prediction/causation.
- **Sim-Watch has one reachable authority.** A single ordered ticker listener opens the box score and then the broadcast; touch/pen, keyboard and buttons all drive the same previous/next controller.
- **Fictional labels are presentation authority.** Rendered review found BUF/NE engine identifiers and an object-shaped standings value leaking into public copy; all affected paths now normalize to fictional abbreviations before interpolation.
- **Public statistics share one honest descriptor.** Homepage showcase, deep atlas and Analytica consume one aggregate-only Feed v1 contract with six analyzed metrics, three showcased metrics and a 30-second refresh promise. It does not claim adoption or synthetic activity.
- **Identity absence is explicit.** Passport v1 query-token/session examples are removed. Structured status declares external/not-integrated Obelisk v2, no local auth and no account flows until relying-party registration and PKCE verification succeed.
- **Candidate and publication evidence are exact.** Node passes 1,078/1,078. Nine reviewed dark/light desktop/mobile captures, hosted performance, staging, and production are unified at published revision 8b7d595… and artifact 0f79737d…. Staging passes 14/14 with rollback; production passes 10/10.
- **Deployment is not launch.** Zoho delivery/reply-as, SHA-bound founder approval and authoritative lifecycle reconciliation remain unproved. launchReady stays false.

## 2026-08-12 - Session 82 truth update

- **Session truth is monotonic.** Startup authority resolves the newest committed session across status, handoff and SIL; older summaries cannot self-heal the project backward.
- **Trade consent is exact.** A live on-clock offer cannot mutate the draft until the player confirms the named outgoing/incoming picks and irreversible one-use consequence in an accessible dialog.
- **Progression truth belongs to the player.** Planning-friction receipts describe source-derived decisions and Architecture Review projects identity, active pressure, next proof and mastery path; neither surface predicts results or changes simulation outcomes.
- **Candidate evidence is exact.** Stable staging serves candidate `046e35df…` and artifact `656eb904…` with 14/14 checks and rollback. The 64 reviewed captures and hosted performance receipt bind that same deployable identity.
- **Artifact identity excludes only source-bound receipts.** Production exposed that `edge-policy-receipt.json` changes solely because it embeds the publication SHA. It is now excluded alongside health/manifest evidence; its policy fingerprint and every executable/content byte remain verified, and a regression test proves source-bound receipt changes cannot perturb product identity.
- **Production lineage is exact.** Receipt-only publication `a38ad346…` passed 10/10 provenance at the same `656eb904…` deployable artifact as candidate/staging `046e35df…`; the reconciler verifies the Git delta and rejects any deployable publication change.
- **Performance truth is route-specific.** Canonical `/` public-entry medians clear LCP/INP/CLS at desktop and mobile with edge policy observed. A separate direct-game diagnostic preserves its first-run tutorial layout-shift red and is not relabeled as the landing-page gate.
- **Test truth is not rounded up.** Four aggregate shards passed; the Studio shard had one transient aggregate failure and immediately passed 196/196 alone on unchanged source. All 1,069 shard tests are green, but only clean CI may establish the final aggregate receipt.
- **Deployment is not launch.** Reply-capable on-domain email, SHA-bound founder approval and authoritative lifecycle reconciliation remain unproved, so `launchReady` remains false.

## 2026-08-11 - Session 80 truth update

- **Command handoffs are exact.** Ranked command receipts publish `targetTab` and `targetId`; one shared authority waits for tab hydration, scrolls, focuses and reports unavailable targets without choosing for the player.
- **Accessibility is part of the authority.** Keyboard focus lands on the working surface, temporary focusability is applied only when needed, and reduced-motion preference changes scrolling from smooth to automatic.
- **Mastery identity is visible but non-causal.** Architecture Review renders the strongest source-derived signature with score, status and receipt count; an empty portfolio remains empty, and the interface states that no hidden bonus exists.
- **Outcome evidence is not invented.** The game-loop design review scores code-contract coverage only. No real first-session cohort exists, so no measured fun, retention or return-intent claim was made.
- **Candidate evidence is current.** Node passes 1,024/1,024; Playwright passes 40/40; Pages build/smoke passes; responsive evidence passes 176 states; 56 dark/light desktop/mobile captures are hash-bound and reviewed in `docs/visual-qa/LATEST.json`; the scoped workspace secret scan has zero findings.
- **Deployment truth is complete and still separate from launch.** Candidate `7becc573…` passed stable staging 14/14 and production at artifact `6781437a…`; CI, Pages and guarded backend dispatch `31544469131` are green; the external API is database-ready with production CORS and explicit cache behavior. That deployment evidence does not verify email, lifecycle or public-launch approval, so `launchReady` stays false.

## 2026-08-11 - Session 79 truth update

- **Agent negotiation has one mutation authority.** Persona, leverage and counters now enrich `/api/contracts/negotiate`; no alternate agent endpoint can claim a signature without changing the canonical contract.
- **Prediction truth closes during normal play.** The prior week settles before dashboard rollover, winner accuracy and margin error are distinct, receipts are bounded/idempotent, and League Story exports the same source.
- **Community cohort evidence is harder to fabricate.** Public mutations require allowed Origin plus a participant-bound capability, public evidence tier is forced to `browser-receipt`, and one address cannot issue enough distinct participants to cross k=5.
- **First-decision headroom is measured, not promised.** The shell is 610,654/730,000 bytes and 48/58 static modules with zero lazy leaks; each declared island retains at least 15% budget headroom.
- **Rendered UI evidence is current.** 158 browser captures passed responsive checks and 44 reviewed dark/light desktop/mobile states are hash-bound in `docs/visual-qa/LATEST.json`; review exposed and fixed two 34px modal close targets.
- **Deployment and launch remain separate truths.** Exact-SHA stable-staging proof is required before code publication. Even after code promotion, `launchReady` remains false until email, approval, lifecycle, Obelisk and edge evidence clear independently.

## 2026-08-09 - Session 76 truth update

- **The stale/unavailable degradation claim is now proven, not just implemented.** Session 75's `context/LATEST_HANDOFF.md` and the Community Stats copy both describe a graceful stale-cache and honest-unavailable fallback when the database is unreachable, but no test exercised either branch — the claim rested on reading the code, not on running it. Four new tests in `test/community-server.test.js` now drive a real HTTP server through both fallback paths, the oversized/malformed-body rejections, and the health/404 routes. No behavior changed; the previously-unverified claim is now verified.

## 2026-08-08 - Session 75 community truth updates

- **Community means participating anonymous browsers, not all users.** Participation is explicit opt-in and reversible; the live cohort begins at zero and no census, install, account or adoption claim is inferred.
- **Receipts are narrower than saves.** Only versioned allowlisted facts derived from successful contracts can leave the browser. Personal information, names, free text, raw saves, player identities, hidden ratings, IP storage and advertising identifiers are excluded.
- **Small cohorts remain private.** Category leaders and rare feats are suppressed below k=5; 24h/7d/30d measures include sample size, computed time, period, unit and interpretation.
- **The live zero is real.** Production snapshot status is warming, sample size is 0, latest receipt is null, and the interface says so. No synthetic production receipt was inserted.
- **One authority drives every representation.** Homepage Pulse, Stats Atlas and machine-readable twin use the same ETag snapshot. Local percentile comparison reads only a private browser ledger and uploads nothing extra.
- **Deployment truth is exact.** Staging 11/11 and production serve code c71a26065bb355900a3544f5d08b150b8c3191f5 with artifact 0a637f4703dad259786173bb3607de17b3610a994debf31150ec93ef27c1e1f3; the self-hosted API database is ready through Cloudflare with validated CORS/cache behavior. Backend run 31276918230 and Pages run 31276913656 are green.
- **Launch truth remains separate.** Healthy Community Stats does not clear reply-capable email, SHA-bound founder launch approval or authoritative lifecycle gates. Status remains public-unlaunched/HOLD.


## 2026-08-04 - Session 70 truth updates

- **Every public sentence is now build-gated to source truth.** A fail-closed gate derives the engine-system count (38, measured), forbids retired claims ('IndexedDB (250MB)', '50+ API Routes', 'last 10 major decisions') and internal lifecycle vocabulary (SPARKED/FORGE/founder) on all public surfaces, and fails the build when the promised og:image is absent. It caught real drift within hours of landing.
- **The homepage stopped claiming a server.** Source runtime metas now declare the deployed client-only truth; the dev server rewrites them at serve time because it is the one environment where a server exists. 'Connecting to server...' no longer ships on a zero-backend build.
- **The IndexedDB marketing claim became true before it was re-published.** The landing card claimed a 250 MB IndexedDB layer while the client had zero IndexedDB imports; the claim was removed in Wave 1 and re-added only after the hybrid store actually shipped in Wave 4.
- **Reward surfaces report receipts, not stories.** Beat cards read exact box scores, draft grade + round, and TradeService valuations; a bye is silent, a missing valuation shows no verdict, and trophies never award on absent data.
- **Rival personas are memory, not magic.** Grudge ledgers record only receipted interactions and persona lines are descriptive; no rating, bid, or outcome changes because of a name.
- **Artifact identity is platform-independent.** CRLF/LF checkout differences made fingerprints diverge between Windows and CI builds of the same revision; text assets LF-normalize at artifact copy and the local fingerprint now byte-matches the CI-built production artifact (078a91e9…).
- **Production parity is verified, not asserted.** Production serves exact candidate 870382c with provenance 8/8; staging serves the same SHA at 11/11 with a rollback receipt; release truth reconciles with evidenceValid true and launchReady false.
- Release truth: launch remains HOLD on exactly three human gates — delivered/reply-capable on-domain email (zoho.mail.admin MISSING), SHA-bound founder approval, and authoritative registry lifecycle. Production health, revision parity, staging authority, routes, and headers are all green at 870382c. No external readiness was fabricated.

## 2026-08-01 - Session 67 truth updates

- **Contracts expire.** `normalizeContract` defaults `yearsRemaining` with `??`, not `||`, so a zero-year deal stays zero. Until this session no contract in the game had ever run out, which made `advanceContractYear`'s expiry branch, `expireContracts`' `<= 0` check, and the entire S62 competing-offer free-agency market unreachable code. The surfaces that reported on those systems were not lying about their own state — they were correctly reporting a state that could never change.
- **The offseason pipeline's stage names now describe what the stage does.** `retirements` ages, retires and expires; a `free-agency` stage exists and holds for the GM across three bidding waves; `udfa` runs only the roster-legality backstop, normalization and cap rollover. `runOffseason` survives as a composed façade so `leagueSimulator` and the 100-year career regression are unchanged. Free-agent pool by stage moved from 0/0/0/0/0/0/0 to 126/126/126/126/109/105/102 — measured, not projected.
- **The draft order is derived from pick ownership.** `league.draftPicks[].ownerTeamId` plus awarded compensatory picks produce one slot per selection carrying its own provenance; `totalPicks` is derived, not the 224 constant. A save with no ledger falls back deterministically to the standings round-robin rather than stalling. `draftPickAssets` and `compPicks` were already published to the player; they now describe something the engine honours.
- **Compensatory picks are awarded on one finite-validated scale.** Loss and gain values previously used different denominators and the loss side was NaN, laundered to 0 on read. Ledger rows are validated finite at write; 19 awards league-wide in the measured season, all present as draft slots.
- **The offseason does not write the controlled roster.** `runFreeAgencyBackstop` takes an explicit authority parameter; the CPU retention window likewise excludes the GM's franchise. Backstop signings are recorded one aggregated row per club, so the transaction ledger accounts for movement it previously performed silently. An unfilled controlled roster returns a shortfall receipt naming exact positions and counts.
- **Pick assets are bounded and honest.** Picks are consumed at selection and elapsed drafts retired self-healingly; both the trade desk and `TradeService` floor at `year > currentYear`, so a spent or elapsed pick is neither listed nor tradeable.
- Player-facing surfaces are covered by tests that drive the browser modules against live dashboard state rather than fixtures, per the Session 64 finding that an engine half can ship green with its UI half dead.
- Release truth is unchanged and remains HOLD: canonical `/_health` 404 (stale external origin binding), incomplete edge headers, no received-message receipt, no founder approval, sibling-owned registry lifecycle drift. No ranked item this session touched the hosted surface and no external readiness was fabricated.

## 2026-07-27 - Session 58 truth updates

- Exact franchiseId now owns all browser authority epochs and save-sensitive memory; league/team/year identity is a deterministic legacy fallback, not concurrent authority.
- Return Digest continuation derives from the live Season chapter target. Exact focus and tab-only fallback are separately observable; neither claims game outcomes.
- GAME_LOOP.md defines implementation and evidence boundaries. No fun, comprehension, pace, retention, or causal performance lift is claimed without a real approved cohort.
- Four launch-evidence wording variants now collapse into one canonical external gate; the queue reports 0/3 viable innovations open rather than treating duplicates as new work.
- Verification authority is a fresh 499/499 source-bound Node receipt plus Playwright 20/20, responsive 53/53, Pages build/51-module reachability/smoke, promise observability 0 silent sinks, secret scan 0, sanitization 0, sitemap 10/10, and doctor blockingFailing 0.
- Release truth remains HOLD: staging 3/10, provenance 0/7, canonical /_health 404, incomplete edge headers, no received-message receipt or founder approval, and sibling-owned registry drift. Brevo credential readiness is recorded separately from zero observed project inbound evidence.

## 2026-07-25 — Session 56 truth updates

- Weekly planning has one decision-first composition authority across desktop and mobile; preview and commit receipts derive from the submitted command rather than interface copy.
- Local playtest journey evidence is allowlisted, bounded, tab-scoped, relative-time only, and included solely in explicit receipt export. No retention, pace, or causal outcome lift is claimed.
- The service bundle truthfully exposes only ContractService and CoachingService; four undelegated divergent scaffolds are removed instead of advertised as active architecture.
- Overview's Franchise Architecture surface is a progressive Week Room with one Now call, compact Season/Legacy horizons, and one native disclosure; underlying source authorities remain unchanged.
- A cold server required about 6.9 seconds to return `/api/state`. Timeouts no longer permit an automatic runtime fork, and `/public/` browser modules now resolve under the development server.
- Verification authority is a fresh 479/479 source-bound Node receipt plus Playwright 18/18, responsive 20/20, Pages/reachability/smoke, zero bounded working-tree secret findings, canon conformance 0 gaps, and doctor `blockingFailing: 0`.
- Release truth remains HOLD: same-origin staging is 3/10, `/_health` is 404 at the canonical origin, edge/provenance and received-mail evidence are incomplete, founder approval is absent, and the authoritative registry remains sibling-owned drift. Local green evidence is not substituted for launch proof.

2026-05-27 note:
- Public metadata now consistently reflects the proprietary rights posture.
- Football GM has a repo-local Codex startup workaround; global Codex Apps remains enabled outside this project.
- Startup brief generation and blocker preflight now run with local public-safe helper modules.
- GameSession lookup indexes and deterministic browser simulation job IDs are covered by targeted regression tests; full `npm test` timed out locally and remains unproven for this session.
- Obelisk posture is now declared in `context/OBELISK_ADOPTION.md` as Phase 0. The root-level `OBELISK.md` template remains uncommitted because it contains placeholders and is not the canonical project adoption file.
- Continuation verification on 2026-05-27 reconfirmed the targeted changed-surface gates; full `npm test` timed out again after 20 minutes.

2026-06-03 note:
- The prior full-suite timeout statement is obsolete. Default `npm test` now passes locally via bounded shards with 131 passing tests.
- The explicit `npm run test:long` smoke shard passes locally with 3 tests covering same-seed determinism and the career-realism verification pipeline.
- GitHub CI and Pages deploy workflows now include a static client smoke gate before public artifact upload.
- GitHub Pages launch remains blocked only on external provider/repo settings confirmation, not on missing repo-side smoke automation.

2026-06-04 note:
- The prior "external provider/repo settings confirmation" framing is obsolete: Pages is configured (workflow build type), and the real outage is a Cloudflare-origin 403 plus an expired bad_authz GitHub cert on the org root repo's custom domain. The remaining action is Cloudflare-side (founder runbook in TASK_BOARD).
- The "CI matrix green" claim from Session 13 was never true in Actions: both browser-dependent jobs hung at the Playwright install and were timeout-cancelled. Local shard results were accurate; the CI claim is now corrected and the install step is defended. Default suite is 149 passing tests locally.
- New derived surfaces (rivalry strip, epilogue, challenge codes, integrity stamps, feedback URLs) are covered by 18 new tests in the runtime shard.

2026-06-07 note:
- The documented Studio protocol surface now has project-local shims for the helper commands that live `/start` preflight proved were missing; `test:studio` covers the command load path.
- The test suite inventory has grown to 153 known tests across default shards after adding draft pressure, launch readiness, and protocol-shim coverage. This session reran affected/default-adjacent surfaces: core, runtime, studio, Pages build, and Pages smoke.
- The public-domain blocker remains true and intentionally visible: the game repo can explain and surface the Cloudflare/GitHub Pages issue, but it should not silently mutate the shared org-root domain without credentials or founder direction.
- Session 17 reran the full default suite (`npm test`: 153/153), Pages build, and Pages smoke. The repo-local startup shim surface is green, while the newer closeout cost ledger and closeout-brief renderer scripts are not present in this public repo and should be propagated or shimmed before relying on canonical closeout automation.

2026-06-08 note:
- The Launch Readiness public-domain row is no longer a hardcoded permanent blocker. It defaults to the known Cloudflare/GitHub Pages blocker, but can now represent `Ready` or `Needs check` only from explicit status evidence.
- The default test inventory is now 156 passing tests: core 54, runtime 75, sim-contract 22, sim-realism 1, studio 4. `npm test`, `npm run build:pages`, and `npm run smoke:pages` all passed in Session 18.
- Beta feedback issue URLs can include launch-readiness rows and still avoid personal data, tokens, or credentials.

2026-06-15 note (Session 19):
- The mobile overlay is no longer a static action row only. It now derives draft, cap, injury, deadline, news, and advance-week priorities through `buildMobileDecisionDeck()` and renders visible General Manager decision cards in the browser UI.
- Beta feedback issue URLs can now include a compact franchise fingerprint (team, record, cap posture, top need, active pressure) while still avoiding personal data, tokens, credentials, local storage, and save payloads.

2026-06-15 note (Session 20):
- Narrative event IDs are now deterministic (narr-{year}-{week}-{type}-{player}) — no Math.random() ID generation remains in the engine.
- `league.franchiseLore[]` is a new persisted array (MAX 20 entries) that accumulates LEGEND_FAREWELL blurbs; it is exposed in the dashboard state via `getAugmentedState()`.
- GM reputation (tradeStyle/capStyle/cultureStyle + trade ask multiplier) is now computed from career data and wired into CPU trade negotiations.
- Priority Inbox CRITICAL items now expose Take Action deeplinks to relevant tabs — previously the inbox was view-only.
- `public/lib/rivalCoachIntel.js` is a new self-contained browser module; `public/lib/tabOverview.js` now imports from it.
- Smart-quote bug in `seasonEpilogue.js` lines 176-177 used U+201C/201D as JavaScript string delimiters; fixed by replacing all curly quotes with ASCII. Previously undetectable in browsers; breaks Node.js module parsing.
- The default test inventory is now 184 passing tests. Core 54 · runtime 79 · sim-contract · sim-realism · studio 5 · session20-features 20 · remainder in existing suites.
- The default test inventory is now 161 passing tests: core 54, runtime 79, sim-contract 22, sim-realism 1, studio 5. `npm test`, `npm run build:pages`, `npm run smoke:pages`, and Playwright mobile screenshot checks passed in Session 19.

2026-06-30 note (Session 21):
- The active audit for this arc is `docs/AUDIT_2026-06-30_SESSION21.*`; the older untracked Session 19 audit is preserved as historical context but was not used as proof of current infrastructure-rubric completion.
- The default test inventory is verified as 161 passing tests in this run: core 54, runtime 79, sim-contract 22, sim-realism 1, studio 5. The prior 184-test Session 20 note is treated as historical and not reused for Session 21 evidence.
- `node scripts/ops.mjs doctor --json` now classifies GitHub Pages repo-secret work as agent-attemptable with `github.repo` and `gh auth status`; Cloudflare custom-domain remediation remains not auto-ready from this repo.
- SIL v6 Impact intentionally remains 0/1000 with needs-instrumentation rows. That is an honest missing-measurement signal, not a quality score to inflate manually.
- Follow-up correction: Session 21 remote CI failed the UI gate because `buildLaunchReadinessRows()` assumed non-null launch-readiness inputs. The fix is committed in-browser code, not a test relaxation; verified by Playwright UI 9/9 and default suite 162/162.

## 2026-06-30 — Session 22 truth updates

- CI follow-up truth repair: player history no longer renders an empty archive when a selected player has no logged timeline rows for the active filter; the UI shows a selected-player fallback card and table row instead.
- Mobile Loop truth repair: `public/app.js` now imports and calls `mobileLoop.js`; the Settings toggle no longer relies on undefined globals, and the enabled overlay refreshes after Advance Week state mutation.
- Determinism truth repair: runtime `Math.random()` usage is removed from event IDs/callers; the only remaining `Math.random()` grep hit is the intentional test cache-busting import in `test/create-api-client.test.js`.
- Canon truth repair: `check-canon-conformance` now reports 0 gaps after adding rolling-status markers and `prompts/initiate.md`; `context/CANON_ADOPTION.md` records the active posture.
- Launch truth unchanged: Cloudflare/GitHub Pages public-domain readiness remains blocked until public URL evidence changes.

## 2026-06-30 — Session 23 truth updates

- Browser affordance truth repair: Season Newsletter and Cap Casualty buttons no longer call undefined functions; focused source tests cover both contracts.
- Ticker truth repair: live news ticker output now targets the actual `#newsTickerContent` DOM node, not a nonexistent `.news-ticker-track` child.
- Commissioner truth repair: the client-only runtime and browser UI now agree on create/join/ready/advance payload and status fields; `test/local-api-runtime.test.js` covers the flow.
- Public surface truth repair: contact/privacy/terms/agents/llms/sitemap files exist in `public/`, are linked from primary pages, are copied by the Pages build, and are asserted by static smoke.
- Launch truth refinement: public URL probe returned HTTP 200 and GitHub Actions/Pages workflows are green, but GitHub Pages API still reports `bad_authz` on the custom-domain certificate. Do not mark full launch readiness until post-push public route smoke and certificate state are verified.

## 2026-06-30 — Session 23 post-push route correction

- Post-push route smoke found the new project-path compliance routes (`/vaultspark-football-gm/contact.html`, `privacy.html`, `terms.html`, `agents.json`, `llms.txt`, `sitemap.xml`) were not served from the live custom-domain path even though the Pages workflow and local smoke were green.
- Root cause fixed repo-side: `scripts/build-pages.mjs` now mirrors the generated artifact under `static/vaultspark-football-gm/`, and `scripts/smoke-pages.mjs` asserts the mirrored files so the deployed custom-domain/project-path shape is covered before upload.
- Launch truth unchanged: GitHub Pages API still reports custom-domain certificate `bad_authz`/expired `2026-06-02`; the route packaging fix is not a certificate remediation.

## 2026-06-30 — Session 23 deployed artifact vs live domain truth

- Deployed Pages artifact for commit `3c3e795` contains `vaultspark-football-gm/contact.html`, `agents.json`, `.well-known/llms.txt`, `sitemap.xml`, and supporting assets.
- Live custom-domain route smoke after that successful Pages deploy still returns 404/fallback for the new project-path compliance routes. This disproves a repo-artifact-only root cause and keeps launch readiness blocked on the external custom-domain routing/certificate layer.

## 2026-06-30 — Session 24 truth updates

- Startup brief truth repair: the first five SIL category rows now derive from `PROJECT_STATUS.json.silCategoriesV3` when the SIL log only has prose category notes, so a 921/1000 brief no longer renders false zero bars.
- Protocol truth repair: `node scripts/ops.mjs innovation-pack` now exists and produces source-derived candidates; prior notes saying the command is unsupported are obsolete after this session.
- Guard truth repair: the Windows no-window guard now detects dynamic `import('node:child_process')` as well as static imports and `require()`.
- Task-board truth repair: old rows for Pages CI, GameSession lookup indexes, and closeout renderer shims now reflect the later completed state already documented in the same board.
- Launch truth unchanged: external custom-domain certificate/routing remediation remains blocked on provider/dashboard state, not repo-side packaging or tests.

## 2026-07-01 — Session 25 truth updates

- Rebrand truth repair: `Franchise Architect: Football`, `franchise-architect-football`, and `https://playfranchisearchitect.com/` are now the canonical public identity across package metadata, public pages, agent metadata, sitemap, feedback URLs, and Pages build/smoke paths.
- Route truth repair: local Pages smoke now covers root-domain output plus canonical and legacy mirrored paths. This proves the artifact shape, not the post-push live domain state.
- Engagement truth repair: scouting narratives, reveal tiers, trade-deadline pressure cards, Hall of Fame ceremony sharing, and sim-watch field position feedback are wired through browser modules and passed full suite/UI verification.
- Process truth repair: `check-windows-hide` caught a raw dynamic `node:child_process` import in `render-startup-brief.mjs`; the regression was repaired before closeout.
- Launch truth update: the old `vaultsparkstudios.com/vaultspark-football-gm` blocker wording is stale for the new canonical identity. Launch/SPARKED remains blocked until `football@playfranchisearchitect.com` forwarding/copying and post-push public route/domain evidence are verified.

## 2026-07-01 — Session 26 truth updates

- GM Decision truth repair: decision choices are no longer discarded by the browser. They now flow into advance-week, are validated by `gmDecisionConsequences`, write source-of-truth ledgers, and surface in dashboard state.
- Context-meter truth repair: live `pctUsed` from `scripts/context-meter.mjs` is treated as a percentage in the startup brief. The regenerated brief shows `1% used` instead of the false `100% used` boundary case.
- Queue truth repair: `parseUnifiedItems()` now handles three-column task tables and normalizes `✅ Done` rows as done, so completed rows do not re-enter open queues.
- Innovation-pack truth repair: intentional guard/sentinel marker lines are no longer treated as unfinished work. The remaining dry-run candidate is latest-audit follow-through only.
- Launch truth unchanged: launch/SPARKED remains blocked until `football@playfranchisearchitect.com` forwarding/copying and post-push public route/domain evidence are verified.

## 2026-07-01 — Session 27 truth updates

- Protocol cache truth repair: `scripts/cache-genius-list.mjs` now exists and writes `.cache/genius-list.json`; it selects the newest audit by filename date/session so verification-side file touches cannot resurrect older audit state.
- Startup brief truth repair: the canonical HUMAN PRESSURE block renders even when open owner-action pressure is zero, so validation is clean without inventing blockers.
- Browser smoke truth repair: when a GM Decision prompt appears during advance-week, Playwright now handles the expected modal instead of misclassifying the flow as a hung simulation.
- Test truth repair: Playwright advance-week smoke now handles the expected GM Decision modal path introduced by Session 26's real consequence loop.
- Launch truth unchanged: launch/SPARKED remains blocked until `football@playfranchisearchitect.com` forwarding/copying and post-push public route/domain evidence are verified.

## 2026-07-01 — Session 28 Truth Audit

- Tutorial truth: `public/lib/tutorialCampaign.js` exported styles but the app did not inject them; `public/app.js` now imports and calls `injectTutorialStyles()` before mounting the tutorial.
- Launch posture truth: `context/STUDIO_MANIFEST.json` no longer claims `SPARKED` while `PROJECT_STATUS.json` still records public-unlaunched launch blockers; manifest status is `FORGE`.
- Launch evidence truth: `audits/launch-evidence-2026-07-01-session28.json` reports public routes reachable, but status remains `blocked` because on-domain email forwarding/copying has no delivery receipt. No fabricated evidence was used to pass the gate.

## 2026-07-02 — Session 29 Truth Audit

- Genius-cache truth repair: `.cache/genius-list.json` previously judged freshness by file mtime alone and derived done-status from a done-words regex applied to ranked-plan prose, which misclassified an item containing "unverified" as done and left genuinely-shipped items stuck open. `--check` is now content-aware (recomputes and diffs item set + status against the audit's Execution Log by slug, word-anchored) instead of trusting timestamps.
- Test-count truth: default `npm test` grew from 173 to 270 tests this session (97 new, across 13 new files) covering every shipped item; both counts are from real, directly-verified `node --test` exit codes, run twice across the full suite.
- Test-isolation truth: a real cross-file test collision was found and fixed before commit (`test/modal-manager.test.js` vs `test/create-api-client.test.js` under `--test-isolation=none` — see `context/DECISIONS.md` 2026-07-02). This is recorded because it demonstrates the second full-suite run caught something the first run's shard-by-shard verification did not; both are legitimate verification passes and the fix is real, not a masked flake.
- Playwright UI truth: `npm run test:ui` could not be verified locally this session — it hung on two separate attempts (including after a fresh browser install) with zero output, alongside 93 lingering node.exe processes observed system-wide. This is recorded honestly as NOT VERIFIED rather than assumed passing from Session 28's last-known-good result. No code change in this session touches Playwright's browser-launch path; CI carries its own documented install/launch workarounds and will verify on push.
- Launch truth unchanged: launch/SPARKED remains blocked until `football@playfranchisearchitect.com` forwarding/copying and post-push public route/domain evidence are verified. Not touched this session.
## 2026-07-02 — Session 30 Truth Audit

- Audit follow-through truth: the three Session 29 deferrals are now complete. `what-if-replay`, `silent-error-surfacing`, and `service-scaffold-honesty` are no longer open genius-list work.
- Counterfactual truth: Monday Morning QB replay is explicitly non-canon and covered by mutation-safety tests; it never changes standings, stats, records, saves, or injuries.
- Error-surfacing truth: several previously empty catches now render visible panel errors or action errors. Records and archetype loaders were corrected to propagate failures so the visible handlers actually run.
- Service-extraction truth: service scaffolds are now bound on `GameSession`, but production delegation is still incremental. Comments now say extraction target/parity target instead of claiming completed ownership.
- UI truth repair: Playwright caught the return digest overlay intercepting Settings navigation after reload. It is now non-modal status UI; `npm run test:ui` passes 9/9.
- Verification truth: current tree passed `npm test` 273/273, Playwright UI 9/9, Pages build/smoke, windows-hide, Wave guard, startup brief validation, secrets audit, blocker preflight, and canon conformance 0 gaps.
- Launch truth unchanged: launch/SPARKED remains blocked until `football@playfranchisearchitect.com` forwarding/copying and post-push public route/domain evidence are verified.

## 2026-07-02 — Session 31 Truth Audit

- Genius-cache truth repair: `scripts/cache-genius-list.mjs` now falls back to `context/TASK_BOARD.md` Done/Blocked rows when an audit lacks an Execution Log. This fixes the live defect where completed Session 29/30 audit items were still shown as open in `.cache/genius-list.json`.
- Queue truth: regenerated `.cache/genius-list.json` reports the latest audit as exhausted with 0 open items.
- Launch truth: `audits/launch-evidence-2026-07-02-session31.json` reports `routesOk=true` for all checked public routes on `https://playfranchisearchitect.com`, but status remains `blocked` because on-domain email forwarding/copying is still unverified.
- UI verification truth: first Session 31 Playwright aggregate failed because the history-awards test seeded server state through raw API calls without updating browser state, then depended on a later Settings save to pull that state into the UI. A localhost-only dashboard sync hook now makes the test assert the seeded state directly; full Playwright UI rerun passed 9/9.

## 2026-07-02 — Session 32 Truth Audit

- Queue truth: Session 29/30/31 work is still exhausted; `.cache/genius-list.json` is fresh against `docs/AUDIT_2026-07-02_SESSION32.md` with 0 open items.
- Tutorial modal truth: first-run tutorial dialog now uses `openModal`/`closeModal`; it closes the focus trap before rerender/removal and focused source coverage asserts that wiring.
- Verification truth: the aggregate `npm test` wrapper timed out before a suite summary, so it was not counted as green. Direct named shards passed with real exit codes: core 64, runtime 110, sim-contract 63, sim-realism 1, studio 37 (275 total). Playwright UI failed twice due server/dev-runner flake, then passed 9/9 with webserver debug output; this is recorded as rerun-verified, not first-try green.
- Launch truth: `audits/launch-evidence-2026-07-02-session32.json` reports all checked live routes OK, but status remains blocked because on-domain email forwarding/copying has no real receipt. No SPARKED flip was claimed.

## 2026-07-03 — Session 34 Truth Audit

- Launch Readiness truth repair: the browser readiness panel now exposes the true current launch blocker as a dedicated Contact Email row. It defaults to Unverified until explicit evidence proves `football@playfranchisearchitect.com` forwards/copies to Studio operations.
- Domain copy truth repair: the readiness fallback no longer names the stale `vaultsparkstudios.com` blocker; it names `playfranchisearchitect.com` and requires current origin/routing evidence.
- Feedback truth repair: beta feedback issue bodies now include the Contact Email readiness row, so tester reports carry launch-gate context without secrets.
- UI accessibility truth: the theme customizer is no longer mouse-only polish; Playwright proves focus handoff, arrow-key segmented control navigation, Escape close, and focus restore.
- Verification truth: current tree passed `npm test` 276/276, Playwright UI 16/16, Pages build/smoke, sitemap compliance 10/10, release/cost gates, canon conformance 0 gaps, windows-hide, Wave guard, secrets audit, blocker preflight, and PROJECT_STATUS invariant check. Sitemap compliance required an escalated rerun because the Windows sandbox failed before executing the read-only command.
- Launch truth unchanged: no SPARKED flip. Email forwarding/copying still lacks real received-message proof, and live origin/routing must be verified after deployment.

## 2026-07-03 — Session 35 truth updates

- Modal accessibility truth repair: Season Review, Pre-Game Tactical Brief, Draft Pick Reveal, Franchise Moment, GM Decision, Agent Negotiation, Keyboard Shortcuts, and Priority Inbox now use the same shared modal lifecycle instead of claiming or behaving like modals with inconsistent focus behavior.
- Markup truth repair: high-frequency overlays that function as dialogs now expose dialog semantics and labels in `public/game.html`.
- Queue truth: Session 34 audit follow-through is exhausted; Session 35 generated a new live audit and shipped both ranked items. Launch/SPARKED remains blocked on real email receipt plus current live origin/routing evidence.

## 2026-07-04 — Session 36 truth updates

- Tutorial theme truth repair: first-run tutorial CSS now consumes the shared theme token system instead of hard-coded dark surfaces/text, so light-mode onboarding matches the product-level theme contract.
- Queue truth: `docs/AUDIT_2026-07-04_SESSION36.md` contains only the shipped ranked item; stale latest-audit follow-through is recorded as rejected evidence, and `.cache/genius-list.json` is exhausted with 0 open items.
- Verification truth: current tree passed `npm test` 278/278, Playwright UI 17/17, focused browser wiring 8/8, focused theme 8/8, Pages build/smoke, windows-hide, Wave guard, secrets audit, and blocker preflight.
- Launch truth unchanged: live route checks are reachable, but Launch/SPARKED remains blocked until on-domain email forwarding/copying has real received-message proof.

## 2026-07-04 — Session 37 recovery truth updates

- Recovery truth: the previous session did not complete closeout. Session 37 audit/product changes were uncommitted on top of the Session 36 commit, with a stale Session 36 lock still present.
- Mobile loop truth repair: `public/lib/mobileLoop.js` now derives pressure cards from dashboard/news source-of-truth instead of leaving mobile users with actions but no compact "why this matters now" readout.
- Navigation truth: pressure cards are real buttons that route to the relevant tab and dispatch `vsfgm:mobile-pressure`; they are not passive decoration.
- Integrity truth: `docs/AUDIT_2026-07-04_SESSION37.json` parses, no changed NDJSON exists, and `~/.claude.json` parses cleanly when checked outside the Windows sandbox.
- Verification truth: direct default shards passed 280/280 (core 64, runtime 115, sim-contract 63, sim-realism 1, studio 37), focused mobile-loop passed 7/7, syntax check passed, and doctor returned no items. Aggregate `npm test` timed out twice under the harness before printing a final summary and is not counted as green.
- Launch truth unchanged: Launch/SPARKED remains blocked until on-domain email forwarding/copying has real received-message proof and current live origin/routing evidence remains green.
## 2026-07-04 — Session 38 truth updates

- Mobile decision truth repair: mobile mode now fetches the same `/api/gm-decision` source used by the desktop advance gate and renders the first pending decision as the first decision-deck card.
- State truth: `state.mobilePendingDecision` is the single app-shell handoff into `buildMobileDecisionDeck()`; no parallel mobile-only decision engine was invented.
- Verification truth: current tree passed direct default shards 282/282 (core 64, runtime 117, sim-contract 63, sim-realism 1, studio 37), focused mobile-loop 9/9, syntax checks for `public/lib/mobileLoop.js` and `public/app.js`, Pages build/smoke, windows-hide, Wave guard, secrets audit, blocker preflight, genius cache check, and doctor no items.
- Launch truth unchanged: Launch/SPARKED remains blocked until on-domain email forwarding/copying has real received-message proof and current live origin/routing evidence remains green.

## 2026-07-04 — Session 40 Truth Check

- Mobile GM decision overlay truth improved: `/api/gm-decision` async results are now ignored if the dashboard phase/year/week/team snapshot changed before the response returns.
- Failed mobile decision refreshes now clear stale `state.mobilePendingDecision` and repaint the mobile deck, avoiding ghost decision cards.
- Generated mobile overlay attributes/classes now use quote-safe `_escAttr()` rather than text-only escaping.
- Launch/SPARKED remains blocked on real `football@playfranchisearchitect.com` forwarding/copying receipt plus current live-origin/routing evidence; no launch readiness was force-greened.

## 2026-07-04 — Session 41 truth updates

- Mobile fallback decision truth repair: `public/lib/mobileLoop.js` already emitted `vsfgm:mobile-decision` for non-inline mobile cards; `public/app.js` now listens for `choose-gm-decision` and routes it through the existing GM Decision modal and consequence path.
- Queue truth: `docs/AUDIT_2026-07-04_SESSION41.md` contains one shipped ranked item; `docs/INNOVATION_PACK.md` marks latest-audit follow-through shipped; `.cache/genius-list.json` is exhausted with 0 open items.
- Verification truth: current tree passed focused mobile-loop 12/12, default `npm test` 285/285, Playwright UI 17/17, Pages build/smoke, doctor no items, windows-hide, Wave guard, secrets audit, blocker preflight, cache check, and canon conformance 0 gaps.
- Launch truth unchanged: Launch/SPARKED remains blocked until on-domain email forwarding/copying has real received-message proof and current live origin/routing evidence remains green.

## 2026-07-06 — Session 42 truth updates

- Audit sampler truth repair: `scripts/sample-codebase.mjs` now exists and provides deterministic, bounded, JSON-capable code sampling for `/audit`; recent audit notes saying the sampler is absent are obsolete after this session.
- Genius-list truth repair: `node scripts/ops.mjs genius-list` no longer reports that no local generator is configured. It writes `.cache/genius-list.json` through the latest-audit cache helper and prints a parseable open/exhausted cache summary.
- Queue truth: `docs/AUDIT_2026-07-06_SESSION42.md` contains two shipped ranked items; `docs/INNOVATION_PACK.md` marks latest-audit follow-through shipped; `.cache/genius-list.json` is exhausted with 0 open items.
- Verification truth: current tree passed focused studio smoke 18/18, default `npm test` 287/287, Playwright UI 17/17, Pages build/smoke, windows-hide, Wave guard, secrets audit, blocker preflight, and canon conformance 0 gaps.
- Launch truth unchanged: Launch/SPARKED remains blocked until on-domain email forwarding/copying has real received-message proof and current live origin/routing evidence remains green.

## 2026-07-06 — Session 43 truth updates

- Prospect narrative truth repair: Draft War Room targets now show deterministic prospect backstory from the same source-derived narrative helper used by scouting/reveal surfaces, rather than only numeric need/rank/steal-risk data.
- Queue truth: docs/AUDIT_2026-07-06_SESSION43.md contains one shipped ranked item; docs/INNOVATION_PACK.md rejects stale latest-audit follow-through with evidence; .cache/genius-list.json is exhausted with 0 open items.
- Verification truth: aggregate npm test timed out twice under the harness before a summary and is not counted as green. Direct named shards passed with real exit codes: core 64, runtime 121, sim-contract 63, sim-realism 1, studio 39 (288 total). Playwright UI passed 17/17, and Pages build/smoke passed.
- Launch truth unchanged: Launch/SPARKED remains blocked until on-domain email forwarding/copying has real received-message proof and current live origin/routing evidence remains green.

## 2026-07-06 — Session 44 truth updates

- Trade Deadline Frenzy no longer claims only generic market advice. The browser panel now renders deterministic structured recommendation cards from live dashboard inputs, including partner, need, ask, cap impact, rule constraint, and risk.
- The new deadline recommendations remain non-executable until the user enters the existing Trade Desk, preserving trade evaluator/cap/challenge source-of-truth boundaries.
- Test inventory is now 292 direct default shard tests: core 64, runtime 125, sim-contract 63, sim-realism 1, studio 39. The new trade-deadline test is assigned to the runtime shard and covered by the shard guard.
- Launch truth unchanged: launch/SPARKED remains blocked until football@playfranchisearchitect.com forwarding/copying and current live-origin/routing evidence are verified.

## 2026-07-06 — Session 45 truth updates

- Queue truth: Session 45 generated `docs/AUDIT_2026-07-06_SESSION45.*`; `scripts/cache-genius-list.mjs --write` reports 0 open items after the execution log and runtime shard assignment landed.
- Test truth: `npm test` timed out before a summary and `npm run test:ui` returned exit 1 with no captured output. Neither is reported as green. Counted evidence is direct named shards 294/294 plus direct Playwright 17/17.
- Browser truth: `leagueStoryCardBtn` is visible in Settings and `public/app.js` wires it to `buildLeagueStoryFromDashboard()` and `downloadLeagueStory()`; `test/browser-wiring.test.js` now guards that path.
- Launch truth: no launch/SPARKED flip attempted; email forwarding/copying remains unverified without a real received-message receipt.
## 2026-07-15 — Session 46 truth updates

- Usage truth: game-day shares now derive from persisted room intent plus live availability and merit. Healthy QB1/K1/P1 own 100% of their role; the next healthy specialist inherits it only while unavailable.
- Stat truth: situational box-score conversions come from stamped plays and drive identity. The new Impact Index is visibly a deterministic derived index, not an observed NFL statistic.
- Player truth: Potential is persisted and exposed beside Overall across browser/API/stat surfaces; dossier prose, facts, achievements, traits, and milestones derive from player identity, attributes, age, health, and real stored production.
- Interaction truth: static game buttons are contract-inventoried. The Agent Negotiation IDs now match rendered markup, and Commissioner feedback failures are surfaced rather than swallowed.
- Queue truth: all six Session 46 audit items and both second-order Innovation Pack candidates are shipped; the genius cache reports exhausted with 0 open.
- Verification truth: direct canonical shards passed 317/317, direct Playwright passed 18/18, Pages build/smoke passed, Studio gates passed, and doctor returned no items.
- Launch truth unchanged: launch/SPARKED remains gated on real email-receipt and live-origin proof.

## 2026-07-16 — Session 47 recovery truth updates

- Recovery truth: the previous session stopped during `/implement`; Session 47 existed only as uncommitted audit/code/test changes on top of the Session 46 commit. No closeout boundary existed before this recovery.
- Integrity truth: all changed/untracked JSON parsed, all changed/untracked JavaScript syntax-checked, `git diff --check` is clean, and `~/.claude.json` parses with standards-compliant `JSON.parse`. PowerShell's case-insensitive object converter warning was not JSON corruption.
- Decision truth: General Manager choices now execute existing safe mutations or create persisted deadline commitments; buy/sell success uses directionally distinct transaction evidence, and resolved promises write cross-system receipts.
- Simulation truth: accelerated loops pause only on dashboard-derived phase/playoff/decision/commitment boundaries and show actual controlled-team results; the film receipt explicitly avoids causal claims.
- Persistence truth: Priority Inbox data/read/resolution state is scoped by stable franchise identity and rebuilt idempotently from event IDs.
- Queue truth: all six Session 47 audit items plus latest-audit follow-through and the Playwright-discovered runtime-switch refinement are shipped; Genius cache is exhausted with 0 open items.
- Verification truth: direct shards pass 337/337 and Playwright 18/18. The aggregate `npm test` wrapper produced no output for five minutes and is not counted as green.
- Launch truth unchanged: launch/SPARKED remains gated on real email-delivery and current live-origin proof.

## 2026-07-16 — Session 48 truth updates

- Injury truth: `weeksRemaining` has one weekly mutation authority. Rehab projections use actual player/team/facility/reinjury inputs and are explicitly modeled, not clinical claims.
- Persistence/security truth: GitHub tokens are memory/tab-session only, masked token text is invalid, legacy persistent copies are deleted, and both inline and remotely fetched Gist payloads are bounded and integrity-verified before import.
- Lifecycle truth: local contract, manifest, audience, public status, and blocked launch evidence agree on FORGE/public-unlaunched. The authoritative portfolio registry still reports SPARKED; doctor exposes that as one nonblocking warning and signed Ark cargo requests correction.
- Progress truth: offseason roster maintenance refreshes lookup authority, validates every mutation, records `lastRosterMaintenance`, and cannot spin indefinitely when a release fails.
- Runtime truth: once the server has answered successfully, transient background polling failures cannot silently change the league's state authority to browser-local mode.
- Test truth: counted direct evidence is 358/358 Node tests and Playwright 18/18. One timed runtime wrapper and an earlier 17/18 browser run are retained as superseded diagnostic evidence, not claimed green.
- Release truth: current public routes pass 8/8 and sitemap passes 10/10, but no real received-message receipt proves `football@playfranchisearchitect.com` forwarding/copying. Launch posture therefore remains FORGE regardless of the registry's stale SPARKED value.
- Cost truth: all work remains browser/static compatible and zero variable cost; Max Plan accounting is notional and does not generate an alarm.
## 2026-07-19 — Session 49 truth updates

- Public identity truth: the deploy repository is `VaultSparkStudios/vaultspark-football-gm`, not the nonexistent `franchise-architect-football` path formerly embedded in public links. The canonical origin remains `https://playfranchisearchitect.com`.
- Deploy truth: health and manifest artifacts identify source revision and hashed style asset, while the provenance attestor compares the live origin to an expected build artifact. Reachability alone is never treated as deploy currency.
- Launch truth: operational health explicitly reports `launchReady:false`. Missing HSTS/frame/CSP edge headers and missing received-message forwarding evidence remain blockers; fixtures must contain explicit evidence to pass.
- Runtime truth: server and browser weekly advancement now share one executor and receipt envelope. A server connection failure may establish browser authority once during bootstrap; concurrent failures coalesce, and established server authority is not silently forked.
- Persistence truth: future schemas, malformed franchise roots, corruption, and unknown integrity algorithms cannot hydrate an active league. Preflight and failed imports prove the current franchise remains untouched.
- Browser concurrency truth: high-risk async panel writes commit only under their captured authority/filter/sequence; `staleResponsesDiscarded` counts actual rejected writes. Same-authority refreshes remain valid after the Playwright root fix.
- Queue/test truth: Session 49 audit is 4 shipped / 0 open; Innovation Pack shipped two second-order candidates. Counted final evidence is aggregate 370/370, long 3/3, Playwright 18/18, and Pages build/smoke.
- Cost truth: every change remains deterministic, static-host compatible, and zero variable cost. Flat-rate plan accounting is not a product alarm or launch blocker.
## 2026-07-20 — Session 50 truth updates

- Decision truth: every pending General Manager decision is generated and validated by one scoped occurrence authority; defer preserves the occurrence and unavailable/stale choices cannot mutate the league.
- Transaction truth: weekly advancement occurs on a hydrated working copy and replaces runtime authority only after success. Refused Commissioner attempts reopen their gate and do not report stale state.
- Browser observability truth: degradation count, latest affected surface, retry state, and status derive from one bounded sanitized ledger; no console-only failure is counted as healthy.
- Build truth: all 39 retained browser modules are reachable from HTML/module entrypoints; proven orphans are removed and new ones block Pages build.
- Responsive truth: the exact static artifact has 20 passing dark/light captures across 390/768/1440 with zero page overflow/runtime errors and compliant critical touch targets.
- Deploy truth: `/games/franchise-architect/` is a physical published mount; every manifest-declared mount is checked for CSS, JavaScript, favicon existence and correct MIME. HTTP 200 HTML fallback is not accepted as asset health.
- Test truth: final direct evidence is 390/390 Node plus Playwright 18/18. Earlier Commissioner and shard-coverage failures are retained as superseded root-fix evidence, not claimed green.
- Launch truth unchanged: live launch/SPARKED remains gated on edge headers, received on-domain email evidence, current deploy provenance, and authoritative registry reconciliation.
- Cost truth: all changes are deterministic, static-host compatible, and zero variable cost; flat-rate plan cost is not an alarm.

## 2026-07-21 — Session 51 recovery truth updates

- Recovery truth: Session 51 stopped during `/implement` after four bounded feature commits; the fifth route-parity branch, innovation classification, verification, write-back, and push were only uncommitted or absent. The recovery preserved that boundary and did not recast partial work as a completed closeout.
- Integrity truth: no changed JSON/NDJSON existed at recovery start; every changed/untracked JavaScript file parsed; `~/.claude.json` and its guard were valid with zero recent corruption events; no command-output debris was present.
- Career truth: object/string champion records resolve through one helper, title credit is idempotent by season, persona progress is engine-derived, and only the declared destination-pull entitlement changes simulation inputs.
- Onboarding truth: the three first-run choices persist as a versioned receipt and mutate actual scheme, owner, and scouting authorities; pending scouting explicitly waits for a real draft class.
- Browser truth: silent promise sinks are statically blocked, failures enter one local sanitized/coalesced/retry-aware ledger, and direct-action errors remain visible.
- Runtime truth: 140 browser call sites resolve to 111 explicit method/path contracts implemented by both advertised adapters. Live representative reads/errors/mutations match shapes and state transitions; adapter-local storage is explicit and established server authority never silently falls back.
- Test truth: direct canonical Node evidence is 401/401 and Playwright is 18/18. Two short wrapper timeouts are non-evidence and are superseded only by direct named-shard exits; Pages build/smoke and focused API parity 3/3 also pass.
- Launch truth unchanged: live edge headers, received on-domain email evidence, current apex/deploy provenance, and authoritative registry reconciliation remain unverified, so no SPARKED/launch claim is made.
- Cost truth: all Session 51 work is dependency-free, deterministic/local or static-host-safe, and zero variable cost; flat-rate plan cost remains notional.
2026-07-21 note (Session 52):
- Interactive fast simulation and direct offseason progression now stop before controlled-team draft choices; only explicit Finish Draft or the named whole-season simulation command delegates them.
- Opening-contract completion is derived from persisted league receipt, weekly plan, controlled result, tactical film, and current owner expectation; no tutorial completion flag can fabricate progress.
- Mobile General Manager choice selection is non-mutating; both mobile and desktop use one weekly command coordinator.
- All task-board queue readers share one parser. The latest audit cache is exhausted at 0 open / 5 closed.
- The optional bundle script no longer exits successfully without building; its tested fallback invokes the canonical Pages builder and propagates failure.
- Fresh public sanitization is 0 critical / 0 warning. The portfolio release gate currently reads a stale 1-critical packet and expects a private CDR file that this public repository intentionally forbids.
- Launch evidence remains blocked: canonical `/_health` 404, incomplete edge headers, unreachable same-origin staging receipts, absent received-email proof, absent approval, and registry SPARKED/local FORGE drift.

## 2026-07-22 — Session 53 truth updates

- Mutation truth: a successful weekly command is committed even if secondary hydration fails; the UI reports committed-degraded state and retryable named loaders, never rollback.
- Test truth: 444/444 is authorized by an atomic receipt bound to the verified source/test/config digest. Documentation-only closeout edits do not counterfeit freshness.
- Tactical truth: identity tiers derive only from persisted executed film; previews describe directional fit and never predict results.
- Command truth: desktop and mobile use the same deterministic ranking and versioned explanation receipt; controlled decisions still block generic advancement.
- Evidence truth: contextual prompts are source-derived, local, snoozable/dismissible, and globally cadence-limited. Trends require three receipts and remain explicitly small-sample, self-selected, and non-causal.
- Public-boundary truth: every public HTML route has the exact proprietary footer; the orphan broker had no caller and depended on absent private policy, so removal is safer than pretending it was an integration.
- Release truth: local same-revision build/smoke/responsive evidence is green, but hosted staging is 3/10, current literal CI history is 3/5, canonical custom-origin health/headers and received email are unproved, approval is absent, and registry lifecycle conflicts. Launch is HOLD.
- Cost truth: no variable-cost service or dependency was introduced; flat-rate Max Plan cost remains notional.

## 2026-07-23 — Session 54 truth updates

- Session truth: startup freshness requires current date, coherent marker, closed-session identity, rendered next-session identity, and PROJECT_STATUS agreement; all known status mutators use the invariant writer.
- Cap truth: GameSession and ContractService expose one exact cap-ledger authority including overrides, rollover, and both dead-cap years.
- Learning-loop truth: only successful controlled weekly transactions append Architect's Ledger history; failed commands leave no row and save/restore preserves committed rows.
- Interpretation truth: tactic consistency and film alignment are descriptive bounded signals with sample size and explicit non-causation language.
- Public truth: all 11 HTML footers contain the exact proprietary notice and a valid HTTPS VaultSpark Studios link-back.
- Test truth: direct shards pass 452/452 and Playwright 18/18; initial aggregate/short observation timeouts are retained as non-evidence and superseded only by direct exits.
- Release truth: local Pages build/smoke and browser evidence are green, but hosted same-origin staging remains 3/10; no launch/SPARKED readiness is inferred.
- Cost truth: no dependency or variable-cost service was added; flat-rate Max Plan cost remains notional.

## 2026-07-24 — Session 55 truth updates

- CI truth: the scheduled realism verifier runs under Bash `pipefail`; `tee` can no longer reclassify a failed verifier as green, while report upload remains `if: always()`.
- Routing truth: session intent comes from the latest numbered intent and open rows in the latest session table; five-column task ledgers retain semantic columns.
- Simulation truth: accelerated tactics exist only when explicitly declared; each regular-season command records its own Architect receipt and observed alignment.
- Coaching truth: one session-bound authority owns staff lifecycle and lineage; role-aware IDs, duplicate-HC reconciliation, and traversal guards prevent false ancestry.
- Mastery truth: Results, Stewardship, Promise, and Identity are bounded receipt-derived paths; empty paths score zero and the focus coach grants no hidden bonus.
- Test truth: canonical aggregate Node suite passed 467/467 with direct exit 0 and a fresh source-bound receipt; Playwright passed 18/18.
- Visual truth: 20 responsive captures passed automated contrast, overflow, runtime-error, and touch-target checks. Manual AI image inspection is not claimed because the connected viewer failed before reading the files.
- Release truth: local evidence is green, but launch remains HOLD on hosted provenance, edge headers, received email, approval, and registry reconciliation.
- Cost truth: dependency versions were restored from the existing lockfile after exact package trust approval; no new dependency or variable-cost service was introduced.

## 2026-07-25 — Session 57 truth updates

- API truth: 111 browser contracts and 9 explicitly classified shared non-browser routes resolve across exact 120-route local and server adapters; missing and unexpected routes both fail parity.
- Routing truth: only the latest numbered intent and current open tasks affect mode classification; active agent family comes from the session lock and Codex receives no Claude-only model advice.
- Service truth: ContractService exposes only `getCapSummary`; the method-level manifest and reflection guard reject undelegated scaffolds.
- Mastery truth: identity score derives from committed evidence, continuity, and observed reinforce/counter adaptation; random tactic variety grants no points and no causal result is claimed.
- Season truth: one pure versioned chapter derives from phase/week and persisted opening/promise/owner/offseason receipts; unknown phase remains visibly unknown instead of guessed.
- Browser truth: the first-session Playwright journey completes rather than skips onboarding, applies the real contract, commits one weekly plan, and observes ledger, mastery, and Season-horizon transition.
- Visual truth: the required matrix covers 3 viewports × 2 themes × 7 core tabs plus setup/mobile/dialog evidence. The first run's 34px tutorial action failure is superseded by the 44px root fix and 53-capture direct rerun.
- Test truth: the first aggregate's unsharded chapter-test failure remains diagnostic non-evidence. After assigning the test to runtime, shard coverage passed and the full aggregate passed 489/489 with a fresh source-bound receipt; Playwright passed 19/19.
- Security truth: the project-scoped working-tree scan and current `.claude/settings.local.json` sanitizer each report zero findings. The earlier 8,005-hit scan was explicitly out-of-scope Studio Ops history and is not used as project evidence.
- Release truth: local implementation is green, but hosted provenance, canonical edge headers, received email, founder approval, and sibling lifecycle reconciliation remain absent. Launch is HOLD.
- Cost truth: no dependency, paid service, or variable-cost runtime was introduced; flat-rate Max Plan cost remains notional.

## 2026-07-27 — Session 59 truth updates

- Consent truth: saved local receipts are not published by default; only an explicitly selected bounded receipt enters feedback, and omitted excess context is disclosed.
- Input truth: `VSFC1` payload length and field shape reject before decode/parse work; valid historical round trips remain green.
- Plan truth: no weekly mutation occurs before source-derived review commit; revise recollects tactic and defer leaves league state unchanged.
- Hydration truth: Overview requests no secondary domains; each public tab owns an exact self-validating loader set, and failed secondary loads stay visible/retryable without rewriting commit truth.
- Test truth: early aggregate timeouts are non-evidence. The first complete repaired aggregate failed on two unsharded files; after exact ownership repair it passed 516/516. Post-push Linux CI then exposed two browser/source-truth gaps; both were root-fixed, and final direct canonical evidence passes 517/517 with a fresh receipt plus Playwright 20/20.
- Visual truth: 53 automated real-browser captures passed contrast, overflow, runtime-error, touch-target, viewport, and theme gates. Manual AI image inspection is not claimed because both connected readers failed at the Windows DPAPI boundary.
- Security truth: the absolute project-tree secret scan reports zero findings; an earlier sibling-root invocation is out of scope and not used as project evidence.
- Release truth: routes other than `/_health` are reachable, but canonical health is 404, HSTS/frame/CSP evidence is absent, received email and approval are absent, and registry lifecycle is sibling-owned. Launch is HOLD.
- Cost truth: no dependency, paid service, external model, or variable-cost runtime was introduced; flat-rate Max Plan accounting remains notional.
## 2026-07-29 — Session 60 truth updates

- Credential truth: repo-local capability checks derive shape from the canonical Studio capability map unless an explicit local map exists; corrupt local authority fails loud; outputs remain status-only.
- Context truth: model windows and notional token prices come from one model-router authority; flat-rate Max Plan accounting never triggers a cost alarm.
- Startup truth: profile age, local/registry lifecycle drift, and Genius queue exhaustion are fingerprinted source authorities rather than prose inferred from mtime alone.
- Thesis truth: player focus and adaptations are persisted intent only. They grant no score or simulation bonus; an adaptation requires prior film and resolves only in the next successful controlled transaction.
- Concurrency truth: expected-revision mismatch returns 409 with current thesis authority and leaves newer intent intact in both advertised runtimes.
- Lineage truth: pending and resolved thesis receipts derive a live validity verdict from ledger endpoints and exact observed-film text; tampered or missing evidence cannot remain green.
- Test truth: the initial 19/20 Playwright and aggregate shard-coverage failure are retained as non-evidence. Root fixes reran to Playwright 20/20 and canonical Node 539/539 with a fresh digest-bound receipt; the added clean-checkout authority contract is included.
- Visual truth: automated 53-capture dark/light responsive gates passed. Manual AI inspection is not claimed because viewer, Node runtime, and fallback image processing all failed before inspection.
- Release truth: local implementation is green, but canonical health/headers, delivered email, exact hosted provenance, founder approval, and sibling lifecycle authority remain absent. Launch is HOLD.
- Cost truth: no dependency, paid service, or variable-cost runtime was introduced; flat-rate Max Plan cost remains notional.

## 2026-07-29 — Session 61 truth updates

- Capability truth: definitions, status, live probes, and remediation instructions derive from one canonical operations authority; outputs expose no credential values.
- API truth: both advertised runtimes delegate Architect Thesis HTTP semantics to one shared handler; route-list parity is no longer the only equivalence claim.
- Architecture truth: the player’s declared focus baseline and current mastery portfolio are distinct source authorities; the review reports evidence delta and exact next action without predicting outcomes or claiming causation.
- Trade truth: TradeService owns evaluation and commit; a plan fingerprint binds mutable roster/pick/cap/rule/phase state and stale commit fails before mutation.
- Edge truth: generated policy fingerprint `sha256:33e2bee21d929395d5ee85d54bc76abbb8ea464926f22cd5747e27c309d8d883` covers exact inline script/style hashes and hardening headers. The live origin does not yet prove application.
- Test truth: the complete repaired aggregate passes 560/560 with a fresh source-bound receipt; Playwright passes 20/20; responsive evidence passes 53 captures; Pages build/reachability/promise-observability/smoke pass.
- Release truth: `/_health` is invalid, deployed revision is unknown, and HSTS/CSP/frame/permissions headers are absent. Delivered email, approval, and lifecycle reconciliation remain independent; launch is HOLD.
- Cost truth: no dependency, paid service, or variable-cost runtime was introduced; flat-rate Max Plan accounting remains notional.

## 2026-07-31 — Session 62 truth surface changes

- Dashboard truth: `GameSession.getDashboardState()` is the single payload authority; the browser adapter's augmentation layer is a passthrough, so `/api/state` and the client dashboard can no longer serve different shapes for the same route.
- Market truth: premium free agency resolves through one multi-bid market; outbid receipts name the exact winning terms; synthetic offseason players carry an `emergency-depth-signing` provenance receipt instead of appearing silently.
- Venue truth: every game result and box score carries an explicit venue receipt (home edge applied / rested / neutral site); the effect exists only as bounded per-game context boosts.
- Award truth: selection order is fully deterministic (playerId final tie-break), MVP pools are skill-position scoped, and the award-selection AV surface (pre-honor) is distinguished from the post-honor display surface.
- Owner truth: patience is a live weekly authority with per-week receipts naming why it moved; the ultimatum consequence lives on the commitment board and resolves with evidence at season end.
- Boot truth: the precache service worker serves static assets cache-first but never caches `/api/`, `_health`, `deploy-manifest.json`, or `edge-policy-receipt.json` — freshness evidence always comes from the network.
- Restore truth: snapshot-restored sessions construct the same service surface as new sessions; the restore path can no longer silently lack trade authority.
- Release truth: unchanged and still HOLD — hosted `/_health`, applied edge headers, received email, founder approval, and sibling lifecycle reconciliation remain independent external authorities.

## 2026-08-01 — Session 63 truth surface changes

- **Authority truth:** `src/runtime/franchiseAuthority.js` is the single classification authority for which commands act on behalf of a franchise. All 58 POST routes are named there as either team-scoped or explicitly exempt with a recorded reason, and a completeness test fails on any route in either adapter that is neither. Before this, no mutating command checked the acting team at all — `POST /api/staff` and `POST /api/owner` accepted an arbitrary `teamId` and wrote live simulation inputs for any club. The guard sits at the command boundary, not inside `GameSession`, so CPU AI maintenance still acts for all 31 rivals; a test asserts the boundary has not drifted inward.
- **Multiplayer truth:** an intent's acting team is bound from the author's lobby slot at apply time. `queueIntent` always stamped the authoritative team; `applyIntents` then discarded it. The originally submitted payload is preserved on the intent for audit, so the request and the authority are both visible.
- **Press truth:** post-game quotes are selected by a real hash over game id, year, week, tone and outcome. The previous character-sum seed read only the home team's first letter (every three-character team code made `charCodeAt(3)` the hyphen), so a franchise saw one quote per tone for its entire history. `topPerformer` now reads `boxScore.playerStats.{home,away}` — the shape the simulator actually produces — through the shared `src/stats/gameImpact.js`, which also replaced the inline season-MVP scorer, so the podium and the MVP ballot cannot name different players for the same game.
- **Podium truth:** the GM's own answer is recorded with receipts naming every point of owner patience, fan interest and chemistry it moved, and a promise made after a loss is what the following week's continuity follow-up resolves against. The engine-inferred tone remains only as the fallback for weeks the GM skipped and for saves predating the interactive podium.
- **Gameplan truth:** every simulated game carries a `matchupEdges` receipt naming the opponent unit read and its direction for both offenses, derived from the same unit ratings the drive engine uses. Teams expose split `runDefenseRating` / `passDefenseRating` from one source-of-truth computation, and the pre-game brief states the same read the engine acts on — including an explicit "no exploitable gap" state and an honest empty state when ratings are unknown.
- **Staff truth:** coaching ability is no longer writable by hand. `updateStaff` refuses rating changes with `reasonCode: staff-ratings-readonly`; ability comes only from hiring a candidate priced against `owner.staffBudget`, with firing charging dead money and owner patience. Head-coach identity is synchronised with the coaching tree on hire, fire and rename — the tree re-syncs the name on every dashboard build, so a change to the staff sheet alone was silently reverted.
- **League-generation truth:** staff and owner profiles are derived per club from a seed key rather than from a stub that returned a constant. Previously every team in every browser-created league shared identical coaching ratings, one tendency archetype, a `yearsRemaining` of 76 against a 1–7 domain, and byte-identical owner economics — so coaching and market size were constants, not variables, throughout the deployed game. League averages are unchanged; only the spread is new. Existing saves are untouched because both profile builders preserve values already present.
- **Test truth:** offer-generation coverage now samples several seeds for behaviour and asserts determinism separately and exactly, rather than depending on one seed landing inside a fixed window.
- **Release truth:** unchanged and still HOLD — hosted `/_health`, applied edge headers, received email, founder approval, and sibling lifecycle reconciliation remain independent external authorities. No launch evidence was fabricated, and the `registry SPARKED · local contract FORGE` warning remains correctly non-blocking and sibling-owned.

## 2026-08-01 — Session 64 truth surface changes

- **Server-adapter truth:** `src/server.js` is now covered by executing tests (`test/server-routes.test.js`) rather than only by source-text greps. The two adapters are proved equivalent by speaking HTTP to a real server, including the franchise authority boundary, and a guard asserts no mutating route may answer with a leaked runtime exception. This closed the gap that let `POST /api/press-conference` return HTTP 500 with a fully green suite.
- **Gameplan receipt truth:** the pre-game brief's opponent read now actually reaches the browser. `toDashboardTeam` projects `runDefenseRating`/`passDefenseRating`, without which `buildMatchupEdgeRead` always returned its honest "unknown" state and rendered nothing — the S63 claim that the read was "surfaced with a visible receipt" was true of the engine and false of the screen until this session.
- **Mobile-mode truth:** the decision deck auto-enables at ≤640px, the width at which `styles.css` actually collapses the desktop navigation. The S63 ≤980px band silently replaced the full game UI with a phone overlay on tablets and small laptops. A test binds the band to the responsive-evidence viewports so the two cannot disagree again.
- **Test-isolation truth:** `globalThis.fetch` stubs are restored by the files that install them. Under `--test-isolation=none` an unrestored stub is process-wide, so "the suite is green" previously depended on no test needing real network after those files loaded.
- **Save-payload truth:** snapshot weight is now measured and pinned (`test/save-payload-budget.test.js`). The recorded numbers state plainly that a `mode:"play"` franchise exceeds a browser localStorage budget within one season; this is an open blocker, not a solved problem, and the ceilings exist to stop it worsening rather than to bless it.
- **Release truth:** unchanged and still HOLD. `/_health` remains 404 on the live domain; re-verified this session as the external stale-origin binding (live serves S33 JSON-LD but not S62 `sw.js`), not an in-repo packaging fault.

## 2026-08-01 — Session 65 truth surface changes

- **Storage truth:** a played season is now persistable. Full season with weekly rolling backups plus a named save = **3.95 MB** against a 5 MB origin, measured end-to-end, with the save loading back into a working session. The S64 statement that "a franchise cannot finish one season" is no longer true and has been superseded.
- **Box-score truth:** `league.gameArchive` is the single box-score authority; stored week records keep only ids and scorelines and carry `gameId` so a full box score still resolves. Older archived games retain their complete statistical box score but not their drive log, and the box-score modal states that explicitly instead of rendering an empty play table.
- **Encoding truth:** stored snapshots are gzip+base64 with a self-describing prefix. Legacy plain-JSON saves decode unchanged; a build without `CompressionStream` writes plain JSON rather than failing. The integrity stamp covers the stored bytes in both cases, so its meaning is unchanged.
- **Backup truth:** rolling backups are bounded by bytes as well as count, and always retain at least one. The previous default retained up to 40 full snapshots, which is what produced `Auto-backup skipped: Browser storage is full` during ordinary play.
- **Migration truth:** every persisted-snapshot load path now goes through `migrateSnapshot`, including `/api/rewind/restore`, which previously restored without migrating. Loading a legacy franchise reclaims its stored payload rather than only affecting games played from that point on.
- **Release truth:** unchanged and still HOLD on external authorities. `/_health` remains 404 on `playfranchisearchitect.com` (stale origin binding, re-verified S64), and the delivered-email receipt, founder approval and registry lifecycle reconciliation are owned elsewhere.

## 2026-08-02 — Session 68 truth surface changes

- **Tactic truth:** one frozen authority owns tactic unit, modifiers, description, and model version; simulator, command, browser, and film receipts consume it rather than reclassifying names independently.
- **Plan truth:** the previous tactic is only a standing proposal. Source-derived red flags force rehearsal; a stable week may reinforce without falsely claiming new analysis.
- **Season truth:** the thesis ledger persists exact Opening Contract and checkpoint receipts. Its reckoning is descriptive and explicitly non-causal.
- **Test truth:** partial shard progress is atomic but `authoritative:false`; the final complete digest-bound receipt passes 800/800. Browser truth passes 33/33 and responsive truth 53/53.
- **Visual truth:** manual inspection of four retained dark/light desktop/mobile captures found mobile objects rendered as text despite green automated metrics. The projection was fixed, static assets rebuilt, and the corrected images re-inspected with zero blocking defects.
- **Release truth:** the production origin now proves 9/9 routes, `/_health`, HSTS, frame protection, and CSP at deployed revision `0ad328d790428effd212023b0416915d90ab03aa`. Launch remains HOLD because the candidate revision is different, staging is not independent, received email and founder approval are absent, and authoritative lifecycle disagrees. Production health is not launch readiness.
- **Propagation truth:** generic Studio files that removed project-specific startup authority were rolled back after executing tests proved the regression. No sibling tree was changed.
- **Cost truth:** no dependency, paid service, external model, or variable-cost runtime was introduced; flat-rate Max Plan accounting remains notional.

## 2026-08-02 — Session 68 truth surface changes

- **Tactic truth:** one frozen authority owns tactic unit, modifiers, description, and model version; simulator, command, browser, and film receipts consume it rather than reclassifying names independently.
- **Plan truth:** the previous tactic is only a standing proposal. Source-derived red flags force rehearsal; a stable week may reinforce without falsely claiming new analysis.
- **Season truth:** the thesis ledger persists exact Opening Contract and checkpoint receipts. Its reckoning is descriptive and explicitly non-causal.
- **Test truth:** partial shard progress is atomic but `authoritative:false`; the final complete digest-bound receipt passes 800/800. Browser truth passes 33/33 and responsive truth 53/53.
- **Visual truth:** manual inspection of four retained dark/light desktop/mobile captures found mobile objects rendered as text despite green automated metrics. The projection was fixed, static assets rebuilt, and the corrected images re-inspected with zero blocking defects.
- **Release truth:** the production origin now proves 9/9 routes, `/_health`, HSTS, frame protection, and CSP at deployed revision `0ad328d790428effd212023b0416915d90ab03aa`. Launch remains HOLD because the candidate revision is different, staging is not independent, received email and founder approval are absent, and authoritative lifecycle disagrees. Production health is not launch readiness.
- **Propagation truth:** generic Studio files that removed project-specific startup authority were rolled back after executing tests proved the regression. No sibling tree was changed.
- **Cost truth:** no dependency, paid service, external model, or variable-cost runtime was introduced; flat-rate Max Plan accounting remains notional.

## 2026-08-03 — Session 69 truth surface changes

- **Season truth:** phase eligibility is evaluated before receipt presence. Contested or failed evidence remains visible but cannot establish a thesis; future checkpoints cannot certify the present.
- **Return truth:** Welcome Back is derived from a versioned per-franchise session boundary. Elapsed absence alone creates no league-movement claim, and boundary sequence exposes exact lineage.
- **Legacy truth:** score, playoffs, titles, and tenure are independent General Manager advancement authorities; the player sees every exact remaining OR path.
- **Propagation truth:** a local compatibility contract proves project parser exports, invariant status writes, nonzero canonical tests, and startup fingerprints before generic payloads can be accepted.
- **Artifact truth:** health, deploy manifest, staging, and promotion receipts bind one deterministic SHA-256 over 155 deployable files while excluding only the two circular evidence files.
- **Staging truth:** https://staging.playfranchisearchitect.com is a dedicated Cloudflare Pages origin at 833779e836cb977d614033b74117956b68530816, exact artifact 2a83b18b9cec635b2fd850327bc593b3e97e1974ab295fb21a4f4fa8038bf77f, 11/11 same-origin checks, active exact-zone CNAME, and rollback deployment 0afb9434-6785-4ad8-af36-60ba957c6059.
- **Probe truth:** release network probes have a real wall-clock abort bound, and staging verification waits for stable-origin promotion convergence rather than sampling a stale first frame.
- **Test truth:** the complete source-bound aggregate passes 819/819 with direct exit 0; Playwright passes 33/33; responsive evidence passes 65/65; six representative originals were manually inspected across both themes with zero blocking defects.
- **Release truth:** production remains healthy at c92e389384b9fa51e7b4e7af69887831b61d2fe8, but launch remains HOLD on email delivery/reply identity, exact production parity, founder approval, and authoritative lifecycle. Independent staging is green and is not collapsed with those gates.
- **Cost truth:** no dependency or variable-cost runtime was added. Dedicated static staging remains cost-neutral; flat-rate Max Plan cost is notional.

## Session 71 — 2026-08-04

**Status: green.** One long-standing reporting untruth closed, one measurement honestly scoped.

| Surface | Was | Now |
|---|---|---|
| Championship scoreline | Assembled `home-away` (AFC first) at four write sites and published beside `championTeamId` as though champion-first. In 8 of 10 measured seasons the champion's score was printed second — the History tab, the franchise newsletter, the shareable League Story Card, the transaction feed and the CLI all announced the champion losing its own final. | One `championScoreline()` authority writes winner-first; nine player-facing readers repair stored scorelines on read. Covered by a test that fails if either conference's win is oriented wrongly. |
| Approximate value | Reported as a comparable cross-position number and used to decide MVP, OPOY, Rookie of the Year and the Hall of Fame, while offensive value was ~0 league-wide and an offensive lineman who merely started scored 6x an MVP quarterback. | Comparable across positions and regression-guarded. The scale is asserted, not assumed. |
| Hall of Fame | Presented as a Hall while admitting 24.5% of everyone who ever retired. | 1.4% of retirees, dated by induction class, with the policy visible in the History tab. |
| League overall drift | Not measured or reported at all. | Measured (+0.38/season after fixes, from +0.43) and **recorded as an open balance question**, not silently corrected. Long-run behaviour beyond 10 seasons is explicitly *not* measured and explicitly not extrapolated. |

No readiness, retention, or launch evidence was fabricated. Launch remains HOLD on the same three human gates:
delivered on-domain email, SHA-bound founder approval, and authoritative registry lifecycle. The registry drift is
reported through signed Ark cargo `01JV62KEPG9B017D2712C0F8F5`; the doctor warning stays visible rather than
suppressed, because it is true.

## Session 72 — 2026-08-04

| Surface | Prior truth | Session 72 authority |
|---|---|---|
| League progression | A decade measured +0.38 overall/year after S71, but no executable league-level target existed. | Versioned profile `2026-s72-parity`, fixed ±0.15/year band, deterministic decade regression and player-visible start/end distribution receipt. |
| Numeric integrity | Read-side defaults had repeatedly laundered non-finite values into plausible zeroes. | Bounded, cycle-safe scan of ten critical roots; non-finite values fail, traversal truncation is incomplete, source and simulated receipts are independent. |
| Browser reproducibility | Setup used `Date.now()`; CI could not replay the same league. | Test leagues declare seed `20260306`; per-test overrides remain explicit. Production setup may remain time-seeded. |
| Hall rendering | A two-season fixture treated a naturally empty scarce Hall as failure, and Settings forgot custom class size. | The fixture names a permissive Hall policy; all three policy values round-trip; Ballot Watch truthfully shows the strongest non-inducted resumes. |
| Roster horizon | The age curve existed only as engine math. | Seven source-derived position rooms expose OVR/POT, mean age, projected delta, age mix, contracts and succession priority in both runtimes and UI. |

The one-season visual progression sample is retained exactly as rendered, including a watch/out-of-range value when
the short sample produces one. It is visual evidence, not the parity release gate. The authoritative gate remains
the deterministic ten-year regression; no screenshot value was manipulated to appear green.

Launch truth is unchanged: healthy code and independent staging do not replace delivered reply-capable email,
SHA-bound founder approval or authoritative lifecycle reconciliation.

## Session 74 — 2026-08-06

- **Evidence truth:** Sim-Watch screenshots resolve a real receipted game through a bounded eight-advance production-runtime search. Exhaustion returns diagnostics; no fixture, score, or high-impact play is invented.
- **Decision truth:** Decision Archive projects the persisted Decision Anthology and retains its explicit non-causal language. Empty history renders as empty rather than synthesizing a career story.
- **Agent-context truth:** Co-GM export is player-initiated, local, fixed-allowlist, and bounded to three receipts. It does not transmit automatically, read hidden save state, expose secrets, or claim the agent acted.
- **Visual truth:** 32 retained dark/light desktop/mobile captures were manually inspected. Pixel review found fixed/sticky mobile chrome obscuring component evidence; the evidence lens now hides only unrelated overlapping chrome for component captures while full-page captures remain unaltered.
- **Test truth:** the complete source-bound aggregate passes 890/890 with direct exit 0; Playwright passes 40/40; responsive evidence passes 140/140; Pages build/smoke, 69-module reachability, and the 705,078/710,000-byte boot budget pass.
- **Security truth:** no dependency or credential custody was added. Settings sanitation is clean; a staged working-tree secret scan is required immediately before commit.
- **Release truth:** founder-approved direct-main promotion proved exact staging/production with rollback and applied edge policy. A later receipt-only CI run reproduced the podium timeout: the test had mistaken one-shot visibility checks for waits and could strand a real pending command. The journey now drains late weekly-plan gates through a bounded state machine. Staging retries thrown transient fetch errors across read-only Cloudflare authority calls and provenance probes while mutations remain one-shot.
- **Launch truth:** reply-capable on-domain email is not proven and registry SPARKED/local FORGE remains unreconciled. Those holds stay visible.
- **Cost truth:** no paid service, backend, external model, or variable-cost runtime was introduced.

## Session 77 — 2026-08-09

- **Test-suite truth:** `test/studio-protocol-smoke.test.js`'s innovation-pack assertion was already failing at `main` HEAD before this session touched anything — verified directly via `git stash` of this session's own changes and rerunning the isolated test file. Session 76's own closeout claimed "Node 911/911 direct exit 0" for its final full-suite run; that claim is not contradicted (the assertion regressed only once this session's own new `docs/AUDIT_2026-08-09_SESSION77.json` sidecar became the "latest" one the test reads), but the underlying assertion design was already fragile in exactly the way its own source comment warns about. Root-fixed rather than left for the next session to rediscover under the same construction-based failure.
- **Coverage truth:** `CommunityStore`'s Postgres-facing logic (abuse rate limiting, dedup, retention, snapshot cache/truncation, pepper hashing) was previously covered by zero direct tests — every existing community test exercised only the HTTP handler in front of it via a hand-rolled mock. `grep -rn communityStore test/` returned no matches before this session. Now 11 direct tests exist against an injected fake pool; no runtime behavior changed.
- **Test truth:** canonical Node suite passes 922/922 with direct exit 0 (up from 911/911); Playwright passes 40/40; windows-hide guard clean; doctor `blockingFailing: 0`.
- **Launch truth:** unchanged — reply-capable on-domain email is not proven and registry SPARKED/local FORGE remains unreconciled.
- **Cost truth:** no dependency, paid service, backend, or variable-cost runtime was introduced.

## 2026-08-14 — Session 85 release and first-run authority

- **Deployment truth:** Session 84 did deploy production automatically at `31248786…`; the prior “no deploy” narrative was stale. Session 85 replaced that path with explicit promotion and reconciled exact staging/production at `fcf16f109cf4da44b43eb14b61a977f6fa23e29d`, artifact `3bafed3904f2e209d152de40a0e2959209fe7e9aa6d48d3c50b4cef6179151ad`.
- **Performance truth:** canonical `/` and direct `/game.html` are distinct source-bound receipts. Both are verified on final staging; the direct game route now records CLS 0 at desktop and mobile rather than retaining the inherited red.
- **Visual truth:** 209 final-SHA captures passed; 68 dark/light desktop/mobile states are retained. The Opening Contract was manually inspected at desktop and 390x844 mobile in both themes with no clipping, hidden-shell leakage, or unreadable contrast.
- **CI truth:** the first exact-SHA backend/Pages gates exposed a fixture that conflated real release drift warnings with lifecycle warnings. The assertion was made category-specific, final Studio passed 204/204, and exact candidate CI run 31769309459 passed all browser and Node shards. The earlier local 1,102/1,102 aggregate predates only this test-only assertion correction; exact-SHA CI is the final aggregate authority.
- **Backend truth:** run 31769913974 built/deployed both images and attested the server; public `/community/v1/health` reports HTTP 200, database ready, no-store, and exact `fcf16f1…`.
- **Launch truth:** technical release evidence is verified, but public launch is not. Email delivery/reply-as, founder approval, lifecycle authority, and external Obelisk relying-party proof remain unresolved; `launchReady:false` is correct.
- **Cost/security truth:** no paid service or new dependency was added. Exact package candidates were trust-checked, staged secret scans report zero findings, and deployment uses existing cost-neutral/static plus self-hosted infrastructure.

## 2026-08-16 — Session 87 binding pressure and deployment authority

- **Economy truth:** generated contracts, free-agency offers and CPU bids share one versioned salary curve; cap pressure is measured from real generated leagues rather than inferred from constants.
- **Runtime truth:** narrative events read live chemistry/owner state, long-play values use max semantics, fan sentiment reads the live season, and waiver projections retain player identity.
- **Browser truth:** Franchise Legends and General Manager Reputation are mounted. 233 responsive captures passed and 84 retained dark/light desktop/mobile states were inspected; the observed OVR/name column defect was fixed and recaptured.
- **Test truth:** canonical local Node passes 1,136/1,136 and Playwright passes 41/41; exact application candidate CI is green.
- **Static deployment truth:** stable staging and production serve candidate `90f0d4871828fc10df7b0933f636793db2697446` with artifact `9bc71a36579a03f2b566ff3e2f0b512a9677b19f8f26b73ea8471c9b31212a59`.
- **Backend truth:** the public Community API reports HTTP 200, database ready and exact candidate `90f0d487…`. Deployment now skips an unchanged Caddy fragment and retries transport-level cold-start errors before exact-revision attestation; both defects were exposed by real server runs rather than hidden.
- **Security/cost truth:** strict public sanitization and dependency incident scans are clean; no new package, secret custody, paid service or variable-cost model was introduced.
- **Launch truth:** public launch remains HOLD. Technical deployment does not clear Zoho delivery/reply-as, SHA-bound founder launch approval, lifecycle reconciliation or external Obelisk relying-party proof.
