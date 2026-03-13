# Latest Handoff

Last updated: 2026-03-12

What was completed:
- Added a first pass of depth-based QB passing ratings and live pass resolution:
  - generated/imported QBs now carry `throwAccuracyShort`, `throwAccuracyMedium`, and `throwAccuracyDeep`
  - QB overall, development focus, scheme-fit, and setup-penalty paths now account for those ratings
  - the game simulator now picks short/intermediate/deep pass buckets and applies bucket-specific completion, YAC, breakup, sack, and interception behavior
- Tuned PFR QB imports so productive modern passers derive more realistic depth-accuracy/awareness values instead of landing as low-end backups
- Added a regression that verifies both generated and imported QBs have the new depth ratings
- Fixed a stale challenge-mode trade test after CI exposed that `getDraftPickAssets()` returns cloned pick payloads; the test now mutates the underlying league pick before evaluating the top-10 trade restriction
- Fixed the broken regular-season player stats path:
  - season realism calibration now updates the `regular` split that the stats UI and player profile views read
  - aggregate season totals and career totals are rebuilt from regular/playoff splits after calibration, so verification snapshots and table views no longer disagree
  - the starter-qualified season regression now validates the regular-season split directly and includes a kicker sample that would have caught the previous bug
- Updated the stats benchmark hint copy with approximate per-game equivalents so the player stats area reads closer to how users compare position output in practice
- Diagnosed the failing GitHub Actions runs on `main`:
  - `CI` was failing in `npm test` because `test/realism-career-regression.test.js` exceeded the career out-of-range guardrail
  - `Deploy Backend Runtime` was failing because GHCR tags used the mixed-case `github.repository_owner`, which Docker rejects
- Fixed the career realism regression by tightening the QB career baseline qualifier to require meaningful starts in addition to passing-volume qualification, preventing long-tenure low-start backups from distorting the starter-weighted average
- Fixed backend image tagging by lowercasing the GitHub owner before building/pushing GHCR tags in `deploy-backend.yml`
- Confirmed the direct-Pages standards PR already merged into `origin/main`
- Fixed the `Play`-mode startup hang by splitting game-page boot into core dashboard loading plus background panel hydration
- Made setup boot non-blocking for save discovery by allowing `/api/setup/init` to skip saves, marking the page ready from active-league/team state, and hydrating `/api/saves` in the background
- Fixed the client-only runtime import boundary by moving node-only realism profile loading out of the browser path, and made runtime-mode switching reload setup state for the selected runtime
- Hardened the Pages runtime selector so builds without an explicit backend origin disable `server-backed` mode in setup and keep the published bundle on the client-only path by default
- Made server-mode API failures report a clear non-JSON/backend-origin error instead of surfacing the raw `Unexpected token '<'` JSON parse failure on Pages
- Taught the browser save store to prune older rolling backups before retrying quota-limited writes and downgraded client-only auto-backup quota failures to warnings so week advancement can continue
- Added a shared setup/config framework for franchise archetype, rules preset, difficulty preset, and challenge mode; `/api/setup/init` now publishes the catalog to the menu, and both runtimes resolve those selections through a single settings normalizer
- Applied first-pass startup scenario effects for controlled teams, including cap-hell dead cap, small-market budget pressure, aging-core veteran skew, and no-QB penalties
- Added richer owner/staff/culture world-state by expanding owner personality/priorities, extra front-office and medical roles, derived scheme identity, and culture summaries
- Wired challenge enforcement into user free-agent signings/offers and trades that would deliver top-10 draft picks to the controlled team
- Extended the new world-state layer into live gameplay effects:
  - scouting point gains now depend on scouting/analytics quality
  - injury chance and recovery now depend on medical/strength support and rehab
  - morale swing intensity now depends on culture/owner pressure
  - owner fan-interest and hot-seat state now react during weekly finance processing
  - negotiation demands now include cap-analyst leverage and demand multipliers
- Extended that same world-state into the next planned systems:
  - scouting board confidence/reveal quality now improves when staff quality, analytics, budget support, team need, and scheme fit line up
  - offseason development now uses training/coaching/scheme context and lowers reinjury risk in stronger environments
  - weekly matchup plans now derive from team/opponent strengths, feed the game simulator, and surface through staff/owner views plus game results
- Finished the next challenge-enforcement pass:
  - waiver claims are now blocked in `no-free-agency`
  - force-sign retirement overrides are now blocked in `no-free-agency`
  - user top-10 draft selections are now blocked in `no-top-10-picks`
  - CPU draft progression no longer stalls when the controlled team is challenge-blocked from making a top-10 pick
