# Audit — Franchise Architect: Football — Session 78

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: game-type rubric with skill overlay: beta-readiness, zero-backend loops, vivid General Manager decision pressure over backend-heavy features; free-tier work must remain static-host-safe or local-only; staging: Cloudflare Pages static build; no backend dependency for any item in this audit
- Profile source: Dispatched a general-purpose live-code survey agent against src/, public/lib/, and test/ with the full list of previously-shipped systems (S60-S77) as an exclusion set, then independently re-verified every surviving candidate by reading exact file/line evidence before scoring.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Gamification / novel feature | 2.0h | 4 | 5 | 10.0 | **primetime-marquee-badge** — L1 plus a short deterministic label ('Division Showdown', 'Statement Game', 'Playoff Preview') selected from the qualifying signal, surfaced on both the schedule panel and the Sim-Watch overlay header, with a direct test asserting label selection against constructed standings fixtures. |
| 2 | FIRE | Gamification / novel feature (speculative) | 5.0h | 4 | 7 | 10.0 | **weekly-spread-prediction-minigame** — L1 plus point-margin guess, a running accuracy card (season streak, best streak, hit rate), and extending picks to all games in the current week (not just the controlled team), with a direct test proving zero engine-state mutation. |
| 3 | FIRE | Gamification / immersion | 1.0h | 5 | 3 | 9.5 | **td-flourish-touchdown-sound-hookup** — L1 plus a direct test asserting the call fires on a touchdown play fixture and does not fire on a non-scoring play, using the existing sound-toggle test pattern from rewardBeats.test.js. |
| 4 | HIGH | UI/UX accessibility | 1.5h | 5 | 2 | 5.5 | **dynasty-timeline-keyboard-accessibility** — L1 plus aria-expanded reflecting activeIdx, aria-controls pointing at the detail panel (matching the S76 stats aria-controls pattern), and a direct test covering keyboard activation and ARIA state. |
| 5 | HIGH | Speed/organization / test coverage | 1.5h | 4 | 2 | 4.4 | **audiofeedback-test-coverage** — L1 plus haptic (navigator.vibrate) gating, unknown-name safety, and a determinism check that the same call produces the same envelope parameters. |
| 6 | MEDIUM | UI/UX accessibility | 0.5h | 4 | 1 | 3.0 | **coaching-market-panel-aria-live** — L1 plus a test/coaching-market.test.js assertion that the mount markup or module-emitted markup carries the attribute. |
| 7 | MEDIUM | Correctness / display accuracy | 0.5h | 3 | 1 | 2.3 | **cap-war-room-expiring-zero-year-contracts** — L1 plus a direct test with both a 0-year and 1-year contract fixture asserting both are counted and a 2-year contract is not. |

Combined priority: **44.7**.

## Premise verification and rejected phantom work

