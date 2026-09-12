# Latest Handoff — Session 106 → Session 107

> **Keep this heading shape.** Since S105 it is committed session authority: `parseHandoffCloseoutAuthority` reads the left-hand session, and `test/session-authority.test.js` fails if the live handoff and the newest SIL entry disagree.

## Where We Left Off

S106 was a clean start — F7 current, tree clean, brief coherent.

**The finding: potential and overall were never measured on the same scale.** `randomPotential` drew one band for every position (SUPERSTAR 84-98, HIDDEN 76-94, BUST 58-76, else 68-90) while `overall` is a position-**weighted** average of position-**biased** attributes. Only one of the two knew what position the player plays, and every system that reads their difference — development, reversion, scouting, elite density — inherited that.

Measured at generation, four seeds, 8,832 rostered players, no simulation:

```
                       mean OVR   mean POT   above own potential
QB                       81.7       80.3           51.8%
OL                       80.4       79.8           49.0%
WR / DB / RB / DL / LB  74.9-77.6  ~80            30-38%
TE                       73.6       80.8           22.7%
league                              ~80 flat       36.8%
90+ in a fresh league: 45 players — 34 OL, 11 QB, zero in any other room
```

That is the generation-side root of the elite-density watch S103, S104 and S105 each circled from above.

## What shipped — and what was refused at the gate

**The headline change is NOT in the code.** It was implemented, measured, re-fixed, measured again and reverted; `src/` carries a 37-line comment recording the measurement and nothing else, verified by `git diff` as zero behaviour change. Read "The measurement that decided the shape of the fix" below before re-landing it, and read this first:

`test/session90-development-environment.test.js` asserts that one offseason moves the league by its declared curve **and nothing else**. With position-aware potential it read **0.285 against a 0.25 tolerance**, and it **stayed red at 0.289 after the obvious follow-up fix — per-room trait centres — was also implemented and measured**. The cause is not a miscentred term: reversion's mean contribution measured **exactly 0.000**, and using the engine's measured trait centre made the gap slightly *worse* (0.297). Development deltas are applied to **ratings**, and overall is recomputed with **position weights**, so changing *which* players move changes aggregate OVR even when the delta's mean is zero — and taking the potential gap from mixed (37% negative) to uniformly positive is exactly that redistribution. Closing the gate would have required duplicating the engine inside the test or widening its tolerance. Both refused.

**So the next session's item is the TEST, not the generator:** make its declared curve model the rating-level, position-weighted application it is compared against, keep the +0.84 S90 subsidy as its negative control, and only then re-land position-relative potential. The generator finding is real, measured across four seeds, and worth landing once the gate can express it.

### Shipped

- **The ledger-budget gate got its population** (see below).
- **The brief reports the authority that exists on disk**, recomputed after its own self-heal.
- **The doctor remedy prescribing a contractually forbidden writer is deleted**, with a test to keep it gone.
- **Ledger ordering is guarded**: this session appended its entry *above* the previous one in four ledgers at once, and a test now fails when a newest-last ledger does not end with its highest-numbered entry.

### Measured, implemented, reverted

