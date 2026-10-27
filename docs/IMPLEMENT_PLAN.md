<!-- source: docs/AUDIT_2026-10-27.json · Session 125 -->
# S125 nonblocking player state

Stage FORGE/FB from local project status; health yellow. L2 selected, no lifecycle change.

1. **Keep optional journey instrumentation from interrupting startup or play**. Resolve session storage inside a guard. Keep a bounded per-storage/tab memory fallback when reads or writes fail, with no network, absolute-time export or invented durability. Prove denied getter, quota, mid-session failure, deduplication and separate stores; prove actual game startup and checkpoint calls in the browser. Readiness: core journeys and product correctness. Done only after behavioral tests, actual browser evidence and independent diff review.

2. **Keep the Inbox usable when browser storage access is denied**. Reuse the safe local-storage accessor in Inbox resolution. Preserve existing injected stores and in-memory scope rules. Test denied getter, method failures, ingest, dedup, unread/resolve and franchise switch. Verify actual Inbox browser behavior. Readiness: email and notifications where used. Done only after behavioral tests, actual browser evidence and independent diff review.

3. **Keep First Season Contract progress during this tab after failed persistence**. Retain contract state by storage context and franchise key after failed writes. Preserve marks, dismissal, first-year boundary, season-close verdict and once-only completion through repeated reads/renders; isolate franchises and injected stores. Explain temporary tab-only tracking when persistence fails without claiming reload durability. Verify desktop/mobile in both themes. Readiness: onboarding and identity/access. Done only after behavioral tests, actual browser evidence and independent diff review.

Wave1: startup/audit; Wave2: these three outcomes; Wave3: exact candidate staging, production and ordered closeout. Stop after verified selected outcomes and authorized release/closeout.
