# Audit — Franchise Architect: Football — Session 47

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game
- Rubric: product; staging: github-pages
- Profile source: context/PROJECT_STATUS.json, startup brief, game skill profile, and live code; unmatched arc-profile registry fallback rejected
- Game-loop review: tightness 8 · progression 8.7 · session engagement 8.1 · retention 7.7 · soul fidelity 8.8 · overall 8.3
- Evidence caveat: No context/GAME_LOOP.md or recent docs/PLAYTESTS files and context/SOUL.md is public-safe only; scores are provisional and derive from live runtime/browser contracts rather than fabricated player observations.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Gamification / agency / simulation truth | 4.0h | 10 | 10 | 86.0 | **gm-decision-commitment-engine** — Execute safe immediate consequences through existing runtime primitives; persist measurable expiring commitments; resolve success/failure into owner heat, fan sentiment, morale, legacy, news, and history. |
| 2 | FIRE | Core loop / speed / engagement | 3.0h | 10 | 9 | 77.0 | **checkpoint-aware-fast-sim** — Introduce a shared checkpoint classifier, accumulate a source-derived digest, pause only for material controlled-team moments, and resume with one action. |
| 3 | FIRE | Retention / feedback loop / persistence | 2.0h | 9 | 8 | 65.0 | **save-scoped-franchise-inbox** — Reconstruct from stable event IDs, merge persisted state idempotently, retain critical items until their linked action/outcome resolves, and surface unread truth per save. |
| 4 | HIGH | AI / coaching intelligence / UI | 2.5h | 9 | 8 | 58.0 | **matchup-aware-tactical-film-room** — Build a deterministic matchup brief from opponent roster/scheme/injuries and a postgame film receipt from actual box-score/play telemetry, with no causal claims beyond observed deltas. |
| 5 | HIGH | Observability / truth / process quality | 2.0h | 10 | 6 | 45.0 | **startup-brief-truth-contract** — Introduce explicit source/fallback contracts, invariant validation, width-safe rows, and tests for modern SIL/status formats and flat-rate Max Plan cost semantics. |
| 6 | HIGH | Developer efficiency / protocol reliability | 1.0h | 7 | 5 | 22.0 | **audit-renderer-protocol-bridge** — Add deterministic source selection, schema validation, merge-safe output, premise/skip/game-loop sections, and focused tests. |

Combined priority: **353.0**.

## Premise verification and rejected phantom work

- Rejected/deferred “Add a fan sentiment card”: Rejected: desktop and mobile fan sentiment surfaces already exist; the real gap is action memory and consequence authority.
- Rejected/deferred “Add tactical choices”: Rejected: four choices already modify weeklyPlan for the real simulation; the real gap is matchup intelligence and an honest result receipt.
- Rejected/deferred “Add press conference continuity”: Rejected: deterministic follow-up quotes already remember prior podium tone; the higher-value gap is user-authored commitment and source-derived tactic language.
- Rejected/deferred “Launch/SPARKED flip”: Deferred honestly: real on-domain email forwarding receipt and current live-origin proof remain external evidence gates and cannot be fabricated.

## Three recommended design moves

1. Execute safe immediate consequences through existing runtime primitives; persist measurable expiring commitments; resolve success/failure into owner heat, fan sentiment, morale, legacy, news, and history.
2. Introduce a shared checkpoint classifier, accumulate a source-derived digest, pause only for material controlled-team moments, and resume with one action.
3. Reconstruct from stable event IDs, merge persisted state idempotently, retain critical items until their linked action/outcome resolves, and surface unread truth per save.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| gm-decision-commitment-engine | shipped | Immediate depth-chart and cap actions, directionally honest trade obligations, expiring success/failure receipts, owner/fan/morale/legacy effects, news/history, and browser commitment visibility shipped; combined consequence/checkpoint verification passed 10/10. |
| checkpoint-aware-fast-sim | shipped | Source-derived phase, playoff, decision, and commitment checkpoints now pause accelerated loops; a visible five-step digest retains franchise results and one action resolves/resumes remaining work; runtime decision-contract and browser wiring verification passed. |
| save-scoped-franchise-inbox | shipped | Stable franchiseId added to dashboard; inbox cache/read/resolution state is scoped and reconstructable; 41/41 focused inbox/browser/runtime tests passed. |
| matchup-aware-tactical-film-room | shipped | Opponent-aware modal and persistent source-derived Film Receipt shipped; syntax checks and 21/21 focused tactic/browser/runtime tests passed. |
| startup-brief-truth-contract | shipped | Modern SIL average/date parsing, manifest profile fallback, status compliance, prelaunch revenue N/A, cache Genius List, width-safe rows, and flat-rate notional cost semantics shipped; validator green and protocol smoke 19/19. |
| audit-renderer-protocol-bridge | shipped | Deterministic JSON-to-Markdown renderer added; 3/3 focused tests and syntax check passed; Session 47 sidecar round-trip is current. |