- Pushed the world-state layer one step deeper into AI and player-facing surfaces:
  - trade valuation now accounts for scheme fit, age/development, pick appetite, and owner/culture tolerance
  - free-agency offer selection now considers team context instead of only salary/years
  - player profiles now expose development outlook, focus ratings, weekly-plan context, owner pressure, and legacy score
- Extended owner pressure into a full expectation model:
  - owner state now computes a mandate, target wins, projected wins pace, recent transaction pressure, and contextual heat score
  - weekly finance processing now uses that expectation model when updating fan interest and hot-seat state
  - the owner table now surfaces mandate, target wins, projected wins, heat, trend, and expectation reasons
- Added first-pass startup observability for setup init:
  - both runtimes now emit setup-route timing diagnostics for setup state, saves, backups, and total API time
  - the setup page measures client init time plus deferred save hydration time and shows the resulting diagnostics in the status line
- Trimmed the next setup-latency bottleneck on the client-only path:
  - browser `/api/setup/init` now stays on a lightweight catalog/team bootstrap until a full league session is actually needed
  - setup status no longer overwrites the timing diagnostics with a plain `Ready` after init or runtime-mode switches
- Improved the main-game UI around the new systems:
  - frontend API errors now preserve backend `reasonCode`, so challenge-restricted actions show explicit blocked-action messaging
  - the overview tab now surfaces weekly-plan/culture/owner-pressure context in a summary line instead of hiding it only in staff-owner tables
  - the scouting board now exposes scheme fit directly plus a textual scouting insight summary for the top board target and latest report
- Cleaned up the roster and stats surfaces:
  - removed the redundant roster-board panel from the roster page
  - fixed career stat rows so they now carry real games/starts, which restores correct per-game calculations in the stats UI
  - added a regression that checks starter-qualified season averages against weighted position baselines
- Added a filter-aware starter-qualified benchmark hint to the stats tab so users can tell when they are comparing against position-specific regular-season starter baselines versus broader all-player/team views
- Revalidated the current gameplay/client batch with:
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
  - `node --check src/stats/realismCalibrator.js`
  - `node --check test/stats-regression.test.js`
  - `node --check public/app.js`
  - `node --test --test-isolation=none test/stats-regression.test.js test/realism-career-regression.test.js`
  - `node --test --test-isolation=none test/realism-career-regression.test.js`
  - `npm.cmd test`
  - `node --check public/setup.js`
  - `node --check public/lib/api/createApiClient.js`
  - `node --check src/stats/statBook.js`
  - `node --check test/stats-regression.test.js`
  - `node --check src/config/leagueSetup.js`
  - `node --check src/runtime/applyLeagueSetup.js`
  - `node --check src/runtime/GameSession.js`
  - `node --check src/engine/gameSimulator.js`
  - `node --check src/engine/offseasonSimulator.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check src/server.js`
  - `node --check test/world-state-next-step.test.js`
  - `node --check test/local-api-runtime.test.js`
  - `node --check test/new-systems.test.js`
  - `node --check test/feature-pack-v1.test.js`
  - `node --test --test-isolation=none test/feature-pack-v1.test.js test/new-systems.test.js test/local-api-runtime.test.js test/world-state-next-step.test.js test/session-actions.test.js test/strategy-contract-scouting.test.js`
  - `npm.cmd run build:pages`
  - `npm.cmd run smoke:pages`

What is mid-flight:
- The unrelated realism/runtime work is still parked in a local stash and has not been reincorporated
- Challenge restrictions are much more mechanical now, though edge-case acquisition paths may still be worth auditing later
- Full `npm.cmd test` exceeded the local command timeout window during the QB depth-rating pass, so the focused suites above are the confirmed validation set for this session

What to do next:
1. Validate the new QB depth-rating pass against refreshed 2025 NFL/PFF benchmarks and decide whether DB/LB coverage also needs bucketed subratings
2. Push the QB depth-rating pass and confirm GitHub stays green on the next run
3. Use the new setup diagnostics to decide whether any remaining setup/main-menu latency still needs another trim after the lazy browser bootstrap
4. Feed the new world-state deeper into any remaining owner expectation loops and transaction AI edges
5. Extend the new benchmark/qualification hint pattern to any other views that still imply apples-to-apples NFL averages without saying so

Important constraints:
- The parked stash is named `park unrelated realism-runtime work after depth-chart commit`; do not lose it if that work is still needed
- The local Studio repo clone is heavily dirty; do not edit its standards/docs blindly without first isolating that worktree
