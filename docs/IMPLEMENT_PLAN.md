<!-- source: docs/AUDIT_2026-10-28.json · Session 126 -->
# S126 resilient player loops

FORGE/FB from local project status; L2 selected. No lifecycle transition.

1. **Keep mobile decision controls usable without browser storage**. Guard storage access and retain the explicit mobile/full-view preference in this tab when reads or writes fail. Preserve stored preferences and viewport defaults. Verify getter/read/quota failures, both switch directions and actual mobile navigation in both themes. Readiness: accessibility, mobile parity and every supported theme. Done only with focused behavioral tests, actual browser evidence, required visual proof and independent diff review.

2. **Keep damaged optional predictions from interrupting dashboard updates**. Validate persisted prediction maps, entries, statistics and receipts before use. Discard malformed data without invented grades. Keep league/year/week isolation, engine input immutability and once-only grading. Prove dashboard hydration with corrupt optional storage and normal prediction submission/settlement. Readiness: core journeys and product correctness. Done only with focused behavioral tests, actual browser evidence, required visual proof and independent diff review.

3. **Keep earned trophies during this tab after failed persistence**. Retain validated earned trophy records in tab memory when persistence fails. Deduplicate repeated events, keep browser-wide cross-franchise trophy semantics, restore durable data without losing tab awards, and explain temporary persistence truthfully in Trophy Case. Verify repeated events, malformed records, quota/read/getter failures and actual desktop/mobile renders in both themes. Readiness: backup, recovery and rollback. Done only with focused behavioral tests, actual browser evidence, required visual proof and independent diff review.

Wave 1: startup and audit. Wave 2: selected repairs. Wave 3: staging, production, push and ordered closeout.
