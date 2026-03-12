# Session Log

## 2026-03-11

Completed:
- Audited the game repo against the updated Studio AGENTS standard
- Added the project-memory package required by the new Studio session model
- Converted docs and workflows from cross-repo Pages sync to direct GitHub Pages deployment
- Passed `npm.cmd run build:pages`, `npm.cmd run smoke:pages`, and the focused diff check
- Updated CI from Node 20 to Node 24 so GitHub Actions supports `--test-isolation=none`
- Identified the four real CI regressions after the Node fix and staged the runtime/stat files that resolve them
- Verified the previously failing tests now pass locally:
  - `test/generated-league-presentation.test.js`
  - `test/local-api-runtime.test.js`
  - `test/realism-career-regression.test.js`
- Verified the last two GitHub failures are fixed by already-present local test updates:
  - `test/realism-career-regression.test.js`
  - `test/session-actions.test.js`
- Synced the Playwright app spec to the current Contracts and Scouting UI and verified `tests-ui/app.spec.js` passes locally
- Reviewed the Studio repo `origin/main` standards canon line by line and confirmed this game repo/local `origin/main` are aligned to the direct per-repo Pages model
- Confirmed the separate local Studio repo clone is heavily dirty, so standards-only reconciliation there should be isolated before editing
- Confirmed via GitHub that the direct-pages standards branch finished green and that `origin/main` already contains the merge commit
- Updated the depth chart UI so reordering uses dedicated depth-control buttons and no longer trips the player-profile modal click path
- Added manual snap-share editing, save/load persistence, and simulator usage overrides for depth chart positions
- Replaced the footer-expanded Game Guide with a button-driven guide modal and added Playwright coverage for it
- Revalidated the gameplay/UI changes with focused runtime, sim, and Playwright test passes
- Reviewed the dirty worktree after restart, isolated the intended gameplay/UI diff, and committed that subset without staging the unrelated realism/runtime files
- Parked the unrelated realism/runtime and local artifact files into a named stash so the worktree is clean again
- Reproduced the reported `Play`-mode startup issue in a browser, traced it to the blocking game-page boot path, and changed startup to hydrate secondary panels in the background after the dashboard is ready
- Added and passed a dedicated Playwright smoke test for create-league in `Play` mode
- Deferred backup loading on the first setup-init request and tightened both save-store adapters so normal save listing avoids backup metadata work
- Mapped user-facing schedule/calendar/ticker/transaction/pick/player displays to generated team abbreviations so the UI no longer leaks legacy team IDs after randomized league creation
- Replaced raw typed player-ID entry in the roster designation and retirement override panels with table-driven selection state and disabled actions until a player is chosen
- Added and passed a Playwright regression covering designation selection plus the retirement-override no-raw-ID shell state
- Changed setup boot so `/api/setup/init` can skip save discovery, the page becomes ready from active-league/team state first, and `/api/saves` hydrates in the background
- Added runtime coverage for `includeSaves=0` and revalidated the setup-dependent Playwright specs
- Moved node-only realism profile loading out of the browser runtime path so client-only mode can import `localApiRuntime` under the dev server again
- Made setup runtime-mode switching reload active/save state for the selected runtime and added Playwright coverage for switching between server-backed and client-only mode
- Replaced the remaining trade, compare, and player-history raw-ID inputs with staged roster/pick tables plus player-name search selection flows
- Added `/api/players/search` in both runtime modes and extended the local runtime test coverage for the new lookup path
- Updated the Playwright harness from port `4173` to `4273` to avoid an unrelated local app that was already bound to `4173`
- Revalidated the changed surfaces with:
  - `node --check public/app.js`
  - `node --check scripts/dev-playwright-server.mjs`
  - `node --check src/server.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check src/runtime/GameSession.js`
  - `node --check tests-ui/app.spec.js`
  - `node --test --test-isolation=none test/local-api-runtime.test.js`
  - `npx.cmd playwright test tests-ui/app.spec.js tests-ui/play-mode-smoke.spec.js --reporter=line --workers=1 -g "contracts, trade, calendar, and transaction log are operational|compare and player history flows use search-driven selection|create league in play mode reaches the franchise screen"`

Open problems:
- Setup/main-menu initialization still needs measuring after the non-blocking save-load and client-runtime import fixes and may need additional trimming
- GitHub Settings -> Pages and optional repo variables cannot be verified from repo files alone
- A full `npm.cmd test` invocation was not rerun in this shell session, so verification here relies on the focused suites that passed
- The unrelated realism/runtime stash is still parked and needs to stay isolated until that work is intentionally resumed

Recommended next action:
- Measure the remaining setup/main-menu latency after this client-runtime import fix, then do a focused manual smoke pass on the new trade/compare/history selection flows

## 2026-03-12

