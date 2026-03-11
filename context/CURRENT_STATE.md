# Current State

Build status:
- Direct GitHub Pages deployment from this repo is now the canonical frontend publish path
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- Project memory files now exist in-repo and are part of the required session bootstrap path
- Local standards validation passed for `build:pages`, `smoke:pages`, and the focused diff check
- CI now targets Node 24 so `npm test` can use `--test-isolation=none` in GitHub Actions
- The current PR branch now also includes the runtime/stat fixes for the four failing `npm test` assertions seen in GitHub Actions
- The remaining two CI failures were stale test expectations; local test updates now match the current runtime behavior
- The remaining Playwright failures were outdated selectors/flows in `tests-ui/app.spec.js`; the updated UI spec now passes locally end to end

Current priorities:
1. Confirm GitHub Actions clears the updated UI checks on `codex/direct-pages-standards`
2. Return to the pending gameplay/UI work after CI is stable
3. Reconcile the Studio repo's own deployment docs with Studio `AGENTS.md` once that separate repo is in a safe state to edit

Known issues:
- The Pages artifact is client-only; the server-backed runtime still requires separate backend rollout
- The local worktree contains unrelated modified and untracked files outside this standards pass
- Live GitHub-side confirmation for Pages settings still depends on repo access/tooling outside the local worktree
- The separate Studio repo local clone is heavily dirty, so standards-only reconciliation there should not proceed without isolating or cleaning that worktree first
