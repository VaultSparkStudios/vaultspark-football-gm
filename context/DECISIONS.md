# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.



## 2026-09-30 — S111 live Play hotfix — the production browser is part of the release gate

**Decision 7 — document navigations belong to the browser when the host canonicalizes URLs.** The founder's Play click failed after the `9400912` production promotion. A real browser reproduced `net::ERR_FAILED` on `/game.html` with the service worker active, while the same URL loaded at `/game` with service workers blocked. Cloudflare Pages returns a 308 for `/game.html` → `/game`; the old worker precached the redirected HTML response and handed it to a navigation whose redirect mode disallowed it. Source `68856a7` excludes HTML from precache and returns without `respondWith` for navigation requests, leaving redirect handling to the browser while retaining static module caching. A VM behavior test would fail on the pre-fix worker; a stable-staging browser with an active worker successfully navigated and completed the actual Start Your Franchise click with no request errors. The previous 10/10 provenance and 69-pass browser receipts were true for the checks they ran but did not exercise this production host/worker seam. Preserve that boundary in the closeout; do not retroactively call the first promotion fully playable.

**Decision 8 — test the visible bye prompt, not its static markup.** The first hotfix promotion gate failed on a random first-week bye because the browser spec expected zero `.tactic-option` DOM nodes. Four buttons always exist under a hidden dialog, so the correct contract is that the dialog stays hidden. Source `15a962b` asserts that contract and passed the focused browser suite and full release gate. Stable staging and production both serve the same `c09fc822…686c980c` artifact; direct `/game.html`, fresh Play, and an old-worker returning visitor reached `/game` without failed requests. This verifies the Play correction while public launch remains a separate HOLD.

## 2026-09-29 — S111 — The league may change without the GM, but every release claim needs its own witness

**Decision 1 — CPU trade ecology runs through existing law and a matched control.** A player-controlled league whose rival clubs never transact cannot make market consequences credible. The S111 market selects bounded CPU-only candidates at weekly advance and submits them to the same TradeService that checks legality, cap, roster and picks. It uses deterministic keyed selection and a matched seeded three-season control to test transaction volume and league effects; it does not invent a separate trade authority or loosen a rule to make trades happen. League News exposes accepted moves.

**Decision 2 — one Team destination joins the decisions that share a roster.** Roster and Depth were separate navigation destinations even though changing snap shares requires comparison against the players on that roster. One Team destination now has Roster and Depth submodes while preserving underlying tab IDs and deep-link behavior. Crests use the existing lazy procedural module in League and Trades; text labels remain the identity fallback. Browser and rendered-pixel checks cover keyboard and mobile navigation in both themes.

**Decision 3 — email proof is a typed roundtrip, not a nonempty string.** The old launch report accepted arbitrary `--email-evidence` text. It now requires a structured project-domain receipt for inbound delivery and recipient-observed reply-as identity, including address and freshness checks. Negative controls reject malformed, incomplete and forged claims. The actual Zoho roundtrip has not been observed; `launchReady` remains false rather than turning code coverage into delivery evidence.

**Decision 4 — backend transport retries are bounded and identity-preserving.** S110's workflow failure was at runner SSH transport, after gate and image builds. S111 replaced one-shot transfer/deploy with a helper that checks a pinned host key, retries transient connection resets only within a finite bound, and supplies the registry token through stdin. Application failures and host-key mismatches terminate immediately. The new GitHub workflow passed and independent external health matched the exact deployed source, closing the transport task without treating a green workflow alone as runtime proof.

**Decision 5 — the S110 pre-push deadlock diagnosis is superseded by measured normal pushes.** S110 recorded a Bash hook deadlock and a `--no-verify` recovery exception. The recovered closeout push and S111 source pushes completed under the ordinary hook; one was slow, subsequent pushes took seconds. The audit rejected the deadlock premise, so no replacement hook was shipped. The historical bypass remains recorded; reopen only on a reproducible failure and retain its positive/negative checks.

