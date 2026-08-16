# Audit — Franchise Architect: Football — Session 86

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay and app-release-gate: core-loop truth, decision consequence, first-run clarity, mobile/theme parity, static-host safety, exact staging identity, rollback, privacy, and honest launch holds; staging: stable Cloudflare Pages must prove the exact immutable candidate before direct-to-main publication; production promotion remains an explicit candidate-bound workflow_dispatch, never an automatic side effect of a main push
- Profile source: arc-profile registry authority, Session 85 handoff and task board, doctor JSON, the 1,102-test source-bound suite receipt, and two parallel live-code audit passes that read public/lib, public/app.js, src/engine, src/runtime, src/domain and src/app/api and executed the engine across fixed seeds
- Game-loop review: tightness 6 · progression 5 · session engagement 7 · retention 6 · soul fidelity 7 · overall 6.2
- Evidence caveat: Scored down sharply and deliberately from Session 85's 8.4. This is not new pessimism about the design; it is the first audit to execute the loop rather than read it, and execution showed that three of its load-bearing decisions do not reach the simulation. The weekly tactic is measurably inert (four tactics produce byte-identical 8-week league results on a fixed seed), the on-the-clock Draft button throws before submitting a pick, and the declared veteran aging curve arrives roughly five times weaker than specified. Loop tightness and progression are scored against measured behaviour, not intent. No real player cohort exists, so no retention or fun claim is invented.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Core loop / decision consequence / simulation truth | 3.0h | 10 | 6 | 23.0 | **weekly-tactic-reaches-simulation** — L1 plus a session-held pending-tactic slot consumed exactly once, preserved restore semantics, and a fixed-seed distribution regression proving the league result actually diverges. |
| 2 | FIRE | Core loop / draft / client correctness | 0.5h | 10 | 3 | 22.5 | **draft-pick-reveal-crash** — L1 plus a defensive empty-table guard and focused tests covering both pickAnalystLine and the in-row Draft click path. |
| 3 | HIGH | Simulation realism / progression / distributional truth | 3.0h | 8 | 7 | 20.0 | **veteran-progression-curve-fidelity** — L1 plus a seeded distribution harness asserting measured per-bucket overall movement against the declared ageFactors within tolerance. |
| 4 | HIGH | Progression authority / achievements / state shape | 1.5h | 8 | 4 | 18.5 | **gm-legacy-playoff-authority** — L1 plus carrying playoffSeed/playoffExit into the archived season row, correcting the fabricated fixture, and adding an engine-driven regression. |
| 5 | HIGH | First-run clarity / UI correctness / state shape | 1.0h | 8 | 3 | 18.0 | **cap-alert-contract-shape-authority** — L1 plus focused tests for the flagged/not-flagged boundary, the undefined-free headline, and the newly reachable positive signal. |
| 6 | HIGH | Save payload / snapshot parity / efficiency | 1.0h | 7 | 4 | 17.0 | **postseason-snapshot-payload-parity** — L1 plus extending the payload-budget guard into the postseason phase so the blind spot cannot reopen. |
| 7 | HIGH | Client runtime safety / concurrency / data integrity | 2.0h | 7 | 5 | 17.0 | **client-sim-job-exclusivity** — L1 plus rejecting concurrent simulate requests with an explicit conflict and single-flighting the launch control, with parity tests across both runtimes. |
| 8 | HIGH | Snapshot parity / owner state / release truth | 1.5h | 7 | 4 | 16.5 | **owner-confidence-snapshot-parity** — L1 plus spreading unknown owner keys through the rebuild and adding round-trip parity tests that guard the pattern, not just the field. |

