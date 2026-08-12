# Audit — Franchise Architect: Football — Session 82

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay: vivid General Manager agency, explicit irreversible boundaries, progression hierarchy, browser-visible feedback, accessibility, privacy, static/local-first behavior, and public-app release gates; staging: stable Cloudflare Pages must prove the exact immutable candidate before direct-to-main publication; backend deployment is required only when backend source changes
- Profile source: arc-profile registry authority, Session 82 startup brief, 29,981-token code sample, exact grep/read preverification, game-loop review, app-release gate matrix, browser boot/reachability probes, canon conformance, and doctor
- Game-loop review: tightness 9 · progression 9 · session engagement 8 · retention 7 · soul fidelity 8 · overall 8.2
- Evidence caveat: Code-contract review only. No consented cohort or docs/PLAYTESTS evidence exists, and public SOUL intentionally withholds private criteria, so these scores do not claim measured fun, retention, or complete private-soul conformance.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Observability honesty / session protocol / security | 2.0h | 9 | 5 | 22.5 | **monotonic-session-authority** — Extract a pure monotonic session-authority resolver, parse structured handoff/status evidence, allow only upward canonical repair, emit explicit divergence diagnostics, and regression-test every authority ordering. |
| 2 | FIRE | Game-loop safety / irreversible agency / UI UX | 3.0h | 9 | 7 | 27.1 | **irreversible-draft-trade-confirmation** — Build one accessible shared live-pick trade review dialog with exact asset/value/fingerprint disclosure, explicit irreversible language, cancel/focus restoration, and a single guarded confirm seam for Accept and Counter. |
| 3 | FIRE | Feedback loop / playtest truth / retention evidence | 2.0h | 8 | 6 | 24.0 | **planning-friction-journey-authority** — Version the journey schema, retain review/revision/defer checkpoints with relative deltas, add a bounded planning-friction summary to explicit local exports, and preserve the no-cohort warning. |
| 4 | FIRE | Progression hierarchy / engagement / innovative feature | 4.0h | 8 | 8 | 24.8 | **architect-objective-hierarchy** — Derive one non-blocking Architect Objective from player-authored mastery focus first, active season chapter second, and nearest measurable Trophy Road milestone as supporting evidence; show source, exact destination, and no-hidden-bonus boundary on desktop and mobile. |
| 5 | HIGH | Performance / release truth / browser excellence | 4.0h | 9 | 6 | 20.9 | **hosted-performance-evidence** — Create a bounded exact-revision browser performance probe with a deliberate interaction, hash-bound JSON receipt, threshold verdicts, edge-header observation, and fail-closed release/status consumption. |
| 6 | HIGH | Release observability / organization / truth | 3.0h | 9 | 5 | 18.5 | **release-receipt-authority** — Introduce one fail-closed release-authority reconciler that reads verified staging, production, visual and performance receipts, reports exact divergence, and writes PROJECT_STATUS current-candidate fields through the invariant writer. |

Combined priority: **137.8**.

## Premise verification and rejected phantom work

- Rejected/deferred “Create synthetic playtest or Community Stats activity”: Rejected by GAME_LOOP and observability honesty. Real consented cohort evidence does not exist and this session will not manufacture it.
- Rejected/deferred “Build another progression or achievement system”: False premise. Immediate commands, season chapters, mastery paths, and Trophy Road already exist; the verified gap is their hierarchy, not missing breadth.
- Rejected/deferred “Add project-local authentication”: Rejected. The current product is anonymous Phase 0; local auth would violate the Obelisk identity boundary rather than close a product gap.
- Rejected/deferred “Claim launch readiness from green CI or deployment parity”: Rejected. Email, lifecycle, founder approval, exact hosted performance, and exact visual authority are independent gates.
- Rejected/deferred “Add hosted AI commentary or a metered recommendation service”: Rejected by the static/local-first and free-tier cost bars. Existing deterministic authorities can close every verified gap without variable spend.
- Rejected/deferred “Implement General Manager firing or game over”: Founder-direction-gated in the durable decision record; this audit cannot invent terminal product canon.

## Three recommended design moves

1. Make every authority boundary honest before adding breadth: session identity cannot reverse, and irreversible draft-pick trades require an explicit review boundary.
2. Close the evidence gap around the weekly loop by retaining review, revision, defer, commit, and debrief checkpoints without publishing local instrumentation as cohort proof.
3. Unify the player's progression hierarchy and release truth: one Architect Objective should connect the current mastery focus to an exact destination, while hosted performance and structured release receipts remain exact-revision authorities.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| monotonic-session-authority | implemented | test/session-authority.test.js 4/4,canonical startup renderer advanced to Session 82 without lowering PROJECT_STATUS,npm test aggregate 1067/1067 before receipt-only tooling refinements |
| irreversible-draft-trade-confirmation | implemented | on-clock/modal focused suite 23/23,Playwright 40/40,exact candidate dark/light desktop/mobile/tablet review pixels passed |
| planning-friction-journey-authority | implemented | playtest journey/composer focused suite 11/11,schema 1.1 planning-friction summary preserves local-only no-cohort boundary |
| architect-objective-hierarchy | implemented | progression and mobile focused suite 45/45,206/206 responsive captures,dark/light desktop and mobile Architect Objective pixels manually inspected with zero blocking defects |
| hosted-performance-evidence | implemented | stable staging exact candidate 14/14,public entry route median desktop LCP 556ms INP 24ms CLS 0.0151,mobile LCP 452ms INP 16ms CLS 0.0085,direct game-shell hydration retained separately as a red diagnostic |
| release-receipt-authority | implemented | release provenance and authority focused suite 9/9,one exact deployable candidate 046e35df plus artifact 656eb904 across staging, visual and performance receipts,source-bound edge-policy receipt excluded from deployable-content identity with regression coverage,production verifier intentionally remains pending until direct-main publication |
