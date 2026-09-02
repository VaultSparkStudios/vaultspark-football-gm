# Audit — Franchise Architect: Football — Session 97

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product, game-loop, realism, rendered-pixel, security, and release gates; staging: Commit the exact candidate, deploy and verify it on stable Cloudflare staging, then promote the same revision to production.
- Profile source: Session 97 local status plus live repository and provider evidence
- Game-loop review: tightness 9 · progression 9 · session engagement 8 · retention 5 · soul fidelity 9 · overall 8
- Evidence caveat: The 30-second, five-minute, season, and dynasty contracts remain visibly implemented and deeply regression-covered. The audit found two truth/interaction seams inside those loops: a tie can vanish from the record a player reads, and the phone commit control can fall below a long pressure stack. Retention stays evidence-limited because no genuine opted-in cohort exists.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | Feature depth · feedback loop · engagement · truth | 6.0h | 10 | 7 | 23.3 | **ties-disappear-from-franchise-truth** — Create a shared browser record helper, migrate every reproduced player-facing consumer, make tie-only return movement visible, and correct achievement/season percentage logic with focused tests. |
| 2 | CRITICAL | Process quality · observability · efficiency | 3.0h | 8 | 6 | 20.7 | **doctor-health-refresh-fakes-project-activity** — Isolate doctor receipt freshness from project activity and add a before/after regression around the real command path. |
| 3 | HIGH | UI/UX · mobile parity · accessibility | 2.0h | 8 | 5 | 20.0 | **mobile-core-loop-buries-the-commit-control** — Add four-edge safe-area padding, a sticky action dock with opaque theme-correct backing, a named region, and focused static/browser assertions. |

Combined priority: **64.0**.

## Premise verification and rejected phantom work

- Rejected/deferred “local-page-loads-prove-retention”: REFUTED Aggregate page paths do not identify users, sessions, returns, comprehension, or retention.
- Rejected/deferred “provider-ai-is-the-next-depth-layer”: REFUTED Deterministic intelligence already covers the decision loop and no cost-neutral demand signal exists.
- Rejected/deferred “tablet-needs-a-second-application-shell”: REFUTED Existing 768px rendered and browser evidence proves the drawer keeps the full game reachable.
- Rejected/deferred “technical-deploy-means-public-launch”: REFUTED Deployment authorization does not prove reply-as email, lifecycle authority, external Obelisk registration, cohort evidence, or public-launch approval.
- Rejected/deferred “regrouping-tabs-fixes-mobile-commit-reachability”: REFUTED The reproduced problem is action placement inside the phone deck; the existing section rail is already grouped.

## Three recommended design moves

1. Make every football record and percentage tie-complete, from simulation judgement through the return digest and shareable season card.
2. Separate health-receipt freshness from substantive project activity so startup cannot make a stale project look active.
3. Keep the phone's one decisive commit reachable above device cutouts and long pressure stacks.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| ties-disappear-from-franchise-truth | open | — |
| doctor-health-refresh-fakes-project-activity | open | — |
| mobile-core-loop-buries-the-commit-control | open | — |
