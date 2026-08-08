# Session 75 Closeout — Live Community Intelligence

## Where We Left Off

- Community Stats is implemented and live on production, stable staging, and the self-hosted API.
- Collection is explicit opt-in. Only versioned, allowlisted, contract-derived receipts leave the browser; local comparisons remain useful with participation off.
- The aggregate authority uses one-way participant keys, request/contribution clamps, deduplication, deletion, 30-day raw retention, IP-free application storage, k=5 suppression, percentiles, deterministic insights, ETag caching and stale fallback.
- Homepage Community Pulse and the full nine-category Stats Atlas use the same public snapshot. The JSON twin, agents.json, llms.txt, sitemap, privacy, terms and methodology agree.
- Live state is honestly warming with zero participating browsers. No synthetic production rows were inserted.
- Code c71a26065bb355900a3544f5d08b150b8c3191f5 and artifact 0a637f4703dad259786173bb3607de17b3610a994debf31150ec93ef27c1e1f3 are exact on production and staging; staging passed 11/11 with rollback. Backend workflow 31276918230 and Pages workflow 31276913656 are green.
- Verification: Node 905/905, Playwright 40/40, Community focused 13/13, Pages build/smoke, eight inspected hash-bound rendered captures, CANON-054 6/6, Doctor zero blocking findings, and secret scan clean.

## Decisions That Must Survive

- participating anonymous browsers is the denominator. Never relabel it all users, players, installs, or accounts.
- A warming/suppressed/stale/unavailable state is product truth, not a gap to fill with synthetic activity.
- New receipt fields require explicit allowlist, bounded-value, privacy, runtime-parity and deletion review. No free text or raw save state.
- The public JSON snapshot is the only external community-data authority. Analytica may receive aggregates later, never raw receipts by default.
- On the shared host, Postgres stays on an internal Docker network; only the stats app also joins an edge bridge and binds loopback for the existing system Caddy. The project never owns host ports 80/443.

## Honest Holds

- Project launch remains HOLD on delivered and reply-capable football@playfranchisearchitect.com evidence.
- Founder launch approval is not inferred from feature implementation and must be SHA-bound.
- Registry SPARKED/local FORGE reconciliation remains authoritative outside this public repository.
- Studio responsive-audit helper skipped because Playwright was unavailable in the sibling script context; local Playwright, CI responsive evidence, and eight inspected project captures are green and are not misreported as that helper passing.
- Reusable consent/privacy/shared-host/ETag guidance shipped through Studio Ark receipt `01JVHJJ0OK763CB3B3B46AC56A`.
- Closeout autopilot lock binding is incorrect when invoked from a project repository; the verified mechanization defect was reported to Studio Ops through Ark receipt `01JVHMP3I27103901164DA9D12`, and closeout was completed with the equivalent project-local checks.
- Creative direction was reviewed and captured in public-safe Decisions; the intentionally absent private Creative Direction Record was not created in this public repository.

## Next Best Work

Watch the first real consenting cohort. Confirm freshness and suppression behavior, but do not optimize categories or make adoption claims until real evidence exists. If launch authority arrives, reconcile it through the existing structured release contract.

## Key Files

- public/lib/communityTelemetry.js
- public/lib/communityEventContract.js
- src/community/server.js
- src/community/communityStore.js
- src/community/aggregateCommunitySnapshot.js
- public/community-stats.js
- public/stats.html
- public/stats-surface.json
- docs/COMMUNITY_STATS.md
- docs/AUDIT_2026-08-08_SESSION75.json
- docs/visual-qa/LATEST.json
- ops/deploy-backend.docker-compose.yml
- .github/workflows/deploy-backend.yml
