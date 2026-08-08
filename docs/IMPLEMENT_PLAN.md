# Implementation Plan — Session 75 Community Intelligence

The audit sidecar `docs/AUDIT_2026-08-08_SESSION75.json` is the source of truth. Work is ordered by dependency and verification efficiency, not by raw rank alone.

## Wave 1 — Evidence contract and local safety

- [x] `community-receipt-contract`: versioned allowlisted extractors at the shared post-contract API seam.
- [x] Explicit opt-in, disclosure preview, withdrawal/deletion, local-only ledger, offline bounded queue, retry and batching.
- [x] Focused privacy, parity and queue tests.

## Wave 2 — Self-hosted aggregation authority

- [x] `community-aggregate-plane`: isolated PostgreSQL schema/service, idempotent ingest, participant hashing, deletion and retention.
- [x] Request validation, contribution clamps, no-IP-storage rate limits, k-anonymity suppression, percentile rollups and deterministic interpretations.
- [x] Cached ETag snapshot, freshness/degraded states, health route, Caddy/Compose/workflow wiring.

## Wave 3 — One snapshot, two human surfaces, one agent twin

- [x] `homepage-community-pulse`: compact live pulse after the hero, participation controls, honest states and visibility-aware refresh.
- [x] `public-community-stats-atlas`: full category atlas, period controls, local comparisons, methodology and accessible charts without a dependency.
- [x] JSON twin plus agents.json, llms.txt, sitemap, privacy, terms, manifest and navigation truth.

## Wave 4 — Exact rendered and operational proof

- [x] `community-stats-release-proof`: focused tests, full shards, Pages build/smoke, CSP/CORS, service migration/deploy checks.
- [x] Dark/light desktop/mobile browser captures for homepage, atlas and participation states; inspect and hash-bind `docs/visual-qa/LATEST.json`.
- [ ] Exact-candidate staging, backend health/snapshot proof, production verification and rollback receipt.

## Wave 5 — Closeout

- [ ] Mark all audit items with direct evidence; reconcile Task Board, Current State, decisions, truth audit, SIL, handoff and work log.
- [ ] Run release/secret gates, commit the bounded scope, push `main`, monitor required workflows, and verify deployed truth.
