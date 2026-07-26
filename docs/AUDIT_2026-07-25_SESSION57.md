# Audit — Franchise Architect: Football — Session 57

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public football game/app
- Rubric: founder-requested infrastructure rubric with product, game-loop, and release-gate lenses; staging: GitHub Pages artifact plus exact same-origin hosted verification
- Profile source: live source, direct script probes, current CI/staging evidence, release gate, game-loop review, infrastructure sweep, and public-safe context
- Game-loop review: tightness 8.9 · progression 8.6 · session engagement 8 · retention 8.2 · soul fidelity 8.7 · overall 8.5
- Evidence caveat: Implementation-contract review only. GAME_LOOP.md and checked-in playtests are absent, SOUL is intentionally public-safe, and project impact remains zero; no fun, pace, adoption, or retention lift is claimed.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Infrastructure / observability / dual-runtime contract | 2.0h | 10 | 8 | 40.0 | **api-contract-bidirectional-authority** — Teach parity to fail on unexpected local/server routes, support a frozen explicit adapter-only allowlist with reasons, delete the two unreachable ghosts, expose exact local/server counts, and add fixture tests proving both missing and unexpected routes fail. |
| 2 | FIRE | Infrastructure / agent parity / routing observability | 2.0h | 9 | 8 | 36.0 | **session-routing-agent-neutral-truth** — Share the current-intent/task source ledger with session-mode scoring, make agent identity explicit from the session lock, suppress incompatible model-family recommendations, emit explainable evidence, and cover historical-noise plus Codex/Claude cases. |
| 3 | FIRE | Infrastructure / architecture truth / attack-surface reduction | 1.3h | 9 | 7 | 37.0 | **contract-service-exact-authority** — Reduce ContractService to the exact cap-summary authority, declare method-level call sites in a frozen manifest, add reflection/static guards for unexpected public methods, and update comments to forbid scaffold methods before characterization. |
| 4 | FIRE | Game depth / progression / explainable intelligence | 2.5h | 9 | 9 | 37.3 | **adaptive-identity-mastery** — Add a pure identity evidence model that scores declared continuity plus source-observed reinforce/counter adaptation after film misalignment, exposes a transparent breakdown in the existing Mastery card, and proves random churn cannot beat deliberate identity. |
| 5 | FIRE | Engagement / progression / UI-UX | 3.0h | 9 | 9 | 34.9 | **source-derived-season-chapters** — Create a versioned season-chapter composer from phase/week, Opening Contract, owner promise, deadline, playoff, and epilogue receipts; surface one active promise and one next call in Week Room and Return Digest; add transition, empty-state, mobile, and browser-wiring tests. |
| 6 | HIGH | Automation / feedback loop / playable proof | 1.5h | 8 | 7 | 31.0 | **first-session-playable-proof** — Add a deterministic first-session Playwright journey from setup through all tutorial choices, applied Opening Contract, decision-first weekly plan, committed week, debrief/ledger, and chapter transition; assert zero silent skip and preserve separate skip coverage. |

Combined priority: **216.2**.

## Premise verification and rejected phantom work

- Rejected/deferred “Add another rivalry, inbox, achievement, recap, or generic retention system”: Rejected as additive sprawl. Live code already has all five; the verified gap is orchestration of existing season milestones and an unambiguous identity lesson.
- Rejected/deferred “Redesign the fourteen-tab shell again”: Rejected as a phantom rewrite. Session 56 already shipped the progressive Week Room; the next bounded surface is its Season horizon and first-session browser path.
- Rejected/deferred “Claim learning or retention from the consented receipt instrument”: Rejected because no checked-in player cohort exists. Instrumentation is an evidence path, not outcome evidence.
- Rejected/deferred “Reward daily streaks or raw tactic variety”: Rejected as coercive or semantically contradictory. The product promise is deliberate franchise identity and source-derived chapters.
- Rejected/deferred “Add a large-language-model coach or tactic-win predictor”: Rejected on cost, custody, and causal evidence. Existing deterministic receipts can explain state without fabricating predictions.
- Rejected/deferred “Flip launch/SPARKED from local green evidence”: Deferred honestly: hosted provenance, edge headers, same-revision parity, received email, explicit approval, and registry coherence remain red or sibling-owned.
- Rejected/deferred “Merge all 111 server and local handlers in one high-risk rewrite”: Rejected for this pass. The bidirectional parity gate and ghost-route removal are the bounded root fix; a shared dispatcher remains a future characterized extraction.
- Rejected/deferred “Optimize model/API spend”: Rejected: gameplay has no model calls, free-tier cost is zero, and Max Plan spend is flat-rate/notional.
- Rejected/deferred “Perform a broad GameSession strangler or edit the sibling lifecycle registry”: Rejected as unsafe or out of ownership. This pass tightens exact service/API surfaces and uses Ark for sibling truth.

## Three recommended design moves

1. Make API and runtime/service observability bidirectional: advertised and implemented surfaces must match exactly.
2. Teach deliberate identity: consistency plus source-observed adaptation, never random tactic variety as mastery.
3. Turn existing season systems into one source-derived chapter cadence and prove the full first-session path in a real browser.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| api-contract-bidirectional-authority | done | unexpected adapter routes fail the gate; the two ghost routes are absent; declared browser/server/local surfaces join exactly; summary counts are derived from scanned sets |
| session-routing-agent-neutral-truth | done | the current mission classifies builder/execution; historical task-board references cannot flip mode; Codex output contains no Claude-only model directive; Claude behavior remains explicitly covered |
| contract-service-exact-authority | done | ContractService has only constructor and getCapSummary as public production methods; manifest names exact methods and call sites; guard fails on a future undelegated method; cap summary behavior is unchanged |
| adaptive-identity-mastery | done | random tactic variety earns no automatic mastery; consistent intent and evidenced adaptation are distinct explainable components; all scores remain bounded and source-derived; the browser-visible mastery evidence names the rule |
| source-derived-season-chapters | done | chapter state derives only from live dashboard receipts; exactly one active chapter and next call render; week/phase transitions are deterministic; no new telemetry or reward currency is introduced |
| first-session-playable-proof | done | the tutorial is completed rather than skipped; the opening receipt is visible before entry; one weekly plan commits and advances authority; the debrief, ledger, and chapter transition are browser-visible |
