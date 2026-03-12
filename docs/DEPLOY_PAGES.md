# VaultSpark Football GM Pages Deployment

This repo builds and deploys its own GitHub Pages site directly at:

- `https://vaultsparkstudios.com/vaultspark-football-gm/`

The Pages bundle is client-only and uses the in-browser runtime. The Node-hosted
server remains the development/runtime path and is not part of the Pages
artifact.

Backend/runtime deployment is separate. The default studio runtime plan lives in:

- `docs/STUDIO_BACKEND_PLAN.md`

## Required GitHub setup

In `vaultspark-football-gm`:

- Settings -> Pages -> Source: `GitHub Actions`

## Optional GitHub variables

Set these only if the published client should point at a live backend:

- `GAME_SERVICE_ORIGIN`
  - `https://play-vaultspark-football-gm.vaultsparkstudios.com`
- `API_DOMAIN`
  - `api-vaultspark-football-gm.vaultsparkstudios.com`

No secret is required for GitHub Pages deployment.

## What the workflow does

`deploy-pages.yml`:

1. Builds the static client for `/vaultspark-football-gm/`
2. Forces the published bundle to default to the client runtime and disables the `server-backed` setup option unless an explicit backend origin variable is provided
3. Copies `index.html` to `404.html` for deep-link fallback
4. Uploads the built `static/` artifact to GitHub Pages
5. Deploys the artifact directly from this repo

Local validation commands:

- `npm run build:pages`
- `npm run smoke:pages`

## Current scope

This Pages build does not include the server-backed runtime. Published Pages
artifacts are expected to run in browser/local-storage mode until a separate
production backend rollout is ready. If `GAME_SERVICE_ORIGIN` or `API_DOMAIN`
is configured later, the build can point the client at that backend and re-enable
the `server-backed` runtime selector.

## Backend scaffold

The repo includes:

- `.github/workflows/deploy-backend.yml`
- `Dockerfile.runtime`
- `ops/deploy-backend.docker-compose.yml`
- `ops/Caddyfile`

The backend workflow is separate from Pages deployment and remains the Studio
standard path for `play-{slug}` and `api-{slug}` rollout.

## Studio site follow-up

The studio site repo remains the landing page and discovery layer. Homepage
card changes there are separate content work:

- fetch the latest `VaultSparkStudios.github.io` remote state first
- verify the live or upstream landing page before editing
- keep the card link pointed at `/vaultspark-football-gm/`
