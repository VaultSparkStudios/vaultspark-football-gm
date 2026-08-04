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
