# Audit — Franchise Architect: Football — Session 76

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric with app-release-gate lens: CANON-011 sitemap, CANON-041 mobile parity, CANON-047 theme parity, CANON-048 dual-audience; staging: Cloudflare Pages staging plus the existing self-hosted community-stats backend
- Profile source: targeted general-purpose agent live-code audit of the only subsystem shipped since the last audit (Community Stats, S75), plus a broad TODO/FIXME/Math.random/falsy-laundering sweep of the rest of the repo

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | HIGH | Test coverage / reliability | 1.0h | 7 | 3 | 9.5 | **community-server-branch-coverage** — Add direct tests for stale-fallback, unavailable-fallback, 413, 400, /health, and 404 — every previously-unverified branch. |
| 2 | LOW | Accessibility / dual-audience | 0.3h | 3 | 1 | 4.5 | **stats-period-toggle-aria-controls** — Same — this item has no meaningful larger version. |

Combined priority: **14.0**.

## Premise verification and rejected phantom work

- Rejected/deferred “Full line-by-line re-audit of the simulation engine (src/)”: Rejected. 75 prior sessions already ran deep audits against this exact bug class (falsy-laundering, RNG leaks, spawn windows, contract-expiry, save-payload budget) and TRUTH_AUDIT.md records them fixed; re-running would be redundant busywork, not a live-code finding.
- Rejected/deferred “Fabricate additional audit items to pad the list”: Rejected. The dispatched audit agent explicitly checked and cleared TODO/FIXME/HACK, Math.random() usage, and falsy-laundering patterns with no further defects found; reporting 2 items instead of padding to 5+ is the honest result for a near-exhausted codebase.

## Three recommended design moves

1. Add direct test coverage for every distinct outcome branch of a live production request handler before trusting its happy-path tests as complete.
2. Give programmatic (aria-controls) linkage to any toggle group that repaints a specific region, not just visual/aria-pressed state.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| community-server-branch-coverage | shipped | Added 4 new tests to test/community-server.test.js covering stale fallback, unavailable/503 fallback, 413/400 body handling, and /health plus 404. test/community-server.test.js now 7/7; full suite 911/911. |
| stats-period-toggle-aria-controls | shipped | Added id="communityAtlas" to the atlas region and aria-controls="communityAtlas" to all three period buttons in public/stats.html. |
