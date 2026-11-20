# Audit — Franchise Architect: Football — Session 132

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game
- Rubric: product; staging: independent Cloudflare Pages project; stable staging domain
- Profile source: Three read-only source audits after /start (public site, game client and engine, infrastructure and release process) plus public competitor research.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | ⚡ | speed-organization-efficiency | 3.0h | 9 | 4 | 20.5 | **legacy-mirrors-to-redirects** — Stop copying the whole site into each legacy path. Emit 301 rules for the legacy slugs in _redirects and keep one service worker at the root. |
| 2 | ⚡ | observability-honesty | 6.0h | 9 | 4 | 19.1 | **site-truth-pass** — Move shipped work out of the roadmap, add the missing release note, extend Features to shipped systems, add releaseLabel and a single Community Stats block to claims.json and render both everywhere. Extend the public-truth check to the stats JSON and script strings. |
| 3 | 🔨 | speed-organization-efficiency | 12.0h | 9 | 5 | 17.7 | **bundle-and-minify** — Add a pinned bundler through the package-trust gate. Bundle and minify the client and worker graphs into hashed chunks with immutable caching, shorten the precache list, and serve the hero as a preloaded image. Measure the boot budget on shipped bytes without raising maxBytes. |
| 4 | 🔨 | ui-ux-feedback | 12.0h | 9 | 6 | 18.5 | **in-game-feedback-and-diagnostics** — Add feedback and diagnostics routes to the existing community service with a human-verification check on capability issuance. Replace the three local-only prompts and the external issue link with one consented in-game form. |
| 5 | 🔨 | gamification-immersion | 10.0h | 9 | 6 | 19.2 | **faster-first-week** — Put the team choice in the hero, state each preset's difficulty and mode on its card, cut the Opening Contract to one step, skip plan modals in week one, and move the playtest survey off the first game. |
| 6 | ⚡ | gamification-immersion | 8.0h | 8 | 7 | 19.2 | **game-day-in-the-loop** — After the user's game, the recap card offers the Sim-Watch highlight reel directly, with a setting to play it automatically. Loaded as a lazy island. |
| 7 | 🔨 | gamification-immersion | 14.0h | 9 | 8 | 19.3 | **owner-can-fire-you** — A failed ultimatum at the patience floor ends the tenure. The GM career continues through a job-market screen. Free team switching is limited to Sandbox rules. Authority stays guarded at the shared command seam. |
| 8 | 🔨 | ai-intelligence | 10.0h | 8 | 7 | 18.4 | **cpu-draft-through-fog** — Measure first: tabulate ten seasons of draft outcomes by club. Then score CPU picks on the club's scouted read, potential and age instead of the true rating, with persona-specific error. |
| 9 | 🔨 | ui-ux-feedback | 10.0h | 8 | 6 | 17.6 | **gm-profile** — New lazy tab holding career record, legacy tier, Trophy Case, share exports, save slots and backup status. Settings keeps preferences only. No account is introduced. |
| 10 | 🔨 | gamification-immersion | 10.0h | 8 | 8 | 19.2 | **scored-weekly-challenge** — Each week's seed gets a stated objective and a deterministic score. Opted-in players submit to the community service; the board shows only when the participation threshold is met. |
| 11 | ⚡ | ui-ux-feedback | 8.0h | 7 | 4 | 15.0 | **one-site-template** — Render every marketing page through one layout in the shared chrome. Group footer links, unify nav labels, remove the app shell from the shared-footer list or include it properly. |
| 12 | 🔨 | features-depth | 12.0h | 8 | 6 | 16.9 | **new-pages** — Merge status, archive and shipped-roadmap content into Updates with a Known Issues section. Add a Guides hub, a Media gallery, a comparison page and a Beta page explaining what beta means and how to give feedback. |
| 13 | 🔨 | ui-ux-feedback | 12.0h | 8 | 6 | 16.9 | **visual-upgrade** — Self-host two WOFF2 faces so typography is the same on every device. Rebuild the hero around the showcase league. Recapture screenshots in both themes and at phone width, including portraits and the depth chart. Set per-page share images. |
| 14 | ⚡ | observability-honesty | 6.0h | 8 | 4 | 17.4 | **funnel-telemetry** — Add coarse funnel events (setup finished, first advance, first season finished, return visit) to the event contract and offer the existing consent choice once inside the game. Off by default. |
| 15 | ⚡ | ui-ux-feedback | 8.0h | 7 | 4 | 15.0 | **plain-football-language** — Replace process words in player-facing copy with football terms from one glossary, auto-load panels that still wait for a button, and bind the command palette to Ctrl/Cmd+K. |
| 16 | ⚡ | token-cost | 8.0h | 8 | 4 | 16.7 | **release-process-diet** — Run browser tests on several workers with a curated release set and the full set nightly. Run the process-tooling shard beside the deploy, not in front of it. Parse the truth status token correctly and import the hosted test receipt into the brief. |
| 17 | ⚡ | security | 8.0h | 7 | 3 | 14.2 | **security-hardening-batch** — Staging is marked noindex. Imports are size-capped before parsing. One tested escape helper replaces the copies and covers style values. The service uses a least-privilege database role. Automated dependency merges check the pull request author. Developer diagnostics are stripped from production markup. |
| 18 | 🔨 | features-depth | 14.0h | 7 | 6 | 14.8 | **desk-and-tactics** — Group the Desk into this week, your club, the league and your career, with the rest one click down. Extend the weekly plan beyond four tactics with pace, run-pass lean and coverage choices whose effect is measured. |
| 19 | ⚡ | ai-intelligence | 5.0h | 6 | 5 | 15.1 | **seo-and-agent-surfaces** — Add FAQ, organization, website and breadcrumb structured data. Publish the Co-GM briefing as a versioned JSON schema. Add a game-specific map to the agent instructions and remove links to files that are not in the public repo. |
| 20 | ⚡ | observability-honesty | 4.0h | 9 | 3 | 19.1 | **launch-hold-clearance** — Prepare the email-delivery check and the approval packet for the founder to run. Add the install prompt. Switch the release label and promote through staging to production. |

