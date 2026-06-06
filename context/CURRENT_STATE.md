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
- 2026-06-04: CI and Pages deploy now defend against the Playwright install hang that killed both pipelines on the Session-13 push (browser cache, 6-minute step timeouts with one retry, smoke watchdog); a weekly scheduled realism sweep workflow runs `test:long` plus a 24-season verification with its own time budget
- 2026-06-04: rivalryDNA is now surfaced in the game UI (schedule rivalry strip + RIVALRY WEEK sim-watch banner); season end gained a Season Epilogue ritual (arc verdicts, records set, fan pulse, deterministic coach quote) inside the Season Review modal
- 2026-06-04: speedrun challenges are shareable via checksummed VSFC1 challenge codes (copy on the speedrun panel, accept on setup) — deterministic seeds make zero-backend duels possible on static hosting
- 2026-06-04: browser saves and gist sync payloads carry FNV-1a integrity stamps verified on load/import (legacy saves unaffected); a "Tell the Commissioner" beta feedback flow opens prefilled GitHub issues with game context
- 2026-06-04: the public site outage was root-caused: the org root Pages repo's custom-domain cert is bad_authz/expired because the Cloudflare-proxied apex blocks GitHub's ACME challenge, and Cloudflare serves a 403 on all paths — founder runbook in TASK_BOARD; Cloudflare credentials are not in the secrets gateway
- 2026-06-05: post-closeout verification chased the pipeline to full green — Node pinned to 24.14.0 (24.16 hangs Playwright's post-download step), and the production rate limiter gained a test-harness exemption after it 429'd the first-ever CI execution of the UI suite; commit ae0c92b is the first fully-green CI + Pages + backend deploy in project history (149 unit tests + 9 UI tests)
