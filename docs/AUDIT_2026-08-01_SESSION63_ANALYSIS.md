# Audit — Franchise Architect: Football · Session 63 · 2026-08-01

Source of truth: live code read this session. Every premise below was verified against the
working tree before it was ranked — no item was carried forward on the strength of a prior
report, and two candidates were dropped after the live check contradicted their premise
(see *Rejected on live evidence*).

Entry state: SIL 995/1000 · doctor `blockingFailing 0` · 0 human-blocked items ·
S62 Unified Genius List **exhausted** (10 primary + 3 second-order closed) ·
4 honest deferrals carried in `## Next`.

---

## The through-line

Sessions 46–62 built an extraordinarily deep franchise sim: rival GMs that make offers,
owners whose patience drifts on receipts, CPU free-agency bidding, a coaching lineage tree,
a continuity ledger with press memory. The depth is real.

This audit found that three of those systems are **load-bearing but not actually
load-carrying** — they run every week, produce output the player sees, and are wrong or
inert in ways no test asserts and no report surfaces:

1. The command layer has **no concept of which team you are allowed to act for**.
2. The press room prints **the same quote forever**, with its best clause permanently blank.
3. The offense **never looks at who it is playing**.

Each is a single root cause with a wide blast radius. That is the shape of this session.

---

## Ranked plan

| Rank | Tier | Item | Category | Effort |
|---:|---|---|---|---:|
| 1 | FIRE | `franchise-authority-boundary` | Security · competitive integrity · multiplayer | 3.5h |
| 2 | FIRE | `press-room-truth` | Correctness · narrative fidelity | 2.0h |
| 3 | FIRE | `opponent-aware-gameplanning` | Simulation realism · depth | 3.5h |
| 4 | FIRE | `interactive-press-conference` | Engagement · narrative agency | 3.5h |
| 5 | HIGH | `coaching-market-authority` | Game depth · progression · integrity | 4.0h |
| 6 | HIGH | `tablet-decision-deck-parity` | UX · mobile/tablet reach | 1.5h |

---

### 1 · FIRE — `franchise-authority-boundary`

**Premise (verified live).** No mutating command in the game checks that the acting team is
the team you control. Confirmed by reading every mutation seam:

- `src/server.js:1209` `POST /api/owner` → `updateOwnerState({ teamId: body.teamId, … })`
- `src/server.js:1150` `POST /api/staff` → `updateStaff({ teamId: body.teamId, … })`
- `src/runtime/GameSession.js:2348` `updateOwnerState` — resolves `teamById`, no authority check
- `src/runtime/GameSession.js:2302` `updateStaff` — same
- `src/runtime/GameSession.js:3286` `setDepthChart` — validates the *roster*, not the *actor*
- `src/runtime/GameSession.js:3394` `releasePlayer` — validates player-on-team, not actor
- `src/runtime/GameSession.js:3142` `setPracticeSquad` · `:3464` `claimWaiver` — same shape

`grep -n "controlledTeamId" src/runtime/GameSession.js` returns 40 hits and **not one of them
is an authorization check on a mutation**. Every hit is a default-parameter convenience
(`teamId = this.controlledTeamId`) — which is exactly the trap: the parameter *looks* like a
guard and is in fact an invitation.

**Blast radius.** A client can `POST /api/staff` with a rival's `teamId` and set their head
coach's `playcalling`/`development`/`discipline` to 40, or `POST /api/owner` and set a rival's
`staffBudget` to the 10M floor and `ticketPrice` to the 450 ceiling — draining their fan
interest and revenue for the rest of the franchise. Both fields are live inputs to the
simulation (`GameSession.js:349` budget bonus, `:520` staff quality, `:2487` revenue,
`:2505` fan interest). The player can also release rivals' stars, garbage their depth charts,
and demote their starters to the practice squad. The competitive premise of the entire
single-player game is unenforced.

**Multiplayer is worse.** `src/runtime/multiplayerSession.js:98` stamps the authoritative
`controlledTeamId` onto each queued intent — and then `applyIntents` (`:156`) passes
`intent.payload` straight to `session.call(...)` **without using it**. The correct team is
known, recorded, and discarded one function later. Any lobby member can queue a `release`
intent against another member's roster.

**The one thing this must not break.** `releasePlayer`, `setDepthChart`, and the rest are
also called internally by CPU AI maintenance for all 31 other teams. The guard therefore
belongs at the **command boundary**, not inside `GameSession`. This repo already has the
right pattern for that: S61's shared Architect Thesis handler and S62's dashboard payload
parity both put one authority behind both adapters.

