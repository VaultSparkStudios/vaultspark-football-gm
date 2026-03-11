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

What is mid-flight:
- The unrelated realism/runtime work is still parked in a local stash and has not been reincorporated
- The next UX/runtime batch still needs to tackle randomized abbreviations and any remaining setup/main-menu latency after this backup-deferral pass

What to do next:
1. Measure and trim any remaining setup/main-menu latency, especially active-session checks
2. Generate abbreviations from randomized city/team names instead of fixed NFL IDs
3. Reconcile the separate Studio repo docs/templates to match Studio `AGENTS.md` once that worktree is safe to edit

Important constraints:
- The parked stash is named `park unrelated realism-runtime work after depth-chart commit`; do not lose it if that work is still needed
- The local Studio repo clone is heavily dirty; do not edit its standards/docs blindly without first isolating that worktree
