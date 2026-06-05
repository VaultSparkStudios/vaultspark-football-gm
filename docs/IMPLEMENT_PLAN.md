# Implement Plan - 2026-06-04 Audit

Public-safe sprint sequencing. Detailed private ops context remains outside this repo.

## Wave 1 — Ship-pipeline foundations (infra unblocks everything downstream)

1. `ci-playwright-hang-fix`
   - Surface: `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`, `scripts/smoke-pages.mjs`
   - Verification: `npm run build:pages` + `npm run smoke:pages` locally; CI matrix green on push.
   - Contract: no browser-dependent CI step may run without a step-level timeout; Playwright browser binaries are cached keyed to the Playwright version.

2. `realism-sweep-cron`
   - Surface: `.github/workflows/realism-sweep.yml` (new)
   - Verification: workflow YAML validates; never wired into push-blocking path.
   - Contract: deep statistical confidence has its own time budget; closes the twice-recorded SIL follow-up.

3. `pages-cert-remediation`
   - Surface: GitHub Pages API (no repo files)
   - Verification: `https_certificate.state` leaves `bad_authz`; DNS records confirmed.
   - Contract: agent attempts remediation before any human-blocked label (blocker preflight protocol).

## Wave 2 — Engine→UI gamification cluster (shared client surfaces)

4. `rivalry-heat-surfacing`
   - Surface: `public/lib/api` runtime, `public/lib/tabOverview.js`, `public/lib/engagementFeatures.js` (sim-watch header), `public/styles.css`
   - Verification: `npm run test:runtime`; smoke if presentation path touched.

5. `season-epilogue-ritual`
   - Surface: new `public/lib/seasonEpilogue.js`, `public/lib/gameFlow.js` hook, `public/styles.css`
   - Verification: `npm run test:runtime` + targeted unit test for `buildSeasonEpilogue()`.

6. `shareable-challenge-codes`
   - Surface: new `public/lib/challengeCodes.js`, speedrun card UI, `public/setup.js`
   - Verification: encode/decode round-trip unit tests; `npm run test:runtime`.

## Wave 3 — Trust & feedback loop

7. `save-integrity-guard`
   - Surface: browser save store path, `public/lib/gistSync.js`
   - Verification: checksum round-trip unit tests; `npm run test:runtime`.

8. `beta-feedback-widget`
   - Surface: `public/lib/tabSettings.js`, `public/lib/engagementFeatures.js`
   - Verification: URL-building unit test; manual render check via smoke.

## Test-surface contract map (carried forward from 2026-06-03)

- `core` covers pure football engine/domain contracts; `runtime` covers browser/local API/save/session endpoints; `sim:contract` covers season-flow contracts; `sim:realism` covers the bounded Monte Carlo guardrail; `studio` covers local Studio protocol helpers; `long` keeps the two expensive determinism/career-realism probes explicit instead of hiding them in default CI.
- Measurement plan: shard-level durations recorded after each full CI run; agents choose the smallest matching shard before attempting all shards; `npm run test:long` only for realism/determinism changes or scheduled confidence sweeps.
