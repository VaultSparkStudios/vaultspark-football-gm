# Franchise Architect Rebrand Tombstone

Date: 2026-06-30

## Product Decision

The former public game name `VaultSpark Football GM` is now `Franchise Architect: Football`.

Universe brand: `Franchise Architect`
First sport: `Franchise Architect: Football`
Primary domain: `https://playfranchisearchitect.com/`
Legacy slug: `vaultspark-football-gm`
New slug: `franchise-architect-football`
Studio owner: `VaultSpark Studios LLC`

## Studio Website Agent Request

Add a studio website listing/card for `Franchise Architect` and route the primary play call-to-action to `https://playfranchisearchitect.com/`.

Recommended copy:

- Title: `Franchise Architect`
- Sub-title: `Football`
- Description: `A browser-first football general manager simulator about roster pressure, cap choices, draft gambles, league history, and the long shadow of every season.`
- CTA: `Play Franchise Architect`
- Studio line: `A VaultSpark Studios game.`

## Routing Notes

The new standalone build targets the domain root. The repo build also mirrors files into these legacy/static paths so existing studio-site links stop returning HTML fallback for CSS/JS:

- `/franchise-architect-football/`
- `/games/franchise-architect-football/`
- `/vaultspark-football-gm/`
- `/games/vaultspark-football-gm/`

The console failure that triggered this tombstone was a missing legacy asset path: `/games/vaultspark-football-gm/styles.css` returned HTML, causing strict MIME rejection. `scripts/smoke-pages.mjs` now checks that legacy CSS and JS are real static files.

## Gridiron-GM Vault Review

Full merge review: `docs/rebrand/GRIDIRON_GM_VAULT_MERGE_REVIEW.md`

Reviewed `<dev-root>\\Gridiron-GM` as a VAULTED source. Do not bulk-merge its React app into the current static game. The useful candidates are design/mechanics to port selectively:

- Live play-by-play sim with field visualization.
- Draft clock, draft lottery, and stronger draft-room ceremony.
- Scouting reveal levels for hidden true overall/potential.
- Player backstory/fact banks for prospect personality.
- Achievement/trophy room and local leaderboard loops.
- Hall of Fame induction/download/share cards.
- Trade deadline frenzy and CPU GM voice/personality patterns.
- Async multiplayer league concepts as a future backend-backed mode, not part of the static-domain rescue.

Next merge step: create one focused audit item per candidate and port only after the static Franchise Architect build is reachable and smoke-green.