# Audit — Franchise Architect: Football — Session 87

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay and app-release-gate: consequential General Manager decisions, simulation truth, mobile/theme parity, static-host safety, exact staging identity, rollback, privacy, and honest independent launch holds; staging: stable GitHub/Cloudflare Pages staging must prove the exact immutable candidate before direct-to-main production promotion; public sanitization and CANON-053 rendered-pixel evidence are mandatory
- Profile source: arc profile, S86 handoff, live canon adoption, current source tree, fixed-seed GameSession probes, DOM-id cross-checks, and current deployment receipts
- Game-loop review: tightness 6.5 · progression 6 · session engagement 7 · retention 6 · soul fidelity 7.5 · overall 6.6
- Evidence caveat: S86 restored the weekly tactic, draft pick, and aging curve, but S87 measured the next load-bearing fiction: the $255M salary cap cannot currently constrain a single opening roster. Two authored pressure systems are unreachable, and four visible evidence surfaces either lose their source or have no mount. No real cohort exists, so retention remains unproven rather than inferred from feature count.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Franchise economy / decision consequence / simulation realism | 5.0h | 10 | 9 | 32.1 | **binding-franchise-economy** — L1 plus a versioned exported market-salary authority, fixed-seed multi-league distribution tests, explicit existing-contract preservation, and UI-visible cap-pressure proof. |
| 2 | FIRE | Narrative engine / General Manager pressure / feedback loop | 3.0h | 9 | 7 | 27.1 | **reachable-pressure-narratives** — L1 plus explicit source adapters, owner-event dedupe against the existing ultimatum path, and fixed-seed end-to-end event-to-decision tests. |
| 3 | HIGH | Fan pressure / record authority / weekly feedback | 1.5h | 8 | 6 | 26.6 | **fan-sentiment-reads-live-record** — L1 plus explicit record-source precedence, end-to-end weekly tests, and browser-visible score/reason coherence. |
| 4 | HIGH | Stat integrity / box score / season records | 1.5h | 8 | 5 | 22.1 | **long-stat-max-semantics** — L1 plus direct accumulator coverage and a fixed-seed full-game invariant comparing player long stats to play-by-play maxima. |
| 5 | HIGH | UI/UX / dynasty identity / feedback surfaces | 1.0h | 7 | 4 | 17.7 | **mount-authored-legacy-surfaces** — L1 plus accessible labels, DOM contract coverage, empty-state behavior, and rendered-pixel inspection in both themes/viewports. |
| 6 | MEDIUM | UI/UX / roster action clarity / data projection | 1.0h | 6 | 3 | 11.4 | **waiver-player-identity** — L1 plus orphan-safe projection, player-column decoration, and focused runtime/browser coverage. |

Combined priority: **137.0**.

## Premise verification and rejected phantom work

- Rejected/deferred “new AI coach or paid inference layer”: Rejected. The game is intentionally zero-backend for its core loop, no AI capability gap blocks these findings, and adding variable-cost inference would violate the free-tier discipline without improving the measured defects.
- Rejected/deferred “security/auth rewrite”: Rejected for this audit. No new account-bearing flow is being introduced, franchise command authorization is already centralized, and public launch remains held on external Obelisk relying-party proof rather than replaced with local auth.
- Rejected/deferred “raise the salary cap or lower cap-alert thresholds”: Rejected as force-green. The $255M league rule is the declared authority; the defect is the salary distribution beneath it. Alert thresholds already reveal the problem honestly.
- Rejected/deferred “retroactively rewrite existing signed contracts”: Rejected. Existing saves keep their negotiated agreements; the versioned market curve applies to newly generated or newly signed contracts and becomes binding through normal contract turnover.
- Rejected/deferred “replace player IDs inside the persistent waiver ledger”: Rejected. Player IDs are the correct durable authority. The browser-facing dashboard projection should join names/position/overall without duplicating mutable player data in saves.
- Rejected/deferred “launch readiness from technical deployment success”: Rejected. Technical deploy authorization is independent from Zoho receipt/reply proof, lifecycle authority, founder public-launch approval, and Obelisk relying-party verification.

## Three recommended design moves

1. Make scarcity real first: replace the nearly linear contract formula with one versioned market curve whose fixed-seed distribution puts most opening teams inside a meaningful cap-management band without starting any team illegal.
2. Repair the consequence chain next: adapt live team chemistry, owner patience/expectation, and season records into the exact shapes consumed by narrative and fan-pressure systems, with end-to-end tests proving the player can actually receive and answer the authored pressure.
3. Finish at the evidence boundary: use max semantics for long plays, project player identity onto waivers, and mount the already-authored Franchise Legends and GM Reputation renderers; then inspect every affected surface in both themes and both target viewports.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| binding-franchise-economy | shipped | fixed-seed multi-league test proves a monotonic OVR salary curve with meaningful elite scarcity and reachable configured maximum band; opening-league distribution proves no team starts over the cap and a strong majority starts within a declared competitive cap-space band; existing explicit salary offers and persisted contracts remain unchanged; overview/contract surfaces visibly reflect the corrected cap pressure |
| reachable-pressure-narratives | shipped | a live low-chemistry five-loss team can emit CULTURE_CRISIS through runNarrativeChecks and generate the decision; a live critical owner expectation can emit one OWNER_ULTIMATUM narrative without duplicating the existing commitment or inbox notice; other teams never pressure the controlled General Manager; rendered decision pressure is visible in desktop/mobile dark/light evidence |
| fan-sentiment-reads-live-record | shipped | same owner context with 8-2 vs 2-8 records yields correctly ordered approval; weekly update uses the live team season without requiring a dashboard render; fan card reason, trend and score stay internally coherent |
| long-stat-max-semantics | shipped | multiple plays in one game retain only the maximum long value; season merge remains maximum across games; passing/receiving/rushing long cannot exceed the longest source play |
| mount-authored-legacy-surfaces | shipped | DOM contract test proves both IDs exist exactly once; renderer test proves non-empty source data becomes visible; desktop/mobile dark/light screenshots are inspected and hash-bound |
| waiver-player-identity | shipped | dashboard waiver rows include id, player, pos and overall for live players; orphaned legacy entries degrade to an explicit unavailable label rather than throw; the browser waiver table renders a clickable/decorated player identity |
