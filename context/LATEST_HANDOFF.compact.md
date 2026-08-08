<!-- generated-by: scripts/compact-handoff.mjs v3.1 -->
<!-- source-hash: e7e9a2dba01d -->
<!-- generated-at: 2026-08-08T22:39:39.526Z -->

# LATEST_HANDOFF (compact)

SESSION 75 HANDOFF SUMMARY

Status
- Community Stats live on production, staging, self-hosted API. Stable.
- Explicit opt-in only; versioned allowlisted contract-derived receipts leave browser; local comparisons work without participation.
- Live state honestly warming, zero participating browsers, no synthetic rows.

Shipped
- Aggregate authority: one-way participant keys, request/contribution clamps, dedup, deletion, 30-day raw retention, IP-free storage, k=5 suppression, percentiles, deterministic insights, ETag caching + stale fallback.
- Homepage Community Pulse + nine-category Stats Atlas share one public snapshot; JSON twin, agents.json, llms.txt, sitemap, privacy, terms, methodology agree.
- Code SHA c71a260 and artifact 0a637f4 exact on prod+staging. Staging 11/11 with rollback. Backend workflow 31276918230 and Pages 31276913656 green.
- Verified: Node 905/905, Playwright 40/40, Community 13/13, Pages build/smoke, 8 hash-bound captures, CANON-054 6/6, Doctor clean, secret scan clean.

Invariants (must survive)
- Denominator is "participating anonymous browsers" — never relabel as users/players/installs/accounts.
- Warming/suppressed/stale/unavailable states are product truth; never fill with synthetic activity.
- New receipt fields require allowlist + bounded-value + privacy + runtime-parity + deletion review. No free text or raw save state.
- Public JSON snapshot is sole external community-data authority. Analytica may get aggregates later, never raw receipts by default.
- Shared host: Postgres internal Docker net only; stats app joins edge bridge + loopback for system Caddy; project never owns host 80/443.

Now bucket
- Watch first real consenting cohort; confirm freshness + suppression behavior.
- Do not optimize categories or make adoption claims until real evidence exists.
- If launch authority arrives, reconcile via existing structured release contract.

Blockers
- Project launch HOLD pending delivered + reply-capable football@playfranchisearchitect.com evidence.
- Founder launch approval must be SHA-bound; not inferred from implementation.
- Registry SPARKED / local FORGE reconciliation authoritative outside this repo.

Human-blocked / defects reported
- Studio responsive-audit helper skipped (Playwright unavailable in sibling context); local + CI + 8 captures green, not misreported.
- Closeout autopilot lock binding incorrect from project repo; defect reported to Studio Ops via Ark receipt 01JVHMP3I27103901164DA9D12; closeout completed with equivalent local checks.
- Consent/privacy/shared-host/ETag guidance shipped via Studio Ark receipt 01JVHJJ0OK763CB3B3B46AC56A.
- Private Creative Direction Record intentionally absent from public repo.

Next session: Monitor first consenting cohort's freshness/suppression; hold on launch until SHA-bound founder approval and email evidence land.
