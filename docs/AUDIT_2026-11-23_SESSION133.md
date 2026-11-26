# Audit — Franchise Architect: Football — Session 133

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game
- Rubric: product; staging: independent Cloudflare Pages project; stable staging domain
- Profile source: Three read-only source audits after /start (public site, game client and engine, infrastructure and release process) plus public competitor research.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | ⚡ | security | 3.0h | 7 | 4 | 8.0 | **checkpoint-cut-off-session** — Run the cut-off tree's tests, then commit it. Admit the Turnstile origin in the edge policy by default, because the switch lives on the community server and the build never learned the server's key. |
| 2 | 🔨 | observability-honesty | 10.0h | 10 | 8 | 7.0 | **gridiron-census** — A pulse-1 contract of capped counters with no identifier; the browser sends them with no credentials and stores nothing but the player's own off switch; GPC and Do Not Track mean off. The service keeps one total per metric per day (schema 4). Totals: game sessions, returning sessions, franchises founded, first games, games, seasons, players drafted, titles, Hall of Famers, trades, signings and minutes managed. Shown on the stats page and the landing page; documented on Privacy, agents.json and llms.txt. |
| 3 | 🔨 | features-depth | 14.0h | 10 | 9 | 6.1 | **frame-matters** — physicalProfile.js measures each position's centre from the live league per game (never a constant, never stored) and turns height, weight, wingspan, arm and hand into bounded rating edges: pass blocking, pass rush, run fits, coverage, tackling, catch radius, passer sight, broken tackles and ball security; heavy-and-fast and light-for-position bodies carry more injury risk, and the scouting medical read uses the same model. |
| 4 | ⚡ | features-depth | 4.0h | 8 | 8 | 9.6 | **measurables-and-ras** — physicalCard() on the player detail payload; the dossier shows Frame, RAS (0-10 with a bar), Speed Score, catch radius for skill players and wingspan with hand size. |
| 5 | ⚡ | features-depth | 3.0h | 7 | 4 | 8.0 | **combine-fixes** — Timed drills no longer invert (better prospects ran slower 40s); each prospect draws from his own derived stream, not the session's, and no wall clock; measured workouts win; combine grades narrow every club's read; the pro day reads the combine against this class's median; the results table shows position, 40, vertical and bench. |
| 6 | 🔨 | ui-ux-feedback | 8.0h | 8 | 6 | 6.1 | **players-in-uniform** — The portrait jersey takes the club's primary colour with secondary trim, sleeve stripes, outlined numbers and shoulder pads sized by position; colours are accepted only as plain hex. |
| 7 | 🔨 | ui-ux-feedback | 10.0h | 8 | 6 | 5.4 | **landing-for-conversion** — A football tagline and a compact Gridiron Census on the landing page instead of an empty 'still filling up' panel. |
| 8 | 🔨 | ui-ux-feedback | 6.0h | 7 | 4 | 5.6 | **site-consolidation** — How to Play becomes the first chapter of Guides, How It Compares an FAQ answer, Roadmap and Beta become 'What's next' and 'Early access' on Updates; each old URL is a 301. Footer groups: Play, The game, Studio, Legal; the header swaps How to Play for Guides; Community Stats is labelled Gridiron Census. |
| 9 | 🔨 | gamification-immersion | 8.0h | 7 | 8 | 6.3 | **body-programmes** — A per-player offseason choice through the command seam. |
| 10 | 🔨 | gamification-immersion | 10.0h | 8 | 7 | 5.8 | **franchise-scenarios** — Seeded starts on the challenge-code entry. |
| 11 | 🔨 | gamification-immersion | 14.0h | 8 | 8 | 5.1 | **draft-day-room** — Clock, war-board, trade-up calls and steal-or-bust retrospectives. |
| 12 | 🔨 | gamification-immersion | 8.0h | 7 | 7 | 5.9 | **field-drive-chart** — A 2D field with drive arrows from the play log. |
| 13 | 🔨 | gamification-immersion | 8.0h | 7 | 7 | 5.9 | **cross-league-legacy** — Hall of Fame and achievements across saves. |
| 14 | 🔨 | speed-organization-efficiency | 6.0h | 6 | 3 | 4.7 | **css-split** — Lazy per-screen CSS. |
| 15 | ⚡ | ai-intelligence | 1.0h | 5 | 5 | 12.0 | **census-agent-surfaces** — agents.json gridironCensus block and an llms.txt line for GET /community/v1/pulse. |
| 16 | ⚡ | observability-honesty | 2.0h | 7 | 4 | 9.8 | **visits-report** — npm run report:visits adds a landing-to-game ratio from beacon-executing browsers; the Census carries game sessions, franchises and first games. |

Combined priority: **111.3**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. Run the cut-off tree's tests, then commit it. Admit the Turnstile origin in the edge policy by default, because the switch lives on the community server and the build never learned the server's key.
2. A pulse-1 contract of capped counters with no identifier; the browser sends them with no credentials and stores nothing but the player's own off switch; GPC and Do Not Track mean off. The service keeps one total per metric per day (schema 4). Totals: game sessions, returning sessions, franchises founded, first games, games, seasons, players drafted, titles, Hall of Famers, trades, signings and minutes managed. Shown on the stats page and the landing page; documented on Privacy, agents.json and llms.txt.
3. physicalProfile.js measures each position's centre from the live league per game (never a constant, never stored) and turns height, weight, wingspan, arm and hand into bounded rating edges: pass blocking, pass rush, run fits, coverage, tackling, catch radius, passer sight, broken tackles and ball security; heavy-and-fast and light-for-position bodies carry more injury risk, and the scouting medical read uses the same model.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| checkpoint-cut-off-session | shipped | — |
| gridiron-census | shipped | — |
| frame-matters | shipped | — |
| measurables-and-ras | shipped | — |
| combine-fixes | shipped | — |
| players-in-uniform | shipped | — |
| landing-for-conversion | shipped | — |
| site-consolidation | shipped | — |
| body-programmes | shipped | — |
| franchise-scenarios | shipped | — |
| draft-day-room | shipped | — |
| field-drive-chart | shipped | — |
| cross-league-legacy | shipped | — |
| css-split | shipped | — |
| census-agent-surfaces | shipped | — |
| visits-report | shipped | — |
