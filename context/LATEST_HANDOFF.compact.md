<!-- generated-by: scripts/compact-handoff.mjs v3.1 -->
<!-- source-hash: 342d9e4c47f9 -->
<!-- generated-at: 2026-08-13T07:48:27.831Z -->

# LATEST_HANDOFF (compact)

# Handoff Summary — Session 84

## Session
- S84 closeout. Next: S85 fresh live-code audit from S84 authority.

## Shipped (S84)
- Tutorial route `/game.html`: 5 desktop + 4 mobile panels now reserve rendered height in `public/styles.css`, closing CLS shift sources.
- `/api/team-archetypes?team=` optional param added to Express (`src/server.js`) and static (`src/app/api/localApiRuntime.js`) runtimes; Overview Rival Coach Intel now scoped to one opponent. Full-list caller unchanged (needs all 32).
- `public/lib/historyFormatting.js` now covered by `test/history-formatting.test.js` (5 tests, all formatters).
- Node proof 1,094/1,094 across five shards (+16: 9 layout, 2 archetype scoping, 5 formatting). Pages build/smoke green.

## Current Intent
- Verify shipped work against live evidence; do not re-litigate exhausted S84 lens. Preserve external Obelisk boundary and public-launch HOLD unless new signed evidence changes them.

## Now — Top 3
1. Re-run `scripts/measure-hosted-performance.mjs` against live staging to confirm tutorial CLS lands under 0.1 desktop and mobile (contract verified, live delta not).
2. Observe first real opted-in Community Stats cohort; evaluate historical/shareable aggregates only after value proven.
3. Complete Obelisk relying-party registration on signed Ark response, then prove discovery, PKCE, session, logout before account flows.

## Blockers — Top 3
1. Zoho delivery/reply-as unproved.
2. SHA-bound founder launch approval unmet (false).
3. Registry SPARKED / local FORGE lifecycle reconciliation unmet.

## Human-Blocked (age)
- Public launch HOLD: 3 external gates (Zoho, founder approval, lifecycle) — persisting unchanged since at least S78 (6+ sessions).
- Obelisk relying-party registration: awaiting signed Ark response — since S83 (1+ session).

## Constraints That Must Survive
- Tutorial min-height is rendering-order fix only; never alter lazy-island hydration contract (D-S73.6) or add delay.
- `/api/team-archetypes` additive/backward-compatible; omitting param always returns all 32.
- No live-pixel pass run S84 (CSS layout + backend query only, no themed visual change) — stated as scope call.

## Do Not Re-Litigate (S85)
- Rival-GM persona surfacing, offline/service-worker, three already-covered untested modules, Depth Chart drag-and-drop parity — rejected phantoms, need new evidence.

## Next-Session Pointer
Start `docs/AUDIT_2026-08-13_SESSION84.json`; run fresh S85 live-code audit, prioritize live-staging CLS re-measure.
