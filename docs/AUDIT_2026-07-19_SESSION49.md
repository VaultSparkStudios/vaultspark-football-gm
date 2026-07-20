# Audit — Franchise Architect: Football — Session 49

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game/app
- Rubric: infrastructure-weighted product rubric; staging: github-pages
- Profile source: live code, direct runtime shard, current startup brief, project skill profile, authoritative arc profile, and app release-gate evidence
- Game-loop review: tightness 8.7 · progression 8.9 · session engagement 8.5 · retention 8.3 · soul fidelity 9 · overall 8.7
- Evidence caveat: No current playtest corpus or private creative bible is available in this public repository. Scores are provisional and derive only from executable browser, simulation, persistence, and regression contracts; no user sentiment is fabricated.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Release truth / web hardening / public trust | 3.0h | 10 | 9 | 41.5 | **public-origin-release-contract** — Create one public identity/deploy contract consumed by build and smoke checks; repair all repository/community links; ship a static health receipt, footer manifest, rollback runbook, and responsive parity ledger; make the artifact publish its commit/style fingerprint; add a canonical-origin release report that distinguishes source-fixable failures from external edge/email gates; and send the registry-origin checker defect through signed Ark cargo without touching Studio Ops. |
| 2 | FIRE | Runtime architecture / simulation truth / observability | 5.0h | 10 | 9 | 39.0 | **weekly-command-parity-envelope** — Extract a shared weekly-command executor that validates the full payload before mutation, applies GM choice and ephemeral tactics in a deterministic order, restores temporary plans in finally, returns one versioned command/receipt envelope, and is used by both runtimes; add same-seed state/receipt parity, invalid-command non-mutation, and failure-cleanup tests. |
| 3 | FIRE | Persistence / security / compatibility | 4.0h | 10 | 8 | 34.0 | **save-compatibility-integrity-boundary** — Create one snapshot compatibility inspector used by migration, import, browser saves, and file saves; reject future/invalid structures with stable recovery codes; stamp and verify file-save integrity like browser saves while preserving explicitly identified legacy slots; keep the active session untouched on failure; and surface actionable recovery evidence through both APIs and the browser. |
| 4 | HIGH | Browser concurrency / speed / user trust | 4.0h | 9 | 8 | 29.0 | **hydration-authority-epochs** — Introduce a small authority-epoch primitive keyed by league, runtime, controlled team, year, and week; advance it on authoritative dashboard replacement; make background and entity-scoped loaders commit only when their captured epoch/filter key remains current; count discarded stale responses in source-derived browser observability; and add deterministic deferred-response tests plus a visible sync-health row. |

Combined priority: **143.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “Rebuild or re-list Rehab Command, Gist custody, tactical film, GM commitments, Potential, themes, or mobile decision work”: Rejected as phantom work: each surface is present in live code and covered by direct runtime/browser tests from Sessions 46–48.
- Rejected/deferred “Flip FORGE/SPARKED or claim launch readiness”: Deferred honestly: no received-message receipt proves football@playfranchisearchitect.com forwarding/copying, and authoritative registry drift is not launch evidence.
- Rejected/deferred “Extract every GameSession domain service in one rewrite”: Culled as an unsafe façade-first refactor. The bound service scaffolds are not production delegates; the weekly command boundary is the smaller root seam with immediate parity evidence.
- Rejected/deferred “Add paid telemetry, hosted AI commentary, or a backend feedback service”: Rejected by the internal-first, cost-neutral, and observability-honesty ladders; current gaps are deterministic local architecture problems.
- Rejected/deferred “Add weather or stadium systems before runtime truth is unified”: Culled below the current infrastructure priority floor. It remains a valid future immersion direction only after command parity and save safety are proven.
- Rejected/deferred “Treat the passing baseline suite as proof that these contracts exist”: Rejected: the direct runtime shard passes 175/175 but contains no weekly-command adapter parity test, future-schema rejection, file integrity verification, or stale-loader race test.

## Three recommended design moves

1. Make the public origin prove its own deploy currency, repository identity, rollback path, static health, and footer/parity contract without mistaking skips for passes.
2. Replace duplicated week advancement with one shared command envelope so tactics, decisions, receipts, cleanup, and runtime behavior cannot drift.
3. Make every save cross the same version, structure, integrity, and recovery boundary before it can replace the active league.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| public-origin-release-contract | shipped | Focused public/release tests: 29/29 pass,Pages build and static smoke pass,Footer manifest: 7/7 destinations complete,Ark repo-question receipt: 01JTUQRA8780576DEF65968F04,External edge-header and email-forwarding gates remain honestly blocked |
| weekly-command-parity-envelope | shipped | Shared src/runtime/advanceWeekCommand.js used by both adapters,Invalid-command non-mutation, failure cleanup, and same-seed parity tests pass,Concurrent bootstrap fallback coalesces to one authority event,Complete runtime shard: 182/182 pass |
| save-compatibility-integrity-boundary | shipped | Future schema and malformed shape rejection tests pass,File corruption and unknown-integrity-algorithm tests pass,Legacy unstamped slots remain explicitly supported,Rejected browser import proves active-league preservation,Complete runtime shard: 182/182 pass |
| hydration-authority-epochs | shipped | Authority epoch primitive rejects old-team and slower same-filter responses,Roster, contracts, calendar, scouting, depth, history, settings, owner, and observability writes are fenced,Settings exposes source-derived authority epoch and stale-response discard count,Complete runtime shard: 182/182 pass |
