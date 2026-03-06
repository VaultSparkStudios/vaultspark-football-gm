# Handoff

## Project
VaultSpark Football GM

## Current State
- `npm run dev` starts the browser game from `src/server.js`.
- Season realism verification is currently stable in the verification flow.
- Career realism improved materially from the prior handoff after role-aware usage and offseason accrual changes.
- Depth chart snap-share display now uses the same usage model as the simulator.
- The workspace is not yet connected to a GitHub repository. `git` is installed, but `gh` is not installed and there is no remote configured yet.

## What Changed In This Pass
- Added shared depth-chart usage logic in `src/engine/depthChartUsage.js`.
- Updated `src/engine/gameSimulator.js` so offensive and defensive usage depend on personnel packages, coaching tendencies, and position room role order.
- Added game-level availability wear in the simulator so careers do not default toward unrealistic full-17-game participation every season.
- Updated `src/engine/offseasonSimulator.js` so players only accrue `experience` and `seasonsPlayed` when they actually played enough to count as an accrued season.
- Tightened general retirement behavior for aging veterans while giving specialists a separate retirement curve.
- Updated `src/runtime/GameSession.js` so the UI/API depth-chart snap-share view reflects the live usage profile.
- Fixed invalid unquoted hyphenated keys in `src/config.js`.
- Added regression coverage in `test/realism-career-regression.test.js` for offseason accrual and 10-year career realism guardrails.

## Key Files
- `src/engine/depthChartUsage.js`
- `src/engine/gameSimulator.js`
- `src/engine/offseasonSimulator.js`
- `src/runtime/GameSession.js`
- `src/stats/realismCalibrator.js`
- `src/stats/profiles/pfrCareerWeightedProfile.js`
- `src/config.js`
- `test/realism-career-regression.test.js`
- `src/server.js`
- `public/game.html`
- `public/app.js`

## Verification Artifacts
- Existing historical reports remain in `output/realism-verification-10y-final.json`
- Existing historical reports remain in `output/realism-verification-20y-final.json`

## Latest Validation
- `npm.cmd test` passed.
- Full test suite now includes:
  - existing gameplay/session/API/snapshot regression tests
  - `test/realism-career-regression.test.js`
- In-process 10-year realism verification after this pass:
  - Season: `on-target 44, watch 0, out 0`
  - Career: `on-target 40, watch 19, out 4`

## Current Realism Read
- `WR`, `TE`, `OL`, and `LB` improved enough in the 10-year verification to avoid `out-of-range` career metrics in the validation run from this pass.
- `RB` still has the largest remaining issue, especially career receiving TDs and some receiving volume.
- `K` remains low in career volume and career length versus the current target profile, though the specialist retirement curve is now separated from other positions.
- I did not regenerate and write fresh 10-year / 20-year JSON verification artifacts to `output/` during this pass.

## Important Behavior
- Position max-age caps are configured in `src/config.js`.
- Retirement chance uses age, team winning context, player quality, prior-season usage, free-agent/inactive status, override state, and specialist-specific handling.
- `seasonsPlayed` and `experience` no longer auto-increment for active players who effectively missed the season.
- Career verification currently evaluates league-wide averages using active + retired players.
- Season calibration still uses year-qualified players and discrete-stat rebalancing to keep season averages on target.
- Depth charts now matter more because sub-package and role usage affect accumulation more directly.

## Commands
- `npm run dev`
- `npm test`
- `npm run test:ui`
- `npm run verify:realism -- --seasons 10 --outFile output/realism-verification-10y-final.json`
- `npm run verify:realism -- --seasons 20 --outFile output/realism-verification-20y-final.json`

## Known Gaps
- 20-year career drift still needs a fresh rerun after this pass.
- `RB` career receiving production is still high relative to target.
- `K` career totals and seasons remain low relative to target.
- CPU roster-building AI by scheme/age/contract/role still needs a deeper pass.
- Save/load continuity should still be stress-tested against long realism runs and report generation.
- The Rules/manual area and broader UX backlog remain open.

## Suggested Next Steps
1. Rerun 20-year realism verification and inspect whether the new usage and accrual changes reduced the original long-horizon drift.
2. Reduce `RB` receiving career inflation by tightening target share and/or role distribution for RB2+ usage in passing situations.
3. Revisit kicker target assumptions versus sim environment and qualification thresholds, then tune specialist usage or profile values deliberately.
4. Extend role-aware logic into CPU roster-building so medium-tier veterans are not retained too long in positions that should churn faster.
5. Stress-test save/load continuity using long sims that also generate realism reports.
6. Improve documentation/UI surfaces around rules, contracts, scouting, offseason flow, and realism verification.

## Deployment Notes
- Local deployment prerequisites are present for development (`node_modules` already installed).
- This directory was not initialized as a git repository before this handoff.
- `git` is available locally.
- `gh` was not found on PATH in this environment.
- To push to GitHub, the remaining requirement is either:
  - an empty GitHub repository URL to push to, or
  - GitHub credentials/token with permission to create and push a new repository.
