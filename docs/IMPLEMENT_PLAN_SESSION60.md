# Session 60 Implementation Plan

Source of truth: `docs/AUDIT_2026-07-28.json`. Default rung: L2. Order is optimized for dependency and verification efficiency, not raw audit rank.

| Wave | Audit item | Rung | Status | Why this order |
|---:|---|---|---|---|
| 1 | `canonical-capability-map-authority` | L2 | Done | Repairs the startup/blocker credential truth used by every later gate. |
| 2 | `context-meter-model-authority` | L2 | Done | Collapses model metadata before further context-gated waves. |
| 3 | `startup-brief-authority-drift-contract` | L2 | Done | Builds on the repaired meter and existing lifecycle authority. |
| 4 | `closeout-board-truth-fixtures` | L2 | Done | Hardens the final reporting gate before closeout. |
| 5 | `player-authored-architect-thesis` | L2 | Done | Versioned thesis authority, both adapters, accessible Architecture Review controls, rehearsal, ledger consumption/resolution, and cross-runtime parity are verified. |

Every wave requires focused behavior tests and a direct context-meter `CONTINUE` receipt before the next begins. No item is complete until its audit execution log and Unified Genius cache agree.