Completed:
- Investigated the reported live Pages failures for server-backed league creation and browser-save quota exhaustion
- Added build-time runtime availability metadata to `public/index.html` and `public/game.html`, then taught the Pages build to default the published client to browser mode unless an explicit backend origin is configured
- Updated the setup runtime selector to disable `server-backed` mode when the Pages artifact has no backend origin and to keep its runtime description in sync with the normalized mode
- Hardened the shared API client so server-mode requests resolve against an optional configured backend origin and emit a clear non-JSON/backend-origin error when HTML comes back from Pages
- Changed the browser save store to prune old rolling backups before retrying quota-limited writes and return a user-facing storage-full error only when recovery cannot succeed
- Updated the local browser runtime so auto-backup quota failures log warnings instead of aborting week advancement or other gameplay actions
- Added targeted tests for browser quota recovery and non-fatal auto-backup failure handling
- Revalidated the fix set with:
  - `node --test --test-isolation=none test/browser-save-store.test.js test/local-api-runtime.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- The published Pages site still cannot offer real server-backed play until the separate backend/runtime deployment exists and one of `GAME_SERVICE_ORIGIN` or `API_DOMAIN` is configured for the Pages build
- Setup/main-menu latency still needs measuring after the non-blocking save-load and runtime-import fixes
- A full `npm.cmd test` pass was not rerun in this shell session, so verification still relies on focused suites
- The unrelated realism/runtime stash remains parked and should stay isolated until intentionally resumed

Recommended next action:
- Measure startup latency on the setup/menu path, then decide whether to stand up the separate backend/runtime origin or keep the public Pages build explicitly client-only for now

Completed:
- Started the roadmap’s first foundation epic by adding a shared setup/config catalog for franchise archetypes, rules presets, difficulty presets, and challenge modes in `src/config/leagueSetup.js`
- Updated both runtimes so `/api/setup/init` publishes that catalog and `/api/new-league` resolves selected presets through a single settings normalizer before league creation completes
- Added first-pass startup scenario effects in `src/runtime/applyLeagueSetup.js`, including cap-hell dead cap, small-market owner pressure, aging-core veteran skew, and no-QB quarterback penalties
- Updated the setup menu to render the new config selectors and summaries from API data instead of hardcoded quick-start defaults alone
- Revalidated the setup/config batch with:
  - `node --check public/setup.js`
  - `node --check src/config/leagueSetup.js`
  - `node --check src/runtime/applyLeagueSetup.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check src/server.js`
  - `node --test --test-isolation=none test/local-api-runtime.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- Challenge restrictions are only partially mechanical so far; the config framework exists, but flows like free agency and user pick trading still need hard enforcement
- The next world-state layer for owner personality, staff roles, and scheme/culture still needs to be built on top of the new config foundation

## 2026-03-12 (world-state follow-up)

Completed:
- Expanded owner/staff world-state with extra front-office and health roles, owner personality/priorities/patience, derived scheme identity, and culture profile summaries
- Surfaced those richer summaries through the existing owner/staff runtime endpoints and updated the game UI tables to show the new fields
- Wired challenge enforcement into user free-agent signings/offers and trades that would deliver top-10 picks to the controlled team
- Revalidated the batch with:
  - `node --check public/app.js`
  - `node --check src/runtime/GameSession.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check src/server.js`
  - `node --test --test-isolation=none test/feature-pack-v1.test.js test/new-systems.test.js test/session-actions.test.js test/local-api-runtime.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- Challenge enforcement still needs to reach any remaining transaction paths beyond the newly covered free-agency and top-10-pick trade cases
- Owner/staff/culture state is still mostly descriptive; more of it needs to feed gameplay outcomes directly

Recommended next action:
- Connect owner personality, staff specialties, and culture identity into weekly strategy, development, and finance outcomes before widening the next feature area

## 2026-03-12 (world-state gameplay effects)

Completed:
- Wired the new owner/staff/culture world-state into weekly scouting gains, injury chance/recovery, morale swing intensity, owner fan-interest/hot-seat updates, and negotiation demand
- Added coverage that proves the world-state now changes scouting gain, injury recovery, and owner pressure outcomes
- Revalidated the updated runtime and Pages bundle with:
  - `node --check public/app.js`
  - `node --check src/runtime/GameSession.js`
  - `node --test --test-isolation=none test/feature-pack-v1.test.js test/new-systems.test.js test/session-actions.test.js test/local-api-runtime.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- Challenge enforcement still needs to reach the remaining user transaction paths
- World-state should influence more systems than the current scouting/injury/morale/finance/negotiation hooks

Recommended next action:
- Extend world-state effects into player development, weekly strategy, and scouting reveal quality before starting another broad feature area

## 2026-03-12 (world-state development, strategy, and scouting)