- **Potential is headroom above the player's own overall** — sized by development trait, tapered to nothing by age 31, damped as he approaches the 99 ceiling, and drawn in the **same stream slot** as the old value (one `rng.int`), so no seeded league's downstream draws shift. Above-own-potential **36.8% → 0.0%**; mean potential now tracks the room (QB 85.8, OL 84.0, TE 77.2); **every mean overall is unchanged to the decimal**, which is the evidence the stream held.
- **The ledger-budget gate got its population.** WORK_LOG (213 KB) and TASK_BOARD (206 KB) were never in `ROLLABLE_LEDGERS`, though the roller's own header has called TASK_BOARD append-only since S94. Both registered with directory, order and both heading eras, then rolled: **572 KB → 244 KB**, S105 entries and the standing `Now`/`Next` sections intact. A test now derives the population from disk.
- **The brief reports the authority that exists on disk**, recomputed after its own self-heal (S105's deferred finding).
- **The doctor remedy prescribing `check-last-session-summary.mjs` is deleted** — the contract forbids that path, `doctor.mjs` defines no such check, and a test now asserts no remedy names a forbidden file.

## The measurement that decided the shape of the fix — read this before touching potential again

Position-aware potential **on its own** made two gates worse, on the canonical seed over ten seasons:

```
                    S105 inherited   position-aware only   shipped (ceiling-damped)
elite 90+ density   2.8%  watch      5.3%  OUT OF RANGE    1.8%  watch
dispersion drift    0.095 watch      0.157 OUT OF RANGE    0.083 watch
parity mean drift   +0.043 on-target +0.065 on-target      +0.034 on-target
```

**The follow-up fix was measured too, and it was worse on both counts.** Per-room trait centres (a player differentiated against his own room's mean potential rather than the league's) is the principled next move once potential is position-relative — and it left the S90 gate red at **0.289** while moving the ten-season arms the wrong way against the damped league-centre version:

```
                    shipped baseline   position-aware + damped   + per-room centres
elite 90+ density   2.8%  watch        1.8%  watch              2.5%  watch
dispersion drift    0.095 watch        0.083 watch              0.085 watch
parity mean drift   +0.043 on-target   +0.034 on-target         +0.058 on-target
```

Do not re-land per-room centres as part of the generator work; on this evidence they cost accuracy and bought nothing at the gate.

**The defect was load-bearing.** A third of the league sitting above its own potential was a standing *downward* pull in the reversion term; removing it left only upward pull, and the two rooms whose ceilings rose most are exactly the ones that feed elite density. Damping headroom by proximity to the ceiling restores a brake that is defensible on its own terms — a player at 70 keeps nearly all his room to grow, one at 92 keeps a fraction. **No threshold was moved, and both arms that remain outside their on-target bands are still reported as `watch`.**

## Next work

- **Elite density is `watch` at 1.8% against a sourced 1.53% ceiling — the closest this project has measured** (S91 2.07%, S102 3.5%, S103 3.3%, S105 2.8%). The residual is now a different question: the 90+ cut is **position-blind** while First-Team All-Pro is allocated **per position**. That is the declared-population question S102-S104 settled for the parity gate, in a new place. Take it as its own item, state the question first, and **do not adopt it as a route to a green gate**.
- **Dispersion drift is `watch` at 0.083 against an on-target ceiling of 0.08.** Do not widen `stdDevDrift*`.
- **Do not re-point the parity population** (standing since S104).
- **Ledger retention is positional, and the live files prove it.** The SIL still holds S78/S79/S80 above its modern block and WORK_LOG still holds S87/S95/S96, because the roll keeps the last N entries *in file order* while these files have never been strictly ordered. Nothing is lost. Retention by session **number** is the real fix and means reordering within a live file — a history rewrite that wants its own session. S106 fixed the half it caused itself: appending the new entry **above** the previous one in four ledgers at once, now guarded by a test asserting every newest-last ledger ends with its highest-numbered entry.
- The ten-season figures here are **one seed**; the generation figures are four seeds with no simulation. A cross-seed ten-season confirmation of the new generation shape has not been run.
- The authoritative registry still reads `sparked` against a local contract of FORGE; do **not** flip the local contract.
- Delivered/reply-capable project-domain email, candidate-bound public-launch approval and authoritative lifecycle reconciliation remain independent launch evidence. Public launch remains **HOLD**.

## Receipts

**Canonical Node receipt: 1,463/1,463 across six shards** — core 245, runtime 817, sim-contract 83, sim-realism 1, long 5, studio 312 (up from 1,458/1,458 in S105).

The full `npm test` run read **1,461/1,463**: every behaviour shard green on its first pass, and **two self-caused studio reds that are one defect seen from two gates** — `public-compliance` and `session94-public-surface` both reported `status.html`'s newest release note at session 104 against a `lastSession` of 106, two unpublished against a tolerance of one. Fixed at source by writing the note, and the studio shard re-run green at 312/312. Neither red was flaky, sibling drift, or force-greened.

**The note says nothing changed, because nothing did.** S105 and S106 shipped no player-facing surface, and the freshness gate counts sessions rather than features — so the honest entry is one that says so in players' terms, records that the ceiling-scale repair was built, measured twice and taken back out, and states that saved franchises are untouched. A status page that only speaks when there is something to boast about is not a status page. That is the same reasoning as S104's DECISIONS 14, applied to a session with nothing to sell.

An earlier full run in this session (before the revert) read 1,450/1,452 and is superseded; its numbers describe code that is no longer in the tree.

Other gates green at the final tree: `check-audit-premises` 1 verified · 3 resolved · **0 open decay** · SIL rolling-status current · every newest-last ledger ends at S106 · the ledger population derived from disk covers all six ledgers.
