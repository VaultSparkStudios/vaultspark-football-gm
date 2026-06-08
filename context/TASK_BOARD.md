# Task Board — VaultSpark Football GM

Public-safe roadmap. Session 8 audit + implementation sprint (2026-04-13). Session 9: test coverage (2026-04-13).

## Session 8 Priority Items (All 20)

### TIER 1 — Ship-Blockers (Beta Gate)

| # | Item | Status |
|---|------|--------|
| 1 | localStorage rewind size guard — auto-demote oldest slots above 4MB, non-blocking toast | ✅ Done |
| 2 | GitHub Pages CI deploy + Playwright smoke test on push to main | 🔄 In Progress |
| 3 | Mobile 375px overflow fix — modal-content overflow-x, draft war room, trade modal | ✅ Done |

### TIER 2 — UX/Retention Breakers

| # | Item | Status |
|---|------|--------|
| 4 | Franchise Moment card — cinematic post-game drama event with share button | ✅ Done |
| 5 | GM Decision Required modal — pre-advance choices on critical weeks (trade deadline, playoff clinch, QB injury) | ✅ Done |
| 6 | Tab navigation bucketing — 4 mode buckets (GAMEDAY / ROSTER / BUILDS / HISTORY) with pill toggles | ✅ Done |
| 7 | Live box score sim-watch mode — 300ms animated drive log, key play highlight cards, skip-to-final | ✅ Done |
| 8 | Priority Inbox — bell icon, CRITICAL/IMPORTANT/FLAVOR tiers, badge counter, persistent inbox | ✅ Done |

### TIER 3 — Depth & Differentiation

| # | Item | Status |
|---|------|--------|
| 9  | GM Persona Arc — enhanced Identity Card, score progress bar, confetti on tier-up | ✅ Done |
| 10 | Cap War Room — multi-year visual cap timeline, color-coded zones, restructure hints | ✅ Done |
| 11 | Trade Value Transparency — post-evaluate/execute breakdown card with A-F grades and verdict | ✅ Done |
| 12 | Dynamic Season Narrative Arc — 3 tension threads generated at week 1, binary resolution at season end | ✅ Done |
| 13 | AI GM Archetypes — per-team personality (Moneyball/Gut-Feel/Loyalty/Win-Now), visible in scouting | ✅ Done |
| 14 | Veteran Mentorship visual — "Mentored by" badge on player cards, stat boost display | ✅ Done |
| 15 | Dynasty Records Board — all-time franchise records by category, new-record celebrations | ✅ Done |

### TIER 4 — Performance & Security

| # | Item | Status |
|---|------|--------|
| 16 | Map-based player/team index — O(1) lookups in GameSession, ~15-25% sim speedup | 🔜 Next sprint |
| 17 | SimJob memory cleanup — TTL eviction after fetch or 10 min, prevents OOM | ✅ Done |
| 18 | Input validation hardening — schema validation at route entry for teamId/seed/week/year | ✅ Done |
| 19 | Seeded RNG for ID generation — replace Math.random() in beatReporter/narrativeEvents/server.js | ✅ Done |
| 20 | Rate limiting — token-bucket 50 req/min per IP on API endpoints | ✅ Done |

## Session 9 — Test Coverage Sprint (2026-04-13)

| Item | Status |
|------|--------|
| Add Session-8 endpoints to localApiRuntime (season-arcs, gm-decision, records/franchise, team-archetypes, franchise-moment) | ✅ Done |
| test/session8-endpoints.test.js — 18 tests covering all 5 new endpoints | ✅ Done |
| test/session8-contract-edges.test.js — 17 tests (pure logic + session edge cases) | ✅ Done |
| Pure unit tests for checkRateLimit, validateParam, deriveGmArchetype, pruneSimJobs | ✅ Done |
| Session tests: multi-restructure, picks-only trades, dashboard state, box score shape | ✅ Done |

**Suite result: 95 pass, 0 fail (up from 45 at S8 close)**

## Deferred to Next Sprint

- Item 16: Map-based player/team index — Done 2026-05-27 for GameSession identity lookups; future sim-loop hot paths can build on the index layer.
- Full GitHub Pages CI wiring (repo secrets needed)
- Verify whether the Football GM Codex Apps MCP startup failure is resolved upstream; remove `scripts/codex-football.*` wrappers if normal Codex startup becomes reliable for this repo.

