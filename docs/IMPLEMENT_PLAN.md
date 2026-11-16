<!-- Source: docs/AUDIT_2026-11-13_SESSION131.json · Session 131 -->
# S131 implementation plan

Live focus: FORGE/FB beta hardening, public-unlaunched, product rubric. Two L2 outcomes are selected. No lifecycle transition, model API or paid dependency is selected. Engine change first (foundation), display change second (façade over the corrected clock).

## 1. Injured players miss the games their injury says they miss (`injury-clock-truth`)

Readiness: core journeys and product correctness.

Run the weekly availability recovery after the week's games and before that week's injury rolls, so a recovery week elapses only for a game the player actually missed and a fresh injury is never decremented before its first absence. Keep the season-end (no week block) recovery tick. Preserve every pay, pension and admitted-injury interval contract.

Acceptance: Canonical-path probe shows Out 1W players never dress for the next game their team plays, Out 2-3W miss two, IR (4W) four. A focused regression test proves the labelled absence through advanceWeek. Full native suite green; any golden-master movement is re-measured and explained.

## 2. Show Questionable as a game-time status, not as a recovered injury (`questionable-status-visible`)

Readiness: core journeys and product correctness.

One shared formatter for a player's injury line, used by the player profile medical fact, roster injury column and depth board row tag. Questionable reads as expected to play this week; multi-week injuries read as games out.

Acceptance: Pure tests for null, Questionable, one-game, multi-game and malformed data; profile no longer says Recovered for a live Questionable tag; visible in the browser on desktop and mobile in dark and light.
