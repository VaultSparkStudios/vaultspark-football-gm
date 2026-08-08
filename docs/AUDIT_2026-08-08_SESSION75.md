# Audit — Franchise Architect: Football — Session 75

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric with game overlay: engagement, evidence, UI/UX, privacy, free-tier cost, rendered-pixel, dual-audience and observability-honesty gates; staging: independent Cloudflare Pages staging plus the current self-hosted backend stack; prove exact candidate before production
- Profile source: founder-approved scope, current browser API seam, shared advance-week receipt authority, current PostgreSQL/Redis/Caddy compose, public privacy and metadata surfaces, and live Studio Canon 020/029/031/038/048/053/054
- Game-loop review: tightness 9 · progression 9 · session engagement 9 · retention 8 · soul fidelity 9 · overall 8.8
- Evidence caveat: Structural score only. The new work creates the first consented cohort evidence path; it cannot retroactively establish adoption, retention, popularity, or causality.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Privacy / evidence authority / architecture | 5.0h | 10 | 9 | 86.1 | **community-receipt-contract** — Create a versioned event catalog at the shared post-contract API seam; derive league, week, season, tactic, decision, roster-market, draft, staffing, challenge and rare-feat receipts; maintain a local-only comparison ledger; gate network batching behind explicit consent; support offline retry, bounded storage, withdrawal and deletion. |
| 2 | FIRE | Backend / security / live aggregation | 8.0h | 10 | 9 | 81.3 | **community-aggregate-plane** — Ship an isolated self-hosted stats service with idempotent batched ingest, one-way participant hashing, delete-by-participant, retention cleanup, bounded rollups, percentile bands, deterministic insights, small-cell suppression, ETag caching, health/freshness states and deployment wiring on the existing API origin. |
| 3 | FIRE | Homepage / engagement / UI | 5.0h | 10 | 9 | 79.7 | **homepage-community-pulse** — Build a cinematic Community Pulse below the hero with honest participation context, four headline measures, one deterministic live insight, freshness badge, participation controls and a progressive link to the full atlas; refresh only while visible and preserve the one-click start hierarchy. |
| 4 | HIGH | Stats Atlas / dual audience / feedback loop | 7.0h | 9 | 10 | 58.0 | **public-community-stats-atlas** — Ship a responsive Stats Atlas covering scale, league lab, team loyalty, strategy, tactics, roster market, draft room, pressure/outcomes, challenges and rare feats; add local-only percentile comparisons, filterable periods, deterministic interpretations, a documented JSON twin, methodology/privacy disclosure and complete sitemap/agent/LLM navigation. |
| 5 | HIGH | Release / observability / rendered pixels | 5.0h | 10 | 8 | 20.0 | **community-stats-release-proof** — Extend build, smoke, edge, Playwright and visual evidence gates across every stats state and theme; deploy the exact candidate to staging and the self-hosted service; verify CORS, cache, freshness and rollback; then release and reconcile truth without changing independent launch gates. |

Combined priority: **325.1**.

## Premise verification and rejected phantom work

- Rejected/deferred “Buy or add a third-party analytics platform”: Rejected. The existing self-hosted PostgreSQL, Caddy and container deploy plane can own a bounded product aggregate at zero new vendor cost or data-sharing boundary.
- Rejected/deferred “Describe the denominator as all players or all users”: Rejected. Browser-first play has no identity census. The only defensible denominator is participating anonymous browsers within the displayed period.
- Rejected/deferred “Upload complete saves to derive richer stats”: Rejected. The shared API receipt seam exposes enough bounded facts; save payloads, names, free text, credentials and hidden simulation state remain local.
- Rejected/deferred “Launch an individual leaderboard”: Rejected. Public ranks invite identity collection, gaming and false precision. Cohort distributions and suppressed rare-feat counts create useful comparison without exposing a person.
- Rejected/deferred “Use a language model to narrate the snapshot”: Rejected. Deterministic interpretation templates are cheaper, reproducible, auditable and cannot hallucinate a claim beyond the aggregate.
- Rejected/deferred “Seed production with synthetic community activity”: Rejected. Warming and honest-zero states are first-class UI states; synthetic events may exist only in tests and can never ship into the live aggregate.

## Three recommended design moves

1. Establish one versioned, privacy-bounded receipt authority and explicit participation control before any network collection or visual claim.
2. Aggregate on the existing self-hosted PostgreSQL/Caddy plane with strict validation, deduplication, abuse ceilings, small-cell suppression and a cached public snapshot.
3. Render one cinematic homepage pulse and one deep Stats Atlas from the exact same snapshot, including local-only comparisons and machine-readable methodology.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| community-receipt-contract | shipped | Shipped a versioned allowlist and shared post-contract mutation seam with explicit opt-in, anonymous browser key, local-only ledger, bounded offline queue/batching, withdrawal and remote deletion. Tests prove redaction, clamps, derivation, local comparison, ingest and deletion. |
| community-aggregate-plane | shipped | Shipped an isolated PostgreSQL community_stats schema/service with migration ledger, one-way participant hashing, request/rate/retention ceilings, dedupe, k=5 suppression, 24h/7d/30d aggregates, deterministic insights, ETag caching and honest fallback; wired Compose, Caddy and backend workflow. Contract/server tests 7/7; Compose config passes. |
| homepage-community-pulse | shipped | Shipped a compact Community Pulse immediately below the hero with four live measures, denominator/methodology truth, deterministic insight, freshness state, consent controls and a visibility/save-data-aware 30-second refresh. Desktop/mobile dark/light captures inspected with no blocking defects; boot budget remains green. |
| public-community-stats-atlas | shipped | Shipped /stats.html with nine valuable category groups, period filters, local-only percentile comparison, warming/suppressed/stale/unavailable states, methodology and JSON twin navigation. Agents, llms, sitemap, privacy, terms, footer and manifest truth updated; CANON-054 passes 6/6. |
| community-stats-release-proof | shipped | Live release complete at c71a26065bb355900a3544f5d08b150b8c3191f5. Staging is 11/11 at artifact 0a637f4703dad259786173bb3607de17b3610a994debf31150ec93ef27c1e1f3 with rollback; backend workflow 31276918230 and Pages workflow 31276913656 are green. Public API health reports database ready; authoritative DNS/TLS, production/staging CORS, ETag/cache and honest warming snapshot verified. Node 905/905, Playwright 40/40 and eight hash-bound captures pass. Independent project launch gates remain open. |
