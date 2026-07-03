<!-- truth-audit-version: 1.1 -->
# Truth Audit

Overall status: green
Last reviewed: 2026-07-02
Public-safe summary only. Sensitive verification notes are maintained privately.

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
