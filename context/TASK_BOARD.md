# Task Board — Franchise Architect: Football

Public-safe roadmap. Session 8 audit + implementation sprint (2026-04-13). Session 9: test coverage (2026-04-13).

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
