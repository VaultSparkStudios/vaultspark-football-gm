# Current State

Build status:
- `origin/main` already contains the merged direct-Pages / CI-fix branch from PR #2
- Direct GitHub Pages deployment from this repo remains the canonical frontend publish path
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- Depth chart editing now uses dedicated controls instead of generic table post-processing, so move buttons no longer collide with the global player-modal click handler
- Manual snap-share overrides are now persisted in league state, exposed through `/api/depth-chart`, and consumed by the live game simulator rotation logic
- The always-open footer Game Guide has been replaced with a button-driven modal/submenu while the Rules tab guide remains available
- Focused validation passed for:
  - `node --test --test-isolation=none test/session-actions.test.js test/local-api-runtime.test.js`
  - `npx.cmd playwright test tests-ui/app.spec.js --reporter=line --workers=1`

Current priorities:
1. Clean or isolate the unrelated dirty files still present in this repo outside the committed depth-chart / guide batch
2. Smoke the updated depth-chart flow in any remaining manual QA scenarios if needed
3. Start the next UX/runtime fixes: randomized team abbreviations, `Play` mode startup, and setup/main-menu load time

Known issues:
- The Pages artifact is client-only; the server-backed runtime still requires separate backend rollout
- The local worktree still contains unrelated modified and untracked files outside the committed gameplay/UI batch
- A full local `npm.cmd test` pass was not rerun in this session, so current verification relies on the focused suites above
- Live GitHub-side confirmation for Pages settings still depends on repo access/tooling outside the local worktree
