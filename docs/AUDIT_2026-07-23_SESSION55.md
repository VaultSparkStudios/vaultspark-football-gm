# Audit — Franchise Architect: Football — Session 55

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game/app
- Rubric: founder-requested infrastructure-grade product rubric; staging: GitHub Pages artifact plus exact same-origin hosted verification
- Profile source: live code, infrastructure debt sweep, game-loop review, application release gate, current CI and staging evidence, and public-safe context
- Game-loop review: tightness 7.8 · progression 8.3 · session engagement 7.6 · retention 6.7 · soul fidelity 8.7 · overall 7.8
- Evidence caveat: Implementation review only. context/GAME_LOOP.md and checked-in playtest files are absent, while the public SOUL intentionally contains no private creative pillars; no claim about actual fun, retention, churn, or player sentiment is made.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Game loop / command parity / observability | 3.0h | 10 | 9 | 38.8 | **fast-sim-architect-policy** — Create a scoped, explicit Architect Auto-Plan for four-week and season runs: collect one tactic with copy that states its duration, carry it through checkpoint/resume state, attach it to every regular-season command, and include tactic plus observed alignment in the simulation digest. Preserve General Manager decision and draft checkpoints, allow an explicit no-plan choice, and add pure policy, continuation, and browser-wiring tests. |
| 2 | FIRE | Infrastructure / game depth / domain authority | 4.0h | 9 | 9 | 31.3 | **coaching-lineage-authority** — Add a session-bound CoachingService to the existing service bundle; reconcile current head coaches and coordinators into deterministic nodes, delegate staff lifecycle through the service, preserve mentor and replacement history across snapshot restore, expose a versioned team-specific lineage view from the dashboard, and render the exact schema in Coaching Tree DNA with empty-state, escaping, and focused service/UI tests. |
| 3 | FIRE | Progression / engagement / source-derived intelligence | 3.0h | 9 | 8 | 31.0 | **architect-mastery-portfolio** — Add a versioned Architect Mastery Portfolio alongside—not inside—the historical score. Derive bounded Results, Stewardship, Promise, and Identity paths from existing season, cap/culture/trade, commitment, and Architect ledger receipts; name each path's evidence count and next source-derived milestone; expose it in both runtimes and render it in the Legacy lane with honest empty states and no causal or predictive language. |
| 4 | FIRE | Infrastructure / parser authority / model routing | 1.5h | 9 | 6 | 29.9 | **session-intent-task-authority** — Replace extractNow with parseTaskBoardItems, select the highest-priority open rows without resurrecting obsolete sections, parse the latest numbered Session Intent, export pure sampling helpers, and add fixtures proving current tables influence scores while done and human-blocked history do not pollute execution routing. |
| 5 | FIRE | Infrastructure / CI observability / security | 0.5h | 10 | 4 | 30.2 | **realism-workflow-exit-truth** — Run the verifier under explicit bash pipefail, keep the report artifact upload under if: always(), add a Studio static regression test for the exact workflow contract, and verify the YAML command directly so a failed verifier cannot be reclassified by tee. |

Combined priority: **161.2**.

## Premise verification and rejected phantom work

- Rejected/deferred “Add another generic rivalry, inbox, challenge, recap, or achievement widget”: Rejected as additive sprawl. Live code already contains rivalry DNA, Priority Inbox, speedrun challenges, return digest, dynasty history, season epilogues, and local feedback instruments; the higher-value defect is that fast simulation bypasses the declared tactical loop.
- Rejected/deferred “Create an LLM coach or server-backed recommendation system”: Rejected on cost, custody, and product evidence. The game is intentionally static-host-safe and cost-neutral, and no observed player demand justifies a variable-cost or data-custody surface.
- Rejected/deferred “Redesign every Overview panel in one pass”: Rejected as an unsafe broad rewrite. The command center and Three-Horizon Blueprint are coherent; a focused Game Week lane may be evaluated as second-order work after intent parity is restored.
- Rejected/deferred “Claim playtest trends or retention lift”: Rejected because no checked-in playtest corpus or retention telemetry exists. Existing local receipts remain sparse, opt-in, and explicitly non-causal.
- Rejected/deferred “Replace the existing General Manager score”: Rejected because historical score and tier semantics are already persisted. The ranked mastery item adds transparent parallel paths without rewriting prior career truth.
- Rejected/deferred “Use generated predictions to choose tactics”: Rejected because tactical film records observed alignment, not causal effectiveness. Deterministic matchup context remains advice, never a prediction of results.
- Rejected/deferred “Launch or promote SPARKED”: Deferred honestly: staging/provenance, web hardening, current hosted theme/parity proof, email delivery, approval, and lifecycle coherence are red. Local implementation cannot substitute for external receipts.
- Rejected/deferred “Consolidate both approximately 120-route adapters in one pass”: Premise is real but the repository explicitly rejected an unmeasured broad dispatcher rewrite. Continue the GameSession strangler through one characterized domain at a time.
- Rejected/deferred “Optimize notional model spend or add runtime API caching”: Rejected: Max Plan cost is flat-rate/notional, gameplay has no LLM calls, and no measured network hot path supports a cache claim.
- Rejected/deferred “Restore the obsolete ## Now task-board format”: Rejected. The canonical format intentionally removed that bucket; the classifier must consume the shared live table parser instead of resurrecting stale structure.
- Rejected/deferred “Treat local Playwright 1.58.2 as repository dependency debt”: Rejected: package.json and package-lock.json resolve 1.61.1, matching the registry. The local node_modules tree is stale, while the repository manifest is current.

## Three recommended design moves

1. Preserve declared tactical intent across multi-week and season simulation so the fastest play modes still produce a real Architect plan-act-learn ledger.
2. Activate the dormant coaching-tree engine through a GameSession service and one truthful lineage adapter instead of leaving a hidden, shape-incompatible feature scaffold.
3. Make General Manager progression legible across results, stewardship, commitments, and tactical identity without weakening the existing outcome score or fabricating causality.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| fast-sim-architect-policy | done | four-week and season commands carry the selected tactic only during regular-season games; checkpoint resume preserves the scoped policy; explicit no-plan remains honest and supported; simulation digest shows declared intent and observed alignment without causal claims |
| coaching-lineage-authority | done | new and restored leagues contain deterministic coaching lineage; staff replacements update lineage exactly once; dashboard and UI consume one versioned shape; lineage copy identifies scheme inheritance without claiming performance causation |
| architect-mastery-portfolio | done | historical legacy score and tier thresholds do not change; each path is deterministic and capped; missing evidence produces a named empty state rather than zero-as-failure; server and browser summaries are shape-equivalent |
| session-intent-task-authority | done | current numbered intent is discovered; open live task rows affect classification; completed historical rows are excluded; no obsolete ## Now heading is required |
| realism-workflow-exit-truth | done | the verifier's nonzero status fails the step; the report still uploads on failure; a regression test rejects future unguarded verifier pipelines; no fabricated realism result is introduced |
