# Agent Instructions - VaultSpark Football GM

## Studio Identity

- Studio site repo: `VaultSparkStudios/VaultSparkStudios.github.io`
- Studio public URL: `https://vaultsparkstudios.com/`
- Game repos live under: `VaultSparkStudios/`

## Per-Game Identity

- Repo name: `vaultspark-football-gm`
- Public slug: `vaultspark-football-gm`
- Public URL: `https://vaultsparkstudios.com/vaultspark-football-gm/`
- Gameplay origin: `https://play-vaultspark-football-gm.vaultsparkstudios.com`
- API origin: `https://api-vaultspark-football-gm.vaultsparkstudios.com`

## Project Memory

Before non-trivial work in this repo, read in this order:

1. `context/PROJECT_BRIEF.md`
2. `context/CURRENT_STATE.md`
3. `context/DECISIONS.md`
4. `context/TASK_BOARD.md`
5. `handoffs/LATEST_HANDOFF.md`

For deployment, domain, GitHub Pages, or studio-site integration work, also read:

- `docs/STUDIO_DEPLOYMENT_STANDARD.md`
- `docs/STUDIO_BACKEND_PLAN.md`
- `docs/DEPLOY_PAGES.md`
- `docs/templates/deploy-pages.template.yml`
- `docs/templates/deploy-backend.docker-compose.template.yml`
- `docs/templates/Caddyfile.studio-backend.template`
- `docs/templates/GAME_LAUNCH_CHECKLIST.template.md`
- `CODEX_HANDOFF_2026-03-11.md`

## Required Behavior

- Treat this `AGENTS.md` file as the source of truth for Studio deployment protocol if any local document drifts.
- Treat `docs/STUDIO_DEPLOYMENT_STANDARD.md` as the repo-local deployment standard and keep it aligned with this file.
- Repo name and public slug are identical and lowercase: `vaultspark-football-gm`.
- This game deploys GitHub Pages directly from this repo. No cross-repo Pages sync and no `STUDIO_SITE_TOKEN` are part of the Pages path.
- Enable GitHub Pages source as `GitHub Actions` in the repo settings.
- Keep the public frontend URL on the game repo path:
  - `https://vaultsparkstudios.com/vaultspark-football-gm/`
- Keep frontend Pages deployment separate from backend/runtime deployment.
- Keep backend/runtime naming on the studio default:
  - `https://play-vaultspark-football-gm.vaultsparkstudios.com`
  - `https://api-vaultspark-football-gm.vaultsparkstudios.com`
- Keep this repo self-sufficient: deployment and operational context must live in repo files, not only in chat.
- Update `context/CURRENT_STATE.md`, `context/TASK_BOARD.md`, and `handoffs/LATEST_HANDOFF.md` after meaningful work sessions.
- Update `CODEX_HANDOFF_YYYY-MM-DD.md` after deployment-related changes.
- Before changing the studio-site homepage repo for this game, fetch the latest remote there and verify the live landing page or upstream `index.html` first.
- If you create a temporary clone inside this repo, add it to `.git/info/exclude` so it cannot be accidentally staged here.
