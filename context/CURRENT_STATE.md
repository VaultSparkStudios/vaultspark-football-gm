# Current State

## Build / Deployment Status
- All code is local-only on `main` — Sessions 3–6 have not been deployed to GitHub Pages yet
- Last deployed state predates Session 3 (all current features are invisible to public users)
- GitHub Pages deployment path: `deploy-pages.yml` → `npm run build:pages` → Pages artifact
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- Backend image tags normalize GitHub owner to lowercase before GHCR push (fixed in Session 5)
- GitHub workflow action runtimes bumped to actions/checkout@v5 and actions/setup-node@v5

## Engine Systems (20 active modules)
All wired into `GameSession.advanceWeek()` weekly hook block:

| Engine | File | Status |
|--------|------|--------|
| beatReporter | src/engine/beatReporter.js | ✅ Wired |
| rivalryDNA | src/engine/rivalryDNA.js | ✅ Wired |
| injurySystem | src/engine/injurySystem.js | ✅ Wired |
| pressConference | src/engine/pressConference.js | ✅ Wired |
| gmLegacyScore | src/engine/gmLegacyScore.js | ✅ Wired |
| fanSentiment | src/engine/fanSentiment.js | ✅ Wired (Session 6) |
| veteranMentorship | src/engine/veteranMentorship.js | ✅ Wired offseason (Session 6) |
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

## Frontend Surface (public/)

### game.html panels and modals (all wired to applyDashboard)
- **Overview tab**: franchise command-deck spotlight, narrative panel, trade deadline alert, world-state pulse row (Fan Sentiment card, Active Injury overlay, Stat Leaders strip), owner ultimatum banner
- **Roster tab**: main roster table, cap casualty panel, veteran mentorship panel
- **Draft tab**: war room board, draft available table (with Draft Day Radio reveal), combine results
- **Contracts tab**: cap command spotlight, cap projection panel
- **Scouting tab**: scouting command-deck, scheme-fit board
- **Stats tab**: season/career stats with AV column, benchmark hints
- **History tab**: Season Awards showcase, Hall of Fame gallery, player career archive
- **Settings tab**: commissioner deck, franchise brand builder panel, rewind timeline, cloud sync

### Modals
- `#agentNegotiationModal` — agent offer/counter/signing flow
- `#seasonReviewModal` — end-of-season GM performance review
- `#halftimeAdjustModal` — pre-game tactical brief (4 tactic options)
- `#draftPickRevealModal` — Draft Day Radio broadcast reveal
- `#personaTierToast` — GM Legacy tier unlock notification
- `#shortcutsModal` — keyboard shortcut reference

### app.js state additions (Session 6)
- `prevGmLegacyTier` — tier change detection for persona toast
- `prevDashboardPhase` — phase transition detection for season review
- `halftimeTacticChoice` — advance-week tactic override
- `mentorships` — veteran mentorship pairs from /api/mentorship
- `statLeaders` — season leaders from /api/stat-leaders
- `brandOverride` — brand identity overrides from /api/brand-identity

## API Routes (localApiRuntime.js — 55+ routes)

### Session 6 additions
- `GET /api/fan-sentiment` — current controlled team fan approval + label
- `GET /api/injuries/active` — starter-level injuries with weeksRemaining
- `GET /api/stat-leaders` — top-3 season leaders (QB/RB/DEF)
- `GET /api/mentorship` — veteran/mentee pairs for controlled team
- `POST /api/brand-identity` — mutates team.brandOverride; applies color/name/city/abbrev

### Advance-week enhancement
- `POST /api/advance-week` now accepts `weeklyTacticOverride` body param
  - Supported values: `run-heavy`, `pass-heavy`, `blitz-heavy`, `prevent`
  - Temporarily mutates team.weeklyPlan passLeanDelta/aggressionDelta before sim, restores after

