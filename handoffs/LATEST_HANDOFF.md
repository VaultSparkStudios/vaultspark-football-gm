# Latest Handoff

Last updated: 2026-03-11

What was completed:
- Confirmed the direct-Pages standards PR already merged into `origin/main`
- Fixed the depth chart move-control bug by giving the depth table dedicated controls that no longer advertise `data-player-id` on reorder buttons
- Added persisted manual snap-share overrides to the depth chart UI, server/local API, session state, and simulator usage path
- Replaced the always-open footer Game Guide with a button-driven guide modal while leaving the Rules tab guide content intact
- Added coverage for manual snap-share persistence/runtime behavior in `test/session-actions.test.js` and `test/local-api-runtime.test.js`
- Added a Playwright regression for depth chart controls and the guide modal in `tests-ui/app.spec.js`
- Re-ran the focused Node tests and the Playwright UI suite, then committed only the intended gameplay/UI files from this batch
- Parked the unrelated realism/runtime work behind a named stash so the branch is clean
- Fixed the `Play`-mode startup hang by splitting game-page boot into core dashboard loading plus background panel hydration
- Added a dedicated Playwright smoke test for creating a league in `Play` mode and reaching a ready franchise screen
- Deferred backup loading on the first setup-init request and tightened both save-store adapters so normal save listing skips backup metadata work
- Fixed the main user-facing team identity leak by mapping schedule/calendar/ticker/transaction/pick/player displays to the generated team abbreviations instead of raw team IDs
- Replaced raw typed player-ID inputs in the designation and retirement-override panels with table-driven selection chips and disabled action buttons until a player is selected
- Added a Playwright regression for the designation selection flow and the no-raw-ID retirement override shell state
- Made setup boot non-blocking for save discovery by allowing `/api/setup/init` to skip saves, marking the page ready from active-league/team state, and hydrating `/api/saves` in the background
- Fixed the client-only runtime import boundary by moving node-only realism profile loading out of the browser path, and made runtime-mode switching reload setup state for the selected runtime
- Added regression coverage for switching between server-backed and client-only mode on the setup menu

What is mid-flight:
- The unrelated realism/runtime work is still parked in a local stash and has not been reincorporated
- The next UX/runtime batch still needs to tackle the remaining raw-ID commissioner/admin flows outside designation/retirement override and any remaining setup/main-menu latency after the non-blocking save-load and client-runtime import fixes

What to do next:
1. Measure and trim any remaining setup/main-menu latency, especially any residual runtime-mode startup overhead after the client-runtime import fix
2. Remove the remaining raw-ID dependence from the remaining commissioner/admin flows such as trade, compare, and player-history lookups
3. Reconcile the separate Studio repo docs/templates to match Studio `AGENTS.md` once that worktree is safe to edit

Important constraints:
- The parked stash is named `park unrelated realism-runtime work after depth-chart commit`; do not lose it if that work is still needed
- The local Studio repo clone is heavily dirty; do not edit its standards/docs blindly without first isolating that worktree
