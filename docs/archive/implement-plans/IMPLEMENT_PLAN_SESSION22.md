# Implement Plan — Session 22

1. wire-mobile-core-loop — fix browser shell wiring first because it restores a player-facing beta loop and has narrow test scope.
2. deterministic-runtime-ids — remove the remaining replayability leaks while the changed-surface tests are still small.
3. canon-strong-gap-repair — close conformance gaps and rerun the checker after product code changes settle.

Validation:
- `node --test test/mobile-loop.test.js test/deterministic-ids.test.js`
- `npm run test:runtime`
- `npm run test:studio`
- `npm test`
- `npm run build:pages`
- `npm run smoke:pages`
