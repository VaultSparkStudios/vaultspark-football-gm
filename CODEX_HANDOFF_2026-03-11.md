# Codex Handoff - 2026-03-11

## Repo
- Local folder: `C:\Users\p4cka\Documents\development\vaultspark football gm`
- Current remote: `https://github.com/VaultSparkStudios/vaultspark-football-gm.git`
- Canonical slug: `vaultspark-football-gm`
- Public URL: `https://vaultsparkstudios.com/vaultspark-football-gm/`

## Standards status
- `AGENTS.md` is aligned to the updated Studio source-of-truth model.
- Project-memory files exist under `context/`, `handoffs/`, `logs/`, `plans/`, `prompts/`, and `specs/`.
- Local deployment docs/templates now describe the direct per-repo GitHub Pages model.
- `.github/workflows/deploy-pages.yml` now deploys GitHub Pages directly from this repo.
- Backend deployment remains separate under `.github/workflows/deploy-backend.yml`.

## Deployment targets
- Frontend: `https://vaultsparkstudios.com/vaultspark-football-gm/`
- Gameplay origin target: `https://play-vaultspark-football-gm.vaultsparkstudios.com`
- API origin target: `https://api-vaultspark-football-gm.vaultsparkstudios.com`

## Required GitHub setup
- Settings -> Pages -> Source = `GitHub Actions`
- Optional repo variable: `GAME_SERVICE_ORIGIN=https://play-vaultspark-football-gm.vaultsparkstudios.com`
- Optional repo variable: `API_DOMAIN=api-vaultspark-football-gm.vaultsparkstudios.com`

## Workflow status
- `.github/workflows/ci.yml` exists for repo validation
- `.github/workflows/deploy-pages.yml` is the direct GitHub Pages workflow for this repo
- `.github/workflows/deploy-backend.yml` is the separate backend scaffold for the Studio runtime pattern

## Known gaps
- The Pages build is client-only; production server-backed play still depends on the separate backend rollout.
- The local worktree contains unrelated modified/untracked files outside this standards-compliance pass.
- GitHub-side Pages settings and any optional backend-linked repo variables still need to be confirmed live.

## Validation targets
- `npm.cmd run build:pages`
- `npm.cmd run smoke:pages`
- `git diff --check -- AGENTS.md docs .github/workflows package.json context handoffs logs plans prompts specs CODEX_HANDOFF_2026-03-11.md`

## Next action
- Validate the focused standards diff and push the standards update.
