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

What is mid-flight:
- Unrelated dirty gameplay/realism files still remain in the repo and should not be swept into the next commit by accident
- The next UX/runtime batch still needs to tackle randomized abbreviations, `Play` mode startup, and setup/main-menu performance

What to do next:
1. Clean or isolate the unrelated dirty files in the game repo before the next feature batch
2. Reproduce the reported `Play` mode and setup-load issues from the main menu
3. Reconcile the separate Studio repo docs/templates to match Studio `AGENTS.md` once that worktree is safe to edit

Important constraints:
- Do not revert or stage the unrelated gameplay/realism files already modified in the worktree
- The local Studio repo clone is heavily dirty; do not edit its standards/docs blindly without first isolating that worktree