**Decision 6 — a visual receipt needs the durable ledger as well as the current hash list.** The first final-source Studio shard caught 158 retained S111 PNGs absent from `CAPTURE_LEDGER.json`, although `LATEST.json` and reviewed pixels were valid. The capture-ledger writer appended their hashes and the focused regression passed. The failed full run remains a failed receipt; a new six-shard run is required. Technical production promotion is distinct from public launch authority and from a real-cohort outcome.

---

Older entries are retained verbatim in `context/archive/DECISIONS.archive.md`. Nothing is summarised or removed on the way; the live file holds the working set only (newest 10 entries), so a reader does not pay for the whole project's history to learn what is true this week.



## 2026-09-30 — S111 recovery verification — completed baseline

The completed S111 closeout is verified rather than repeated. Fresh direct source-bound tests pass 1,588/1,588 and Doctor reports blockingFailing 0; earlier S111 statements requesting that final run are superseded by this receipt. Preserve the historical failed run and the separate launch HOLD. No SIL score is repeated or inflated for re-verification. The recovery checkpoint changes documentation and evidence only, so no deployment or user-interface change is required.

<!-- s112-closeout:decisions -->
## 2026-09-30 — Session 112 — Fair trades, durable saves and observed outcomes

**Whole-package trade authority.** Pick-containing offers use complete economics for both clubs; only player-only trades retain the persona shortcut. Transport preserves the service’s stale-plan refusal.

**Durability includes overlap.** Reserve the save slot before reading previous bytes, hold it through publication and cleanup, and attribute a flush to its writing request. Publish IDB metadata after commit/readback. Deletion unpublishes metadata before authoritative byte removal and restores the old loadable save if a fallible earlier step fails. Write degradation does not disable old-IDB reads.

**Feedback requires observed evidence.** Advice is checkpoint-bound, three-state and replay-idempotent. First-season signing progress requires explicit player intent in the resolved winning transaction.

**Rendered security parity.** Real browser checks use generated security headers. Semantic light/dark colors and theme-aware chart repainting replace fixed foreground assumptions; capture-ledger publication retains immutable hashes.

**Browser page-boundary recovery.** Restore this tab before dashboard reads, distinguish an applied action from failed checkpoint publication, retain dirty unload protection and retry only the checkpoint. Large-checkpoint fallback references only an explicitly saved or selected slot. Verify the exact frozen saved snapshot before runtime replacement; a separate live-state fingerprint excludes only diagnostic observability. JSON/hash/codec work stays in the default worker while the page verifies its receipt and owns storage markers. Capture/flush measurements are distinct from functional restore evidence; isolated restore latency was not measured.

**Exact action authorization.** The founder explicitly approved actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6.1.0), actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d (v6.0.0), and actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a (v7.0.1) after the generic URL trust gate returned BLOCK40. Five workflow references use those exact official releases. This narrow authorization does not change the generic verdict or approve other revisions.
<!-- /s112-closeout:decisions -->

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

<!-- s113-closeout:decisions -->
## 2026-10-02 — S113 — Player language is a product surface, and gates are kept by intent

**Decision 1 — the honesty voice stays; the vocabulary changes.** "No hidden bonus", "predicts no result" and "not a causal claim" are kept in plain words; "receipt", "authority", "schema" and raw reason codes are not player language.

**Decision 2 — "free early access" replaces "open beta".** The lifecycle public-status gate checks intent (a pre-launch declaration that never claims launch); its pattern was widened to accept the new label rather than reverting the copy.

**Decision 3 — fog potential, not overall.** A veteran's play is on film; what he becomes is an estimate until he is yours. Bands narrow with age and come from a derived stream, so no simulated outcome moves.

**Decision 4 — the League Pulse is a lens, not a system.** Rankings, races and the record watch read existing state, reuse the MVP ballot weights and draw no RNG; regular-season measures read regular-season tables once playoffs begin.

**Decision 5 — defer the server route split and persona drafting with reasons.** The split needs the text-reading parity tooling moved first; persona drafting changes simulation outcomes and needs a measured realism window.

**Decision 6 — supersede rather than patch a released candidate.** The first promotion failed in its own evidence build; the fix became a new fully re-verified candidate instead of a partial re-run.
<!-- /s113-closeout:decisions -->

<!-- s114-closeout:decisions -->
## 2026-10-02 — S114 — Measure before you build, and keep the candidate bound

