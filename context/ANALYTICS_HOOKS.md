# Analytics Hooks

Public-safe product instrumentation map. Detailed operator procedures remain in Studio Ops.

## Community Stats

- Consent authority: `public/lib/communityTelemetry.js`
- Receipt extraction authority: `public/lib/extractCommunityEvents.js`
- Event contract: `public/lib/communityEventContract.js`
- Server validation/ingest: `src/community/server.js`
- Aggregation authority: `src/community/aggregateCommunitySnapshot.js`
- Human surface: `/stats.html`
- Machine twin: `https://api-franchise-architect-football.vaultsparkstudios.com/community/v1/snapshot`

Community Stats is aggregate product feedback, not identity analytics. Raw receipts remain project-owned. Analytica may consume only the public sanitized snapshot; it must not receive raw receipts, participant hashes, browser identifiers, or save state.
