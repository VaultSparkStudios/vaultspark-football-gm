# Current State

Build status:
- Direct GitHub Pages deployment from this repo is now the canonical frontend publish path
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- Project memory files now exist in-repo and are part of the required session bootstrap path
- Local standards validation passed for `build:pages`, `smoke:pages`, and the focused diff check
- CI now targets Node 24 so `npm test` can use `--test-isolation=none` in GitHub Actions

Current priorities:
1. Push the CI Node 24 fix to the active PR branch
2. Confirm live GitHub Pages settings and any optional backend-linked repo variables in GitHub
3. Keep the repo's memory and handoff files current as future feature work resumes

Known issues:
- The Pages artifact is client-only; the server-backed runtime still requires separate backend rollout
- The local worktree contains unrelated modified and untracked files outside this standards pass
- Live GitHub-side confirmation for Pages settings still depends on repo access/tooling outside the local worktree