- Rejected/deferred “Internal coaching-tree / staff-promotion narrative (mentor-protege lineage across coordinators and head coaches)”: False premise. src/engine/coachingTree.js already implements exactly this: a league.coachingTree graph of {nodes, edges} tracking mentor-protege lineage, scheme drift on promotion, and cross-team narrative continuity, wired through src/runtime/services/CoachingService.js and src/runtime/GameSession.js, covered by test/coaching-lineage-authority.test.js. Re-proposing it would duplicate a shipped S53 system (D-2026-07-23 'Coaching lineage is a domain authority with collision-safe identity').
- Rejected/deferred “pressRoomPanel.js appears untested by filename”: False premise. Covered by test/interactive-press-conference.test.js and test/press-room-truth.test.js.
- Rejected/deferred “Grep-flagged `|| 0` / `|| 1` patterns across public/lib as instances of the S67/S71 falsy-default class”: Spot-checked; the appCore.js instances found are legitimate display-time fallbacks for optional fields, not ledger-write-site laundering. The one live boundary issue found (Cap War Room's expiring-contract check) is reported separately as cap-war-room-expiring-zero-year-contracts, scoped correctly as a display miss rather than the systemic write-side bug class.
- Rejected/deferred “TODO/FIXME/HACK marker sweep across public/lib”: Zero matches found. Confirms the polish claim from prior sessions rather than surfacing hidden debt.

## Three recommended design moves

1. Ship the td-flourish hookup and the two accessibility fixes first — all three are sub-2-hour, zero-risk, and close real live-code gaps in already-shipped surfaces (same pattern as the S76 stats aria-controls fix).
2. Treat primetime-marquee-badge and weekly-spread-prediction-minigame as the session's genuine second-order design bets — both are additive, local-only, and explicitly non-causal (spread outcomes never feed the simulation), consistent with the counterfactual-replay and rehearsal decisions already on record.
3. Give audioFeedback.js the same constructor/module-seam test treatment CommunityStore got in S77 — it is the last live, multi-call-site browser module with zero coverage that was easy to verify by grep.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| primetime-marquee-badge | shipped | New pure module public/lib/marqueeBadge.js (deriveMarqueeBadge) derives Division Showdown/Playoff Preview/Statement Game labels deterministically from latestStandings, gated to week 6+. Wired into the schedule table (tabOverview.js renderSchedule) and the Sim-Watch overlay header (simWatchDirector.js renderHeader). test/marquee-badge.test.js: 12/12 pass, covering all three labels, the no-signal null case, the week-6 boundary, determinism, and malformed-input safety. |
| weekly-spread-prediction-minigame | shipped | New pure module public/lib/spreadPredictions.js (submitPrediction/resolveWeekPredictions/scorePrediction, localStorage-backed, keyed per-league) plus DOM surface public/lib/predictionPanel.js, mounted at #weeklyPredictionsPanel in game.html and wired from tabOverview.js renderSchedule() for every game in the current week (not just the controlled team's). test/spread-predictions.test.js: 18/18 pass, including a deep-frozen-object byte-identical-before/after proof that submission+resolution never mutate the game/schedule/league objects passed in. test/prediction-panel.test.js: 9/9 pass covering the empty state, pick form, pending/resolved-correct/resolved-incorrect receipts, and markup escaping. |
| td-flourish-touchdown-sound-hookup | shipped | public/lib/simWatchDirector.js exports a pure shouldPlayTdFlourish(snapshot) gate (fires only on forward-advance 'tick'/'next' reasons whose current play is a touchdown, never on scrub-back/speed/pause) called from renderFrame() to invoke the existing playSound('td-flourish'), which already gates on the sound-enabled setting. test/td-flourish.test.js: 7/7 pass, covering TD-fires, non-scoring/field-goal no-fire, no-refire-on-scrub-back, and pregame-safety. |
| dynasty-timeline-keyboard-accessibility | shipped | public/lib/dynastyTimeline.js season nodes now carry role="button", tabindex="0", aria-expanded reflecting activeIdx, and aria-controls pointing at a stable per-mount detail-panel id; a shared toggle() function backs both the click and keydown (Enter/Space, via exported isActivationKey) listeners so keyboard and mouse activation are provably identical code paths. test/dynasty-timeline.test.js: 10/10 pass, including a fake-DOM integration test (matching the modal-manager.test.js pattern, since this repo has no jsdom) proving Enter/Space expand and re-collapse a node exactly like a click. |
| audiofeedback-test-coverage | shipped | New test/audio-feedback.test.js: 13/13 pass, covering isSoundEnabled/setSoundEnabled persistence, palette lookup for every defined sound (including td-flourish) with a fake AudioContext, the disabled-setting no-op path (asserting zero AudioContext construction), unknown-sound-name safety, envelope-parameter determinism across repeated calls, and navigator.vibrate haptic gating (enabled/disabled/absent). Uses cache-busted dynamic imports to isolate the module's cached AudioContext singleton per test, matching the tablet-decision-deck.test.js global-stubbing discipline. |
| coaching-market-panel-aria-live | shipped | public/game.html:1304 coachingMarketPanel section now carries aria-live="polite", matching every sibling dynamically-rewritten panel. test/coaching-market.test.js gained a direct assertion reading game.html and matching the attribute on the section tag; full file 24/24 pass. |
| cap-war-room-expiring-zero-year-contracts | shipped | Extracted the inline cap-projection loop in public/lib/engagementFeatures.js into a pure, exported computeCapProjection(roster, currentYear, opts) function and changed the expiring-count boundary from `yearsRemaining === 1` to `yearsRemaining <= 1`. New test/cap-war-room.test.js: 6/6 pass, covering 0-year counts, 1-year no-regression, 2-year exclusion, mixed rosters, and committed/dead-money splitting. |
