<!-- generated-by: /implement §2C step 2 · Session 62 · 2026-07-31 -->
<!-- source: docs/AUDIT_2026-07-31.json (sole truth) -->

# Implementation Plan — Session 62

Efficiency-ordered execution of the 10-item Session 62 audit (combined priority 258.4).
Ordering rule: same-axis grouped · 🔥+small first · foundations before façades · build-layer last.
Default ladder rung: **L2** (budget is ample; climb to L3 only after list exhaustion).

| Seq | Rank | Slug | Effort | Group rationale |
|---:|---:|---|---:|---|
| 1 | 10 | injury-eligibility-dressed-only | 1h | Small isolated correctness win; touches GameSession injury site only |
| 2 | 9 | gist-integrity-fail-closed | 0.75h | Small isolated security win; gistSync + shared store parity |
| 3 | 8 | opening-contract-recovery | 1h | Small isolated UX dead-end fix; tutorialCampaign + settings |
| 4 | 7 | home-field-advantage | 1.5h | Isolated engine change; realism-shard risk surfaced early |
| 5 | 4 | owner-pressure-live-loop | 3h | Foundation: live pressure authority feeds the decision cluster |
| 6 | 2 | decision-pressure-catalog-expansion | 3.5h | Extends gmDecisionAuthority machinery the next item rides |
| 7 | 1 | cpu-inbound-trade-offers | 4h | Consumes decision/inbox surfaces + archetype traits (foundation for FA valuation) |
| 8 | 3 | cpu-free-agency-market-competition | 5h | Largest; reuses archetype valuation from seq 7 |
| 9 | 6 | celebration-milestone-authority | 2.5h | Payoff layer over everything shipped above |
| 10 | 5 | service-worker-instant-boot | 3h | Build layer last so the precache manifest captures the final asset graph |

Gates per item (mandatory): implement L2 recipe → focused tests + relevant shard green →
browser-visible behavior confirmed (successBar) → static-host-safe (successBar) →
execution-log row with evidence → bounded conventional commit → session-floor check.

Token-cost axis: no ranked item — recorded in the audit candidateMatrix with a measurement note
(zero runtime API cost by design; suite wall ~57s; Max Plan cost notional).
