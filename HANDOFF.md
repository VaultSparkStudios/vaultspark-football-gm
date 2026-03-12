# Handoff

## Project
VaultSpark Football GM

## Current State
- `npm run dev` still launches the Node-hosted game from `src/server.js`.
- The setup screen now supports two runtime modes:
  - `server-backed` uses the existing Node API plus filesystem-backed saves
  - `client-only (beta)` runs the session and save slots in the browser through `localApiRuntime`
- The current playable branch already includes these immediate UX/foundation additions:
  - separate `Roster`, `Free Agents`, `Depth Chart`, and `Scouting` tabs
  - dedicated `Contracts` page split out from `Transactions`
  - one-click draft actions, including `Sim One Pick`
  - stats column hide/show controls
  - regular-season / playoff / combined stat filters on player stats and player profiles
  - snapshot export/import from the in-game save area
  - randomized generated team names now use one real U.S. city plus one nickname per team
  - deterministic generated player height, weight, and `faceSeed`
  - header box score tracker for the controlled team with clickable box score modal
  - pauseable multi-week / season simulation loop in the header
  - setup hover help for `Drive` vs `Play`
- rules guide plus a footer-launched Game Guide modal describing gameplay loop, features, ratings, physicals, development, and era profiles
- New user-reported blockers after the latest pass:
  - setup/start menu is loading too slowly, especially while checking the active league/save state
  - the create-league/menu boot path currently feels too slow overall and needs profiling/trim work
- The project is still not production-ready for GitHub Pages:
  - no static bundler/build pipeline yet
  - no worker-backed long sims or realism verification yet
  - client-only mode still depends on direct browser ESM loading from `/src/*` during local dev
- Repo: `https://github.com/VaultSparkStudios/VaultSpark-Football-GM`
- Studio site repo: `VaultSparkStudios.github.io`

## What Changed In This Branch
- Browser-safe runtime work:
  - moved realism defaults into `src/stats/realismProfiles.js`
  - moved path-based realism loading into `src/runtime/profileLoader.js`
  - updated bootstrap/session wiring so the sim core receives realism profile objects instead of loading files directly
- Persistence/runtime split:
  - added shared save helpers in `src/adapters/persistence/saveStoreShared.js`
  - added `fileSaveStore` and `browserSaveStore`
  - reduced `src/runtime/saveStore.js` to the file-backed wrapper
  - added `src/app/api/localApiRuntime.js`
  - added transport switching in `public/lib/api/createApiClient.js`
- Setup/game shell updates:
  - setup runtime selector in `public/index.html`
  - `public/setup.js` and `public/app.js` now use the transport client instead of direct `fetch`
  - `src/server.js` now serves `/src/*` for browser ESM during local dev
  - setup page now includes mode help text and a setup guide block
- Latest committed UX batch:
  - roster/free-agent/depth/scouting areas are now split into separate tabs
  - contracts moved into their own page with table-driven selection and roster actions
  - draft room has better status display plus user/CPU draft controls
  - draft/scouting/depth flows have been reduced away from typed raw-ID entry toward table-driven actions
  - stage chip/status copy is wired into the main header
  - roster and depth selectors now default back to the controlled team when the user changes teams
  - depth-chart move controls now display slot-based snap-share changes in the visible order without colliding with the player modal
  - depth-chart rows now support manual snap-share overrides that save into league state and feed live game rotations
  - stats tables now use user-friendly labels and column-visibility preferences
  - stats tables are being reshaped toward the provided PFR-style position templates, including richer RB/WR scrimmage merges and profile season tables
  - player profile modal now supports season-type filtering
  - player profile modal now includes a richer summary block, season-by-season table, team splits, and awards history
  - header now shows recent user-team box scores and opens scoring summary / play-by-play / team + player stats
  - multi-week and season sim actions now run one week at a time in the client so they can be paused
  - snapshot export/import buttons are wired in the game shell
  - rules tab and game footer now include a fuller user guide, with the footer guide moved behind a button-driven modal
  - game-page startup now loads the core dashboard first and hydrates heavier panels in the background so `Play` mode no longer looks hung on entry
  - setup init now defers backup loading on first open, and normal save listing skips backup metadata work
  - setup-page boot now skips save discovery on the first `/api/setup/init` request, marks the menu ready from active-league/team state, and hydrates saves in the background
  - client-only mode now loads in the browser again because node-only realism profile loading was moved out of the browser runtime path, and switching runtime mode on setup now reloads the selected runtime state
  - user-facing schedule/calendar/ticker/transaction/pick/player displays now resolve team IDs to generated team abbreviations instead of showing legacy NFL IDs
  - roster designation and retirement override panels now use table-driven player selection chips instead of typed raw player IDs
- Generated presentation work:
  - generated teams now use randomized names
  - generated players now carry deterministic physical/body data and `faceSeed`
  - generated/imported players now include additional gameplay attributes (`carrying`, `breakTackle`, `elusiveness`, `routeRunning`, coverage/pass-rush splits, etc.)
- New regression coverage already present:
  - `test/browser-save-store.test.js`
  - `test/local-api-runtime.test.js`
  - `test/generated-league-presentation.test.js`
  - `test/game-simulator-realism.test.js`

## Key Files
- `HANDOFF.md`
- `public/game.html`
- `public/app.js`
- `public/setup.js`
- `public/index.html`
- `public/lib/api/createApiClient.js`
- `src/runtime/GameSession.js`
- `src/app/api/localApiRuntime.js`
- `src/server.js`
- `src/domain/teamFactory.js`
- `src/domain/playerFactory.js`
- `src/domain/ratings.js`
- `src/engine/gameSimulator.js`
- `src/engine/seasonSimulator.js`
- `src/engine/weeklySimulator.js`
- `src/adapters/persistence/browserSaveStore.js`
- `test/local-api-runtime.test.js`
- `test/game-simulator-realism.test.js`
- `test/browser-save-store.test.js`
- `test/generated-league-presentation.test.js`

## Runtime Behavior
- `server-backed`
  - Node owns the active session
  - save slots use JSON files under `saves/`
  - setup still allows local path inputs like `pfrPath` and realism profile paths
- `client-only (beta)`
  - browser owns the active session
  - save slots use browser storage
  - setup disables filesystem path inputs
  - custom `pfrPath` and custom realism-profile file loading are not supported
  - this is still a dual-mode dev path, not the final production architecture

## Immediate Progress Audit
- Already done or largely present:
  - `Roster` page no longer shows `To Active` for already-active players
  - `Free Agents` remains a dedicated page for unsigned, non-retired players
  - stats column hide/show preferences exist in the UI
  - stats/player-profile season-type filtering is now wired for regular season vs playoffs vs combined
  - generated team names are randomized
  - generated player height/weight variability exists by position
  - generated/imported players now have a wider ratings model and the sim uses more of those ratings directly
  - draft and offseason stage indicators exist
  - offseason pipeline stages already include retirements, coaching carousel, free agency, combine, pro days, and draft
  - scouting board / weekly reveal flow already exists in `GameSession`
  - depth chart ordering is now editable from table controls instead of comma-separated IDs
  - scouting and draft selection no longer depend on typed raw player IDs
  - controlled-team box scores are archived and exposed through runtime + API (`/api/boxscores`, `/api/boxscore`)
- Still incomplete or needing polish:
  - setup boot path still needs more profiling after the non-blocking save-load change
  - some commissioner/admin flows still expose raw IDs, especially trade, compare, and player-history tools
  - the new box score ticker is functional but still stylistically basic
  - the stats page/player profile sample-matching pass is in progress and still needs more exact playoff/accolade formatting against the provided screenshots
  - stronger draft storylines / ranking variability still need a deeper pass
  - longer-term cartoon face generation is not started

## Validation
- Prior full suite result recorded before the read-only interruption:
  - `npm.cmd test`
  - result: `21 passed, 0 failed`
- Focused validation re-run during the latest writable pass:
  - `node --test --test-isolation=none test/local-api-runtime.test.js test/browser-save-store.test.js test/generated-league-presentation.test.js`
  - `node --test --test-isolation=none test/api.test.js test/e2e-session.test.js test/snapshot-migration.test.js`
- Latest full suite after the current fixes:
  - `npm.cmd test`
  - result: `23 passed, 0 failed`
 - Additional frontend/runtime sanity after the latest guide/profile/default-team pass:
   - `node --check public/app.js`
   - `node --check public/lib/api/createApiClient.js`
   - `node --check public/setup.js`
   - `node --check src/server.js`
   - `node --check src/app/api/localApiRuntime.js`
   - `node --check src/runtime/bootstrap.js`
   - `node --check src/runtime/profileLoader.js`
   - `node --check tests-ui/app.spec.js`
   - `node --test --test-isolation=none test/browser-save-store.test.js test/file-save-store.test.js test/local-api-runtime.test.js`
   - `node --test --test-isolation=none test/local-api-runtime.test.js test/session-actions.test.js`
   - `node --test --test-isolation=none test/local-api-runtime.test.js test/bootstrap-realism-profile.test.js`
   - `npx.cmd playwright test tests-ui/app.spec.js tests-ui/play-mode-smoke.spec.js --reporter=line --workers=1`

## Realism Status
- The earlier realism pass remains intact after the runtime refactor work.
- Latest recorded 10-year verification from that pass:
  - Season: `on-target 44, watch 0, out 0`
  - Career: `on-target 40, watch 19, out 4`
- Remaining realism work is still centered on:
  - deeper calibration of career `RB` volume / longevity after the rushing model change
  - `K` career totals and career length
  - longer-run roster churn / retirement balance

## Known Gaps
- Client-only mode is not yet production-grade.
- No static build pipeline or Pages base-path support yet.
- No worker-backed long sims or realism verification yet.
- Team abbreviations are still tied to legacy team IDs rather than the new randomized identities.
- The `Play` startup path may be broken despite the current test suite being green; no dedicated regression test exists yet for “create league in play mode and enter franchise successfully.”
- Main-menu initialization and active-league checking need performance investigation; current user report is that this is taking far too long.
- Some user-facing commissioner/admin actions still depend on raw player IDs.
- The guide/rules footer is now much more complete, but it still needs to be maintained alongside future feature changes.
- CPU roster/team-building AI still needs a deeper pass by scheme/age/contract/role.
- Broader manual smoke coverage is still needed on commissioner/admin flows and long save continuity.

## Near-Term Priorities
1. Finish the immediate UX/runtime batch:
   - measure and reduce any remaining setup/main-menu load time, especially active-league checks
   - remove remaining raw-ID dependence from roster/admin forms
   - continue polishing draft/scouting presentation and board workflow
   - isolate the remaining unrelated dirty worktree changes before the next feature batch
2. Keep both runtimes aligned as those UX changes land.
3. Add or update regression tests for each immediate improvement.
4. Re-run the full suite after the immediate batch stabilizes.

## Next Session Start Point
1. Reproduce the reported issues from the main menu:
   - create a new league in `Play` mode
   - measure perceived delay on initial setup load / “Checking active session...”
   - verify how team abbreviations are shown after randomized league creation
2. Audit likely hotspots first:
   - `public/setup.js`
   - `public/index.html`
   - `src/server.js` route `/api/setup/init`
   - `src/app/api/localApiRuntime.js` route `/api/setup/init`
   - `src/runtime/GameSession.js` bootstrap / dashboard state creation
   - `src/domain/teamFactory.js` randomized team identity generation
3. Add regression coverage for:
   - randomized abbreviation generation
   - setup init latency-sensitive path where practical
   - create-league in `play` mode for both runtime paths if feasible

## Roadmap After The Immediate Batch
1. Finish the dual-mode foundation.
2. Make client-only mode production-grade.
3. Resume realism calibration with automated guards.
4. Improve CPU roster/team strategy.
5. Expand stats fidelity, records, and narratives.
6. Do a focused UX/manual pass.
7. Harden long-sim stability and save continuity.
8. Ship the static Pages build and studio integration polish.
