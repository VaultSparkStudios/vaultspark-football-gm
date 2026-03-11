# Current State

Build status:
- `origin/main` already contains the merged direct-Pages / CI-fix branch from PR #2
- Direct GitHub Pages deployment from this repo remains the canonical frontend publish path
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- Depth chart editing now uses dedicated controls instead of generic table post-processing, so move buttons no longer collide with the global player-modal click handler
- Manual snap-share overrides are now persisted in league state, exposed through `/api/depth-chart`, and consumed by the live game simulator rotation logic
- The always-open footer Game Guide has been replaced with a button-driven modal/submenu while the Rules tab guide remains available
- The game shell now marks itself ready after loading core dashboard state, then hydrates heavier panels in the background so `Play` mode no longer appears stuck on `Loading...` after league creation
- Server-backed setup init now defers backup loading on first open, and both save-store adapters skip backup metadata work when only normal saves are requested
- The setup page now requests active-league/team state without blocking on save discovery, marks itself ready, and hydrates the save list in the background via `/api/saves`
- User-facing schedule, calendar, ticker, transaction, pick, analytics, and player-profile views now resolve team IDs to the generated team abbreviations instead of leaking legacy NFL IDs
- Roster designation and retirement-override controls now use table-driven player selection chips instead of raw typed player IDs, with focused UI coverage for the designation flow
- Focused validation passed for:
  - `node --check public/app.js`
  - `node --check public/setup.js`
  - `node --check src/server.js`
  - `node --check src/app/api/localApiRuntime.js`
  - `node --check tests-ui/app.spec.js`
  - `node --test --test-isolation=none test/browser-save-store.test.js test/file-save-store.test.js test/local-api-runtime.test.js`
  - `node --test --test-isolation=none test/session-actions.test.js test/local-api-runtime.test.js`
  - `node --test --test-isolation=none test/local-api-runtime.test.js`
  - `npx.cmd playwright test tests-ui/app.spec.js --reporter=line --workers=1`
  - `npx.cmd playwright test tests-ui/play-mode-smoke.spec.js --reporter=line --workers=1`

Current priorities:
1. Measure and trim any remaining setup/main-menu latency after the non-blocking save-load pass, especially any residual active-session or runtime-mode startup overhead
2. Remove the remaining raw-ID dependence from the remaining commissioner-facing flows such as trade, compare, and history tools
3. Smoke the updated setup/startup, team-identity, depth-chart, and `Play`-mode flows in any remaining manual QA scenarios if needed

Known issues:
- The Pages artifact is client-only; the server-backed runtime still requires separate backend rollout
- The unrelated realism/runtime work was parked in a local stash and is not yet reconciled back into the branch
- A full local `npm.cmd test` pass was not rerun in this session, so current verification relies on the focused suites above
- Live GitHub-side confirmation for Pages settings still depends on repo access/tooling outside the local worktree
