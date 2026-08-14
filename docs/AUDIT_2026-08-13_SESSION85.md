# Audit — Franchise Architect: Football — Session 85

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay and app-release-gate: first-run player clarity, mobile/theme parity, static-host safety, exact staging identity, rollback, dual-audience contracts, privacy, and honest launch holds; staging: stable Cloudflare Pages must prove the exact immutable candidate before direct-to-main publication; production promotion must be an explicit, candidate-bound action rather than an automatic side effect of any main push
- Profile source: arc-profile registry authority, Session 85 startup brief, 29,980-token code sample, targeted reads of public/app.js, tutorialCampaign.js, performance/release scripts, deploy workflows and tests, GitHub Actions runs, and live staging/production health receipts
- Game-loop review: tightness 9 · progression 9 · session engagement 9 · retention 7 · soul fidelity 8 · overall 8.4
- Evidence caveat: No new measured player cohort exists. The audit does not invent fun or retention data; it protects the first-run Opening Contract experience and release fidelity while the real opt-in cohort remains pending.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | UI/UX / first-run engagement / performance truth | 3.0h | 9 | 7 | 27.1 | **first-run-performance-authority** — L1 plus start the tutorial/beta dynamic import promise in parallel with core-dashboard loading, retain lazy-module boundaries, add focused source/argument tests, and generate separate canonical-entry and game-shell staging receipts at desktop/mobile. |
| 2 | FIRE | Release architecture / security / staging discipline | 3.0h | 10 | 5 | 21.5 | **candidate-bound-production-promotion** — L1 plus require candidate revision and staging artifact digest inputs, checkout that exact SHA, verify the built manifest and live stable-staging receipt match both inputs, then publish and verify production. Add focused workflow-contract tests. |
| 3 | HIGH | Observability / release truth / process quality | 2.0h | 8 | 4 | 10.3 | **release-authority-currency-probe** — L1 plus pure classification tests, honest unknown handling, and integration into the local doctor so stale release evidence cannot remain silent. |

Combined priority: **58.9**.

## Premise verification and rejected phantom work

- Rejected/deferred “Add another player-facing strategy or rivalry feature”: The live code already contains Opening Contract, Weekly Plan, Architecture Review, Rematch Memory, rival persona intel, Sim-Watch, decision archive, Trophy Road and return continuity. No measured cohort proves another system would outperform repairing the first-run/release evidence path.
- Rejected/deferred “Treat production reachability as proof that Session 84 was properly released”: Rejected by live evidence. Production did deploy S84 automatically, but stable staging, visual and performance receipts remained on S83. Reachability proves deployment happened; it does not prove the staging-first or rendered-pixel gates passed.
- Rejected/deferred “Keep using the current hosted-performance script to verify the tutorial CLS fix”: False premise. The script was changed in Session 82 to measure only the canonical / route and cannot reproduce the retained /game.html diagnostic. Its own receipt boundary says the direct game shell is separate.
- Rejected/deferred “Mark Obelisk, email, lifecycle or founder approval as code-complete”: Rejected as fabricated readiness. Zoho admin and Obelisk relying-party credentials/authority are absent, lifecycle registry disagrees with the local FORGE contract, and no SHA-bound launch approval exists. launchReady remains false.
- Rejected/deferred “Add a new package or browser tool for the audit”: The floating @playwright/cli candidate was blocked by Obelisk Package Trust (34/100). The existing exact @playwright/test 1.62.1 installation is approved (86/100), already used across 12 Studio manifests, and sufficient.

## Three recommended design moves

1. Turn the retained first-run game-shell red into a reproducible route-specific probe, then remove the tutorial module waterfall without breaking the lazy-island contract and prove the S84 layout reservation in real pixels.
2. Stop publishing production as an automatic side effect of every matching main push. Require an explicit candidate-bound promotion whose source revision and artifact already pass stable staging provenance.
3. Make stale release authority impossible to overlook: compare checked-in staging/performance/release identities with live staging, live production and current Git before doctor or closeout can describe them as current.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| first-run-performance-authority | shipped | route-specific CLI options deterministically select / versus /game.html, the matching interaction selector, output and boundary text; focused tests cover route normalization and reject unsafe/cross-origin route input; staging /game.html is measured on desktop and mobile after the exact candidate deploy, with real LCP/INP/CLS and shift sources retained; dark/light desktop/mobile tutorial captures are inspected and the canonical / receipt remains independently green |
| candidate-bound-production-promotion | shipped | workflow source tests prove the production Wrangler and GitHub Pages deploy jobs are promotion-only; promotion inputs carry the exact candidate revision and staging artifact digest; a pre-promotion step verifies stable staging provenance against the locally built manifest and fails on revision/artifact drift; the exact S85 candidate is deployed to stable staging and verified before any production workflow is dispatched |
| release-authority-currency-probe | shipped | pure evaluation tests cover current, staging-behind, production-behind, local-status-stale and network-unknown states; CLI JSON names HEAD, checked-in staging/release identities, live staging and live production identities without exposing secrets; doctor surfaces a non-blocking warning for evidence drift and a blocking failure only when a current-release claim is made from contradictory identities; Session 85 status prose is reconciled to actual deployment history and preserves launchReady false |
