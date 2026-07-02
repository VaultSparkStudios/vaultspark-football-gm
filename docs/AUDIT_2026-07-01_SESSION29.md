<!-- generated-by: /audit skill v1.0 -->
<!-- generated-at: 2026-07-01 -->
<!-- project: franchise-architect-football · type: game -->

# Project Audit - Franchise Architect: Football Session 29

> One ranked improvement plan covering all 9 audit axes, weighted for a game project (gamification 3x · UX 2x · AI/feature depth 1.5x). Every premise was checked against live code before scoring; one candidate was rejected on evidence. Run `/implement` against this plan. Depth ladders per item live in `docs/AUDIT_2026-07-01_SESSION29.json`.

## Top-line

- Total items: 17
- Combined Priority: 280.1
- Top 3: time-capsule-receipts · return-hook-digest · narrative-continuity-engine

## Ranked Plan

| # | Tier | Axis | Effort | Impact | Innov. | Priority | Item |
|---|:-:|---|---|:-:|:-:|:-:|---|
| 1 | 🔥 | gamification | 2h | 8 | 8 | 32.0 | **time-capsule-receipts** — Beat reporter publishes deterministic preseason predictions; the Season Epilogue grades those receipts and the reporter owns the misses. **Recipe:** new `src/engine/timeCapsule.js` (build at `startSeason`, grade in epilogue), Receipts section in Season Review, focused test. |
| 2 | 🔥 | gamification | 2h | 8 | 7 | 28.0 | **return-hook-digest** — Zero-backend return loop: last-visit timestamp in localStorage plus a "While you were away" digest card when a lapsed player reopens a saved franchise. **Recipe:** track lastSeenAt/week, render digest from Priority Inbox + standings delta + pending decision, wire in `engagementFeatures.js`, focused test. |
| 3 | 🔥 | gamification | 4h | 9 | 8 | 27.9 | **narrative-continuity-engine** — Press conferences gain memory and narrative events compound: a continuity ledger lets quotes reference last week's promise and crises apply bounded morale/hot-seat deltas. **Recipe:** continuityLedger on league state, consume in `pressConference.js`, feedback hooks from `narrativeEvents.js`, tests. |
| 4 | 🔥 | gamification | 3h | 8 | 8 | 27.6 | **what-if-replay** — Monday Morning QB: once per season, replay your most painful loss in a sandboxed non-canon timeline with one changed lever, powered by the deterministic engine. **Recipe:** epilogue offers the loss, re-sim from pre-game snapshot in a sandbox copy, side-by-side result, non-persistence test. |
| 5 | 🔥 | feature-depth | 6h | 10 | 7 | 23.3 | **situational-playcalling** — Pass/run choice is currently stochastic from rotations (`gameSimulator.js:906-908`); add down-and-distance leans, a 4th-down go-for-it brain, 2-minute urgency, and user game-plan tendencies the sim honors. **Recipe:** `choosePlayCall(situation, gameState, teamPlan)` module + strategy surface wiring + distribution regression tests. |
| 6 | 🔥 | feature-depth | 3h | 9 | 6 | 23.3 | **scouting-skill-reveal** — Pro days bump every prospect by flat `rng.int(-1,3)` regardless of scouting spend (`GameSession.js:1922-1926`); make allocation and scout quality drive reveal precision, with position-weighted combine grades and gated interview/medical flags. **Recipe:** scale pro-day noise by allocation, threshold-gated flags, deterministic reveal-error tests. |
| 7 | ⚡ | observability | 1h | 8 | 4 | 20.2 | **genius-cache-truth** — The protocol cache judges freshness by mtimes and parses status from prose substrings, so completed Session 28 work still reads as open in `.cache/genius-list.json` while another row was misclassified by an accidental substring match. **Recipe:** join Execution Log status by slug, word-boundary status matching, content-aware `--check`, fixture tests for both failure modes. |
| 8 | ⚡ | speed/testing | 45m | 8 | 3 | 16.4 | **orphan-test-shards** — 40 test files exist but only 35 are sharded: browser-wiring, deterministic-ids, launch-evidence-report, public-compliance, and session20-features never run via `npm test` or CI. **Recipe:** shard the five files + add a no-orphan guard so the hole cannot reopen. |
| 9 | ⚡ | ux/public | 45m | 7 | 3 | 14.4 | **landing-front-door** — `public/landing.html` is a polished marketing page with zero inbound links and no sitemap entry; the best first impression is unreachable. **Recipe:** link from index footer/about, add landing + changelog to `sitemap.xml`, landing→play CTA, extend the public-compliance test. |
| 10 | ⚡ | observability | 45m | 6 | 3 | 12.3 | **launch-evidence-redirect-truth** — `launch-evidence-report.mjs:49` counts any 2xx/3xx as ok without following the Location header, so a 308 to a dead target would pass the launch gate. **Recipe:** follow bounded redirect chains, judge the FINAL status, record the chain, fixture test for redirect-to-404. |
| 11 | ⚡ | security | 30m | 7 | 2 | 10.6 | **test-spawn-window-guard** — `test/studio-protocol-smoke.test.js` imports `spawnSync` raw from `node:child_process` (~15 spawn sites) while the windows-hide guard scans only `scripts/`, reopening the S186 window-storm on local Windows runs. **Recipe:** route through `safe-spawn.mjs` and extend the guard scan root to `test/`. |
| 12 | ⚡ | ux/accessibility | 2h | 7 | 3 | 10.5 | **tabs-aria-modal-focus** — The 14 game tabs are plain buttons with only a class toggle (`gameFlow.js:101-108`) and the 14 modals have no shared focus trap or Escape system; menu touch targets fall under 44px at ≤640px. **Recipe:** tablist/tab roles + aria-selected + roving tabindex, small shared modalManager, touch-target bump, UI smoke. |
| 13 | ⚡ | ux/reliability | 90m | 6 | 3 | 9.9 | **silent-error-surfacing** — Dashboard panels swallow failures via empty catch blocks (`app.js:399-400,1525-1572,1725`), leaving stale panels with no signal. **Recipe:** `panelGuard()` helper rendering an inline "couldn't load — retry" state, adopt at the cited sites, test. |
| 14 | 💡 | security/ci | 1h | 6 | 2 | 7.6 | **ci-deploy-gating** — `deploy-pages.yml`/`deploy-backend.yml` trigger on push with no dependency on CI green, so unit regressions can reach production artifacts. **Recipe:** fast test job as `needs:` prerequisite inside deploy-pages (keeps path filters), same gate for backend images. |
| 15 | 💡 | speed/ci | 45m | 5 | 2 | 6.8 | **determinism-smoke-on-push** — The long shard (determinism + realism-career) only runs weekly; a determinism regression can hide for a week in a game whose challenge codes depend on seed stability. **Recipe:** fast same-seed two-run comparison test in a push-path shard; keep the weekly sweep for depth. |
| 16 | 💡 | ux/theme | 1h | 5 | 2 | 6.3 | **theme-parity-static-pages** — about/changelog/status/ip hardcode dark with no theme JS and contact/privacy/terms set no theme; player preference only works inside the app. **Recipe:** shared theme bootstrap include on static pages + toggles where layout allows, extend the compliance test. |
| 17 | 💡 | architecture | 30m | 4 | 1 | 3.0 | **service-scaffold-honesty** — `src/runtime/services/*` is 757 LOC of unused scaffolding; `createServices` is imported nowhere and the migration notes claim a 3-phase plan stalled at Phase 1. **Recipe:** truth-align the notes + DECISIONS entry, or extract ContractService for real as the pattern proof. |

## Innovation reserve (Innovation ≥ 8 — execute these even when busy)

- 3 items: time-capsule-receipts · narrative-continuity-engine · what-if-replay

## Skipped (premise rejected or out of agent reach)

- **static-host-client-default** — premise false on live code: `scripts/build-pages.mjs` rewrites the runtime metas and `static/index.html:7-8` already boots the Pages artifact client-only. Reject-on-check win.
- **in-app-feedback-form** — needs a backend or third-party endpoint; violates the static-host-safe success bar. The GitHub prefilled-issue flow with auto-context stays.
- **sparked-flip** — still evidence-gated: live report `audits/launch-evidence-2026-07-01-session29.json` shows routes reachable but on-domain email delivery proof missing. Owner action, not agent work.

---
*Generated by `/audit` v1.0 · ready for `/implement`*
