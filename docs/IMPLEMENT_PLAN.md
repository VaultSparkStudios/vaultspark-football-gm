# Implement Plan - 2026-06-03 Audit

Public-safe sprint sequencing. Detailed private ops context remains outside this repo.

1. `ci-friendly-test-shards`
   - Surface: `scripts/run-test-shard.mjs`, `package.json`, `.github/workflows/ci.yml`
   - Verification: `npm run test:studio`, `npm run test:runtime`, then shard-specific follow-up as needed.
   - Contract: `core` covers pure football engine/domain contracts; `runtime` covers browser/local API/save/session endpoints; `sim:contract` covers season-flow contracts; `sim:realism` covers the bounded Monte Carlo guardrail; `studio` covers local Studio protocol helpers; `long` keeps the two expensive determinism/career-realism probes explicit instead of hiding them in default CI.

2. `pages-smoke-deploy-gate`
   - Surface: `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`
   - Verification: `npm run build:pages`, `npm run smoke:pages`.
   - Contract: a public Pages publish is not eligible until the static client-only league path boots in Chromium.

3. `test-surface-contract-map`
   - Surface: this file plus npm script names.
   - Measurement plan: replace the previous single `npm test` timeout note with shard-level durations after the next full CI/local run; future agents should choose the smallest matching shard before attempting all shards, and run `npm run test:long` only for realism/determinism changes or scheduled confidence sweeps.
