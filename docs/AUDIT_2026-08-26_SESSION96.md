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
| mobile-navigation-misses-its-own-hard-gate | shipped | The trigger is 44x44px and the 100dvh drawer uses four-edge safe-area padding. Static and browser regressions pass; the byte-identical artifact promoted at exact source 93b867e010dfe3773116433e5b8068dc894e7c0c produced 255 responsive captures, all 240 required states, with zero layout, contrast, touch-target, page-error, or runtime-error findings in promotion workflow 33031371311. The canonical S96 receipt retains 96 hash-bound, ledger-registered images. Manual review of mobile/tablet dark/light open-drawer pixels found complete labels, readable palettes, safe spacing, and no clipping. The pixel loop caught and repaired a cold lazy-island Escape error, then Linux CI exposed a non-portable wall-clock wait; the final harness polls settled rendered geometry. |
| startup-brief-corrupts-session-truth | shipped | scripts/lib/startup-sil-truth.mjs now validates ISO dates, parses inline SIL v3 categories, and derives achieved-intent streaks from entry bodies; startup authority accepts session-suffixed audits and content-refreshes the Genius cache. Focused negative controls pass and docs/STARTUP_BRIEF.md now reports Active 0d, real category scores, and the live S96 queue. |
| promotion-bind-refuses-correctly-but-explains-nothing | shipped | Artifact fingerprints now carry deterministic path/byte/SHA-256 entries. scripts/verify-promotion-bind.mjs reports expected and observed revision/digest identities plus the first ten file deltas, degrades explicitly for legacy manifests, and is wired into deploy-pages.yml. Doctor-driven final integration caught that copying the full 207-file ledger into _health exceeded a downstream launch-evidence read bound, then caught that the verifier still expected full entries from the intentionally compact health document. The final contract keeps compact identity in the 846-byte _health document and the complete ledger in the deploy manifest; positive, legacy, compact-health, and mismatch negative controls pass. |
| analytics-proof-is-live-but-ephemeral | shipped | scripts/verify-cloudflare-web-analytics.mjs resolves credentials through the Studio secrets gateway, performs an account-scoped aggregate-only RUM query, bounds output, and exposes injected-fetch tests for privacy, authorization, and response shape. reports/s96-cloudflare-web-analytics.json records seven page loads (six /, one /landing, zero /game.html) and marks reporting verified while engagement, retention, and cohort claims remain false. |