## Deferred to Project Agents

- cross-repo item owned by another repo agent:

## Session 10 — Codex Startup Reliability (2026-05-27)

| Item | Status |
|------|--------|
| Keep Codex Apps globally enabled for the Studio portfolio | Done |
| Add Football GM-only Codex startup wrappers using `--disable apps` | Done |
| Verify wrapper startup path with `codex exec --ephemeral --sandbox read-only` | Done |
| Align package metadata with proprietary rights posture | Done |

## Session 11 — Audit + Implementation Sprint (2026-05-27)

| Item | Status |
|------|--------|
| Restore local Studio startup/blocker helper modules so `/start` and blocker preflight run again | Done |
| Ship GameSession Map-backed lookup indexes for teams, players, retired players, draft picks, and team rosters | Done |
| Replace browser local API simulation job `Math.random()` IDs with deterministic clock-plus-counter IDs | Done |
| Add regression coverage for Studio protocol scripts, lookup index mutations, and deterministic job IDs | Done |

**Verification:** `node --test test/studio-protocol-smoke.test.js`, `node --test test/session-lookup-indexes.test.js`, `node --check src/runtime/GameSession.js`, `node --check src/app/api/localApiRuntime.js`, `node scripts/render-startup-brief.mjs`, and `node scripts/blocker-preflight.mjs --json` passed. Full `npm test` was attempted with 5-minute and 15-minute ceilings and timed out before completion.

## Session 12 — Explicit Closeout Refresh (2026-05-27)

| Item | Status |
|------|--------|
| Refresh all public-safe closeout surfaces after pushed audit implementation sprint | Done |
| Add canonical `context/OBELISK_ADOPTION.md` Phase 0 declaration | Done |
| Update CDR, decisions, work log, SIL, truth audit, closeout board, and agent memory | Done |

## Next Sprint Queue

| Item | Status |
|------|--------|
| Split simulation-heavy `npm test` into CI-friendly shards so local/agent runs return actionable output | ✅ Done 2026-06-03 — `npm test` now runs bounded default shards; `npm run test:long` isolates expensive realism/determinism smoke probes |
| Complete GitHub Pages CI deploy once repo secret/provider configuration is ready | 🔄 Improved 2026-06-03 — deploy workflow now builds and smokes the static client before upload; provider/repo Pages settings still external |

## Session 13 — Test Sharding + Pages Smoke Gates (2026-06-03)

| Item | Status |
|------|--------|
| Add shard runner and npm scripts for core/runtime/sim/studio/long test surfaces | Done |
| Convert CI unit checks to a matrix of bounded shards | Done |
| Run static Pages smoke in CI and deploy workflow before artifact upload | Done |
| Restore missing local Studio helper modules required by startup smoke | Done |

**Verification:** `npm run test:studio`, `npm run test:runtime`, `npm run test:core`, `npm run test:sim:contract`, `npm run test:sim:realism`, `npm test`, `npm run test:long`, `npm run build:pages`, and `npm run smoke:pages` passed. `npm run test:runtime` took about 183 seconds when run alone; composed `npm test` completed in about 8.9 minutes with 131 default tests.

## Session 14 — Engagement Surfacing + Pipeline Defense Sprint (2026-06-04)

| Item | Status |
|------|--------|
| Defend CI + Pages deploy against the Playwright install hang (cache, step timeouts, retry, smoke watchdog) | Done |
| Add weekly scheduled deep realism sweep workflow with its own time budget (closes twice-recorded SIL follow-up) | Done |
| Surface rivalryDNA in game UI — schedule rivalry strip + RIVALRY WEEK sim-watch banner | Done |
| Season Epilogue ritual — arc verdicts, records, fan pulse, coach quote in the Season Review modal | Done |
| Shareable seeded challenge codes — zero-backend "beat my run" duels (encode/copy/accept flow) | Done |
| Save integrity guard — FNV-1a checksum on browser saves + gist sync sidecar, verified on load/import | Done |
| Beta feedback widget — "Tell the Commissioner" prefilled GitHub issue with game context | Done |
| Pages custom-domain cert remediation | Diagnosed — founder action required (see below) |

