# Implement Plan - 2026-06-07 Audit

Public-safe sprint sequencing for the latest audit. Detailed private ops context remains outside this repo.

## Wave 1 - Protocol Reliability

1. `studio-protocol-shims`
   - Surface: `scripts/set-active-skill.mjs`, `scripts/lib/skill-profile.mjs`, `scripts/check-brief-staleness.mjs`, `scripts/credential-watch.mjs`, `scripts/ark.mjs`, `scripts/ops.mjs`
   - Verification: `node --test test/studio-protocol-smoke.test.js`
   - Contract: documented Studio commands load locally even when the full private Studio OS command surface is not vendored into this public repo.

## Wave 2 - Beta Player Experience

2. `draft-war-room-pressure`
   - Surface: `public/lib/tabDraft.js`, `public/game.html`, `public/styles.css`
   - Verification: `node --test test/draft-war-room.test.js` plus `npm run build:pages` and `npm run smoke:pages`
   - Contract: the draft tab turns board state, current pick, roster needs, and scouting order into immediate decision pressure.

3. `launch-readiness-cockpit`
   - Surface: `public/lib/tabSettings.js`, `public/game.html`
   - Verification: `node --test test/launch-readiness.test.js` plus static Pages smoke
   - Contract: the Commissioner Deck surfaces runtime, save, feedback, challenge-code, and known public-domain readiness without a backend.

## Wave 3 - Regression Coverage

4. `protocol-and-ui-coverage`
   - Surface: `test/studio-protocol-smoke.test.js`, `test/draft-war-room.test.js`, `test/launch-readiness.test.js`, `scripts/run-test-shard.mjs`
   - Verification: `npm run test:studio`, `npm run test:runtime`, `npm run test:core`
   - Contract: new protocol and beta-facing helper coverage is part of named shards, not only a manual one-off command.

## Execution Result

All four 2026-06-07 audit items shipped in this pass. The public-domain Cloudflare blocker remains intentionally outside this repo's mutation scope until credentials or founder dashboard action changes the evidence.
