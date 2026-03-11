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

Open problems:
- There are still unrelated dirty gameplay files in the worktree that are intentionally not part of this commit
- GitHub Settings -> Pages and optional repo variables cannot be verified from repo files alone
- A full `npm.cmd test` invocation was not rerun in this shell session, so verification here relies on the focused suites that passed

Recommended next action:
- Isolate the remaining unrelated worktree changes before the next feature batch, then start the `Play` mode / setup-load investigation