**Decision 1 — retire the CSS split.** The stylesheet is 31 KB brotli and cached by the service worker after the first visit; a split saves roughly 10–12 KB on a first visit only, and risks unstyled flashes, cache-busting and CSP issues across more than 200 reviewed surfaces.

**Decision 2 — rewrite team ids where text is created, not where it is displayed.** Rewriting stored text at display time would mangle ordinary words that collide with a team id (for example "NO"). Older saves keep their original headline text.

**Decision 3 — split the server by domain, verified by behavior.** Routes are exact method and path pairs with no duplicates, so domain grouping cannot change which route matches. Both servers were replayed side by side.

**Decision 4 — re-dispatch rather than edit the workflow.** The gate job timed out on a slower runner with no failing test. Changing the timeout on main would have broken the candidate binding, so the same candidate was re-dispatched and the headroom fix was queued.
<!-- /s114-closeout:decisions -->

<!-- s115-closeout:decisions -->
## 2026-10-03 — S115 — Measure the population before trusting a persona effect

**Decision 1 — re-key the draft tilt.** Keyed to the strategy profile, the tilt did almost nothing, because generated clubs are nearly all "balanced". It is now keyed to the GM archetype, the classifier the archetype table shows, so the drafting a player watches matches the label the player reads.

**Decision 2 — defaults are the old engine.** Situational calls change thresholds and weights only. "By the book" and "Standard" are asserted to be exactly zero, with a negative control.

**Decision 3 — parallelize the gate rather than raise its timeout.** Four legs keep the same budget each and cut the wall-clock time.

**Decision 4 — complete an interrupted run instead of restarting it.** The host reaped the full run during the studio shard; the five finished shards and a studio re-run at the same commit form the record.
<!-- /s115-closeout:decisions -->

<!-- s116-closeout:decisions -->
## 2026-10-04 — S116 — Extract behind a byte-identity gate, one seam at a time

**Decision 1 — no extraction step ships unless football is byte-identical.** The golden master hashes 70 sections per scenario. Each gate's negative control was a real behavior change, never a synthetic one: a 0.01 draft-weight nudge was too small to change any pick, so the control was strengthened until the gate demonstrably fired.

**Decision 2 — the engine returns, the core applies.** Removing the simulator's StatBook writes was the decoupling every later sport depends on. The records keep the original write order through a shared sequence number.

**Decision 3 — packs are declarations; the core dispatches.** Rules, stat schema, calendar and competition are data or functions on the pack. Stored ids (phases, stages, bracket keys) are unchanged, so every existing save restores as before.

**Decision 4 — defer data-key renames to their own migration step.** superBowl, AFC/NFC and the passer-rating formula all change stored data or outcomes, so each gets a deliberate step with its own save migration or golden-master regeneration.

**Decision 5 — verify under memory pressure by splitting, not skipping.** When the host kept stopping long background runs, the suite ran shard by shard and in runtime chunks at the same commit. Every shard still ran.
<!-- /s116-closeout:decisions -->

<!-- s116-addendum:decisions -->
## 2026-10-05 — S116 addendum — Founder direction: every sport, and the email plane as its own project

**Decision 1 — Franchise Architect becomes a multi-sport platform** (founder direction: "the #1 most diverse sports simulation platform"). The plan is a shared core plus sport packs in this monorepo, with basketball second. Football is kept byte-identical behind the golden master.

**Decision 2 — reply-as email is deferred to the founder's custom email studio project.** Inbound now works through a Cloudflare routing rule. The launch email receipt waits for that project or for Zoho Send Mail As through Brevo SMTP.

**Decision 3 — founder approvals are run by the founder.** The S0→FB transition is verdicted green, but the founder-go apply was not executed by the agent. CANON-052 and the session's permission system both keep it founder-run.
<!-- /s116-addendum:decisions -->

## 2026-10-08 — S117 partial closeout and release disposition

Honor explicit closeout without converting partial work into completion. Preserve the immutable accepted grooming fixture for historical modern geometry; current categorical geometry remains compared to production and modern sculpt/eyes have their own acceptance authority. Do not regenerate goldens. Preserve unadopted trunk experiments outside production. Keep the save-size and rendered appearance gates unchanged; authorized deployment waits on applicable checks, with no redundant approval request.

