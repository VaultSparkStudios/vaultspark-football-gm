# Work Log

## 2026-06-04 — Session 14: engagement surfacing + pipeline defense closeout

- Generated the 2026-06-04 audit (8 items) personalized to live findings: both ship pipelines dead since Session 13 at the Playwright install step, the custom-domain cert expired/bad_authz, rivalryDNA invisible in UI, and the twice-recorded realism-sweep follow-up.
- Hardened CI and Pages deploy with Playwright browser caching, bounded install steps with retry, and a smoke watchdog; added the weekly scheduled realism sweep workflow.
- Shipped four player-facing systems: rivalry surfacing, Season Epilogue ritual, shareable challenge codes, and the beta feedback flow; added save/gist integrity stamping.
- Root-caused the public 403 outage to Cloudflare-proxied DNS blocking GitHub ACME plus a Cloudflare-side block; wrote the founder runbook and confirmed Cloudflare credentials are absent from the secrets gateway.
- Verification: 149 tests green across five shards (up from 131), `build:pages` + `smoke:pages` pass.

## 2026-06-03 — Test sharding and Pages smoke closeout

- Generated fresh 2026-06-03 audit artifacts focused on the active Football GM blockers: opaque test timeout, Pages publish confidence, and low-token verification routing.
- Added a named shard runner plus npm scripts for core, runtime, sim-contract, sim-realism, studio, long, and full verification paths.
- Converted GitHub CI unit checks to a shard matrix and added static Pages smoke gates to CI/deploy before artifact upload.
- Restored missing local Studio helper modules surfaced by the startup smoke test.
- Verification passed for all default shards, composed `npm test`, explicit `test:long`, Pages build, and Pages smoke.

## 2026-05-27 — Goal continuation verification closeout

- Reran the Studio sequence from the current worktree: `/start` orientation, audit artifact inspection, `/implement` no-op verification against the execution log, and closeout write-back.
- Verified the changed audit surfaces still pass targeted tests and syntax checks.
- Attempted full `npm test` with a 20-minute ceiling; it timed out, keeping test sharding as the next engineering priority.

## 2026-05-27 — Explicit closeout refresh

- Refreshed public-safe closeout surfaces after the audit implementation sprint had already been committed and pushed.
- Added canonical `context/OBELISK_ADOPTION.md` with Phase 0 declared posture for CANON-021.
- Updated task board, current state, latest handoff, decisions, CDR, SIL, truth audit, closeout board, and Codex memory for the post-push handoff.

## 2026-05-27 — Audit implementation sprint closeout

- Restored local Studio startup/blocker automation by adding the helper modules imported by `render-startup-brief.mjs` and `blocker-preflight.mjs`.
- Added GameSession lookup indexes for teams, active players, retired players, draft picks, and team rosters, then routed roster, profile, trade, waiver, and free-agent paths through the indexed helpers where appropriate.
- Replaced browser local API simulation job `Math.random()` suffixes with deterministic clock-plus-counter IDs.
- Added targeted regression coverage for Studio protocol scripts, lookup-index mutation flows, and deterministic job IDs.
- Verification passed for targeted tests and syntax checks; full `npm test` exceeded both 5-minute and 15-minute command timeouts.

## 2026-05-27 — Codex startup reliability closeout

- Added project-local Codex launch wrappers for Football GM so this repo can start Codex with `--disable apps` without disabling Apps globally across the Studio portfolio.
- Verified the wrapper path with a fresh `codex exec --ephemeral --sandbox read-only` turn.
- Aligned package metadata with the proprietary rights posture documented in `docs/RIGHTS_PROVENANCE.md`.

This public repo no longer carries the detailed internal work log. Internal session-by-session execution detail is maintained privately.
