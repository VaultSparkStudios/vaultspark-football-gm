# Task Board — VaultSpark Football GM

Public-safe roadmap. Session 8 audit + implementation sprint (2026-04-13). Session 9: test coverage (2026-04-13).

## Session 8 Priority Items (All 20)

### TIER 1 — Ship-Blockers (Beta Gate)

| # | Item | Status |
|---|------|--------|
| 1 | localStorage rewind size guard — auto-demote oldest slots above 4MB, non-blocking toast | ✅ Done |
| 2 | GitHub Pages CI deploy + Playwright smoke test on push to main | 🔄 In Progress |
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
| 16 | Map-based player/team index — O(1) lookups in GameSession, ~15-25% sim speedup | 🔜 Next sprint |
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
- Verify whether the Football GM Codex Apps MCP startup failure is resolved upstream; remove `scripts/codex-football.*` wrappers if normal Codex startup becomes reliable for this repo.

## Deferred to Project Agents

- cross-repo item owned by another repo agent:

## Session 10 — Codex Startup Reliability (2026-05-27)

| Item | Status |
|------|--------|
| Keep Codex Apps globally enabled for the Studio portfolio | Done |
| Add Football GM-only Codex startup wrappers using `--disable apps` | Done |
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
| Complete GitHub Pages CI deploy once repo secret/provider configuration is ready | 🔄 Improved 2026-06-03 — deploy workflow now builds and smokes the static client before upload; provider/repo Pages settings still external |

## Session 13 — Test Sharding + Pages Smoke Gates (2026-06-03)

| Item | Status |
|------|--------|
| Add shard runner and npm scripts for core/runtime/sim/studio/long test surfaces | Done |
| Convert CI unit checks to a matrix of bounded shards | Done |
| Run static Pages smoke in CI and deploy workflow before artifact upload | Done |
| Restore missing local Studio helper modules required by startup smoke | Done |

**Verification:** `npm run test:studio`, `npm run test:runtime`, `npm run test:core`, `npm run test:sim:contract`, `npm run test:sim:realism`, `npm test`, `npm run test:long`, `npm run build:pages`, and `npm run smoke:pages` passed. `npm run test:runtime` took about 183 seconds when run alone; composed `npm test` completed in about 8.9 minutes with 131 default tests.
