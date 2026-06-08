# Implement Plan - 2026-06-08 Audit

Public-safe sprint sequencing for the latest audit. Detailed private ops context remains outside this repo.

## Wave 1 - Beta Truth Surfaces

1. `live-domain-readiness-sentinel`
   - Surface: `public/lib/tabSettings.js`, `public/lib/appState.js`, `test/launch-readiness.test.js`
   - Verification: `node --test --test-isolation=none test/launch-readiness.test.js`
   - Contract: Launch Readiness can represent blocked, ready, and needs-check domain evidence without a backend.

2. `beta-feedback-readiness-packet`
   - Surface: `public/lib/betaFeedback.js`, `test/beta-feedback.test.js`
   - Verification: `node --test --test-isolation=none test/beta-feedback.test.js`
   - Contract: beta feedback issue URLs include launch-readiness context while preserving the no-PII static-host posture.

## Wave 2 - Draft Room Pressure

3. `draft-steal-risk-meter`
   - Surface: `public/lib/tabDraft.js`, `test/draft-war-room.test.js`
   - Verification: `node --test --test-isolation=none test/draft-war-room.test.js`
   - Contract: Draft War Room targets expose steal risk and urgency so the player can distinguish pounce-now from waitable targets.

## Execution Result

All three 2026-06-08 audit items shipped in this pass. Focused helper tests passed, and `npm run test:runtime` passed 75/75. The public-domain Cloudflare blocker remains intentionally outside this repo's mutation scope until credentials or founder dashboard action changes the evidence.