**Ship.** `src/runtime/franchiseAuthority.js` — a single seam declaring, per guarded command,
which body field carries the acting team; `authorizedTeamIds(session)` derived from the
controlled team (plus every claimed lobby team in Commissioner Mode); and a 403 with
`reasonCode: "team-authority"` naming what you *are* allowed to act for. Wired into
`src/server.js` **and** `src/app/api/localApiRuntime.js` so parity is structural rather than
maintained by hand. `applyIntents` binds `teamId` from the intent slot, overriding payload.
Regression coverage asserts the same verdict from both adapters for every guarded route, and
asserts CPU AI maintenance still mutates rival teams freely.

---

### 2 · FIRE — `press-room-truth`

**Premise (verified live, numerically).** The post-game press room has printed the same quote
every week since it shipped, with its best clause permanently blank. Two independent defects
in `src/engine/pressConference.js`:

**(a) The quote seed is degenerate.** `pickQuote` (`:91`):

```js
const seed = (gameId?.charCodeAt?.(0) || 0) + (gameId?.charCodeAt?.(3) || 0) + slot;
```

`gameId` is `` `${home}-${away}-${week}` `` (`:147`). Every team code is three characters, so
`charCodeAt(3)` is **always the hyphen (45)** and `charCodeAt(0)` is the home team's first
letter. The week never enters the seed. Executed against real ids:

| gameId | seed | index into a 3-quote bank |
|---|---:|---:|
| `BUF-NYJ-3` | 111 | 0 |
| `BUF-NYJ-11` | 111 | 0 |
| `BUF-MIA-7` | 111 | 0 |
| `NYJ-BUF-3` | 123 | 0 |

Three quote banks of three, two follow-up banks of two, an analyst bank of two — 12 authored
quotes, and a given franchise sees one per tone, forever. Determinism was the goal; collapse
was the result.

**(b) `topPerformer` is structurally unreachable.** `:134`:

```js
const gameStats = game.playerStats?.[controlledTeamId] || game.stats?.[controlledTeamId];
```

The game object returned by `simulateGame` (`src/engine/gameSimulator.js:1935–1963`) has
neither key. Player stats live at `game.boxScore.playerStats.{home,away}`, grouped by
category (`:1929`), as rows with `yds`/`td` — not a flat `{ name, passingYards, … }` map keyed
by team id. `gameStats` is therefore always `undefined`, `topPerformer` is always `null`, and
six of the twelve templates silently take their degraded branch — `"The whole unit showed
up."` instead of naming the player who actually won the game.

This is the highest ratio of felt quality to effort in the audit. The narrative engine is
authored and shipped; it is being thrown away at two lines.

**Ship.** Replace the character-sum seed with a real deterministic hash over the full
`gameId` **plus** year, week, tone and slot, so variety is wide and replays stay identical.
Read the top performer from the true box-score shape, scoring across passing/rushing/receiving
/defense rows, resolving the controlled team's `home`/`away` side correctly. Regression
coverage asserts (i) a 17-week season produces materially varied quotes per tone rather than
one, (ii) the same seed replays byte-identically, and (iii) `topPerformer` resolves to a real
player name from a real simulated game — the test that would have caught this originally.

---

### 3 · FIRE — `opponent-aware-gameplanning`

**Premise (verified live).** Carried honest deferral from S62 (`context/TASK_BOARD.md → Next`),
re-verified against the working tree rather than trusted:

`buildTeamContext(league, teamId, rng)` (`src/engine/gameSimulator.js:501`) takes no opponent
and returns no opponent-derived field. At the call site (`:1677–1678`) both contexts are built
independently. `choosePlayType` (`src/engine/playCalling.js:48`) is then invoked with
`offenseContext` only (`gameSimulator.js:758`).

The consequence is precise: the drive engine already computes `defenseContext.unitRatings`
with `runDefense`, `coverageShort/Medium/Deep`, `passRush` and `tackling` (`:715–718`) and
uses them to resolve *how well a play works* — but never to decide *which play to call*. A
team facing an elite secondary and a porous run front throws exactly as often as it would
against the inverse. Coaching staff, scheme identity and weekly plan all feed `passLean`
(`:562–569`); the opponent does not.

Note the layers that *are* already opponent-aware — `chooseRouteFamily` (`:337`),
`choosePassTargetProfile` (`:399`) and coverage shells (`:265`) all read `defenseContext`. The
gap is specifically the run/pass decision, which is the largest realism lever in the file.

**Ship.** A bounded matchup lean derived from the opponent's *relative* unit strengths, added
to the existing situational stack in `playCalling.js` — small enough to preserve calibration,
real enough to change behavior against extreme opponents, and clamped inside the existing
`0.22–0.86` envelope. Coaching quality gates how much of the edge a staff can actually
exploit, so a good coordinator is worth something concrete. The edge is surfaced to the player
in the pre-game tactical brief with a source-derived receipt naming the unit and the
direction — no hidden math. **Realism shards must stay green before and after**; this item is
not shippable if `sim-realism` moves outside tolerance.

