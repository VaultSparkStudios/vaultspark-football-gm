# Implement Plan - 2026-05-27 Audit

1. `restore-studio-start-automation` - repair missing helper modules first because every later Studio command depends on fresh startup/blocker evidence.
2. `session-lookup-indexes` - ship the deferred GameSession lookup foundation while the engine surface is loaded.
3. `deterministic-browser-job-ids` - close the remaining deterministic-ID gap and verify with targeted tests.
