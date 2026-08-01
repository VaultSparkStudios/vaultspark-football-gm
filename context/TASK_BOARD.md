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
