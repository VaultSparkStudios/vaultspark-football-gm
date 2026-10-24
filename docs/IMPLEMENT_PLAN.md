<!-- source: docs/AUDIT_2026-10-24.json · Session 122 -->
# S122 decision navigation and evidence truth

Live registry FORGE/FB; health yellow. Local stage mirrored before planning, no lifecycle transition.

1. **Restore the four Architect Focus follow-up actions** (L2). Route results, stewardship, promise and identity through real existing decision surfaces. Add a real browser regression proving each generated action activates one tab and focuses its visible destination, including reload. Readiness: core journeys and product correctness.

2. **Open League news from desktop and mobile pulse cards** (L2). Use the actual calendarTab/newsTable destination in both pulse builders; click generated full and mobile cards in the browser and prove news is visible and focused. Readiness: accessibility, mobile parity and every supported theme.

3. **Keep stale suite counts out of current startup summaries** (L2). Use one evidence summary for current test signals and handoff rows: only fresh direct receipts supply current totals; stale counts remain explicitly historical with their date, and last-session checks come from the matching handoff. Prove stale/missing/fresh behavior and render the actual brief. Readiness: observability and actionable analytics.

Wave 1 startup/audit complete; Wave 2 implementation pending; Wave 3 staging, closeout and authorized production pending.


S122 implementation acceptance: all three selected L2 outcomes verified locally. Navigation30units/4browser variants incl reload; startup18focused tests; independent reviews pass. Wave2complete; Wave3exact-candidate staging/CI/production/closeout pending. Prior implementation plans remain in Git history.

S122 release correction: f21512d2 was rejected by the unchanged650000-byte boot target (650086bytes). Comment-only trim restores648746bytes; independent executable-parity review and10boot/island checks pass. Hosted URL assertion now accepts actual /game?resume=tab without weaker readiness/focus/reload checks. Corrected fe4f0672 passes staging14/14, hosted4/4, visual128reviewed, clean Studio386/386 and staging performance. All seven exact-candidate CI jobs and production/closeout remain pending.

S122 runtime gate: corrected fe4 source failed both CI and backend runtime jobs. Full provider logs stop mid-line before the test summary, so the failing assertion or termination cause is unknown. Same-source local diagnostic preserves full stdout/stderr and child metadata. Runner output-drain/error-reporting correction passes five focused checks; no test, shard, timeout or buffer ceiling is removed or raised. Production and closeout remain unverified.
