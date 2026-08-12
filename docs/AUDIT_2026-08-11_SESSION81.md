# Audit — Franchise Architect: Football — Session 81

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay: vivid General Manager agency, progression and consequence truth, browser-visible feedback, accessibility, privacy, static/local-first behavior, and public-app release gates; staging: stable Cloudflare Pages must prove the exact immutable candidate before direct-to-main publication; backend deployment must attest the same revision at runtime
- Profile source: arc-profile registry authority, Session 81 startup brief, 29,980-token code sample, three read-only focused audit lanes, exact grep/read preverification, game-loop review, and app-release gate requirements
- Game-loop review: tightness 8 · progression 9 · session engagement 8 · retention 8 · soul fidelity 9 · overall 8.4
- Evidence caveat: Code-contract review only. docs/PLAYTESTS does not exist and the public SOUL file intentionally withholds private criteria, so these scores do not claim measured fun, retention, or complete private-soul conformance.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Game-loop tightness / decision agency / feedback | 4.0h | 10 | 8 | 30.9 | **gm-choice-boundary-dossier** — Extract canonical pure preview planners shared by projection and commit, name the exact candidate or action when known, show measurable commitment success/failure boundaries without odds, and render identical accessible desktop/mobile dossiers. |
| 2 | FIRE | Innovative feature / draft-night agency / AI opponents | 8.0h | 9 | 9 | 24.4 | **on-clock-trade-market** — Generate at most three deterministic rival offers from live need and shared valuation; expose accept, counter and decline in the War Room; bind offers to a board/ownership fingerprint and receipt every accepted transfer. |
| 3 | FIRE | Release architecture / security / observability | 4.0h | 10 | 6 | 23.2 | **backend-runtime-attestation** — Define the backend test gate, inject immutable OCI/source-revision metadata into the image, expose it from no-store health, and require the post-deploy probe to equal github.sha. |
| 4 | FIRE | Progression agency / retention / feature depth | 5.0h | 8 | 8 | 22.8 | **mentorship-covenants** — Let the player select eligible mentor/mentee pairs and one transparent focus, preserve the existing bonus budget, and receipt assignment plus applied offseason result. |
| 5 | FIRE | Career progression truth / feedback / simulation integrity | 6.0h | 9 | 7 | 21.0 | **gm-stewardship-report-authority** — Rebuild the dead report-card module around canonical cap, transaction, draft and roster authorities; persist one idempotent season report; update trade reputation from observed Approximate Value; and render the receipted dimensions in Season Review. |
| 6 | HIGH | Privacy UX / feedback / request efficiency | 5.0h | 8 | 7 | 20.0 | **community-participation-truth** — Retry the purpose-bound deletion tombstone online until acknowledged without resuming collection; add an accessible deletion receipt state; and coordinate ETag-aware snapshot requests around the server refresh floor with single-flight and bounded backoff. |
| 7 | HIGH | Accessibility / UI authority / loop safety | 6.0h | 9 | 5 | 15.0 | **decision-modal-interaction-contract** — Implement an accessible tactic radiogroup with shared receipt truth; expose an active modal-stack query; adopt Player, Box Score, Guide, Command Palette and Sim-Watch into the shared focus/Escape authority; and prove shortcuts cannot leak. |

Combined priority: **157.3**.

## Premise verification and rejected phantom work

- Rejected/deferred “Create synthetic playtest or Community Stats activity”: Rejected by GAME_LOOP and current launch truth. Product claims require real consented cohorts; this session will not manufacture outcome evidence.
- Rejected/deferred “Build mobile/tablet navigation or exact command routing”: False premise. The responsive drawer, mobile decision deck, and shared exact tab-hydrate-scroll-focus authority already ship with current browser coverage.
- Rejected/deferred “Add rival General Manager names, memory, opponent-aware play calling, or a prediction minigame”: False premise. Deterministic rival personas and memories, defense-relative play selection, and weekly winner/margin predictions are live and tested.
- Rejected/deferred “Build mentorship from scratch”: False premise. Mentorship already mutates offseason progression; the verified gap is that the player cannot select or clear the pair and the existing read-only UI promises an automatic result.
- Rejected/deferred “Add project-local authentication”: Rejected. The public game has no account flow; local auth would violate the Obelisk identity boundary rather than close a product gap.
- Rejected/deferred “Implement General Manager firing or game over”: Explicitly founder-direction-gated in Decisions and Task Board. This audit cannot invent that terminal product canon.
- Rejected/deferred “Claim a token-cost optimization”: No public metered language-model path exists. The selected community coordinator targets measured HTTP request load only.

## Three recommended design moves

1. Complete the pre-commit General Manager loop: expose the exact choice boundary and make draft-night offers deterministic, stale-safe, and player-directed.
2. Turn currently automatic or dead career systems into receipted agency: player-selected mentorship covenants and a canonical season stewardship report that also repairs cap and trade reputation truth.
3. Harden the public control plane: one accessible modal/shortcut contract, truthful retried participation deletion with coordinated snapshots, and an exact-revision backend runtime attestation gate.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| gm-choice-boundary-dossier | implemented | every catalog choice publishes a preview matching its executor mode/deadline/target; focused decision authority, commitment, weekly-plan, mobile and browser tests; desktop/mobile dark/light pixels for each boundary shape and defer path |
| on-clock-trade-market | implemented | draft-agency, draft-war-room, trade-plan, rival-offer, API-parity and save/restore tests; no duplicate prospect, stale commit, double advance or duplicate slot ownership; keyboard-safe desktop/mobile dark/light War Room pixels |
| backend-runtime-attestation | implemented | workflow source contract requires backend/runtime tests; container Node version equals tested workflow version; health sourceRevision equals exact GitHub SHA after deploy; focused Community contracts and post-deploy JSON assertion green |
| mentorship-covenants | implemented | authority/API parity and franchise-scope tests; save migration and exactly-once offseason application; traded, released, ineligible, duplicate and CPU fallback cases; progression parity plus roster-panel rendered states |
| gm-stewardship-report-authority | implemented | cap grade changes with canonical cap summary instead of a ghost field; trade net Approximate Value derives from receipted direction and season stats; draft ROI includes actual drafted players; season report persists idempotently and renders in Season Review; focused engine/UI tests and dark/light mobile/desktop pixels |
| community-participation-truth | implemented | success, offline, 401, 5xx, reload and capability-rotation deletion tests; no queued telemetry after decline; 60-second floor, ETag/304 preservation, single-flight and backoff request-count tests; pending/success/failure accessible UI pixels |
| decision-modal-interaction-contract | implemented | radiogroup state, initial choice, disabled Confirm and explicit skip DOM tests; active modal stack and topmost Escape unit tests; keyboard-only Playwright paths prove W/R/N/1-9 cannot mutate behind overlays; dark/light 390/768/1440 pixels for tactic and affected dialog states |
