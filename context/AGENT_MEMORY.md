# Agent Memory

## Session 72 durable patterns

- Long-run simulation truth must be scanned before JSON serialization as well as after simulation; JSON converts
  non-finite numbers and can erase the defect under test.
- `src/stats/progressionParity.js` owns the active `2026-s72-parity` profile contract, finite-number receipts and
  Roster Window Map. Do not duplicate its thresholds in UI or API adapters.
- Hall Ballot Watch and induction share `GameSession.scoreHallOfFameCandidate`; preserve that single score authority.
- Browser league fixtures default to seed `20260306`. Probabilistic states such as Hall induction also need an
  explicit fixture policy; a seed alone is not a semantic setup.
- The canonical deterministic decade is intentionally slow (roughly four minutes locally) and lives in
  `test/realism-career-regression.test.js`; it is release evidence, not a default fast-unit expectation.
- Launch remains HOLD on on-domain reply-capable email, SHA-bound founder approval and registry lifecycle authority.
  Do not collapse healthy code/staging into launch readiness.

## Session 74 durable patterns

- Visual fixtures that depend on a naturally occurring game must use a bounded real-runtime resolver. A single-week lookup is chance disguised as determinism; a fabricated fixture is not evidence.
- `public/lib/decisionAnthology.js` remains the persistence authority. Decision Archive is a projection through `public/lib/decisionArchive.js`, not an independent ledger.
- `public/lib/coGmBriefing.js` owns the fixed public context allowlist. Keep the packet player-initiated, bounded to three receipts, and free of hidden save state, secrets, or invented recommendations.
- Component screenshots can be truthfully framed by hiding only unrelated fixed/sticky elements that overlap the target. Preserve target descendants and ancestors; never apply that lens to full-page evidence.
- Studio CLI smoke tests must use `scripts/lib/safe-spawn.mjs`, and `--help` must exit without generating tracked artifacts or requiring runtime inputs.
- Release deployment and launch readiness are independent. A green exact-SHA promotion can bind founder deployment approval while reply-capable email and registry lifecycle remain honest launch holds.
