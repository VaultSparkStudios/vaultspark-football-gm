# Franchise Architect: Football

Franchise Architect: Football is a football franchise management game that runs in the browser. You run a club for as many seasons as you like: contracts and the salary cap, scouting and the draft, trades with 31 rival front offices, a coaching staff, an owner, and a league that keeps its own history.

It is free in early access at <https://playfranchisearchitect.com/>. The league, clubs and players are fictional; the game is not affiliated with or endorsed by any professional sports league, team, or players association.

## What is in the game

- **Weekly season flow** — a weekly plan (an optional general manager decision plus a tactical focus), advance a week, four weeks or a season, then read results, Sim-Watch replays, press conferences and League News.
- **Front Office Advisor** — argues one call each week with the figures behind it and keeps score of when you overrule it. A **First Season Contract** sets five objectives for a new franchise.
- **Rival front offices** — every rival general manager has an archetype, prices trades by it, and remembers past dealings. Rival clubs also trade with each other under the same rules.
- **Contracts and cap** — extensions, restructures, franchise tags, dead money, cap carryover, expiring contracts and free agency in bidding waves.
- **Scouting and the draft** — prospects arrive in scouting fog; scouting points sharpen your read before you run the draft.
- **The Boardroom** — owner mandate and patience, facilities paid for from club cash with ongoing upkeep, ticket pricing, and a coaching market.
- **History** — awards, records, retired numbers, a Dynasty timeline, and a Hall of Fame with an induction ceremony; six GM legacy tiers.
- **Saves** — stored in the browser with rolling backups and rewind points, save-file export and import, and optional GitHub Gist sync.
- **Sharing** — moment cards, a League Story Card, and challenge codes that recreate a league from the same seed.
- **Commissioner mode** — up to four general managers sharing one league on the same device.
- **Community Stats** — optional and anonymous; off until a player turns it on.

There are no AI services or paid APIs behind any of this: every rival, Advisor call and headline comes from the game's own deterministic rules.

## Run it locally

```powershell
npm install
npm run dev
```

Open `http://localhost:4173`. The start page is `index.html`; the game itself is `game.html`. By default the league runs in the browser; the local server also exposes an optional server-backed runtime for development.

## Build the static site

```powershell
npm run build:pages
```

Writes the deployable site to `static/`. The build renders the shared site header and footer, fills the copy blocks from `public/content/claims.json`, generates the changelog page and `changelog.xml` feed from `public/status.html`, and runs the public-copy checks in `scripts/check-public-truth.mjs`.

## Other scripts

- `npm run cli -- --years 100 --seed 2026 --export --outDir output` — run a long simulation from the command line
- `npm run verify:realism` — multi-season realism checks
- `npm test` — the full automated test suite (long); run single files with `node --test test/<file>.test.js`
- `npm run test:ui` — Playwright browser tests

## Rights

Copyright 2026 VaultSpark Studios LLC. All rights reserved. Proprietary — see `public/terms.html`.
