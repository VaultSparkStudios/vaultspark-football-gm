# Audit — Franchise Architect: Football — Session 77

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric with app-release-gate lens: CANON-011 sitemap, CANON-041 mobile parity, CANON-047 theme parity, CANON-048 dual-audience; staging: Cloudflare Pages staging plus the existing self-hosted community-stats backend
- Profile source: targeted general-purpose agent live-code audit of src/community/*, ops/*, public/community-stats.js, .github/workflows/deploy-backend.yml, verified against context/TASK_BOARD.md and docs/AUDIT_2026-08-09_SESSION76.md to avoid duplication

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | MEDIUM | Test coverage / reliability | 1.5h | 6 | 2 | 7.5 | **community-store-pool-injection-and-tests** — Add pool injection seam plus direct tests for ingest's rate limit/dedupe, snapshot's cache/truncation, and loadPepper's ENOENT/EEXIST paths using a fake pool and fake fs where needed. |

Combined priority: **7.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “Full re-audit of the core simulation engine (src/)”: Rejected. 76 prior sessions already ran deep audits against this exact bug class (falsy-laundering, RNG leaks, spawn windows, contract-expiry, save-payload budget) and TRUTH_AUDIT.md records them fixed; re-running would be redundant, not a live-code finding.
- Rejected/deferred “Pad the list with a second manufactured item”: Rejected. The dispatched audit agent read ops/Caddyfile, ops/deploy-backend.docker-compose.yml, .github/workflows/deploy-backend.yml, and public/community-stats.js line by line and found no further concrete defect. Reporting 1 item is the honest result.

## Three recommended design moves

1. Give any class that owns a real external resource (DB pool, file handle, network client) a constructor-injection seam before assuming the layer above it proves it's tested.
2. Test the abuse/retention/cache boundary conditions (rate-limit math, TTL reuse, truncation flag, pepper ENOENT/EEXIST race) directly, not just through a mocked store.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| community-store-pool-injection-and-tests | shipped | Added a `pool` constructor-injection seam to CommunityStore (src/community/communityStore.js) that falls back to a real pg.Pool only when no pool is supplied. Added test/community-store.test.js (11 tests) covering: injected-pool construction, the databaseUrl-required guard, ingest's accept/duplicate accounting via ON CONFLICT, the 480/hour 429 abuse limit, snapshot's 60s cache TTL and force-bypass, the truncation status boundary, deleteParticipant's scoping and cache invalidation, cleanupIfDue's 6-hour gate, hashParticipant's determinism, and loadPepper's ENOENT-then-write-then-reread bootstrap. All 11 pass against a FakePool with no real Postgres. |
