<!-- source: docs/AUDIT_2026-10-26.json · Session 124 -->
# S124 storage failure recovery

Live local lifecycle FORGE/FB, health yellow; no transition.

1. **Keep optional player panels usable when storage access is denied** (L2). Use one safe storage accessor for the six reproduced modules. Preserve injected storage and franchise keys. Return false when no return boundary can be written. Test denied getters, missing storage, normal storage and cross-franchise isolation. Readiness: core journeys and product correctness. Done only with fault-injection tests and real browser evidence.

2. **Allow tutorial completion and dismissal when storage methods fail** (L2). Guard tutorial reads, writes and removals independently. Keep authoritative completion receipts unchanged and make persistence best effort. Verify skip and applied-receipt dismissal with quota and denied storage failures in both themes and desktop/mobile. Readiness: onboarding and identity/access. Done only with fault-injection tests and real browser evidence.

3. **Keep feedback drafts visible when browser persistence fails** (L2). Make optional feedback cadence reads and writes safe. Require an actual receipt writer for successful saving. Catch save failure in the contextual prompt, retain the draft and show an accessible retry message; never invoke onSaved or mark completed after a failed save. Test denied reads, quota failure and a successful retry in both themes and desktop/mobile. Readiness: feedback, support and issue triage. Done only with fault-injection tests and real browser evidence.

Stop after these three outcomes, required exact-candidate checks, staging, production readback and full ordered closeout.

Late audit review corrects priority weighting and adds the required candidate/readiness breadth; the initial sidecar is preserved by hash. Selection and this dependency order stay unchanged. Three source outcomes are locally and on staging verified; exact CI, production and closeout remain pending.