Combined priority: **349.8**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. Stop copying the whole site into each legacy path. Emit 301 rules for the legacy slugs in _redirects and keep one service worker at the root.
2. Move shipped work out of the roadmap, add the missing release note, extend Features to shipped systems, add releaseLabel and a single Community Stats block to claims.json and render both everywhere. Extend the public-truth check to the stats JSON and script strings.
3. Add a pinned bundler through the package-trust gate. Bundle and minify the client and worker graphs into hashed chunks with immutable caching, shorten the precache list, and serve the hero as a preloaded image. Measure the boot budget on shipped bytes without raising maxBytes.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| legacy-mirrors-to-redirects | shipped-reduced | — |
| site-truth-pass | shipped | — |
| bundle-and-minify | shipped-reduced | — |
| in-game-feedback-and-diagnostics | shipped-reduced | — |
| faster-first-week | shipped | — |
| game-day-in-the-loop | shipped-reduced | — |
| owner-can-fire-you | shipped | — |
| cpu-draft-through-fog | shipped | — |
| gm-profile | shipped | — |
| scored-weekly-challenge | shipped | — |
| one-site-template | shipped-reduced | — |
| new-pages | shipped-reduced | — |
| visual-upgrade | shipped-reduced | — |
| funnel-telemetry | shipped-reduced | — |
| plain-football-language | shipped-reduced | — |
| release-process-diet | shipped-reduced | — |
| security-hardening-batch | shipped | — |
| desk-and-tactics | shipped | — |
| seo-and-agent-surfaces | shipped-reduced | — |
| launch-hold-clearance | deferred | — |
