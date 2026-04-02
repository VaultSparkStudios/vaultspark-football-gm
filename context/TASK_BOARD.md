# Task Board

## Completed This Session (Session 9 — 2026-04-02)
- **Fix modular split empty-body functions** — 7 functions across 4 modules (appCore, tabContracts, tabHistory, gameFlow) had bodies stripped by split-app.mjs; restored from git history
- **Fix missing import** — `createEmptyTradeAssets` not imported in tabContracts.js
- **Fix Playwright tactical modal hang** — advanceWeekBtn shows pre-game modal in regular season; test now dismisses it
- **Fix client-side API timeout** — `/api/new-league` 15s timeout too short under CI memory pressure; increased to 60s
- **All 9 Playwright tests passing** — was 0/9 before session
- **All 93 Node unit tests passing**
- **Pages build verified**

## Completed Prior Sessions (Session 8 — 2026-04-01)
- **CI pipeline** — `ci.yml` with Node tests + Playwright + Pages build verification
- **app.js modular split** — 7,022 LOC → ~1,530 LOC orchestrator + 9 modules
- **Speedrun Challenge Mode** — engine + 6 API routes + UI panel + leaderboard
- **GitHub Pages deployment** — `deploy-pages.yml` + `build-pages.mjs`
- **GitHub Discussions enabled**
- **Play-mode smoke test fixed** — collapsed `<details>` panel

## Completed Prior Sessions (Session 7 — 2026-03-28)
- Full project audit — 93 unit tests, deployed to Pages

## Now
- **Setup.js brand builder wire** — form inputs exist but not passed to create-league API
- **[SIL] Draft Grade System** — immediate A–F post-pick grade in war room
- **375px smoke test** — all new panels on iPhone SE width

## Next — Candidates (from Brainstorm)

### Draft System Gap
- **Player Comparison Tool** — side-by-side prospect/player comparison modal
- **Draft Prospect Comp Cards** — "Comps to X" based on PFR similarity
- **Draft Grade System** — immediate post-pick letter grade A–F

### Narrative + Immersion
- **Offseason Storylines Engine** — drama events in dead period
- **Weekly Power Rankings Feed** — simulated AP/Coaches poll
- **Rivalry Week Big Game Mode** — special pre-game for heat > 60
- **Practice Squad Story Arc** — PS player development narrative

### Depth / Strategy
- **Salary Arbitration Mini-Game** — argument-picking in agent negotiation
- **Coach Personality Conflict** — OC/DC clashes reduce chemistry
- **AI GM Tendency Visible** — REBUILD/WIN-NOW/DEVELOP posture in trade builder
- **Player Regression Cliff Warning** — aging star 30+ decline chip
- **3-Way Trade Builder** — 3-team asset flows

### Technical
- **GameSession Modular Refactor** — split 5,200 LOC into sub-managers
- **Save Size Indicator** — IndexedDB/localStorage usage bar in Settings

## Later
- Deeper runtime/backend rollout docs
- Extend project-memory files with system specs
- Promote client beta to fuller Studio launch checklist
- Reconcile Studio repo deployment docs/templates
