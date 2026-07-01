# Gridiron-GM Vault Merge Review

Date: 2026-06-30
Reviewer: Codex
Source repo reviewed: `<dev-root>\\Gridiron-GM`
Target repo: `Franchise Architect: Football`

## Executive Recommendation

Do not merge the Gridiron-GM app wholesale. Its useful value is design DNA and feature patterns, not code architecture. The vaulted app is a large React single-file surface with direct state mutation, random IDs/random simulation paths, and fragile phase coupling. Franchise Architect already has a cleaner deterministic runtime, static Pages build, test shards, scouting APIs, Draft War Room, Hall of Fame archive, GM reputation, challenge codes, and commissioner-mode scaffolding.

Port selectively in this order:

1. Hall of Fame ceremony/share card.
2. Trade Deadline Frenzy as a deterministic offer ritual.
3. Prospect backstory/fact bank expansion.
4. Scouting reveal UX upgrade inspired by hidden true overall/potential tiers.
5. Live field visualization only after the static domain is green.

## Source Evidence Read

Primary source files:

- `Gridiron-GM/docs/GAME_LOOP.md` - phase loop, live sim loop, draft/combine/scouting mechanics.
- `Gridiron-GM/docs/SYSTEMS.md` - system boundaries and risk notes.
- `Gridiron-GM/docs/CONTENT_PLAN.md` - content banks, fictional-team posture, real-roster note.
- `Gridiron-GM/src/App.jsx` - current evolved single-file React app.
- `Gridiron-GM/gridiron-gm-v3.1-stable.jsx` - earlier stable version with clearer scouting/combine functions.

Relevant source anchors observed:

- `src/App.jsx:55-76` - player fact/backstory banks.
- `src/App.jsx:57-68` - achievement definitions.
- `src/App.jsx:70-71` - AI GM names and voice patterns.
- `src/App.jsx:90+` - modern pick value chart.
- `src/App.jsx:2645+` - multiplayer stub feature list.
- `src/App.jsx:2651+` - Hall of Fame induction card/download/share modal.
- `src/App.jsx:2655+` - Trade Deadline Frenzy modal.
- `gridiron-gm-v3.1-stable.jsx:74-76` - combine/pro-day generation and combine-to-physical mapping.
- `gridiron-gm-v3.1-stable.jsx:110-112` - true overall/potential plus scouted estimates.
- `gridiron-gm-v3.1-stable.jsx:342-348` - scout spend improves reveal accuracy.

## Current Franchise Architect Overlap

Already present or stronger in this repo:

- Static browser-first build with client runtime and smoke tests.
- `public/lib/draftWarRoom.js` has pick clock, trade-call surface, live board updates, and pick reveal model.
- `src/runtime/GameSession.js` has scouting board state, weekly points, combine/pro-day stage, confidence, scout allocation, and board lock.
- `public/game.html` has Scouting, Draft, Hall of Fame, Commissioner Mode, Speedrun, and Sim-Watch panels.
- `public/lib/seasonEpilogue.js` already provides end-of-season ritual payoff.
- `src/engine/gmLegacyScore.js` already has GM legacy, persona tiering, and CPU trade multipliers.
- Challenge codes and speedrun leaderboard exist in `public/lib/challengeCodes.js` and Speedrun UI.

## Priority Merge Candidates

### 1. Hall of Fame Ceremony and Share Card

Why it matters:
The current repo has Hall of Fame archive data, but Gridiron-GM has a stronger emotional moment: an induction modal, career snapshot, canvas-generated share/download card, and social copy.

Port shape:

- Add `public/lib/hallOfFameCeremony.js`.
- Trigger when a newly eligible player enters the Hall of Fame after season rollover.
- Reuse existing history/Hall of Fame data instead of importing Gridiron-GM state code.
- Replace Gridiron-GM branding in card text with `Franchise Architect: Football`.
- Add deterministic tests around candidate selection and card payload text.

Risk:
Low. Mostly presentation logic.

### 2. Trade Deadline Frenzy

Why it matters:
Franchise Architect has a trade deadline alert, but Gridiron-GM's "multiple teams are dealing before the cutoff" ritual is a stronger midseason pressure spike. This directly supports the GM fantasy.

Port shape:

- Implement as deterministic offers generated from current standings, expiring contracts, roster needs, and AI team strategy.
- Present 2-4 deadline offers in the existing trade/deadline UI.
- Do not copy the old hard-coded `costs a 3rd-round pick` behavior; use current trade fairness and cap rules.
- Add regression tests that deadline offers are stable for a seed and never violate cap/challenge restrictions.