Combined priority: **152.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “rival-GM persona surfacing”: Already wired end-to-end since Session 70; re-confirmed live this session. Session 84 reject still valid.
- Rejected/deferred “offline/service-worker support”: Already shipped Session 62; re-confirmed. Session 84 reject still valid.
- Rejected/deferred “Depth Chart drag-and-drop mobile parity”: No drag-and-drop exists to make parity work on; the surface is already button-based. Session 84 reject still valid.
- Rejected/deferred “communityEventContract.js / gistCredentials.js / pressRoomPanel.js untested-module claims”: Each is already covered — via a re-export shim, a behaviour-named test file, and a Playwright surfaces spec respectively. A naive filename grep misses all three; re-confirmed this session.
- Rejected/deferred “draft combine 40-yard-dash grade inversion”: Nearly reported, then disproved by execution. Better prospects do post slower raw 40 times, but _computeGrade correctly inverts time events, so the displayed grade still rises with talent (RB OVR 55 to 63.4, OVR 95 to 83.5) and the raw time is never rendered. Only the slope is dampened. Not a defect.
- Rejected/deferred “renderRehabCommandCenter vs renderWeekResults injury shape drift”: Looks like classic drift but injurySystem.js deliberately emits both the flat and nested shapes. Clean.
- Rejected/deferred “windowsHide spawn safety sweep”: Already gated by scripts/check-windows-hide.mjs; the only literal shell:true call site already sets windowsHide: true.
- Rejected/deferred “unbounded array growth across engine ledgers”: Thirteen candidate ledgers were checked and every one is capped at its write site. No finding.
- Rejected/deferred “src/runtime/rewindManager.js removal”: Header-deprecated with zero importers, but left alone per the read-before-deleting-orphan-modules rule; deletion is not this session's scope and carries no measured benefit.
- Rejected/deferred “cap space is non-binding across the league”: Measured and real (all 32 teams carry $92M-$112M of space against a $255M cap, and maxSalary is unreachable), but this is franchise economy calibration and design work, not a defect fix. Deferred to a dedicated session rather than smuggled into a correctness pass. Honest deferral, recorded.
- Rejected/deferred “narrative trigger shape drift, box-score long-play accumulation, fan-sentiment win band, missing Franchise Legends and GM Reputation DOM mounts, waiver table identity column”: All verified real and all genuinely unshipped, but ranked below the eight selected items. Recorded here in full so Session 87 can pick them up without re-auditing rather than being silently dropped.

## Three recommended design moves

1. Restore the three broken core-loop decisions first — the draft pick must submit, the weekly tactic must reach the simulator, and the cap alert must read the real contract shape — because each is a decision the player already believes they are making.
2. Then close the two snapshot-parity leaks (owner confidence log, postseason box scores) so a save/reload neither loses owner state nor spends 1.09 MB of the 5 MB browser budget on duplicate play-by-play.
3. Finish with the two calibration/authority items — playoff appearances must be derivable and the declared aging curve must be self-enforcing through a distribution test, so the engine's stated design and its measured behaviour can never silently diverge again.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| weekly-tactic-reaches-simulation | shipped | a fixed-seed regression test asserts the 8-week league result differs between blitz-heavy and no-tactic, inverting the exact probe that proved the defect; a no-tactic control run remains byte-identical to the pre-change baseline on the same seed; the pending tactic is consumed exactly once and cleared, so a second advance without a tactic is unaffected; the full source-bound Node suite stays green |
| draft-pick-reveal-crash | shipped | a focused test calls pickAnalystLine across seeds and asserts a non-empty string with no throw; a test drives the data-draft-player-id path and asserts the pick request is actually issued; pickAnalystLine returns an empty string rather than throwing if the line table is ever emptied; rendered dark/light desktop/mobile capture of the reveal modal, since this makes a previously unreachable surface visible for the first time |
| veteran-progression-curve-fidelity | shipped | a distribution test simulates multiple offseasons and asserts mean overall change per age bucket lands within tolerance of the declared ageFactors, making the curve self-enforcing; the test tabulates over a real simulated population rather than asserting on source text; developing and prime buckets are asserted alongside the veteran bucket so the fix cannot overshoot in one direction; the full source-bound Node suite stays green |
| gm-legacy-playoff-authority | shipped | a test simulates a real season through the engine and asserts a playoff team's playoffAppearances increments, with no hand-built season fixture; the archived season row carries the playoff fields so a restored session derives the same answer; a non-playoff team still yields zero, so the fix does not blanket-credit every team; the corrected existing fixture fails against the old read |
| cap-alert-contract-shape-authority | shipped | a test asserts a yearsRemaining 4 star produces no expiring-key alert and a yearsRemaining 1 star produces exactly one; a test asserts the headline never contains the literal string undefined; a test asserts the positive strong-cap-position signal is reachable for a healthy roster; rendered dark/light desktop/mobile capture of the Overview alert banner, since the banner's content changes |
| postseason-snapshot-payload-parity | shipped | a test drives a session through the postseason and asserts the persisted snapshot carries no playoff play-by-play; a test asserts the restored session still resolves the Super Bowl result and bracket; the save-payload budget assertion is extended to a phase where latestPostseason is actually populated, closing the structural blind spot; measured before/after snapshot size is recorded rather than asserted only structurally |
| client-sim-job-exclusivity | shipped | a test asserts a second simulate request is rejected with a conflict while a job is queued or running; a test asserts completed job records are pruned after their TTL; a test asserts the single-flight guard prevents a double launch from advancing the session twice; server and client runtime parity is asserted rather than assumed |
| owner-confidence-snapshot-parity | shipped | a round-trip test asserts confidenceLog survives toSnapshot/fromSnapshot for every team; a round-trip test asserts patience is bit-identical after restore and that the derived band does not move; a test asserts an owner key added after the whitelist was written still survives, guarding the pattern rather than the single field; the existing owner-confidence suite is extended to cover the restore path it currently never exercises |
