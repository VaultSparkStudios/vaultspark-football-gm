# Codex Handoff - 2026-03-12

## Repo
- Local folder: `C:\Users\p4cka\Documents\Development\VaultSpark Football GM`
- Current remote: `https://github.com/VaultSparkStudios/vaultspark-football-gm.git`
- Canonical slug: `vaultspark-football-gm`
- Public URL: `https://vaultsparkstudios.com/vaultspark-football-gm/`

## Deployment/runtime status
- GitHub Pages remains the canonical frontend publish path for this repo.
- The Pages build now injects runtime-availability metadata into `index.html` and `game.html`.
- Published Pages artifacts default to `client-only` mode and disable the `server-backed` setup option unless `GAME_SERVICE_ORIGIN` or `API_DOMAIN` is configured at build time.
- Backend GHCR image tags now lowercase the GitHub owner name before push, fixing the `repository name must be lowercase` failure in `Deploy Backend Runtime`.
- Backend/runtime deployment remains separate and still targets:
  - `https://play-vaultspark-football-gm.vaultsparkstudios.com`
  - `https://api-vaultspark-football-gm.vaultsparkstudios.com`

## Live issue fixes from this session
- GitHub `CI` no longer fails on the career realism guardrail after tightening the QB starter-qualified career baseline to require meaningful starts as well as passing volume.
- GitHub `Deploy Backend Runtime` no longer emits invalid mixed-case GHCR tags.
- Pages no longer exposes a broken `server-backed` path by default, so the live site should stop producing the `Unexpected token '<'` JSON parse failure when users try to create a server-backed league without a deployed backend.
- The shared API client now reports a clearer non-JSON/backend-origin error when HTML is returned from a supposed API request.
- Browser saves now prune older rolling backups before retrying quota-limited writes.
- Client-only auto-backup failures now degrade to warnings instead of aborting week advancement.

## Required GitHub setup
- Settings -> Pages -> Source = `GitHub Actions`
- Optional repo variable: `GAME_SERVICE_ORIGIN=https://play-vaultspark-football-gm.vaultsparkstudios.com`
- Optional repo variable: `API_DOMAIN=api-vaultspark-football-gm.vaultsparkstudios.com`

## Validation targets
- `node --test --test-isolation=none test/realism-career-regression.test.js`
- `npm.cmd test`
- `node --test --test-isolation=none test/browser-save-store.test.js test/local-api-runtime.test.js`
- `npm.cmd run build:pages`
- `npm.cmd run smoke:pages`

## Known gaps
- The public site still cannot offer true server-backed play until the separate backend/runtime deployment exists and an origin variable is configured.
- Setup/main-menu latency still needs measuring after the earlier startup-path fixes.
- The unrelated stash `park unrelated realism-runtime work after depth-chart commit` remains parked.

## Next action
- Push the current workflow/profile fixes, confirm both `CI` and `Deploy Backend Runtime` go green on GitHub, then return to setup/menu latency measurement.
