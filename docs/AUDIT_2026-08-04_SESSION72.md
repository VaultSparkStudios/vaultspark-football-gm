# Audit — Franchise Architect: Football — Session 72

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: infrastructure rubric (speed/token 2x, security and AI 1.5x) with product, game-loop, app-release, and web-canon overlays; staging: independent Cloudflare Pages origin at https://staging.playfranchisearchitect.com; production launch remains gated
- Profile source: live code, current GitHub Actions logs, deterministic engine probes, generated-league age distribution, production route/header evidence, and the committed Session 71 realism baselines
- Game-loop review: tightness 8 · progression 5 · session engagement 8 · retention 6 · soul fidelity 7 · overall 6.8
- Evidence caveat: Structural scores only; no cohort or retention data is claimed. Progression is held at 5 because the age curve still moves league mean overall by +0.38 per season over the measured decade and the player-visible verifier does not report it.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Infrastructure / simulation truth | 2.0h | 10 | 8 | 54.0 | **finite-simulation-truth-receipt** — Build a reusable bounded numeric-integrity scanner over critical league/player/team/stat-book state, attach a self-validating receipt to realism verification, and regression-test both clean and deliberately corrupted state. |
| 2 | FIRE | Progression / mathematical authority | 4.0h | 10 | 9 | 34.8 | **league-progression-parity-contract** — Name the development profile and parity target, calibrate its three life-stage factors against the live age distribution, then prove a deterministic decade stays inside an explicit per-season mean-overall band while youth still develops and veterans decline. |
| 3 | FIRE | CI reliability / reproducibility | 2.0h | 10 | 7 | 35.0 | **deterministic-browser-league-authority** — Give the browser fixture an explicit default seed, allow per-test overrides, configure the Hall rendering scenario through the public settings API, and assert both deterministic setup and the intended rendered class. |
| 4 | HIGH | Observability truth / player tooling | 3.0h | 9 | 9 | 34.9 | **progression-verifier-observability** — Add source-derived start/end mean, median, elite count, age cohorts, annualized drift, target band, deterministic seed and status to the report and commissioner UI, with tests proving the verdict is computed rather than hard-coded. |
| 5 | HIGH | Settings authority / legacy policy | 1.5h | 8 | 7 | 37.7 | **hall-policy-roundtrip-authority** — Hydrate all three Hall policy controls from normalized settings, cover custom score/wait/class values through local and browser API round trips, and keep the History policy line identical. |

Combined priority: **196.4**.

## Premise verification and rejected phantom work

- Rejected/deferred “Season-stat realism needs another retune”: Rejected as phantom work. The committed verifier holds targeted position season lines within 0.0–2.3% drift; the live gap is league-overall progression, not box-score generation.
- Rejected/deferred “Speedrun leaderboard has an obvious stored-XSS path”: Rejected after tracing every player-facing field: player and team names are escaped at render time, while seasons and dates are numeric/server-authored. No exploit premise was found.
- Rejected/deferred “Missing production security headers or routes block this implementation”: Rejected on live evidence. All nine production routes returned 200 with HSTS, CSP and framing protections. Launch is blocked on email, founder approval and lifecycle authority, not a web-hardening fiction.
- Rejected/deferred “The Hall should naturally contain a player after two seasons”: Rejected as an invalid test premise. Session 71 intentionally reduced induction from 24.5% to 1.4%; an empty early Hall is a correct outcome, not an engine failure.

## Three recommended design moves

1. Make every browser league fixture name its seed and make the Hall rendering fixture choose a permissive policy explicitly, so CI tests rendering rather than statistical luck.
2. Calibrate the age curve against an explicit league-parity target and publish start/end distributions with a pass/watch/fail verdict from the same verifier players can run.
3. Attach a bounded finite-number integrity receipt to every long-run verification so a NaN can never again be laundered into a plausible zero.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| finite-simulation-truth-receipt | shipped | Reusable scanner rejects NaN/Infinity, reports bounded truncation as incomplete, names ten critical roots, and a deterministic ten-year run completed both source and simulated receipts with status pass; focused authority tests 29/29 and long gate 3/3. |
| league-progression-parity-contract | shipped | Named profile 2026-s72-parity calibrates developing/prime/veteran factors to +0.20/-0.55/-2.25. The deterministic decade now clears the fixed ±0.15 mean-overall annual drift band while unit contracts retain young upside, potential separation, and veteran decline. |
| deterministic-browser-league-authority | shipped | Every app.spec league now opens advanced setup and writes an explicit default seed (overrideable per test). The Hall journey sets its 120/0/40 fixture policy through the public API and passes in a real browser; the former 37/38 CI failure is locally replayable and green. |
| progression-verifier-observability | shipped | Realism reports now publish seed, profile, start/end player counts, mean/median/elite distributions, age mix, annual drift, target/status, and source/simulated finite receipts. Commissioner Settings renders progression and integrity tables from that report. |
| hall-policy-roundtrip-authority | shipped | Settings hydrates canonical 450/0/6 defaults and custom class size. Local API proves 285/2/3 persistence; Playwright reloads those exact values, changes class size to 4, saves, and verifies the other values remain unchanged. |
