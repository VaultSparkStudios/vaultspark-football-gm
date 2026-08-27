# Implementation Plan — Session 96

Source: `docs/AUDIT_2026-08-26_SESSION96.json` (sole audit truth).

## Efficiency order

1. `startup-brief-corrupts-session-truth` — repair orientation authority before it chooses or reports more work.
2. `promotion-bind-refuses-correctly-but-explains-nothing` — make the immutable release boundary diagnosable before building the candidate.
3. `analytics-proof-is-live-but-ephemeral` — convert the verified Cloudflare aggregate into a repeatable, non-PII receipt.
4. `mobile-navigation-misses-its-own-hard-gate` — close the 44px/safe-area contract, then run the rendered-pixel loop once against the final UI.

L3 is the chosen rung for all four verified items. Technical deployment is authorized. Public launch, `launchReady`, and a SPARKED lifecycle transition remain HOLD because deployment authority is independent from email reply-as, lifecycle, Obelisk, and SHA-bound public-launch approval.

## Execution status

- Startup authority: shipped; focused parser tests pass and the S96 brief reports Active 0d, real S95 category scores, and the live S96 audit queue.
- Promotion bind: shipped; deterministic per-file SHA-256 entries, a reusable verifier, workflow integration, and positive/legacy/mismatch controls pass.
- Analytics proof: shipped; injected-fetch aggregate/privacy/authz tests and the live structured S96 receipt pass. Reporting is proven; engagement, retention, and cohort claims remain withheld.
- Mobile navigation: shipped; 44px trigger, four-edge safe-area padding, static/browser regressions, 255 responsive captures, and the manually reviewed 96-image hash-bound receipt pass. The rendered-pixel loop also repaired a cold lazy-island Escape error and hardened the evidence harness against mid-transition screenshots.

Validation: implementation-boundary canonical Node 1,293/1,293; final-SHA CI 1,290/1,290 across five push shards in workflow 33026206650; Playwright 54/54; focused release/staging checks 26/26 and 19/19; exact Pages build/smoke; and CANON-053 PASS. Final candidate `590d145ef86b3520a6b7b24dbd159eb60788905a` passed 255 responsive states with 96 retained reviewed captures, stable staging 14/14, production 10/10, hosted performance, and promotion workflow 33026545885. All authorities bind artifact `5a92bea5d41678726fa7d7805a53443103a38fe7d58916ca39798ea99088a3d1`. Technical deployment is complete; public launch remains HOLD.
