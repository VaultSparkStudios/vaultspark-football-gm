# Audit — Franchise Architect: Football — Session 54

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game/app
- Rubric: founder-requested infrastructure-grade product rubric; staging: GitHub Pages artifact plus exact same-origin hosted verification
- Profile source: live code, current direct test attempt, game-loop review, application release gate, infrastructure debt sweep, and public-safe context
- Game-loop review: tightness 8.5 · progression 8 · session engagement 8.5 · retention 6.5 · soul fidelity 6 · overall 7.5
- Evidence caveat: Implementation review only: 31/31 targeted contracts pass. No substantive public SOUL, GAME_LOOP document, checked-in playtest corpus, or retention telemetry exists; no claim about fun, pace, churn, or sentiment is made.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Infrastructure / observability / source authority | 2.0h | 10 | 7 | 35.0 | **session-truth-coherence-authority** — Export a pure startup-freshness evaluator that joins generated age, rendered session, status currentSession, and coherent marker; route every PROJECT_STATUS mutation through updateProjectStatus; add fixture and static-authority tests; rerender and validate a truthful Session 54 brief. |
| 2 | FIRE | Game depth / learning loop / observability | 3.0h | 9 | 9 | 34.9 | **architect-ledger** — Persist a bounded deterministic Architect's Ledger for controlled weekly commits: record chosen General Manager decision and tactic as intent, exact started/completed authority, observed score/film alignment as outcome, and a non-causal next-adaptation prompt; expose it in both runtimes and render an accessible recent ledger on Overview with save/restore and transaction tests. |
| 3 | FIRE | Progression / UI-UX / command clarity | 2.5h | 9 | 8 | 33.2 | **three-horizon-blueprint** — Create one source-derived Three-Horizon Blueprint with Now, Season, and Legacy lanes; each lane names its authority, current state, exact next milestone, and real destination action. Reuse existing command, opening-contract/owner, tactical-identity, and legacy sources; add no currency or predicted outcome; cover missing-state, browser, keyboard, and narrow-layout behavior. |
| 4 | HIGH | Infrastructure / decomposition / contract authority | 2.0h | 8 | 6 | 24.0 | **contract-service-cap-authority** — Bind ContractService to the live session, move the exact cap-ledger computation behind it, delegate every production cap check through the service via GameSession.getTeamCapSummary, preserve the public response shape, and add override/rollover/dead-cap/snapshot parity plus a guard proving at least one real service delegation exists. |
| 5 | HIGH | Legal-IP / branding / public compliance | 0.8h | 8 | 3 | 28.0 | **studio-linkback-all-routes** — Extend the canonical public-footer contract to require a safe HTTPS VaultSpark Studios link-back inside every footer, repair all eight routes, and make Pages build plus public-compliance tests fail on missing, non-HTTPS, or off-domain branding links while preserving the proprietary line. |

Combined priority: **155.1**.

## Premise verification and rejected phantom work

- Rejected/deferred “Promote launch or SPARKED posture”: Deferred honestly: same-origin staging is 3/10, canonical health and edge headers fail, email delivery proof and founder approval are absent, responsive evidence is not same-revision, and registry SPARKED conflicts with local FORGE/S0 truth.
- Rejected/deferred “Edit the authoritative registry, apex host, DNS, or sibling staging tree”: Rejected as sibling-owned work. This repository may emit exact evidence and signed Ark cargo but may not edit another repository to make itself green.
- Rejected/deferred “Consolidate all 243 server and local-runtime route branches in one pass”: Premise is real, but a broad rewrite would exceed a safe parity surface. This session establishes a proven service-delegation seam first; future router extraction must move one command family behind representative state-transition tests.
- Rejected/deferred “Add generic streaks, achievements, telemetry, or another retention widget”: Rejected as speculative. The product already has return digest, legacy, tactics, inbox, challenges, rivalry, history, epilogues, and local feedback instruments; efficacy is unmeasured, so the audit joins existing authorities instead of inventing another reward layer.
- Rejected/deferred “Claim soul fidelity or player delight”: Rejected because the public SOUL is intentionally minimal and no real playtest receipt corpus exists. Executable implementation quality is not substituted for player evidence.
- Rejected/deferred “Install or upgrade packages”: Rejected on evidence: package.json and lock metadata already resolve the declared Playwright version; only the local install is stale, and no dependency is needed for the ranked work.

## Three recommended design moves

1. Make session identity, PROJECT_STATUS mutations, and startup-brief freshness one self-validating observability authority.
2. Turn existing weekly command receipts into an Architect's Ledger that joins intent, execution, observed outcome, and the next adaptation without causal overclaiming.
3. Unify the next controlled action, season contract, and career legacy into one Three-Horizon Blueprint instead of adding another disconnected progression currency.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| session-truth-coherence-authority | implemented | Pure freshness authority rejects session-stale/coherence-stale briefs; all three direct PROJECT_STATUS mutators use updateProjectStatus; Session 54 brief rerender, validator, and freshness checker pass. |
| architect-ledger | implemented | Canonical footer contract now requires a valid HTTPS vaultsparkstudios.com anchor inside every footer; all eight missing routes repaired; Pages build and 11/11 public compliance pass. |
| three-horizon-blueprint | implemented | Bounded transaction-only Architect's Ledger persists intent, command authority, observed result/alignment, and explicitly non-causal adaptation; rollback and snapshot tests pass; Overview renders accessible history. |
| contract-service-cap-authority | implemented | Now, Season, and Legacy lanes derive from existing command, opening-contract/owner, and General Manager legacy authorities with honest missing states, actionable destinations, responsive layout, and focused tests. |
| studio-linkback-all-routes | implemented | GameSession.getTeamCapSummary delegates to a live-session ContractService that preserves the exact production response shape and cap-ledger/override semantics; parity test passes. |