**Verification:** all five default shards green — core 54, runtime 69, sim-contract 22, sim-realism 1, studio 3 (149 tests, up from 131, 0 fail) · `npm run build:pages` + `npm run smoke:pages` pass.

### ⚠ Cloudflare Access Required — vaultsparkstudios.com is serving 403 (site down)

Diagnosis (agent-verified 2026-06-04):
- The custom domain lives on the org root repo `VaultSparkStudios.github.io` (cname `vaultsparkstudios.com`).
- GitHub's HTTPS cert for it is `bad_authz`, **expired 2026-06-02** — DNS points at Cloudflare proxy IPs, so GitHub's ACME HTTP-01 challenge can never complete.
- Visitors get TLS from Cloudflare's edge cert, but **every path returns a Cloudflare-origin 403** — the game URL `https://vaultsparkstudios.com/vaultspark-football-gm/` is unreachable, and `*.github.io` 301-redirects into it.
- Cloudflare deploy/DNS credentials are MISSING from the secrets gateway as of 2026-06-07, and blocker preflight still marks this item not auto-ready, so the agent cannot inspect or repair the zone from this repo session.

Fix options (pick one in the Cloudflare dashboard):
1. **Grey-cloud (DNS-only) the apex + www records** so they resolve directly to GitHub Pages (A: 185.199.108–111.153, AAAA equivalents). GitHub ACME then reissues the cert automatically (~minutes–hours). Simplest and matches GitHub's official guidance.
2. **Keep the orange-cloud proxy** but fix the zone: SSL mode "Full" (not "Full (strict)" while GitHub's cert is expired), and check Security/WAF rules for whatever returns the 403 today.

Optionally: add a `cloudflare` API token to the secrets gateway so future agents can run this remediation end-to-end.

## Session 15 — Protocol Repair + Beta Readiness Sprint (2026-06-07)

| Item | Status |
|------|--------|
| Generate a fresh project-specific audit that respects current shipped items, flags, and blockers | Done |
| Restore documented Studio protocol command surface with repo-local shims | Done |
| Add Draft War Room pressure model and browser panel | Done |
| Add Settings Launch Readiness cockpit for beta checks and public-domain blocker visibility | Done |
| Add protocol/helper coverage to named test shards | Done |

**Verification:** focused protocol/helper tests 7/7 · `npm run test:studio` 4/4 · `npm run test:runtime` 72/72 · `npm run test:core` 54/54 · `npm run build:pages` · `npm run smoke:pages`.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare-side blocked until the existing runbook is applied or Cloudflare credentials are added to the secrets gateway.

## Session 17 — Goal Completion Verification (2026-06-07)

| Item | Status |
|------|--------|
| Re-verify latest audit execution log against current code and tests | Done |
| Rerun full default suite and static Pages gates | Done |
| Preserve propagated lean `AGENTS.md` canon block | Done |
| Backfill closeout cost/brief renderer scripts | Follow-up |

**Verification:** `npm test` 153/153 · `npm run build:pages` · `npm run smoke:pages` · `node scripts/ops.mjs blocker-preflight` · `node scripts/check-secrets.mjs --audit`.

**Follow-up:** add or propagate `scripts/record-skill-cost.mjs` and `scripts/render-closeout-brief.mjs`; both are referenced by the current Studio closeout protocol but absent from this public repo.

## Session 18 — Live Beta Readiness + Draft Pressure (2026-06-08)

| Item | Status |
|------|--------|
| Generate a fresh current-state audit after confirming the 2026-06-07 audit was fully shipped | Done |
| Make Launch Readiness public-domain status evidence-driven (`Blocked` / `Ready` / `Needs check`) | Done |
| Add Draft War Room steal-risk and urgency labels for pick-room decisions | Done |
| Attach optional launch-readiness rows to beta feedback issue URLs without personal data | Done |

**Verification:** focused helper tests 10/10 · `npm run test:runtime` 75/75 · `npm run test:studio` 4/4 · `npm run test:core` 54/54 · `npm test` 156/156 · `npm run build:pages` · `npm run smoke:pages`.

**Still blocked:** `vaultsparkstudios.com` remains Cloudflare/GitHub Pages-side until the existing runbook is applied or credentials are added; Launch Readiness now has the truth-state model to flip to `Ready` after public URL verification.
