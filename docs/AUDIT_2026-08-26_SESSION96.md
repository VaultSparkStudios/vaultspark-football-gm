# Audit — Franchise Architect: Football — Session 96

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product, game-loop, realism, rendered-pixel, security, and release gates; staging: Exact immutable candidate on stable Cloudflare staging before production.
- Profile source: Session 96 live evidence
- Game-loop review: tightness 9 · progression 9 · session engagement 8 · retention 5 · soul fidelity 9 · overall 8
- Evidence caveat: The 30-second, five-minute, season, and dynasty contracts are visibly implemented and regression-covered. Retention remains evidence-limited: Cloudflare recorded seven page loads since S94, none on /game.html, and no genuine opted-in cohort exists, so no retention claim is inferred.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | UI/UX · mobile parity · security | 3.0h | 9 | 4 | 10.0 | **mobile-navigation-misses-its-own-hard-gate** — Make the trigger and drawer fully 44px/notch-safe, add focused static and browser regressions, and capture tablet/mobile before-after pixels. |
| 2 | CRITICAL | Speed · organization · token reduction | 4.0h | 9 | 7 | 9.8 | **startup-brief-corrupts-session-truth** — Repair date, inline-v3 category, intent, and stale-genius parsing with synthetic negative-control tests. |
| 3 | HIGH | Release integrity · efficiency | 4.0h | 8 | 8 | 9.1 | **promotion-bind-refuses-correctly-but-explains-nothing** — Add per-file artifact entries and a tested verifier that prints both identities plus the first differing paths. |
| 4 | HIGH | Feedback loop · observability | 3.0h | 8 | 7 | 8.6 | **analytics-proof-is-live-but-ephemeral** — Add a reusable read-only Cloudflare RUM verifier with fixture tests and aggregate-only JSON output. |

Combined priority: **37.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “tablet-needs-a-second-full-screen-ui”: REFUTED The existing 641–980px drawer is reachable, inert while closed, dismissible, and visually coherent; only measurable hard-gate details are ranked.
- Rejected/deferred “local-pageviews-prove-retention”: REFUTED Seven page loads and zero /game.html rows do not identify users, sessions, conversion, or return behavior.
- Rejected/deferred “paid-generative-ai-is-the-next-depth-layer”: REFUTED Source-bound deterministic intelligence is already extensive and no cost-neutral demand signal exists.
- Rejected/deferred “local-auth-will-close-obelisk”: REFUTED There are no account flows and the declared identity architecture is external; local auth would create drift.
- Rejected/deferred “public-stats-should-return-before-the-threshold”: REFUTED The first genuine opted-in cohort still does not exist; publishing zeros would weaken the privacy and evidence contract.
- Rejected/deferred “deployment-authorization-is-public-launch-approval”: REFUTED The standing decision keeps technical promotion separate from Zoho reply-as, lifecycle authority, external Obelisk posture, and SHA-bound public-launch approval.

## Three recommended design moves

1. Close the mobile hard-gate with 44px and safe-area-correct navigation, then inspect the real pixels.
2. Make the startup brief tell the truth before it chooses work.
3. Turn release and analytics evidence from opaque or ephemeral terminal output into deterministic, tested receipts.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| mobile-navigation-misses-its-own-hard-gate | planned | — |
| startup-brief-corrupts-session-truth | planned | — |
| promotion-bind-refuses-correctly-but-explains-nothing | planned | — |
| analytics-proof-is-live-but-ephemeral | planned | — |
