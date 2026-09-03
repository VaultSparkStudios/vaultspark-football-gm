# Audit — Franchise Architect: Football — Session 98

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product, game-loop, rendered-pixel, accessibility, security, and release gates; staging: Commit the exact candidate, deploy and verify it on stable Cloudflare staging, then promote the same source and artifact to production.
- Profile source: Session 98 local project status plus live repository evidence
- Game-loop review: tightness 9 · progression 8 · session engagement 7 · retention 5 · soul fidelity 9 · overall 7.6
- Evidence caveat: The thirty-second and five-minute loops remain dense and source-bound, but the first completed season is explicitly discarded by a stale phase guard before the season reckoning and achievement evaluator run. Trophy Road also re-sorts an already chronological multi-season result window by week alone. Retention remains evidence-limited because no genuine opted-in cohort exists.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | Feature depth · feedback loop · engagement | 3.0h | 10 | 7 | 30.1 | **first-season-reckoning-is-suppressed** — Extract a pure transition predicate, use previous/current phase truth as the only gate, and add focused tests for initial load, non-transition refresh, and first season completion. |
| 2 | CRITICAL | Gamification · progression · truth | 2.0h | 8 | 6 | 24.0 | **trophy-streak-loses-season-chronology** — Add one chronology comparator with finite fallbacks, preserve caller order only when chronology is unknown, and cover current/prior season plus ties and losses. |
| 3 | HIGH | UI/UX · accessibility · tablet parity | 2.0h | 7 | 5 | 17.5 | **tablet-tablist-focus-enters-inert-drawer** — Extract a deterministic next-index helper, consolidate the duplicate handlers, support declared orientation, and test wraparound, ignored keys, and focus return. |

Combined priority: **71.6**.

## Premise verification and rejected phantom work

- Rejected/deferred “local-page-loads-prove-retention”: REFUTED Aggregate page paths do not identify users, sessions, returns, comprehension, or retention.
- Rejected/deferred “provider-ai-is-the-next-depth-layer”: REFUTED Deterministic intelligence already covers the decision loop and no cost-neutral demand signal exists.
- Rejected/deferred “tablet-needs-a-second-application-shell”: REFUTED The existing 980px drawer is reachable, scrollable, safe-area-aware, and responsive-tested.
- Rejected/deferred “technical-deploy-means-public-launch”: REFUTED Deployment authorization does not prove reply-as email, lifecycle authority, external Obelisk registration, cohort evidence, or public-launch approval.
- Rejected/deferred “gm-firing-can-be-inferred-from-arc-authority”: REFUTED The explicit creative-direction reservation still applies; technical implementation authority is not permission to invent the game's terminal ending.
- Rejected/deferred “new-vendor-fixes-local-loop-defects”: REFUTED Every reproduced defect is local, deterministic, and dependency-free.

## Three recommended design moves

1. Let the first completed season deliver its full source-bound reckoning instead of disappearing behind a redundant sentinel.
2. Make Trophy Road read the league's real year/week chronology before counting streaks.
3. Keep the primary tablist keyboard-operable while ensuring tablet selection never strands focus inside the closed inert drawer.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| first-season-reckoning-is-suppressed | shipped | Extracted one previous/current phase predicate; removed the never-initialized sentinel; initial load, ordinary refresh, regular-season to awards, postseason to offseason, and exactly-once callback controls pass in the 26/26 focused reward/browser suite. |
| trophy-streak-loses-season-chronology | shipped | Trophy streaks now preserve GameSession's existing year/week-descending receipt order instead of applying a second week-only chronology. The reproduced 2027 Week 1 win versus 2026 Week 18 loss reports a one-game streak in the focused suite. |
| tablet-tablist-focus-enters-inert-drawer | shipped | Keyboard activation is centralized in bindMenuTabs, declared orientation owns the arrow axis, the duplicate handler is removed, desktop roving focus is preserved, and tablet selection returns focus to the visible toggle. The full real-browser suite passes 55/55 in dark/light and responsive drawer journeys. |
