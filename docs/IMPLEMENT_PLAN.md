# Implementation Plan — Session 96

Source: `docs/AUDIT_2026-08-26_SESSION96.json` (sole audit truth).

## Efficiency order

1. `startup-brief-corrupts-session-truth` — repair orientation authority before it chooses or reports more work.
2. `promotion-bind-refuses-correctly-but-explains-nothing` — make the immutable release boundary diagnosable before building the candidate.
3. `analytics-proof-is-live-but-ephemeral` — convert the verified Cloudflare aggregate into a repeatable, non-PII receipt.
4. `mobile-navigation-misses-its-own-hard-gate` — close the 44px/safe-area contract, then run the rendered-pixel loop once against the final UI.

L3 is the chosen rung for all four verified items. Technical deployment is authorized. Public launch, `launchReady`, and a SPARKED lifecycle transition remain HOLD because deployment authority is independent from email reply-as, lifecycle, Obelisk, and SHA-bound public-launch approval.

## Execution status

- Startup authority: implemented; focused parser tests pass and the S96 brief now reports Active 0d, real S95 category scores, and the live S96 audit queue.
- Promotion bind: implemented; deterministic per-file SHA-256 entries, a reusable verifier, workflow integration, and negative controls pass.
- Analytics proof: implemented; injected-fetch aggregate/privacy/authz tests pass. Live structured receipt pending.
- Mobile navigation: implemented; 44px trigger and four-edge safe-area padding added. Static/browser and rendered-pixel verification pending.
