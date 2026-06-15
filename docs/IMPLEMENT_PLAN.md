# Implement Plan — 2026-06-15 Audit

Source: `docs/AUDIT_2026-06-15.json`

## Wave Plan

1. `mobile-gm-decision-deck` — L2
   - Shared surface: `public/lib/mobileLoop.js`
   - Verification: focused mobile-loop unit tests plus runtime shard
2. `feedback-franchise-fingerprint` — L2
   - Shared surface: `public/lib/betaFeedback.js`
   - Verification: `test/beta-feedback.test.js`
3. `closeout-protocol-shims` — L2
   - Shared surface: `scripts/record-skill-cost.mjs`, `scripts/render-closeout-brief.mjs`
   - Verification: `test/studio-protocol-smoke.test.js`

Token-cost items: none in this audit.
