# Audit — Franchise Architect: Football — Session 50

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game/app
- Rubric: infrastructure-weighted product rubric; staging: github-pages artifact plus canonical-origin verification
- Profile source: live code, direct focused tests, current startup brief, project skill profile, authoritative arc profile, infrastructure debt sweep, game-loop review, and app release-gate evidence
- Game-loop review: tightness 8.8 · progression 9 · session engagement 8.6 · retention 8.4 · soul fidelity 9 · overall 8.8
- Evidence caveat: No current playtest corpus or private creative bible is present in this public repository. Scores are provisional and derive only from executable browser, simulation, persistence, decision, and regression contracts; no user sentiment is fabricated.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Game-loop agency / runtime authority / feedback | 4.0h | 10 | 9 | 34.8 | **gm-decision-authority-contract** — Extract one shared GM decision authority used by both runtimes and dashboard state; give every decision a league/year/week/team occurrence key; distinguish choose, defer, no-decision, and unavailable results; make dismissal defer without suppressing the occurrence; require a matching pending choice at the shared weekly command boundary; keep mobile and accelerated simulation on the same contract; surface actionable availability errors; and add cross-runtime, cross-year, dismissal, mismatch, and fail-closed tests. |
| 2 | FIRE | Transaction integrity / simulation reliability / security | 5.0h | 10 | 9 | 32.1 | **atomic-weekly-command-transaction** — Add a shared clone-then-commit weekly transaction wrapper that executes the full GM/tactic/simulation command on a snapshot-hydrated working session and replaces runtime authority only after success; preserve adapter hooks and receipts; return stable failure evidence without changing the active session; add a keyed single-flight action coordinator that disables all conflicting simulation controls, joins or rejects duplicates honestly, and always releases in finally; and prove full snapshot equality after injected failures plus one-advance behavior under rapid double submission. |
| 3 | FIRE | Observability honesty / UX / feedback loop | 2.5h | 9 | 8 | 33.2 | **browser-degradation-ledger** — Create a bounded in-memory client diagnostics ledger with severity, surface, operation, authority key, occurrence count, timestamp, retryability, and sanitized message; route action errors and background hydration failures through it; expose actual degradation count and latest affected surface in Settings plus the status chip without replacing existing panel retry UI; publish a browser event for tests/agent clients; add clear/retry affordances and focused source-derived tests. |
| 4 | HIGH | Release truth / responsive UX / automation | 3.0h | 9 | 8 | 31.0 | **revision-stamped-responsive-evidence** — Build a project-local responsive evidence runner on @playwright/test that serves the exact static artifact, checks 390/768/1440 viewport overflow and minimum target size, exercises dark/light themes plus drawer and decision/dialog surfaces, writes deterministic JSON and screenshots under output/playwright keyed to source revision and style asset, validates the evidence schema, and wires a non-skip npm release command plus CI artifact upload. |
| 5 | HIGH | Infrastructure debt / speed / organization | 1.5h | 7 | 7 | 27.1 | **browser-module-reachability-guard** — Add a dependency-free browser-module reachability checker that starts from HTML module/script entrypoints, follows static imports, supports an explicit documented allowlist for worker/dynamic entrypoints, rejects unreachable executable modules, wire it into Pages build and the Studio shard, then remove the two verified orphans and prove every remaining public module is reachable. |

Combined priority: **158.2**.

## Premise verification and rejected phantom work

- Rejected/deferred “Flip FORGE/SPARKED or claim launch readiness”: Deferred honestly: canonical /_health is 404, required edge headers are incomplete, no received-message receipt proves football@playfranchisearchitect.com forwarding/copying, and the authoritative lifecycle registry is sibling-owned.
- Rejected/deferred “Treat the strict last-five CI gate as a new code defect”: Rejected as phantom current work: the latest two CI and Pages runs for current and immediately prior main are green; two older failed commits remain historical gate residue and their root causes were already fixed.
- Rejected/deferred “Install playwright solely for responsive audit”: Rejected by internal-first and package-trust discipline: @playwright/test is already pinned, installed, and exposes chromium; the correct fix is a project-local runner using the existing dependency.
- Rejected/deferred “Rewrite the 5,156-line GameSession as one audit item”: Culled as unsafe facade-first debt paydown. Live authority failures are smaller and directly provable; module extraction should follow measured seams, not line-count anxiety.
- Rejected/deferred “Add paid telemetry, hosted AI commentary, or a backend feedback service”: Rejected by cost-neutral, internal-first, and observability-honesty requirements; the identified gaps are deterministic browser/runtime contracts.
- Rejected/deferred “Re-list release provenance, save compatibility, hydration epochs, rehab, tactical film, commitments, themes, or mobile decisions”: Rejected as phantom work: those Session 46-49 surfaces exist in live code and their direct regression tests pass.
- Rejected/deferred “Claim the Studio Oracle disproved the ranked premises”: Rejected: the first oracle run was rooted in Studio Ops and reported project paths missing; the absolute-path retry returned no evidence lines. Direct source references and 36/36 focused baseline tests establish both the present behavior and the missing negative-path coverage.

## Three recommended design moves

1. Make every General Manager decision one shared, league-scoped authority that cannot be bypassed by dismissal, storage collision, runtime drift, or a failed fetch.
2. Make weekly advancement clone-then-commit and single-flight so a failed or duplicate browser action cannot leave a half-applied franchise.
3. Turn browser degradation and responsive parity into source-derived, revision-stamped evidence visible to both the player and the release gate.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| gm-decision-authority-contract | completed | shared generator parity; pending choice required before mutation; wrong occurrence rejected; dismissal preserves pending choice; cross-year and cross-franchise keys do not collide; fetch failure is visible and non-mutating; desktop and mobile paths converge |
| atomic-weekly-command-transaction | completed | full snapshot unchanged after injected post-choice failure; successful transaction promotes the working session; local/server adapter parity; backup and rewind hooks observe committed state only; double submit advances once; all controls release after failure |
| browser-degradation-ledger | completed | real failures increment the ledger; duplicate failures coalesce with occurrence count; messages are sanitized and bounded; successful retries resolve degradation; Settings and status chip derive from the same ledger; no fabricated zero or swallowed critical failure |
| revision-stamped-responsive-evidence | completed | runner imports only existing dependencies; 390/768/1440 screenshots and metrics; both themes exercised; overflow and touch targets checked; JSON revision/style fingerprint; CI cannot treat skip as pass |
| browser-module-reachability-guard | completed | orphan fixtures fail; dynamic and HTML entrypoints are supported; current public tree reaches every retained module; Pages build runs the guard; removed modules have no references |
