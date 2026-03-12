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
- Challenge enforcement now blocks user free-agent actions in `no-free-agency` mode and blocks trades that would deliver top-10 picks to the controlled team in `no-top-10-picks` mode
- That enforcement now reaches the remaining obvious user acquisition paths too:
  - waiver claims are blocked in `no-free-agency`
  - force-sign retirement overrides are blocked in `no-free-agency`
  - user top-10 draft selections are blocked in `no-top-10-picks`, and CPU draft progression no longer stalls on those picks
- Focused validation passed for:
  - `node --check public/app.js`
  - `node --check public/setup.js`
  - `node --check src/config/leagueSetup.js`
  - `node --check src/runtime/applyLeagueSetup.js`
  - `node --check src/runtime/GameSession.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check src/engine/gameSimulator.js`
  - `node --check src/engine/offseasonSimulator.js`
  - `node --check src/server.js`
  - `node --check test/world-state-next-step.test.js`
  - `node --test --test-isolation=none test/world-state-next-step.test.js test/feature-pack-v1.test.js test/new-systems.test.js test/session-actions.test.js test/local-api-runtime.test.js test/strategy-contract-scouting.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

Current priorities:
1. Feed the new world-state deeper into transaction AI, player development surfacing, and owner expectation loops instead of stopping at the current sim hooks
2. Measure and trim any remaining setup/main-menu latency after the non-blocking save-load and client-runtime import fixes
3. Add clearer UI messaging for challenge-triggered failures and for the new weekly plan/scouting-fit outputs

Known issues:
- The Pages artifact remains client-only unless `GAME_SERVICE_ORIGIN` or `API_DOMAIN` is configured and the separate backend/runtime rollout is live
- Challenge restrictions are much more mechanical now, but there may still be edge-case user acquisition paths worth auditing later
- The unrelated realism/runtime work was parked in a local stash and is not yet reconciled back into the branch
- A full local `npm.cmd test` pass was not rerun in this session, so current verification still relies on focused suites plus targeted Playwright coverage
