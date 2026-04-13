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

- Item 16: Map-based player/team index (no engine file access this session)
- Full GitHub Pages CI wiring (repo secrets needed)

## Deferred to Project Agents

- cross-repo item owned by another repo agent:
