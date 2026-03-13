# Current State

Build status:
- Direct GitHub Pages deployment from this repo remains the canonical frontend publish path
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- The game shell now marks itself ready after loading core dashboard state, then hydrates heavier panels in the background so `Play` mode no longer appears stuck on `Loading...` after league creation
- Server-backed setup init now defers backup loading on first open, and both save-store adapters skip backup metadata work when only normal saves are requested
- The setup page now requests active-league/team state without blocking on save discovery, marks itself ready, and hydrates the save list in the background via `/api/saves`
- Switching the setup runtime mode now reloads the menu state for the selected runtime, and the client-only browser runtime no longer pulls node-only realism-loader imports into the browser bundle
- Pages builds now inject runtime-availability metadata so the setup UI disables `server-backed` mode unless a backend origin is explicitly configured, and server-mode fetch failures surface a clear non-JSON/API-origin error instead of `Unexpected token '<'`
- The browser save store now prunes old rolling backups before retrying quota-limited writes, and client-only auto-backup failures are downgraded to warnings so weekly progression keeps running
- Setup and new-league creation now run through a shared config framework for franchise archetype, rules preset, difficulty preset, and challenge mode; both runtimes publish the config catalog through `/api/setup/init`, and startup scenario effects can add cap stress, market pressure, or roster penalties to the controlled team
- Team owner and staff models now expose richer world-state: extra front-office and health roles, owner personality/priorities/patience, derived scheme identity, and culture profile summaries
- That world-state now affects gameplay outcomes directly:
  - scouting weekly points scale with scouting director development and analytics support
  - injury chance/recovery scale with medical/strength staff plus rehab support
  - morale swings scale with culture and owner patience pressure
  - owner fan-interest/hot-seat pressure updates during weekly finance processing
  - negotiation demands now account for contract-demand settings plus cap-analyst leverage
- The next world-state layer is now active too:
  - draft scouting reveal quality and confidence now improve when staff, analytics, budget support, team need, and scheme fit align
  - offseason player development now uses team training/coaching/scheme context and can reduce reinjury risk in stronger environments
  - weekly matchup plans now derive from team/opponent strengths, feed the game simulator, and surface through owner/staff views plus game results
- Transaction AI and player-facing surfacing now consume more of that world-state:
  - trade valuation now accounts for scheme fit, age/development, picks bias, and owner/culture transaction tolerance
  - free-agency offer resolution now considers team context, not just raw salary/years
  - player profiles now expose a development outlook with fit, focus ratings, weekly-plan context, pressure, and legacy score
- Owner hot-seat pressure now uses a computed expectation model with mandate, target wins, projected pace, recent transaction pressure, and cash/fan context instead of only a simple patience/record check
- Both `/api/setup/init` runtimes now emit setup timing diagnostics for core setup state, save listing, backup listing, and total route time
- The setup page now captures client init timing, tracks deferred save hydration timing, and surfaces startup diagnostics directly in the status line
- The browser runtime no longer constructs a full default `GameSession` just to paint the setup menu; client-only `/api/setup/init` stays on a lightweight catalog/team bootstrap until a league is actually created, loaded, or opened
- The setup page no longer overwrites those diagnostics with a plain `Ready` string after `loadSetup()`, so the timing readout stays visible after init and runtime-mode switches
- Frontend API errors now preserve backend `reasonCode` data, so challenge-restricted actions can surface clear blocked-action messaging instead of generic raw backend errors
- Weekly-plan/scouting-fit surfacing is more visible now:
  - the overview tab includes a summary line for the controlled team’s weekly plan, culture, and owner mandate pressure
  - the scouting tab now shows scheme-fit in the main board plus a textual scouting insight summary for the top board target and latest report
- The roster page no longer shows the redundant roster-board panel at the bottom; only the main roster management surface remains
- Career stat rows now carry real games and starts, fixing broken per-game calculations that were previously dividing by seasons in the stats UI
- Added a regression suite that checks both the career per-game denominator fix and starter-qualified season averages against weighted position baselines
- The stats tab now shows a filter-aware starter-qualified benchmark hint so position-based NFL-average comparisons are explicit instead of implied
- The regular-season stats tables now read the same calibrated split that realism verification expects:
  - season realism calibration now targets the `regular` split instead of only the aggregate season bucket
  - aggregate season totals and career totals are rebuilt from regular/playoff splits after calibration so table views and verification no longer diverge
  - the season stats regression now validates the regular-season split directly, including QB and K starter-qualified samples
- The stats benchmark copy now includes approximate per-game equivalents alongside season totals so position filters are easier to interpret in the UI
- The career realism profile now applies a QB games-started qualifier in addition to passing volume so the starter-weighted career verification no longer averages in long-tenure low-start backups
- Backend image tags now normalize the GitHub owner name to lowercase before pushing to GHCR, fixing the `repository name must be lowercase` Actions failure on `Deploy Backend Runtime`
- QB evaluation and simulation now use depth-based passing accuracy:
  - generated/imported QBs carry `throwAccuracyShort`, `throwAccuracyMedium`, and `throwAccuracyDeep`
  - QB overall/scheme-fit logic now reads those ratings instead of only a single broad passing-accuracy number
  - live pass resolution now chooses short/intermediate/deep targets and applies bucket-specific completion, sack, breakup, and interception pressure
- PFR imports now derive QB depth ratings from passing volume, completion rate, and yards per attempt so productive modern passers no longer import as low-end backups
- Challenge enforcement now blocks user free-agent actions in `no-free-agency` mode and blocks trades that would deliver top-10 picks to the controlled team in `no-top-10-picks` mode
- That enforcement now reaches the remaining obvious user acquisition paths too:
  - waiver claims are blocked in `no-free-agency`
  - force-sign retirement overrides are blocked in `no-free-agency`
  - user top-10 draft selections are blocked in `no-top-10-picks`, and CPU draft progression no longer stalls on those picks
- Focused validation passed for:
  - `node --check src/config.js`
  - `node --check src/domain/ratings.js`
  - `node --check src/domain/playerFactory.js`
  - `node --check src/data/pfrAdapter.js`
  - `node --check src/runtime/applyLeagueSetup.js`
  - `node --check src/runtime/GameSession.js`
  - `node --check src/engine/gameSimulator.js`
  - `node --check test/quarterback-depth-ratings.test.js`
  - `node --test --test-isolation=none test/quarterback-depth-ratings.test.js`
  - `node --test --test-isolation=none test/stats-regression.test.js`
  - `node --test --test-isolation=none test/ratings-regression.test.js`
  - `node --test --test-isolation=none test/new-systems.test.js`
  - `npm.cmd run build:pages`
  - `node --check public/app.js`
  - `node --check public/lib/api/createApiClient.js`
  - `node --check public/setup.js`
  - `node --check src/config/leagueSetup.js`
  - `node --check src/runtime/applyLeagueSetup.js`
  - `node --check src/runtime/GameSession.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check src/engine/gameSimulator.js`
  - `node --check src/engine/offseasonSimulator.js`
  - `node --check src/server.js`
  - `node --check src/stats/statBook.js`
  - `node --check test/stats-regression.test.js`
  - `node --check test/world-state-next-step.test.js`
  - `node --test --test-isolation=none test/world-state-next-step.test.js test/feature-pack-v1.test.js test/new-systems.test.js test/session-actions.test.js test/local-api-runtime.test.js test/strategy-contract-scouting.test.js test/stats-regression.test.js`
  - `node --test --test-isolation=none test/realism-career-regression.test.js`
  - `node --test --test-isolation=none test/stats-regression.test.js test/realism-career-regression.test.js`
  - `npm.cmd test`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Current priorities:
1. Use the new setup diagnostics to confirm whether any remaining setup/main-menu latency still needs another trim after the lazy browser bootstrap
2. Extend the new QB depth-rating pass into any remaining coverage/targeting gaps only if the refreshed NFL/PFF spot checks still show per-position drift after calibration
3. Verify the next GitHub push clears both `CI` and `Deploy Backend Runtime` now that the test regression and GHCR tag casing are fixed
4. Feed the new world-state deeper into any remaining owner expectation loops and transaction AI edges instead of stopping at the current trade/FA hooks
5. Extend the new benchmark/qualification hint pattern anywhere else the UI compares all-player data to starter-qualified or team-level baselines

Known issues:
- The Pages artifact remains client-only unless `GAME_SERVICE_ORIGIN` or `API_DOMAIN` is configured and the separate backend/runtime rollout is live
- Challenge restrictions are much more mechanical now, but there may still be edge-case user acquisition paths worth auditing later
- The unrelated realism/runtime work was parked in a local stash and is not yet reconciled back into the branch
- Full `npm.cmd test` did not finish within the local command timeout window during the QB depth-rating pass; targeted stats/ratings regressions and `build:pages` completed successfully
