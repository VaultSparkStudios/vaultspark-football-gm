# Community Stats Architecture

Community Stats is an optional, near-live aggregate of successful Franchise Architect: Football game receipts. It describes participating anonymous browsers; it is not a census of all users or humans.

## Data flow

1. Both browser-first and server-backed play return through the versioned browser API contract.
2. After a successful mutation, the shared extractor emits only allowlisted categorical dimensions and bounded integers.
3. A local-only ledger updates for player comparison. Network collection remains off until explicit participation.
4. Participating browsers batch up to 24 receipts in a bounded offline queue and retry when connectivity returns.
5. The isolated Community Stats service validates every receipt again, one-way hashes the random browser identifier, deduplicates by event ID, applies contribution ceilings, and stores the receipt in the `community_stats` PostgreSQL schema.
6. A public aggregate snapshot is recomputed at most once per minute. The homepage and Stats Atlas check it at most every 30 seconds and only while visible.

## Public endpoints

- `GET /community/v1/snapshot` — cached 24-hour, 7-day, and 30-day aggregates with ETag and stale fallback.
- `POST /community/v1/events` — consented batched receipts; 32 KiB and 24-event maximum.
- `DELETE /community/v1/participation` — deletes receipts associated with the supplied anonymous browser identifier.
- `GET /community/v1/health` — database/schema readiness.

The routes are exposed through `api-franchise-architect-football.vaultsparkstudios.com`. The human atlas is `/stats.html`; `public/stats-surface.json` is the checkable CANON-054 descriptor.

## Categories

- Community scale: participating browsers, franchises, weeks, seasons, decisions.
- League lab: era, archetype, difficulty, resolution mode.
- Team loyalty: most-managed team.
- Strategy and tactics: receipted weekly identity and General Manager decisions.
- Roster market: trades, free agents, contracts, contract bands, staff moves.
- Draft room: user selections and aggregate position preference.
- Pressure and outcomes: wins, playoff-calibre season proxy, championships.
- Challenges and rare feats: challenge completions, championships, undefeated seasons.

The extractor contract can add another allowlisted category without changing transport or UI architecture. Unknown event types and unknown fields are rejected rather than stored.

## Privacy and trust contract

- Explicit opt-in; no pre-consent network queue.
- No full save, name, email, free text, credential, raw player identifier, hidden rating, or narrative history.
- Random browser identifier is stored locally and one-way hashed with a service-local random pepper before persistence.
- Internet protocol addresses are used only by an in-memory rate limiter and are never persisted.
- Raw receipts expire after 30 days.
- Behavioral values and choices are suppressed until at least five participating browsers contribute; the participant count itself remains the honest denominator.
- Receipts are contract-derived but client-reported. The public surface never describes them as verified people, total adoption, retention, causality, or real-world outcomes.

## Operations and rollback

The service reuses the existing self-hosted PostgreSQL, Caddy, container registry, and deployment host. It has a separate process, schema, port, route, cache, and pepper volume. This adds no analytics vendor and no per-view database query.

Startup idempotently creates schema version 1. Rollback is to route `/community/*` away from the service and stop its container; browser play remains unaffected and queues stay bounded locally. The PostgreSQL schema and pepper volume should be retained through rollback so participation deletion and later recovery remain possible.
