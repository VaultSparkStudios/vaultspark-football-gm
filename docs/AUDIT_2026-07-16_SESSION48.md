# Audit — Franchise Architect: Football — Session 48

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game
- Rubric: infrastructure-weighted product rubric; staging: github-pages
- Profile source: live code, context/PROJECT_STATUS.json, context/STUDIO_MANIFEST.json, startup brief, game skill profile, and authoritative arc-profile output
- Game-loop review: tightness 8.6 · progression 8.8 · session engagement 8.4 · retention 8.2 · soul fidelity 9 · overall 8.6
- Evidence caveat: No context/GAME_LOOP.md or recent docs/PLAYTESTS files exist and context/SOUL.md is intentionally public-safe only. Scores are therefore provisional and derive from executable simulation, browser, persistence, and test contracts rather than invented playtest observations.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Simulation truth / architecture / engagement | 6.0h | 10 | 10 | 40.0 | **injury-authority-rehab-command** — Move recovery into one facilities-aware injury authority; persist conservative, standard, and accelerated rehab plans; expose them through both runtimes; render a responsive Rehab Command Center with honest return/risk projections; and record source-derived recovery receipts. |
| 2 | FIRE | Observability / release truth / organization | 2.5h | 9 | 8 | 33.0 | **lifecycle-source-coherence-guard** — Create a machine-readable lifecycle coherence contract, wire it into studio tests and doctor, surface explicit local-versus-authoritative drift evidence, and ship a signed Ark correction request to Studio Ops without touching the sibling tree. |
| 3 | HIGH | Security / privacy / persistence | 3.0h | 9 | 7 | 23.5 | **secure-gist-sync-custody** — Use memory/session-only credential custody with explicit clear state and migration cleanup; never serialize or echo the token; prefer inline Gist content with bounded remote fallback; fetch and verify remote integrity sidecars; and add focused security/integrity tests plus accurate privacy copy. |

Combined priority: **96.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “Add tactical choices or postgame film”: Rejected as phantom work: opponent-aware tactical choices and source-derived Film Receipts shipped in Session 47.
- Rejected/deferred “Add player biographies, Potential, or milestone quests”: Rejected as phantom work: living dossiers, Potential visibility, and position-aware milestone quests shipped in Session 46.
- Rejected/deferred “Add a theme system or mobile decision surface”: Rejected as phantom work: dark/light/accent themes have direct browser contrast tests and the mobile General Manager decision deck is already wired.
- Rejected/deferred “Add generative AI commentary”: Culled: deterministic source-derived narrative systems already fit the product and preserve the cost-neutral static-host contract; an external model would add cost, latency, and truth risk without a verified gameplay gap.
- Rejected/deferred “Add a feedback form backend”: Culled: the zero-backend Commissioner feedback path already opens public-safe GitHub issue drafts; no evidence shows a backend would improve the loop enough to justify new data handling.
- Rejected/deferred “Flip launch/SPARKED state”: Deferred honestly: a real received-message receipt for football@playfranchisearchitect.com and current live-origin proof remain required. The portfolio registry's existing SPARKED value is drift evidence, not permission to fabricate readiness.
- Rejected/deferred “Add weather and stadium systems”: Culled below the current priority floor: they add flavor, but exact injury truth, lifecycle coherence, and credential safety compound across more of the current game and release surface.
- Rejected/deferred “Use paid observability or API products”: Rejected by the internal-first and cost-neutral ladder: current source-derived local telemetry and GitHub Actions are sufficient for this session's verified gaps.

## Three recommended design moves

1. Replace the double injury clock with one facilities-aware authority and make recovery strategy a visible General Manager decision with source-derived receipts.
2. Make FORGE/SPARKED posture self-validating across local truth surfaces and send the authoritative registry mismatch through Ark instead of silently normalizing it.
3. Keep user-supplied GitHub credentials memory/session-bound by default, eliminate masked-token corruption, and verify both inline and remote Gist payloads before import.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| injury-authority-rehab-command | shipped | Replaced the double decrement with one facilities-aware recovery authority; canonical injury probability now includes age, reinjury, multiplier, and team modifiers; Protect/Standard/Accelerate plans persist across snapshots; both runtimes expose the action; the responsive browser panel shows modeled pace/risk and clearance receipts. Focused injury/system/API/browser contracts pass 61/61; saturation also root-fixed stale-index camp-cut progress and cached source-identical team modifiers. |
| lifecycle-source-coherence-guard | shipped | Added a machine-readable FORGE launch contract, direct checker, doctor aggregation, and studio-shard coverage. Local blockingFailing is 0; authoritative SPARKED drift remains an explicit warning and signed Ark repo-question 01JTMN2KPU7561F0E9B389360E was shipped to Studio Ops without a sibling-tree edit. |
| secure-gist-sync-custody | shipped | GitHub tokens now live only in memory/tab session storage; legacy persistent copies are migrated then deleted; masked glyphs are rejected; the UI never rehydrates the secret; inline and bounded remote Gist files use correct precedence; remote integrity sidecars are verified. Focused credential/integrity tests pass 4/4 and browser/public contracts pass. |
