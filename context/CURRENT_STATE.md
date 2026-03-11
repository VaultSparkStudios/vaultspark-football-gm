# Current State

Build status:
- Direct GitHub Pages deployment from this repo is now the canonical frontend publish path
- Backend scaffold remains separate under `deploy-backend.yml`, `Dockerfile.runtime`, and `ops/`
- Project memory files now exist in-repo and are part of the required session bootstrap path
- Local standards validation passed for `build:pages`, `smoke:pages`, and the focused diff check

Current priorities:
1. Commit and push the standards-only diff without touching unrelated gameplay/realism changes
2. Confirm live GitHub Pages settings and any optional backend-linked repo variables in GitHub
3. Keep the repo's memory and handoff files current as future feature work resumes

Known issues:
- The Pages artifact is client-only; the server-backed runtime still requires separate backend rollout
- The local worktree contains unrelated modified and untracked files outside this standards pass
- Live GitHub-side confirmation for Pages settings still depends on repo access/tooling outside the local worktree
