# Latest Handoff — Session 107 → Session 108

> **Keep this heading shape.** Since S105 it is committed session authority: `parseHandoffCloseoutAuthority` reads the left-hand session, and `test/session-authority.test.js` fails if the live handoff and the newest SIL entry disagree.

## Where We Left Off

S107 was a clean start: F7 current, tree clean, synced. The startup brief was two days stale and was re-rendered fresh.

**S106's diagnosis was wrong, and the change it refused is now live.** S106 recorded that `session90-development-environment` could not express position-relative potential because "development deltas are applied to ratings and overall is recomputed with position weights", and prescribed modelling that inside the test. Re-derived before implementing, it did not survive one probe:

```
unchanged S106 tree, one offseason, four seeds       gap vs declared curve
  survivors only (what the gate read)                +0.149 .. +0.238   (canonical 0.235 of a 0.25 tolerance)
  every progressed player, captured before the call  -0.022 .. +0.022
  environment's own contribution (wired - zeroed)    -0.035 .. -0.005
  pre-S90 environment through the same matched run   +0.831 .. +0.903
```

`applyAgingProgressionAndRetirements` progresses a player and **then** rolls `retirementChance` on the overall it just produced (x0.86 at 90+, x1.08-1.18 at 74 and below). Keeping only survivors selects on the outcome. S106's generator changed who retires, and that is all the gate saw.

## What shipped

- **The S90 gate measures the population the mechanism was applied to.** Every progressed player at the engine's measured potential centre, with the environment isolated by a matched seeded offseason (wired vs zeroed tilt) — the engine is the baseline, nothing of it is re-implemented in the test. **Tolerance 0.25 → 0.10** (largest reading 0.056 across four seeds on both generators). Negative controls: the pre-S90 environment must fail; the survivor reading of the same run must exceed the progressed reading.
- **Position-relative potential.** `src/domain/playerFactory.js`: trait-sized headroom above the player's own overall (SUPERSTAR 6-18, HIDDEN 3-14, NORMAL 0-9, BUST 0-3), whole at 23, closed by 31, tapered linearly over the **55** points below 99, drawn in the same single `rng.int` slot, finite inputs asserted in `resolvePotential`. Four seeds: above own potential **36.0-37.6% → 0.0%**, mean potential tracks the room (QB 82.1-83.3, TE 74.3-75.2), every mean overall and 90+ count unchanged to the decimal. Saved franchises keep their stored potentials.
- **`test/session107-position-relative-potential.test.js`** (core shard): generation property, room tracking, a position-blind negative control, `resolvePotential` rules and finite guards, and profile surfacing.
- **Two seed-pinned tests now sample.** The rival-offer negative control (re-pinned in S103, S104 and now) walks 620111/620108/620114/620115; home-field advantage pools three leagues. Both were classified as legitimate simulation shifts by measurement before being touched — home edge reads +0.028 at 2,000 games on the pair that read -0.009 at 220.
- **Record corrected** append-only: DECISIONS S107 Decision 1 supersedes S106 Decision 0's causal claim; TRUTH_AUDIT names the contradiction.
- **Player-facing:** POT columns and the profile narrative's development runway, which is no longer negative for a third of every new league. Release note on `public/status.html`.

## The calibration — read before touching the taper

```
canonical seed 20260306, ten seasons      elite 90+   dispersion   parity
  old position-blind draw                   2.8%        0.095       +0.043
  headroom, taper span 25                   2.4%        0.112         —      <- a cost, rejected
  headroom, taper span 40                   3.0%        0.101       +0.032
  headroom, taper span 55 (shipped)         2.1%        0.093       -0.001

seed 2026, same-seed control
  old draw (restored from HEAD, isolated)   3.4%        0.125       +0.021
  span 55                                   2.7%        0.108       -0.025
```

Dispersion falls monotonically with span, and the mechanism is clear. A narrow taper makes potential track overall almost one-for-one, and the trait term `(potential - centre)/20` then pays the players who are already highest. Elite density bounces around, which is noise on a tail statistic, so it was not used to choose. Absolute readings differ widely between seeds, which is why every comparison here is same-seed. Variants ran from isolated copies of `src/`, never from the worktree.

## Next work

