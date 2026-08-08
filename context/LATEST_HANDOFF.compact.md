<!-- generated-by: scripts/compact-handoff.mjs v3.1 -->
<!-- source-hash: 440487378871 -->
<!-- generated-at: 2026-08-08T21:57:05.973Z -->

# LATEST_HANDOFF (compact)

SESSION 75 HANDOFF SUMMARY

Session
- Session 75. Live Community Intelligence.

Shipped
- Community Stats live on production, staging, and self-hosted API.
- Explicit opt-in collection; only versioned, allowlisted, contract-derived receipts leave browser; local comparisons work with participation off.
- Aggregate authority: one-way participant keys, request/contribution clamps, dedup, deletion, 30-day raw retention, IP-free storage, k=5 suppression, percentiles, deterministic insights, ETag caching, stale fallback.
- Homepage Community Pulse + nine-category Stats Atlas use same public snapshot; JSON twin, agents.json, llms.txt, sitemap, privacy, terms, methodology all agree.
- Verified: Node 905/905, Playwright 40/40, Community 13/13, Pages build/smoke, 8 hash-bound captures, CANON-054 6/6, Doctor clean, secret scan clean.
- Code SHA c71a260, artifact f9a6db0 exact on prod+staging; staging 11/11 with rollback. Backend + Pages workflows green.

Current Intent
- Watch first real consenting cohort. Confirm freshness and suppression behavior. Do not optimize categories or make adoption claims without real evidence. If launch authority arrives, reconcile via existing structured release contract.

Now Bucket
- Observe first real participating cohort; verify freshness/suppression on live data.
- Hold on synthetic data; warming/suppressed/stale/unavailable is product truth.
- Preserve denominator label: participating anonymous browsers only. Never relabel.

Blockers
- Zero participating browsers; live state warming, no production evidence yet.
- Studio responsive-audit helper skipped (Playwright unavailable in sibling script context); local + CI evidence green, not misreported.
- Registry SPARKED/local FORGE reconciliation authoritative outside this public repo.

Human-Blocked
- Project launch HOLD pending delivered and reply-capable football@playfranchisearchitect.com evidence (open, Session 75).
- Founder launch approval not inferred from implementation; must be SHA-bound (open, Session 75).

Constraints
- New receipt fields require allowlist, bounded-value, privacy, runtime-parity, deletion review. No free text or raw save state.
- Public JSON snapshot is sole external community-data authority. Analytica may get aggregates later, never raw receipts by default.
- Shared host: Postgres on internal Docker network; stats app also joins edge bridge, binds loopback for system Caddy. Never own host ports 80/443.
- Reusable consent/privacy/shared-host/ETag guidance in Studio Ark receipt 01JVHJJ0OK763CB3B3B46AC56A.

Key Files
- public/lib/communityTelemetry.js, communityEventContract.js
- src/community/server.js, communityStore.js, aggregateCommunitySnapshot.js
- public/community-stats.js, stats.html, stats-surface.json
- docs/COMMUNITY_STATS.md, AUDIT_2026-08-08_SESSION75.json
- ops/deploy-backend.docker-compose.yml, .github/workflows/deploy-backend.yml

Next session: Monitor first real opt-in cohort for freshness/suppression correctness; hold all launch and adoption claims until evidence and SHA-bound authority exist.
