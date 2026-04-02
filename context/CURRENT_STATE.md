# Current State

## Build / Deployment Status
- **Deployed** to GitHub Pages via `deploy-pages.yml` → `npm run build:pages` → `static/`
- Live URL: https://vaultsparkstudios.com/vaultspark-football-gm/
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- CI pipeline: `ci.yml` runs Node unit tests + Playwright UI tests + Pages build verification
- GitHub Discussions enabled for community feedback

## App Architecture (Post-Modular Split — Session 8)

### public/app.js (thin orchestrator, ~1,530 LOC)
- Imports from 9 split modules + gistSync + tutorialCampaign
- Contains: `bindEvents()` (~1,200 lines event wiring), speedrun UI functions, `init()`
- Speedrun functions registered on `globalThis._` for lazy binding from gameFlow

### Split Modules (public/lib/)
| Module | LOC | Responsibility |
|--------|-----|----------------|
| appState.js | ~225 | Shared state object, API client |
| appCore.js | ~1,170 | 65+ utility functions (escapeHtml, fmtMoney, renderTable, etc.) |
| gameFlow.js | ~810 | applyDashboard, activateTab, all load* functions, sim control |
| tabOverview.js | ~634 | Overview tab rendering |
| tabRoster.js | ~305 | Roster, free agency, depth chart |
| tabContracts.js | ~680 | Contracts, trade workspace, agent negotiation |
| tabDraft.js | ~312 | Draft, scouting, combine |
| tabStats.js | ~182 | Stats, compare players |
| tabHistory.js | ~710 | History, awards, HoF, calendar |
| tabSettings.js | ~699 | Settings, admin, gist sync, commissioner |

### Speedrun Challenge Mode (Session 8)
- Engine: `src/engine/speedrunChallenge.js`
- 6 API routes in `localApiRuntime.js`
- Leaderboard via Gist sync
- UI panel in Settings tab

## Engine Systems (20 active modules)
All wired into `GameSession.advanceWeek()` weekly hook block:

| Engine | File | Status |
|--------|------|--------|
| beatReporter | src/engine/beatReporter.js | ✅ Wired |
| rivalryDNA | src/engine/rivalryDNA.js | ✅ Wired |
| injurySystem | src/engine/injurySystem.js | ✅ Wired |
| pressConference | src/engine/pressConference.js | ✅ Wired |
| gmLegacyScore | src/engine/gmLegacyScore.js | ✅ Wired |
| fanSentiment | src/engine/fanSentiment.js | ✅ Wired |
| veteranMentorship | src/engine/veteranMentorship.js | ✅ Wired offseason |
| draftCombine | src/engine/draftCombine.js | ✅ Wired |
| gameSimulator | src/engine/gameSimulator.js | ✅ Wired |
| offseasonSimulator | src/engine/offseasonSimulator.js | ✅ Wired |
| narrativeEvents | src/engine/narrativeEvents.js | ✅ Wired |
| injuryRecovery | src/engine/injuryRecovery.js | ✅ Wired |
| playerDevelopment | src/engine/playerDevelopment.js | ✅ Wired |
| tradeAI | src/engine/tradeAI.js | ✅ Wired |
| freeAgencyAI | src/engine/freeAgencyAI.js | ✅ Wired |
| realismCalibrator | src/engine/realismCalibrator.js | ✅ Wired |
| ownerFinances | src/engine/ownerFinances.js | ✅ Wired |
| statsEngine | src/engine/statsEngine.js | ✅ Wired |
| aiTeamStrategy | src/engine/aiTeamStrategy.js | ✅ Wired |
| coachingTree | src/engine/coachingTree.js | ✅ Wired |
| speedrunChallenge | src/engine/speedrunChallenge.js | ✅ New (Session 8) |

## API Routes (localApiRuntime.js — 60+ routes)
- 55 original routes + 6 speedrun routes (Session 8)

## Test Suite
- **93 Node unit tests** — all passing
- **9 Playwright UI tests** — all passing (fixed Session 9)
- Pages build verification in CI

## Persistence Layer
- Local filesystem saves (server-backed mode)
- IndexedDB (client-only mode, 250MB capacity)
- GitHub Gist cloud sync (optional)
- Rewind snapshots (last 10 major decisions)

## Known Issues
- **Setup.js brand builder fields not wired** — form inputs exist but not passed to create-league API
- **GameSession.js 5,200+ LOC** — refactor into sub-managers is known future work