---

### 4 · FIRE — `interactive-press-conference`

**Premise (verified live).** Carried honest deferral from S62, re-verified: the podium is
entirely passive. `generatePressConference` (`src/engine/pressConference.js:110`) picks a tone
from the result, unshifts 2–3 items into `league.newsLog`, and calls `recordPress`. The GM
never chooses anything.

What makes this the right session for it: the machinery it needs is **already built and
half-idle**. `continuityLedger.js` exports `recordPress` (`:206`) and `getLastPress` (`:222`),
and `followupKey` (`pressConference.js:75`) already models `promise-kept` / `promise-broken` /
`humbled` transitions with authored quote banks for each. The system was designed for a GM
who makes promises — and no GM has ever been able to make one. Every follow-up currently
fires off a tone the *engine* chose, not a commitment the *player* made.

The consequence surfaces it needs also exist and are already receipted: owner patience
(`ownerConfidence.js:88`), fan interest (`GameSession.js:2505`), and team chemistry.

**Ship.** After a controlled-team game, the GM picks one of three deterministic responses —
each with a distinct posture (back the room · take the blame · put the team on notice) and
bounded, receipted consequences on owner patience, fan interest and chemistry. A response
that makes a promise records it, and next week's `followupKey` resolves against **the player's
own words** instead of the engine's. Skipping is a first-class choice with its own honest
consequence, never a dead end. Deterministic from game state and choice — no randomness, no
hidden bonuses. Built on item 2's repaired press truth, so the quotes it offers are varied and
name real players.

---

### 5 · HIGH — `coaching-market-authority`

**Premise (verified live).** The Coaching Staff panel (`public/game.html:1200–1223`,
`public/app.js:1411–1428`) is a raw numeric editor: a team dropdown, a role dropdown, and
number inputs for `playcalling`, `development`, `discipline` and `yearsRemaining`, posted
straight to `POST /api/staff`. `updateStaff` (`GameSession.js:2302`) clamps them to 40–99 and
applies them via `applyStaffToCoaching`. The GM types `99` into three boxes, for free, for any
team, with no candidate, no salary, no contract and no market.

These are not cosmetic numbers — `GameSession.js:349` and `:520` feed staff quality and budget
into simulation outcomes. This is the last raw dev tool left in a game that has otherwise
become a serious franchise sim, and it is shipped to players in the live UI.

Meanwhile `src/engine/coachingTree.js` already models exactly the thing that should replace
it: `registerCoordinator` (`:108`), `promoteToHeadCoach` (`:147`), `getTeamCoachingLineage`
(`:182`) and `processCoachingCarousel` (`:228`), all wired through
`src/runtime/services/CoachingService.js`. There is a coaching-career world here that the
hiring surface completely bypasses.

**Ship.** A deterministic coaching market: a candidate pool drawn from the live coaching tree
(coordinators ready for promotion, recently displaced head coaches) plus external candidates,
each with derived ratings, scheme fit, salary and contract length. Hiring is priced against
`owner.staffBudget` and cash; firing carries dead money and an owner-confidence receipt.
The numeric editor is replaced by a choice between named people with tradeoffs. Item 1's
authority seam means the market only ever operates on the team you control.

**Scope discipline.** This item ships hiring and firing of *your* staff against a real market.
It does **not** ship GM firing — see the honest deferral below.

---

### 6 · HIGH — `tablet-decision-deck-parity`

**Premise (verified live).** The prioritized GM decision deck — the mobile loop S37–S41 spent
five sessions building — is unreachable on every tablet. `isMobileModeEnabled`
(`public/lib/mobileLoop.js:18–23`) auto-enables only at `window.innerWidth <= 480`. A 768px
iPad gets the desktop shell, whose `.side-menu` collapses to a single column at 640px
(`public/styles.css:1857`) — so the band above 480px receives the *worst* of both layouts: a
tall stacked nav and no decision deck.

This is the shippable half of S62's deferred `mobile-nav-tablet-parity`. It is separable
because it changes a reachability gate and its breakpoint, not the visual-evidence baseline:
the deck, the pressure stack, and the pending-decision flow are all already built, tested
(`test/mobile-loop.test.js`) and shipping — they are simply gated off.

**Ship.** Widen the auto-enable band to the tablet range with a breakpoint that matches the
CSS the layout already uses, keep the existing explicit user override (`MOBILE_PREF_KEY`)
authoritative in both directions so nobody is trapped in a mode they did not choose, and make
the gate re-evaluate on viewport change rather than only at boot. Regression coverage asserts
the band boundaries and the override precedence.

