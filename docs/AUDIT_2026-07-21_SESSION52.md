# Audit — Franchise Architect: Football — Session 52

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game/app
- Rubric: founder-requested infrastructure-weighted product rubric; staging: GitHub Pages artifact plus canonical-origin verification
- Profile source: live code, direct runtime and parser traces, current project state, game-loop review, application release gate, infrastructure debt sweep, and public-safe internal-tool inventory
- Game-loop review: tightness 8 · progression 8.5 · session engagement 8.2 · retention 7.7 · soul fidelity 8.4 · overall 8.2
- Evidence caveat: Executable-contract review only. No GAME_LOOP document or anonymized playtest receipts exist, and SOUL is a public-safe placeholder; no claim about fun, churn, pacing, or sentiment is made.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Player agency / simulation authority / retention | 3.5h | 10 | 9 | 36.6 | **controlled-draft-agency-checkpoint** — Expose source-derived offseason stage, team-on-clock, and controlled-team-on-clock state; make the draft pipeline run CPU picks only until the controlled pick; checkpoint fast simulation on every offseason stage and controlled pick; suppress Resume when a blocking user action is required; preserve the existing explicit Finish Draft button as the delegation command; add engine, checkpoint, and browser regressions. |
| 2 | FIRE | Mobile parity / command clarity / transactional integrity | 3.0h | 9 | 8 | 31.0 | **mobile-weekly-intent-parity** — Extract one browser weekly-command coordinator; let mobile selection stage a visible pending General Manager choice without mutation; open the same compact tactic chooser on Commit Plan and Advance; submit tactic plus decision in one envelope; clear intent only after authoritative success; route desktop through the same coordinator; add focused tests proving selection alone cannot advance and both surfaces send parity payloads. |
| 3 | FIRE | Onboarding / first-session comprehension / progression | 3.0h | 8 | 8 | 27.6 | **opening-contract-playable-prologue** — Derive an opening-contract progress authority from persisted receipt, current phase/week, weekly plan, tactical film, and controlled result; render a three-step pressure-to-plan-to-receipt prologue in the existing card; make its action enter the shared weekly coordinator rather than a tutorial-only simulation; finish on a truthful score, tactic, owner-pressure, and next-decision receipt; add save/restore and browser tests. |
| 4 | FIRE | Infrastructure / observability honesty / parser consolidation | 1.5h | 9 | 6 | 29.9 | **single-task-board-parser-authority** — Version and extend scripts/lib/task-board.mjs as the sole row/status normalizer; adapt cross-repo aggregation and genius-cache joins to its normalized output; preserve human-blocked rows and append-only duplicate history semantics; add fixture tests from the current session-table format plus local/cross-repo/cache count invariants. |
| 5 | HIGH | Release infrastructure / identity / staging evidence | 2.0h | 9 | 6 | 24.9 | **same-origin-staging-receipt-authority** — Reconcile local manifest repository and staging metadata with tracked truth; add a fixture-testable staging evidence command that requires every redirect to remain on the configured origin, parses health JSON, joins deploy-manifest revision/repository/style identity, and exits nonzero on HOLD; wire it into ops/package scripts and keep the live result red until a real preview exists. |

Combined priority: **149.9**.

## Premise verification and rejected phantom work

- Rejected/deferred “Mark the project launch-ready or promote lifecycle posture”: Deferred honestly: staging redirects into a 403, canonical health is 404, provenance is 0/7, required edge headers and received email proof are absent, and launch approval is not recorded.
- Rejected/deferred “Repair the shared apex host or authoritative lifecycle registry directly”: Rejected as sibling-owned work. This repository can emit exact evidence and signed transport, but it must not edit another repository to make its own gate green.
- Rejected/deferred “Add generic retention widgets, achievements, or save hooks”: Rejected as a false premise: saves, return digest, inbox, challenges, dynasty history, replay, exports, rivalry, and epilogues already exist. The verified gaps are agency preservation, intent parity, and first-loop comprehension.
- Rejected/deferred “Claim that the game is fun, well-paced, or retaining players”: Rejected because no anonymized playtest receipt set exists. Code coverage is not player evidence. A local-only receipt loop is reserved for the innovation pass.
- Rejected/deferred “Rewrite the entire GameSession class or both API adapters in one pass”: Culled as unsafe decomposition theater. Existing parity tests are valuable, but a full migration is too broad to verify atomically beside the live player-agency defects.
- Rejected/deferred “Install a bundler or paid telemetry service”: Rejected by the measurement-first, package-trust, cost-neutral, and privacy requirements. No current performance measurement proves a bundler is the optimal intervention.
- Rejected/deferred “Treat a redirecting HTTP 3xx staging response as a green health receipt”: Rejected by live evidence: following the configured redirect chain ends at HTTP 403. Health requires a same-origin, schema-valid JSON receipt and exact deploy identity.

## Three recommended design moves

1. Preserve player agency before adding more content: accelerated simulation must stop before any controlled-team draft choice or material offseason stage can be delegated.
2. Make desktop and mobile submit the same explicit weekly command envelope so selecting a General Manager choice never advances time as a hidden second action.
3. Turn the opening contract into a source-derived one-week prologue that teaches pressure, plan, command, and consequence inside the live game rather than ending at configuration.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| controlled-draft-agency-checkpoint | completed | Completed — controlled picks now block CPU draft progression, every offseason stage checkpoints fast simulation, blocking Resume is suppressed, and explicit Finish Draft remains the delegation path; focused draft/checkpoint suites 14/14. |
| mobile-weekly-intent-parity | completed | Completed — mobile choices stage without mutation, desktop/mobile share one weekly command coordinator and tactic chooser, intent clears only after success, and parity-focused suites pass 24/24. |
| opening-contract-playable-prologue | completed | Completed — source-derived pressure→plan→receipt state renders actual score, tactic, tactical evidence, and owner heat; CTA delegates to production weekly flow; save/restore and browser suites pass 9/9. |
| single-task-board-parser-authority | completed | Completed — one versioned parser now feeds local, cross-repo, and Genius cache readers with latest-status dedupe and blocked-row preservation; focused parser/studio suites pass 22/22. |
| same-origin-staging-receipt-authority | completed | Completed — manifest identity reconciled and fixture-tested same-origin health/deploy receipt command wired through ops/npm; live command remains an honest nonzero HOLD because staging redirects cross-origin. |
