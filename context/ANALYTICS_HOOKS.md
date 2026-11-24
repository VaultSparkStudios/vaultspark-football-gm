# Analytics Hooks

Public-safe product instrumentation map. Detailed operator procedures remain in Studio Ops.

## Gridiron Census (League Pulse) — on by default, opt-out (S133 founder decision)

- Contract (one file for browser and service): `public/lib/leaguePulseContract.js` (`src/community/pulseContract.js` re-exports it)
- Browser counter: `public/lib/leaguePulse.js` (no identifier, no analytics storage; GPC / Do Not Track = off unless the player turns it on)
- Game-page start, Settings switch and one-time notice: `public/lib/leaguePulseNotice.js`
- Ingest and totals: `POST` / `GET /community/v1/pulse` in `src/community/server.js`; store table `community_stats.pulse_daily` (schema 4) keeps one total per metric per day
- Human surface: `/stats#census` (`public/lib/censusBoard.js`); landing ticker
- Funnel reading: `gameLoaded → leagueCreated → firstWeekPlayed → seasonsCompleted`, plus `returningLoad`; page views via `npm run report:visits` (Cloudflare Web Analytics, beacon-executing browsers only, with the landing-to-game ratio)

## Community Stats

- Consent authority: `public/lib/communityTelemetry.js`
- Receipt extraction authority: `public/lib/extractCommunityEvents.js`
- Event contract: `public/lib/communityEventContract.js`
- Server validation/ingest: `src/community/server.js`
- Aggregation authority: `src/community/aggregateCommunitySnapshot.js`
- Human surface: `/stats` (source: `public/stats.html`)
- Machine twin: `https://api-franchise-architect-football.vaultsparkstudios.com/community/v1/snapshot`

Community Stats is aggregate product feedback, not identity analytics. Raw receipts remain project-owned. Analytica may consume only the public sanitized snapshot; it must not receive raw receipts, participant hashes, browser identifiers, or save state.
