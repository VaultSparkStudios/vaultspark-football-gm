# Session 112 implementation plan

Source: AUDIT_2026-09-30_SESSION112.json.

1. Recovery: complete at a783194; S111 independently reverified with1588/1588 and zero blocking Doctor findings.
2. Audit: complete; ten ranked outcomes and five second-order outcomes implemented.
3. Focused implementation validation: complete; final release acceptance remains pending.
4. Remaining acceptance: freeze the committed candidate; run all six canonical shards and exact-source CI; review222 final images; verify stable staging, actual browser continuity, production and backend identity; write canonical closeout and push. Public launch stays HOLD.

The fifth outcome preserves the chosen browser franchise through setup, game navigation and reload. Per-tab checkpoints retain pending markers and verified storage publication; retries capture the applied state without repeating the action. Explicit named saves/backups can supply quota fallback only while their frozen saved bytes still match; corrupt or changed references fail closed before replacement. Worker capture/restore keeps full JSON, parsing, hashing and compression inside the worker while retaining page-side durable publication. Runtime selection is locked during setup navigation, and new intent cancels stale deferred navigation.

Focused results:48/48 recovery helpers,15/15 worker durability,11/11 existing worker parity/fallback,7/7 actual HTTP tests, and18/18 built browser cases in7.1minutes on artifact 5c60a5bd34d4f140464ba4a204850ca0df8b5387691bdc006b66d16c0f7a60e3. Browser cases cover worker and in-page runtimes, exact saved-slot/backup identity, one-week progress, reload/Continue, held checkpoint completion, runtime-switch refusal, quota fallback, changed/corrupt references and dirty failed-marker retry.

Measured checkpoint correction: fresh worker flushes229/266ms with no observed task at or above50ms. After one actual completed season per mode, Drive/Play maximum main-thread task58/71ms versus735/892ms on the retained f34e baseline; wall flush1432/1684ms versus1368/1614ms. Total latency is not improved. All four samples used one worker capture and no raw snapshot request/response or snapshot export/import crossing during flush. This is single warm local evidence; no isolated restore timing, mature-career performance, benchmark distribution or real-player retention claim. Report: output/playwright/client-checkpoint-performance-s112-5c60a5bd.json.

Historical boundaries remain preserved in the audit sidecar: BCF staging lost the selected franchise; its canonical run stopped at1199 tests with sim-contract unfinished; the earlier88 source stopped at1293. Separate successful CI runs do not turn either interrupted canonical run green. The f34e18/18 functional result exposed a performance gap. The later4c25 browser run stopped at3passes/1premature warning assertion/14unrun; waiting for creation settlement corrected the harness, and final18/18 passed. HTTP tests retain the production1MB body limit and50request/minute default; their isolated fixture uses the existing test override.

Prior198-image review and24 provisional recovery images remain scoped historical evidence. Final222-image immutable review, canonical testing, CI and release proof are not yet complete. Actual opted-in cohort, own-domain receive/reply evidence, lifecycle reconciliation and candidate-bound launch approval remain independent conditions.