- **Elite density's declared-population question — state it before writing any code.** At the end of the window, QB+OL hold **97%** of the 90+ cohort on the canonical seed (35/36). On seed 2026 that goes from **72%** under the old draw (41/57) to **91%** with span 55 (42/46). Position-relative potential made the cohort smaller and **more** concentrated, which is what anchoring potential to a position-scaled overall must do. The 90+ cut is position-blind; the First-Team All-Pro anchor is allocated per position. Write the question in DECISIONS first. Do **not** add a per-position arm as a route to a green gate, and do not move the 1.53% ceiling.
- Dispersion is `watch` at 0.093 against 0.08, and elite density is `watch` at 2.1% against 1.53%. Do not widen `stdDevDrift*`.
- Do not re-point the parity population (standing since S104).
- Ledger retention by session number (carried from S106) still wants its own session.
- The authoritative registry still reads `sparked` against a local contract of FORGE; do **not** flip the local contract.
- Delivered/reply-capable project-domain email, candidate-bound public-launch approval and authoritative lifecycle reconciliation remain independent launch evidence. Public launch remains **HOLD**.

## How the canonical receipt was earned — do not repeat these

- Never run ten-season probes beside a shard. Three of them timed `core` out at its 45-minute bound; alone it takes ~25 minutes.
- Never export `TEST_SHARD_TIMEOUT_MS` for `npm test`. `test/test-shard-progress.test.js` asserts the default, and the child tests inherit the environment.
- `runRealismVerification` simulates a copy: read end-of-window composition from `report.progression.end.rooms`, never from `session.league` afterwards.
- A shard that exits 1 with no TAP output is a runner-level failure. Re-run it alone before diagnosing (the long shard was 5/5 alone).

## Receipts

**Tests: every shard green on the final source, 1,471/1,471** (core 253, runtime 817, sim-contract 83, sim-realism 1 in one `all` run on the final tree; long 5 and studio 312 each alone), up from 1,463 in S106. **The combined source-bound receipt (`.cache/test-count.json`) was not produced and is not claimed.** In the final `all` run, `long` exceeded its 45-minute bound (exit 124, no test failed) with the machine at 100% CPU from other sessions' work; it passes 5/5 alone in 29.7 minutes.

**Clean-runner CI on `fac752fe`: success** (run `34816816943`) — unit shards core, runtime, sim-contract, sim-realism and studio, plus browser gates, all green on `ubuntu-latest`.

Reds this session surfaced and resolved, each classified before it was touched:

- The rival-offer negative control (seed shift; now samples).
- Home-field advantage (sampling noise; now pools).
- A stale audit render.
- An exported timeout override leaking into a studio test.
- A `core` timeout and a no-output `long` exit, both under this session's own probe load.

None was flaky, sibling drift or force-greened.

### Deployment

| | |
|---|---|
| Candidate | `fac752feda47a5448d312129cc576a269c9ab0f9` |
| Artifact digest | `bb8382f91956728cd384f6f255176f8222f71b62317902e8aecf9bf85f70c95e` — changed (from `449b6d36…`), because `public/status.html` carries a new release note |
| Staging | verified **14/14** · deployment `a9d06c47-dc29-4895-98ce-812a9c1392f0` · rollback `ff866b0a-117c-4ee2-868a-0b2f671c6317` · provenance report `reports/s107-staging.json` **10/10** |
| Visual QA | 98 `s107-*` captures bound to the candidate and digest, 0 blocking; 255 responsive states passed; retention recorded 98 new hashes (1,821 total), 65.5 MB → 49.9 MB |
| Backend runtime | run **34816816965** success — gate, `build-images (play)` and `build-images (api)` all green. `deploy-server` **skipped by design**: it runs only on a manual dispatch with `deploy_to_server` set (`deploy-backend.yml:104`), exactly as in S106. Images are built and published; no server rollout was dispatched, and none is claimed |
| Production | promotion run **34817136107** — gate, build and deploy all **success** · live origin provenance `reports/s107-production.json` **10/10**, serving `fac752fe` at digest `bb8382f9…` · push-triggered Deploy Pages `34816816986` cancelled by the dispatch, as expected |
| Performance | hosted receipt **verified**, bound to `fac752fe` |
| Release authority | **verified** — source and publication revision `fac752fe`, all four identities (staging, production, visual, performance) bound; `stagingAuthority` reconciled at the same revision |
| Doctor | `blockingFailing 0` · 11/12 · the standing warning is the registry SPARKED vs local FORGE drift |
| `launchReady` | **false** — unchanged (email delivery, founder approval, lifecycle authority). Technical deployment, not public launch |

**What the captures do and do not prove.** The roster at 1440px dark shows POT at or above OVR on every visible row, with veterans at no headroom and young players carrying room. The 390px light roster matches it. The draft-room prospect (77 OVR / 92 POT, EDGE) is a hardcoded fixture in `scripts/responsive-evidence.mjs` and is **not** evidence for this change. The status-page note was verified against the live staging origin (HTTP 200, 2026-09-13 note present), because the harness does not capture that page.