Risk:
Medium. Must avoid breaking trade fairness, cap compliance, and challenge modes.

### 3. Prospect Backstory and Fact Banks

Why it matters:
Gridiron-GM's prospect/personality banks are simple but useful. Franchise Architect already has draft pressure, scouting fit, and combine/pro-day, but more player-specific flavor would make the draft board feel less like numbers.

Port shape:

- Create a sanitized content bank under `src/data/prospectBackstories.js` or `src/domain/prospectNarratives.js`.
- Attach one deterministic backstory to generated prospects using existing seeded RNG.
- Surface it in scouting table spotlight and pick reveal.
- Expand beyond the old bank before shipping; avoid odd claims that imply real people or real schools unless generated fiction is clear.

Risk:
Low. Content and deterministic assignment only.

### 4. Scouting Reveal UX: true value vs scouted estimate

Why it matters:
Franchise Architect already has a better scouting system mechanically, but Gridiron-GM communicates uncertainty clearly with `??`, approximate values, and reveal levels. That UX is worth porting.

Port shape:

- Keep current `GameSession` scouting logic.
- Add visible tiers: Unknown -> Estimate -> High Confidence -> Locked Board.
- Show confidence deltas and explain why a scout allocation helped.
- Add a compact `scoutLvl`-style display without adopting old `trueOvr` fields directly.

Risk:
Low/medium. UI only if kept separate from runtime truth.

### 5. Live Field Visualization

Why it matters:
Gridiron-GM's live sim with SVG field position and Player of the Game creates a stronger week-to-week session hook. Franchise Architect has Sim-Watch, but not a field view.

Port shape:

- Treat as a new `Sim-Watch Field` layer, not a new simulation engine.
- Use current box score/play-by-play data from the existing runtime.
- Add a small field-position visualization only when drive/play events expose enough data.
- Do not import Gridiron-GM's live state machine; its own docs flag `advanceLivePlay()` and live commit behavior as fragile.

Risk:
Medium/high. Defer until domain/static routing is fully proven.

## Do Not Port Now

- Full React app shell: conflicts with current static HTML/module architecture.
- Real-roster mode: legal/IP and licensing risk; current project should stay fictional/proprietary-safe unless explicitly cleared.
- Pro GM subscription plan: conflicts with free-tier cost discipline and would require payment/auth infrastructure.
- Supabase async multiplayer: useful later, but not while the static site is being rescued.
- Old simulation engine: current deterministic runtime is more testable and already integrated.
- Old pick value chart as replacement: compare as tuning input only; do not swap without realism tests.

## Suggested Implementation Plan

### Wave 1 - Emotional Payoff, Low Risk

1. Add Hall of Fame ceremony/share card.
2. Add prospect backstory content bank and display in scouting/draft pick reveal.
3. Add tests for deterministic content assignment and card payloads.

### Wave 2 - GM Pressure

1. Add deterministic Trade Deadline Frenzy offer generator.
2. Wire offers into current trade deadline panel.
3. Test against cap, challenge mode, and trade fairness constraints.

### Wave 3 - Presentation Upgrade

1. Add scouting reveal UX tiers.
2. Add Sim-Watch field visualization based on current play-by-play events.
3. Playwright check desktop/mobile for no overlap and no blank visualization.

## Game Loop Scores From Vault Review

- Loop tightness: 7/10. Clear season loop, but old app mixes too many systems in one component.
- Progression curve: 8/10. Combine -> draft -> free agency -> next season is compelling.
- Session engagement: 8/10. Live sim, draft timer, trophy room, and trade deadline moments are good hooks.
- Retention hooks: 7/10. Achievements, Hall of Fame, leaderboards, and dynasty share prompts are useful but need cleaner persistence.
- Soul fidelity for Franchise Architect: 8/10. Best ideas fit the new brand when framed as franchise-building rituals, not arcade/mobile features.

## Next Three Design Moves

1. Ship Hall of Fame ceremony as the first Gridiron-GM salvage because it strengthens long-save emotional payoff with low runtime risk.
2. Ship Trade Deadline Frenzy next because it creates a midseason decision spike and makes the GM job feel less passive.
3. Upgrade scouting presentation with reveal tiers and backstory flavor so the Draft War Room feels like a personnel department, not just a table.