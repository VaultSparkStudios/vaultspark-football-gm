# Audit — Franchise Architect: Football — Session 46

Public-safe live-code audit for the continuous `/arc` mission. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football franchise simulation
- Rubric: product/game; GitHub Pages staging before direct-to-main promotion
- Game-loop review: tightness 8.6/10 · progression 8.4 · session engagement 8.7 · retention 8.3 · soul fidelity 9.0
- Evidence caveat: `context/GAME_LOOP.md` and recent `docs/PLAYTESTS` artifacts are absent, so review scores use live runtime/browser behavior and regression surfaces.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | UI/UX + feedback loop | 0.7h | 10 | 6 | 68.8 | **commissioner-feedback-trusted-open** — preserve trusted click activation, add blocked-popup fallback, expose failures, and test Settings/Franchise Moment paths. |
| 2 | FIRE | Gamification / NFL realism | 3.0h | 10 | 9 | 62.1 | **merit-availability-snap-engine** — healthy QB1/K1/P1 own their role; blend overall/potential/fit/morale into other automatic shares; prove injury substitution and restoration without losing manual thresholds. |
| 3 | FIRE | Features / statistical depth | 3.0h | 10 | 8 | 55.2 | **broadcast-box-score-stat-matrix** — carry snaps/blocking into game stats, expose rich passing/rushing/receiving/defense/kicking/punting fields, and replace estimated down metrics with observed play telemetry. |
| 4 | HIGH | Engagement / player identity | 2.4h | 9 | 9 | 52.6 | **living-player-dossier** — deterministic position-aware biography, facts, signature traits, truthful achievements, trajectory, and richer dossier visuals for every player. |
| 5 | HIGH | UI/UX / roster intelligence | 1.6h | 9 | 7 | 46.9 | **potential-everywhere** — place POT immediately beside OVR across roster, market, draft, contract, history, commissioner, and stat surfaces. |
| 6 | HIGH | Dev health / action reliability | 1.8h | 9 | 6 | 38.8 | **all-actions-contract-net** — inventory button/data-action contracts, fail on orphaned controls, and smoke high-value interactions with visible error paths. |

Combined priority: **324.4**.

## Premise verification and rejected phantom work

- Rejected “create a potential system”: seeded persisted potential already exists; visibility and rotation use are the real gaps.
- Rejected “add season/career stat tables”: rich Pro Football Reference-inspired tables already exist; box-score parity is the real gap.
- Rejected “build injury substitution”: injured players are already excluded by `getTeamPlayers`; merit rebalance and restoration proof are missing.
- Deferred Launch/SPARKED flip: the real on-domain email receipt and current live-origin evidence cannot be fabricated from repo code.

## Three recommended design moves

1. Make availability and merit visibly control playing time, so depth-chart decisions become legible football strategy.
2. Turn every finished game into a broadcast-grade evidence ritual with honest situational and player impact statistics.
3. Make every player feel like a career, not a row: identity, trajectory, milestones, and contextual achievements evolve from simulation truth.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| commissioner-feedback-trusted-open | shipped | Trusted-window reservation, current-tab fallback, visible error path, unit + Playwright proof |
| merit-availability-snap-engine | shipped | Merit blend, exclusive QB/K/P roles, injury substitution/restoration integration proof |
| broadcast-box-score-stat-matrix | shipped | Observed down metrics, snaps/blocking/punting groups, expanded efficiency columns, browser rendering |
| living-player-dossier | shipped | Deterministic position-aware bios, facts, signatures, achievements, responsive dossier visuals |
| potential-everywhere | shipped | POT adjacent to OVR across browser rows plus roster/market/search/profile/stat API proof |
| all-actions-contract-net | shipped | 100+ static-button inventory; fixed Commissioner feedback and two inert agent-negotiation controls |
