# Task Board

## Now
- Check the live/mobile behavior of the `Season Awards` / `Hall of Fame` split, retired-number controls, player dossier hero, and newer contracts/settings/owner command-deck surfaces
- Use the seeded Playwright history regression as the baseline while continuing the manual populated-league review, especially for mobile layout and any states not covered by the server-backed test path
- Review the new Hall-of-Fame/retired-number commissioner settings in live play so the policy copy, defaults, and blocked-action messaging feel clear on desktop and mobile
- Review the new team-color shell, top bar/nav treatment, scouting hero, and setup hero on desktop/mobile so the stronger visual language holds up beyond the default happy path
- Decide whether the player-history archive cards should stay paired with the raw timeline/search tables or whether one of those legacy tables can be reduced further
- Decide whether the remaining History lookup drawers should stay collapsible or whether some of that raw-table access belongs in export/admin views later
- Sanity-check the 18-week / one-bye schedule structure across a few seeded leagues after deploy, not just the regression seed
- Read the preserved setup diagnostics and decide whether another setup/main-menu trim is still justified
- Feed the new world-state deeper into any remaining owner expectation loops and transaction AI edges
- Decide whether to promote the generated `output/statmuse-2025-baseline.json` flow into a first-class repo script instead of keeping the live profile refresh as a documented/manual smoothing step
- Extend the refreshed UI language across any remaining legacy panels that still look like pre-refresh utility screens
- Decide which long-playability feature area should come next now that the shell is in better shape:
  - league-era drift
  - coaching/staff carousel
  - rivalry/narrative memory

## Next
- Add more player-profile richness if the new dossier surface lands well:
  - trait chips
  - comparison callouts
  - cleaner mobile stat stacking
  - explicit retired-number / Hall-of-Fame honor chips in the dossier
- Carry the command-deck treatment into the remaining lower-priority management tabs so the shell feels consistent end to end
- Consider using the same subtab pattern anywhere else long content blocks force users to scroll past the primary data
- Use the new setup diagnostics to decide whether any remaining setup cost is now dominated by save listing, backup listing, or client-side render work
- Add UI hints for weekly plan/scouting-fit outputs where they matter most beyond the new overview/scouting summaries
- Add setup/settings UI hints for the challenge-rule failures that now have frontend error formatting
- Decide whether to add ceremony surfacing or richer archive storytelling on top of the new Hall-of-Fame / jersey-retirement commissioner controls
- Decide whether to restore the parked realism/runtime stash onto a separate branch or continue keeping it isolated
- Add more targeted startup observability only if the new setup diagnostics still leave startup bottlenecks unclear
- Add UI affordances for pruning old browser backups if live Pages usage still hits quota pressure after the automatic recovery changes
- Reconcile the separate Studio repo deployment docs/templates to the direct-Pages model once that repo is safe to edit

## Later
- Add deeper runtime/backend rollout docs once production infra exists
- Extend project-memory files with system specs and recurring operational checklists
- Promote the client beta to a fuller Studio launch checklist when backend rollout is ready
