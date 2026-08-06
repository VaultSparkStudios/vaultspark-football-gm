# Audit — Franchise Architect: Football — Session 73

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: game rubric with +2 engagement, +1 UI/UX and +1 speed/organization project overlays; public-launch, static-host, rendered-pixel and observability-honesty gates remain binding; staging: independent Cloudflare Pages staging is verified; production launch remains held on email, founder approval and lifecycle authority
- Profile source: fresh 857/857 Node run, 40/40 Playwright run, doctor blockingFailing 0, live source sampling, exact browser DOM measurements, and desktop/mobile Chromium captures of setup, tutorial and a populated league
- Game-loop review: tightness 9 · progression 8 · session engagement 8 · retention 7 · soul fidelity 9 · overall 8.2
- Evidence caveat: Structural scores only. No cohort retention or conversion telemetry is invented. Progression is below the other axes because the global mean can pass while a position room silently inflates or collapses; retention is below 8 because trophies exist but the next attainable goal is not surfaced in the weekly loop.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Verification integrity / automation | 1.5h | 10 | 8 | 88.5 | **hermetic-startup-brief-contract** — Add an explicit validated output-path override to the renderer, aim the live contract at a test-owned temporary file, assert the tracked brief hash is unchanged, and cover malformed or out-of-root output paths as no-write failures. |
| 2 | FIRE | Feature depth / season payoff | 5.0h | 9 | 9 | 86.6 | **architects-cut-season-reckoning** — Build a bounded Architect's Cut model that joins committed weekly plans, trades, draft calls and General Manager choices to their existing receipts; rank three turning points, render declared intent versus observed evidence in Season Epilogue, and keep explicit non-causal and incomplete states. |
| 3 | FIRE | Gamification / broadcast immersion | 4.0h | 9 | 8 | 83.6 | **broadcast-director-sim-watch** — Extract a deterministic playback controller with play/pause, 0.5×/1×/2×/4× speed, previous/next key play and quarter/drive progress; wire accessible controls and keyboard shortcuts, preserve exact score/field receipts, and surface replay failures through client diagnostics. |
| 4 | HIGH | Retention / progression discovery | 3.0h | 8 | 7 | 72.3 | **achievement-questline-authority** — Add declarative progress metadata for measurable trophies, derive the three nearest honest objectives from live dashboard and receipt state, render a compact Trophy Road on Overview and mobile, and advance it immediately after an unlock without inventing percentages for event-only goals. |
| 5 | HIGH | Speed / browser architecture | 4.0h | 8 | 8 | 49.5 | **lazy-ui-island-boot-contract** — Create a source-derived boot budget, dynamically import at least History and Settings/export islands on first activation, centralize pending/error behavior in the hydration dispatcher, update precache/reachability contracts, and prove first decision plus every lazy tab. |
| 6 | HIGH | Simulation intelligence / progression | 6.0h | 10 | 9 | 45.0 | **position-group-progression-parity** — Promote the seven roster rooms into a shared authority, compute count/mean/median/elite and annual drift per room, classify inadequate samples as incomplete, add a multi-seed comparison history without rerunning on render, and expose global plus room verdicts in Commissioner Settings. |

Combined priority: **425.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “The mobile setup page overflows or paints blank”: Rejected after exact Chromium geometry and a byte-complete capture: viewport and scroll widths are both 390px, both resume buttons are 317.6px wide, computed light-theme colors pass, and the New Franchise section begins normally at y=479. The apparent cutoff was truncated temporary image transport.
- Rejected/deferred “Replace onboarding with a new guided campaign”: Rejected as duplicate work. The existing three-step Year One Franchise Challenge is mobile-readable, skippable, scoped per franchise and commits a real Opening Contract rather than decorative choices.
- Rejected/deferred “Build another dynasty export”: Rejected as duplicate work. League Story Export, Franchise Newsletter and Dynasty Timeline already provide escaped, source-derived season and career artifacts.
- Rejected/deferred “Prioritize a speculative stored-XSS rewrite”: Rejected after tracing player-facing rendering and existing public-truth tests. Dynamic names and text use escapeHtml or textContent, Gist credentials remain tab/memory scoped, and no executable exploit premise was found.
- Rejected/deferred “Thirty-six recent Node processes prove this repository leaks test children”: Rejected as unproven. Multiple concurrent Studio sessions and daemons share the host; command-line classification could not bind most processes to this repository. The observed tracked-file mutation is independently reproducible and is the actionable hermeticity defect.
- Rejected/deferred “Resolve launch by editing local lifecycle truth or declaring production ready”: Rejected. Delivered reply-capable email, SHA-bound founder approval and authoritative lifecycle are independent gates. Registry reconciliation is sibling-owned through signed Ark and route health cannot substitute for any of them.

## Three recommended design moves

1. First make the suite hermetic: a verification run must prove the tree without rewriting the tracked startup brief.
2. Then add position-room parity and the lazy UI boot boundary so the simulation and loading architecture become measurable before new presentation layers depend on them.
3. Finally ship the player-payoff trio as one coherent arc: direct the broadcast, pursue the next honest trophy, and end the year with an Architect's Cut of the decisions actually made.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| hermetic-startup-brief-contract | shipped | focused startup-authority contract test; npm test leaves git diff empty; renderer default still writes the canonical brief |
| architects-cut-season-reckoning | shipped | pure model tests for ranking and non-causal wording; season-end browser rendering; mobile one-column capture in dark and light themes |
| broadcast-director-sim-watch | shipped | pure playback-controller tests; Playwright pause/speed/key-play journey; desktop and mobile dark/light pixel captures |
| achievement-questline-authority | shipped | questline selection/progress unit tests; Overview and mobile rendering; unlock automatically advances the next-goal set |
| lazy-ui-island-boot-contract | shipped | source-derived boot manifest with byte/module budgets; first-view Playwright flow; visit every lazy tab and offline smoke; no browser-module orphan |
| position-group-progression-parity | shipped | seven-room deterministic receipt tests; multi-seed measurement history; Commissioner table and mobile readable state; global pass cannot mask a room fail |