## 2026-10-22 — S118 — Character compatibility and bounded rendering

New body proportions use an explicit v5 decoder so existing v4/v3 records retain their geometry. The softer face sculpt preserves the exact crown boundary and the existing1,650,000-byte mesh budget; redundant canthal subdivisions were removed rather than increasing that budget. Family links share background and natural pigment channels while preserving individual faces, recorded measurements and football random streams. Original naming metadata remains generation provenance when a linked surname changes. Complete candidate verification and deployment remain pending.


<!-- s118-final:decisions -->
## 2026-10-22 — Session 118 — Preserve historical authority and deploy only complete candidates

Keep the original S116 golden fixture immutable and adopt a separately versioned S118v2 fixture with attributed section changes and strict retention checks. Store original synthetic browser fixtures as versioned, hash-checked data; lossless gzip preserves the exact injury snapshot. Exclude only opaque PNG payloads from textual finite-geometry validation and prove invalid geometry still fails.

Seven executed exact-candidate CI jobs/test steps are the release contract. Preserve every failed attempt and reject promotion until all required jobs succeed. Scope backend deployment to the application container; compare database and routing identity before/after and retain rollback images.

Use the native bounded closeout ceremony because shared autopilot child scripts would write another repository despite its target flag. No foreign process mutation, --force, hook bypass or fabricated aggregate test count. Characters remain stylized procedural art and movement studies; no photorealism, motion capture, complete physical tissue-mass calibration, physical-device frame-rate or actual-user long-career proof is claimed. Existing expanded-mobile Desk/card right-edge clipping remains recorded and does not obstruct the tested save-restoration controls. Broader S117 benefits/policy and actual-user career work remain outside this selected three-item scope. Technical promotion does not authorize a public launch or lifecycle transition; launch/email holds remain independent.

## 2026-10-23 — S119 — Fix layout and stat truth at their sources; repair main before promoting

- Fix the shared .team-mode-switch, not the Desk column: hiding the overflow with minmax(0,1fr) would have clipped the switch instead of fixing it. The fit-content width keeps the single-row look wherever it fits.
- The passer rating lives once, in the stat schema; the engine imports it and the browser copy is held equal by published reference lines. The golden-master change is deliberate, attributed and versioned (s119-v3); prior fixtures stay byte-identical.
- The carried 16.2 MB task is closed by measurement, not by a fix; payload compaction is deferred until it is measured again, because gzip already absorbs the repeated recipe seeds in storage.
- A red main blocks every release. Register an accumulating ledger the session it crosses the population gate; never raise the threshold.
- Do not commit a script change after a staged candidate to fix an evidence tool: run a reviewed .cache copy, so HEAD stays covered by the publication.
- A visual receipt inherits review only from byte-identical images of an earlier reviewed receipt; none qualified, so all 214 were inspected.

## 2026-10-23 — S120 — Announce what changed in a player's own save, and fix a flaky gate rather than rerun it

- The S119 passer-rating change moves numbers in existing saves, so the note states the direction and range with its exception instead of a single figure; a reviewer's recomputation set the wording.
- Weekly conference tables come from the sport pack, like schedule and postseason already did. Conference display names stay a separate step: choosing fictional names carries IP weight and the AFC/NFC ids are load-bearing in test ids.
- The Pages release gate failed a recovery case that CI passed on the same SHA. It was fixed at its source (the helper's read-then-click raced the page's own auto-open) with a deterministic reproduction, not rerun until green; the fix is a new candidate.
- The backend remote deploy returning exit 75 twice is recorded as a failure with the live API's real revision; it is not reported as deployed, and host diagnosis is left to the founder because this session was not permitted to read the host.
- The footer-gutter defect found by visual inspection is pre-existing and cosmetic; it is recorded for its own candidate instead of starting a third release cycle.

<!-- ledger-roll:pointer -->
---

Older entries are retained verbatim in `context/archive/DECISIONS.archive.md`. Nothing is summarised or removed on the way; the live file holds the working set only (newest 10 entries), so a reader does not pay for the whole project's history to learn what is true this week.
