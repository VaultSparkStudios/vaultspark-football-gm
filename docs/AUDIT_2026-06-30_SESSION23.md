<!-- generated-by: /audit skill v1.0 -->
<!-- generated-at: 2026-06-30 -->
<!-- project: vaultspark-football-gm · type: game -->

# Project Audit — VaultSpark Football GM Session 23

> One ranked improvement plan covering beta-facing broken affordances, game-loop feedback, public-surface compliance, and source-of-truth honesty. Run `/implement` to execute in optimal order.

## Top-line

- Total items: 5
- Combined Priority: 110.6
- Top 3: fix-commissioner-lobby-contract · repair-shareable-newsletter-action · restore-live-news-ticker-renderer

## Ranked Plan

| # | Tier | Axis | Effort | Impact | Innov. | Priority | Item |
|---|---|---|---|---:|---:|---:|---|
| 1 | fire | feature depth & refinement | 1h | 9 | 6 | 27.0 | **fix-commissioner-lobby-contract** — Commissioner Mode is visible async multiplayer, but create/join/ready uses incompatible payload and status field names. **Recipe:** align app payloads, accept legacy aliases in the local runtime, render leagueId/gateStatus/status, and test create/join/ready/advance. |
| 2 | fire | ui/ux/user-experience | 30m | 8 | 5 | 25.2 | **repair-shareable-newsletter-action** — The Season Newsletter button calls an exported function that is not imported into the app shell. **Recipe:** import `generateFranchiseNewsletter()` and cover the source wiring. |
| 3 | fire | gamification/engagement/immersion | 30m | 8 | 5 | 25.2 | **restore-live-news-ticker-renderer** — The renderer targets `.news-ticker-track`, but the DOM exposes `#newsTickerContent`. **Recipe:** render into the real ticker content node and add a stale-selector regression. |
| 4 | high | security | 1h | 7 | 4 | 18.1 | **complete-public-agent-legal-surface** — Public static sources are missing contact/privacy/terms/sitemap/agent metadata files. **Recipe:** add the files, link them from primary footers, and test proprietary-first metadata. |
| 5 | high | ui/ux/user-experience | 15m | 6 | 3 | 15.1 | **repair-cap-casualty-action** — The cap casualty button calls undefined `loadContracts()` instead of imported `loadContractsTeam()`. **Recipe:** replace the call and test the stale call is gone. |

## Skipped

- **cloudflare-custom-domain-fix** — still blocked by missing Cloudflare/admin capability from this repo; do not fabricate public-domain readiness.
- **sparked-release-flip** — release flip remains blocked until external domain smoke and release-gate checks are green.

## Execution Log

- **fix-commissioner-lobby-contract** — shipped. Evidence: app payloads aligned, local runtime accepts canonical/legacy aliases, status renderer uses `leagueId` / `gateStatus` / player `status`, and local runtime create/join/ready/advance test passes.
- **repair-shareable-newsletter-action** — shipped. Evidence: `public/app.js` imports `generateFranchiseNewsletter()` and `test/browser-wiring.test.js` covers the action.
- **restore-live-news-ticker-renderer** — shipped. Evidence: `renderNewsTicker()` targets `#newsTickerContent`; stale `.news-ticker-track` selector is covered absent.
- **repair-cap-casualty-action** — shipped. Evidence: Cap Casualty now calls `loadContractsTeam()` and no stale `loadContracts()` call remains.
- **complete-public-agent-legal-surface** — shipped. Evidence: contact/privacy/terms/agents/llms/sitemap files added, linked from primary pages, and covered by static tests.
- **static-route-build-smoke-proof** — shipped as second-order innovation. Evidence: Pages build canonicalizes all static HTML pages and smoke asserts the new built routes.

Verification: focused browser/public/runtime tests 15/15; `npm test` 165/165; Playwright UI 9/9; Pages build/smoke pass.