**Explicitly out of scope:** touch gestures and the 53-capture responsive re-baseline — see
the honest deferral below. Extracting this half does not license quietly absorbing the other.

---

## Honest deferrals — recorded as wins, not skipped silently

**`gm-firing-terminal-state`** — carried from S62; founder creative direction required
(recorded in `context/DECISIONS.md`, 2026-07-31). Re-verified live: `ownerConfidence.js`
floors patience at `0.05` and bands `<= 0.2` as `"critical"` with no terminal consequence, so
the premise is still accurate. The owner-pressure loop deliberately ships the pressure without
inventing the ending. **Deliberately not ranked** — shipping a game-over state without
direction would be inventing canon, and item 5 was scoped to stop short of it rather than let
it drift in through the coaching market.

**`tablet-touch-affordances`** — the *remainder* of S62's `mobile-nav-tablet-parity` after
item 6 extracts its shippable core. Live check confirms the two halves have very different
costs:

- The **decision-deck gate** is real and cheap. `public/lib/mobileLoop.js:22` returns
  `window.innerWidth <= 480`, so a 700px tablet gets the desktop shell and never sees the
  prioritized GM decision deck. That is item 6.
- The **touch-gesture layer** is real and expensive. `grep -rn "touchstart|swipe|pointerdown|
  touchend" public/ --include="*.js"` returns **0 hits** — there is no gesture surface at all.
  Adding one means re-baselining the 53-capture responsive evidence authority, which is a
  visual-evidence budget, not a code fix.

A correction worth recording: an earlier draft of this audit came close to deferring the whole
item on the grounds that `public/styles.css` carries 19 breakpoints including 980/900/760/720/
700, so the band "is styled." That reasoning was wrong — breakpoints existing is not the same
as the decision loop being reachable, and the touch-affordance count is genuinely zero. The
premise was re-verified rather than argued down, which is what promoted half of it to item 6.
**The gesture half stays deferred at its true size.**

---

## Rejected on live evidence — items that did not survive the premise check

Recorded so they are not re-proposed next session.

- **"Owner finances are stubbed / `revenueYtd` is dead state."** False. `processOwnerFinances`
  (`GameSession.js:2468–2514`) accrues per-game revenue from market size, ticket price and a
  fan-interest-driven attendance factor, debits weekly staff budget, and moves `owner.cash`.
  Gated behind `settings.enableOwnerMode`, reset each season at `:2528`. The loop is live.
- **"`staffBudget` and facilities are cosmetic."** False. `staffBudget` drives a bounded
  development bonus (`:349–350`) and a staff-quality threshold (`:536`); facilities feed
  training (`:488`), rehab recovery (`:504`) and analytics (`:261`). All three are simulation
  inputs. (What is *wrong* about them is that they are free to set — which is item 1, not a
  dead-code item.)
- **Codebase-wide incompleteness sweep.** `TODO`/`FIXME`/`XXX`/`HACK` across `src/` and
  `public/lib/` returns exactly one hit, and it is an intentional `501` guard for unsupported
  client-only methods (`localApiRuntime.js:1705`). There is no debt backlog hiding in markers;
  the real debt is behavioral, which is why every item above came from reading execution paths
  rather than grepping for markers.

---

## Infrastructure rubric

| Axis | Verdict | Evidence |
|---|---|---|
| Observability honesty | ✅ | doctor `blockingFailing 0`; the single warning (`registry SPARKED · local contract FORGE`) is a real sibling-owned lifecycle drift, correctly non-blocking, and is **not** to be resolved by editing a sibling tree |
| Secrets gateway | ✅ | audit clean; every capability this session needs is READY; no credential is required by any ranked item |
| Blocker honesty | ✅ | 0 open Human Action Required; both deferrals above are recorded with reasons, not hidden |
| Test surface | ✅ | 129 test files across 6 named shards; every item above ships with regression coverage in the correct shard |
| Adapter parity | ⚠️ → item 1 | the authority seam is the third system (after S61 thesis handler, S62 dashboard payload) to need explicit both-adapter parity; item 1 ships it structurally so there is no fourth |
| Cost | — | Max Plan flat-rate; notional only; no alarm |

---

## Execution order

`1 → 2 → 3 → 4 → 5 → 6`, then a second-order innovation pass.

Item 1 first because item 5 depends on its seam and because it is the only item that is
currently a live integrity hole. Item 2 before item 4 because there is no point making the
press room interactive while it prints one quote with a blank clause. Item 3 is independent
and gated on realism shards staying green. Item 6 is independent and last because it is the
smallest and touches a surface nothing else in this list touches.
