# Audit 2026-07-06 Session 42 - Franchise Architect: Football

Fresh `/goal /arc` audit after Session 41. Premises were checked against live protocol scripts, the latest audit artifact, `ops.mjs`, and the current test surface. The project profile is app/public-product, but this session uses the founder-requested infrastructure rubric while preserving public-app gates.

## Summary

- Ranked items: 2
- Combined priority: 71.2
- Top item: sample-codebase-protocol-sampler
- Infrastructure read: future audits still depend on two brittle local protocol surfaces, not new gameplay code.
- Release gate read: no SPARKED flip attempted; launch remains blocked on real received-message proof for `football@playfranchisearchitect.com` forwarding/copying and current live-origin/routing evidence.

## Ranked Plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Audit protocol / tooling honesty | 1h | 9 | 6 | 42.8 | **sample-codebase-protocol-sampler** - `/audit` calls `scripts/sample-codebase.mjs`, but the helper is absent and recent audits had to work around it. **Recipe:** add a deterministic sampler honoring `--max-tokens` and `--json`, skip generated/heavy dirs, rank app/runtime/test/studio files first, and emit sampled file metadata. |
| 2 | FIRE | Genius-list source of truth | 0.5h | 8 | 5 | 28.4 | **ops-genius-list-cache-bridge** - `/start` points agents at `node scripts/ops.mjs genius-list`, but the command reports no local generator even though `cache-genius-list.mjs` is present. **Recipe:** bridge `ops genius-list` to cache generation and print a truthful open/exhausted cache summary. |

## Rejected / Deferred With Evidence

- **sparked-flip** - still blocked on real received-message proof that `football@playfranchisearchitect.com` forwards/copies to Studio operations plus current live-origin/routing evidence.
- **feature-depth-new-gameplay** - rejected for this pass because the live broken premises are protocol/tooling truth gaps that compound every future audit and implementation sprint.

## Execution Log

| Item | Status | Evidence | Verification |
|---|---|---|---|
| sample-codebase-protocol-sampler | Shipped | Added `scripts/sample-codebase.mjs` with deterministic prioritized sampling, `--max-tokens`, `--json`, heavy-dir skips, and sampled file metadata. | `node --check scripts/sample-codebase.mjs`; `node --test --test-name-pattern "sample-codebase" test/studio-protocol-smoke.test.js`; full `node --test test/studio-protocol-smoke.test.js` 17/17. |
| ops-genius-list-cache-bridge | Shipped | `scripts/ops.mjs genius-list` now writes `.cache/genius-list.json` through `cache-genius-list.mjs`, then prints a live open/exhausted summary plus JSON cache content. | `node --check scripts/ops.mjs`; `node scripts/ops.mjs genius-list`; full `node --test test/studio-protocol-smoke.test.js` 17/17. |
