# Current State

Public-safe summary:
- this repo remains deployable
- internal operational records were sanitized for public-repo safety on 2026-04-03
- detailed internal state now lives in the private Studio OS / ops repository
- 2026-05-27: added Football GM-specific Codex launch wrappers that suppress the failing built-in Apps MCP startup path only for this repo while leaving global Codex Apps enabled for the broader Studio portfolio
- 2026-05-27: package metadata was aligned with the proprietary rights posture declared in `docs/RIGHTS_PROVENANCE.md`
- 2026-05-27: `/start` automation was restored by adding the missing local helper modules for startup brief rendering and blocker preflight; the regenerated startup brief now builds successfully
- 2026-05-27: GameSession now maintains Map-backed lookup indexes for teams, active players, retired players, draft picks, and team rosters; roster-moving mutations refresh the indexes
- 2026-05-27: browser local API simulation job IDs now use deterministic clock-plus-counter IDs instead of `Math.random()`
- 2026-05-27: explicit founder closeout requested after the audit implementation push; context, CDR, task board, SIL, truth audit, closeout board, and agent memory were refreshed for a clean post-push handoff
- 2026-05-27: declared Obelisk Phase 0 posture in `context/OBELISK_ADOPTION.md` for CANON-021 compliance
- 2026-05-27: continuation verification reran the `/start -> /audit -> /implement -> /closeout` evidence chain; targeted changed-surface tests still pass, while full `npm test` remains too slow for the current local agent ceiling
- 2026-06-03: replaced the opaque full-suite timeout with named test shards (`core`, `runtime`, `sim:contract`, `sim:realism`, `studio`, `long`); default `npm test` now passes locally in about 8.9 minutes, and the explicit long smoke shard passes in about 21 seconds
- 2026-06-03: GitHub CI and Pages deploy workflows now run a static Pages smoke gate after building the client-only bundle and before public artifact upload