## getAugmentedState() injected fields
Returns all of getDashboardState() plus:
- `narrativeLog` — recent franchise story events
- `newsLog` — beat reporter ticker items
- `coachingTree` — staff lineage data
- `gmLegacy` — GM persona arc, tier, scores
- `rivalries` — top rivalry heat entries
- `combineResults` — latest draft combine
- `activeInjuries` — starters currently injured with return timeline (Session 6)
- `fanSentiment` — approval score, label, trend (Session 6)

## GameSession.js key architecture
- **5,200+ LOC** single file (refactor is a known future task)
- `buildOwnerExpectation()` — heat 0–99, mandate, paceGap, trend; now returns `ultimatum` field when heat ≥ 75 + patience ≤ 0.35
- `advanceWeek()` — weekly hook block fires all 20 engine modules in sequence
- Offseason pipeline: `runOffseason()` → `applyMentorshipBonuses()` at camp-cuts stage

## Persistence Layer
- **Local filesystem saves** — server-backed mode; JSON files per slot
- **IndexedDB** — client-only mode; 250MB capacity via indexedDbSaveStore.js; src/adapters/persistence/
- **GitHub Gist cloud sync** — optional; requires Gist token in settings
- **Rewind** — last 10 major decision snapshots; auto-snapshot on trades/pre-deadline/season-start; canonical in localApiRuntime.js

## Test Suite
- **38+ tests** across: stats-regression, realism-career-regression, quarterback-depth-ratings, coverage-depth-ratings, pass-structure-regression, new-systems, world-state-next-step, session-actions, local-api-runtime, strategy-contract-scouting, feature-pack-v1, ratings-regression
- All passing as of Session 5; Session 6 changes (fanSentiment, veteranMentorship) are additive with no test mutations
- Playwright UI tests: create-league flow, season awards + Hall of Fame multi-year regression

## Simulation Architecture
- **Drive mode**: possession-by-possession (faster); **Play mode**: individual play-level variance
- QB depth ratings: throwAccuracyShort / throwAccuracyMedium / throwAccuracyDeep
- DB/LB coverage depth buckets: coverageShort / coverageMedium / coverageDeep
- Route families: quick, breaker, seam, vertical, space
- Coverage shells: man/zone + single-high/split-safety
- Play logs include route family, depth bucket, and shell metadata

## Stats / Realism
- PFR-calibrated against `PFR_RECENT_WEIGHTED_PROFILE` (2025 StatMuse smoothed baseline)
- AV (Approximate Value) — shared calc in src/stats/approximateValue.js; PFR offense/defense split formula
- Regular-season split is canonical for calibration; career totals rebuilt from regular/playoff splits
- Starter-qualified benchmarks surfaced in Stats tab with per-game equivalents

## World-State Depth
- **Owner layer**: personality, priorities, patience, fan interest, hot-seat heat, mandate, ultimatum (Session 6)
- **Staff layer**: culture, scheme identity, scouting/medical/analytics quality
- **Fan layer**: fan sentiment (approval 0–100) updated weekly from win% + owner personality (Session 6)
- **Rivalry layer**: heat 0–100 per matchup pair; feeds game simulator and Rivalry Week logic
- **Mentorship layer**: veteran/young player pairs at same position; +1-2 OVR offseason bonus (Session 6)
- **GM Legacy layer**: 6 tiers (Young Gun → Immortal); tier unlock toast notification (Session 6)

## Landing + Community
- `public/landing.html` — static beta landing page; self-contained dark-themed HTML; links to index.html + GitHub Discussions
- OG tags, Twitter cards, and newsletter button already live in game shell
- Community hub (GitHub Discussions) not yet launched — operational action pending

## Known Issues / Blockers
- **Not deployed** — Sessions 3–6 are local-only; every feature built is invisible to public users
- **Setup.js brand builder fields not wired** — form inputs exist in index.html but setup.js doesn't pass them to create-league API
- **GameSession.js 5,200+ LOC** — refactor into sub-managers is known future work
- **Challenge restrictions** — mostly mechanical; edge-case acquisition paths may still exist
- **Official NFL leaderboards** — limited server-rendered slice; StatMuse bulk path still used for baseline
