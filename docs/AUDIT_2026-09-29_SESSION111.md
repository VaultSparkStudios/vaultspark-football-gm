# Audit — Franchise Architect: Football — Session 111

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product; game-loop consequence, responsive browser decisions, evidence-honest release gates; staging: stable Cloudflare staging before public Pages promotion
- Profile source: local PROJECT_STATUS, startup brief, audit skill profile; game-loop review over live code
- Game-loop review: tightness 4/5 · progression 4/5 · session engagement 4/5 · retention 2/5 evidence quality · soul fidelity 4/5
- Evidence caveat: Source-design assessment only. No consented player cohort or D1/D7 retention observations exist.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | HIGH | feature depth / league ecology | 8.0h | 9 | 8 | 21.7 | **cpu-to-cpu-trade-ecology** — Integrate a bounded deterministic CPU–CPU offer-and-accept market at weekly advance through the existing TradeService; preserve picks, cap, roster and transaction invariants, explain both clubs' need and surplus, and render news. Compare matched seeded three-season controls for transaction volume and parity before enabling it. |
| 2 | HIGH | security / launch truth | 2.0h | 8 | 5 | 20.0 | **typed-reply-capable-email-proof** — Parse a structured project-domain mail receipt with inbound delivery and reply-as-alias evidence, schema validation, address matching and negative controls; keep current launch HOLD and fixture tests honest. |
| 3 | MEDIUM | immersion / visual identity | 3.0h | 6 | 7 | 18.1 | **crest-through-decision-surfaces** — Mount lightweight procedural crests in the league and trade decision surfaces using the shared lazy module; retain text labels and avoid new boot dependencies. Review dark/light desktop/mobile pixels and accessibility names. |
| 4 | HIGH | UI / decision flow | 4.0h | 7 | 6 | 16.2 | **team-workspace-roster-depth** — Create one Team destination with Roster and Depth submodes; preserve exact tab IDs and deep links, keyboard focus, history and mobile drawer behavior. Verify both themes and phone/desktop pixels while switching modes. |
| 5 | MEDIUM | release automation | 3.0h | 7 | 5 | 15.1 | **bounded-backend-ssh-transport** — Replace fragile transport with bounded noninteractive SCP/SSH retry steps that enforce known-host identity; test reset-then-success and terminal failure locally. Keep deployment idempotent and distinguish workflow success from independent recovery. |
| 6 | MEDIUM | second-order innovation / public truth | 2.0h | 6 | 4 | 12.0 | **derived-public-engine-count** — Render the landing stat from the source module count at build time; keep a fail-closed source marker and verify the built HTML contains the exact count with no placeholder leak. |

Combined priority: **103.1**.

## Premise verification and rejected phantom work

- Rejected/deferred “pre-push-hook-is-deadlocked”: The ordinary S110 checkpoint push completed after several minutes and the narrow follow-up push completed in eight seconds. The old task describes latency as a deadlock; reclassify it during closeout, and optimize only against a measured need.
- Rejected/deferred “first-season-has-no-goal-or-owner-verdict”: public/lib/firstSeasonContract.js implements five goals and a season verdict; S110 corrected the player-controlled trade objective.
- Rejected/deferred “mobile-drawer-and-icon-sprite-are-missing”: public/game.html and public/styles.css now contain a six-group drawer and shared SVG sprite; S110 visual receipt covers dark/light desktop/mobile.
- Rejected/deferred “routine-weeks-end-in-only-a-toast”: weeklyPlanComposer, seasonChapters and returnDigest already produce source-bound weekly and return receipts.
- Rejected/deferred “retention-is-proven-by-local-playtest-fixtures”: Synthetic tests and self-selected local receipts cannot establish player comprehension, return intent, or cohort retention.

## Three recommended design moves

1. Build a bounded deterministic CPU-to-CPU market using existing trade legality, with matched seed and transaction-volume controls and visible league news.
2. Require typed inbound delivery plus reply-as identity before launch evidence can mark project-domain mail verified; preserve HOLD until independent proof exists.
3. Join roster and depth decisions in one Team workspace, then carry club identity across the league and market surfaces without a boot-cost regression.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| cpu-to-cpu-trade-ecology | implemented | New matched-seed three-year spec 3/3; rival-offer neighbors 10/10; integrated core 290/290, runtime 849/849, sim-contract 85/85, realism 9/9. Candidate publication and final long/Studio shards pending. |
| typed-reply-capable-email-proof | implemented | Structured Zoho inbound and recipient-observed alias reply validator; freeform and forged controls rejected. Focused launch evidence 17/17 and release-truth 26/26. Actual mail receipt absent, so public launch remains HOLD. |
| crest-through-decision-surfaces | implemented | Lazy team-specific crest mounts in League and Trades; both passed real-browser assertions after a fresh game boot. Final dark/light pixel receipt pending. |
| team-workspace-roster-depth | implemented | One Team destination with Roster/Depth submodes; two hidden depth routes corrected; 34/34 focused Node navigation tests and focused real-browser keyboard/depth flow green. Final dark/light pixel receipt pending. |
| bounded-backend-ssh-transport | implemented | Pinned host-key secret provisioned from a previously trusted and freshly verified host; bounded transport helper, reset-success and terminal-failure controls 15/15; Windows-hide guard zero. Live GitHub runner proof pending next dispatch. |
| derived-public-engine-count | implemented | node scripts/check-public-truth.mjs passed at 44 modules; npm run build:pages succeeded; static/index.html rendered data-engine-system-count>44 with no marker. |