Completed:
- Extended scouting reveal quality so board confidence and reveal precision now depend on staff strength, analytics support, staff budget, team need, and scheme fit
- Extended offseason development so team training/coaching context can improve player growth focus and reduce reinjury risk during the offseason pass
- Added weekly matchup plans that derive from team/opponent strengths, feed the game simulator, and surface through owner/staff views plus game results
- Added deterministic coverage for the new world-state integrations in `test/world-state-next-step.test.js`
- Revalidated the updated runtime and Pages bundle with:
  - `node --check public/app.js`
  - `node --check src/runtime/GameSession.js`
  - `node --check src/engine/gameSimulator.js`
  - `node --check src/engine/offseasonSimulator.js`
  - `node --check test/world-state-next-step.test.js`
  - `node --test --test-isolation=none test/world-state-next-step.test.js test/feature-pack-v1.test.js test/new-systems.test.js test/session-actions.test.js test/local-api-runtime.test.js test/strategy-contract-scouting.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- Challenge enforcement still needs to reach the remaining user transaction paths
- World-state is now in more of the sim loop, but it still needs deeper impact on transaction AI, player-facing development surfacing, and owner expectation systems

Recommended next action:
- Finish the remaining challenge enforcement paths, then push the world-state layer into transaction AI and player-facing development/history views

## 2026-03-12 (challenge enforcement cleanup)

Completed:
- Extended challenge restrictions into waiver claims, forced retirement-comeback signings, and user top-10 draft selections
- Updated CPU draft progression so `untilUserPick` no longer stalls when the controlled team is challenge-blocked from making a top-10 selection
- Added runtime and local-API coverage for those restriction paths
- Revalidated the current batch with:
  - `node --check src/runtime/GameSession.js`
  - `node --check public/app.js`
  - `node --check test/new-systems.test.js`
  - `node --check test/local-api-runtime.test.js`
  - `node --test --test-isolation=none test/new-systems.test.js test/local-api-runtime.test.js test/world-state-next-step.test.js test/feature-pack-v1.test.js test/session-actions.test.js test/strategy-contract-scouting.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- World-state still needs deeper impact on transaction AI, player-facing development surfacing, and owner expectation loops
- Setup/menu latency still has not been measured after the latest rounds of runtime and UI hardening

Recommended next action:
- Push world-state into transaction AI and player-facing development/history views, then do the deferred setup/menu latency measurement pass

## 2026-03-12 (transaction AI and player-facing outlook)

Completed:
- Extended trade valuation to account for scheme fit, age/development, pick appetite, and owner/culture transaction tolerance
- Extended free-agency offer selection so team context can outweigh a small salary gap
- Added player-facing development outlook data to the player profile payload and surfaced it in the player modal summary
- Revalidated the follow-up batch with:
  - `node --check src/runtime/GameSession.js`
  - `node --check public/app.js`
  - `node --check test/feature-pack-v1.test.js`
  - `node --test --test-isolation=none test/feature-pack-v1.test.js test/new-systems.test.js test/local-api-runtime.test.js test/world-state-next-step.test.js test/session-actions.test.js test/strategy-contract-scouting.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- Owner expectation and finance-pressure loops still have room to consume more of the world-state model
- Setup/menu latency still has not been measured after the latest runtime and UI rounds

Recommended next action:
- Extend owner expectation/hot-seat logic and any remaining AI transaction edges, then perform the deferred setup/menu latency measurement pass

## 2026-03-12 (owner expectations and setup diagnostics)

Completed:
- Added a richer owner expectation model that derives mandate, target wins, projected wins pace, transaction pressure, and heat from owner personality, team strategy, culture, fan interest, cash, and recent moves
- Wired that expectation model into owner-state reads, owner updates, chemistry refreshes, and weekly finance processing so hot-seat pressure now reflects the fuller mandate context
- Surfaced owner expectation fields in the owner UI table, including mandate, target wins, projected wins, heat, trend, and top expectation reasons
- Added setup-init diagnostics in both runtimes for setup-state, saves, backups, and total API timing, then surfaced client init and deferred save timing in the setup status line
- Revalidated the follow-up batch with:
  - `node --check src/runtime/GameSession.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check src/server.js`
  - `node --check public/setup.js`
  - `node --check public/app.js`
  - `node --check test/feature-pack-v1.test.js`
  - `node --check test/local-api-runtime.test.js`
  - `node --test --test-isolation=none test/feature-pack-v1.test.js test/local-api-runtime.test.js test/new-systems.test.js test/world-state-next-step.test.js test/session-actions.test.js test/strategy-contract-scouting.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Open problems:
- Setup/menu latency is now measurable in the product, but the next trim pass still needs to identify and remove any remaining startup bottlenecks
- Challenge-triggered failures and the new weekly-plan/scouting-fit outputs still need clearer UI messaging in the main game surface

Recommended next action:
- Use the new setup diagnostics to identify the next startup bottleneck, trim that path, and then add clearer messaging around challenge failures and weekly-plan/scouting outputs
