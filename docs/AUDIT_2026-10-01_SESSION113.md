# Audit — Franchise Architect: Football — Session 113

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product clarity and game-loop consequence; staging: stable staging before production
- Profile source: founder mission, startup brief and three read-only sweeps
- Game-loop review: tightness 7/10 · progression 7/10 · session engagement 8/10 · retention unmeasured; affordances 8/10 · soul fidelity unscored: public summary points to private creative authority
- Evidence caveat: Engineering and rendered-browser evidence, not observed player engagement. Public launch remains HOLD.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | HIGH | player trust | 4.0h | 10 | 7 | 24.0 | **player-language-gate** — Rewrite every visible engineering string in the game shell and public pages, keep the honesty voice, and extend the public-copy gate with the internal vocabulary plus a negative control. |
| 2 | HIGH | decision clarity | 6.0h | 9 | 6 | 20.4 | **desk-next-move** — Group the ranked calls with the Advisor, put progress tracks on one rail, collapse the Co-GM brief into a lazy drawer, and show injuries once. |
| 3 | MEDIUM | player trust | 2.0h | 7 | 4 | 16.4 | **dev-surface-gating** — Gate the jobs panel, QA report and its table behind the developer flag and stop the poll for players. |
| 4 | HIGH | acquisition | 6.0h | 9 | 7 | 21.2 | **landing-rebuild** — Hero with a real gameplay capture and one primary CTA, refreshed feature cards from the single claims source, community pulse below the fold, superlatives removed. |
| 5 | MEDIUM | currency | 4.0h | 8 | 6 | 19.2 | **single-source-claims** — Render feature, fact and status copy from public/content/claims.json at build and assert every marker is filled. |
| 6 | HIGH | ecosystem | 8.0h | 8 | 7 | 18.4 | **new-public-pages** — Add the pages, an RSS feed from release notes, real screenshots, and register them in the sitemap and shared navigation. |
| 7 | MEDIUM | visual | 3.0h | 6 | 4 | 14.0 | **site-chrome-parity** — Inject one header from footer-manifest headerLinks, give every page og/twitter meta, a manifest and theme-color. |
| 8 | MEDIUM | onboarding | 3.0h | 7 | 4 | 16.0 | **onboarding-copy** — Rewrite the guide as a week rhythm, season loop and where-things-live map; fix the tutorial's scouting copy. |
| 9 | HIGH | immersion | 4.0h | 8 | 8 | 20.8 | **real-field-replay** — Drive the field marker from fieldPosition oriented by possession, add down and distance, a red-zone state and a score-margin game-flow strip; unknown spots are never invented. |
| 10 | HIGH | engagement | 6.0h | 9 | 8 | 22.0 | **league-pulse** — A read-only league lens over standings, ratings and season tables, reusing the MVP ballot weights, with movement from the prior week and on-pace/broken record alerts. |
| 11 | MEDIUM | intelligence | 3.0h | 7 | 7 | 18.4 | **advisor-look-ahead** — Add a deterministic look-ahead from the league lens: venue, opponent rank and record, your rank, and a framing line, never odds. |
| 12 | HIGH | depth | 5.0h | 8 | 7 | 19.6 | **potential-scouting-fog** — Fog potential for players you do not employ with an age-narrowing band from a derived stream, through every carrier (roster, free agents, search, profile, contract lists, stat tables), labelled as scouted. |
| 13 | MEDIUM | depth | 4.0h | 7 | 6 | 17.2 | **operating-statement** — A read-only statement over gate revenue, staff costs, cash runway against the owner's target and the heat it adds; salaries stay with the cap. |
| 14 | HIGH | security | 4.0h | 8 | 4 | 17.6 | **server-hardening** — Stop and drain oversize uploads with one 413, generic 500s, separator-safe static paths, clamped limits, trust-flagged proxy keys, parameterized retention, security headers and a secrets ignore rule. |
| 15 | MEDIUM | speed | 1.0h | 5 | 3 | 12.0 | **precache-diet** — Exclude social and marketing imagery from the precache while keeping offline game code. |
| 16 | LOW | organization | 2.0h | 5 | 3 | 11.6 | **repo-hygiene** — Move them under docs/archive without deleting content and roll the hot ledgers at closeout. |
| 17 | LOW | accessibility | 1.0h | 5 | 3 | 12.0 | **accessibility-pass** — Add dialog roles and labels and remove emoji/arrow glyphs from cloud-sync controls. |
| 18 | LOW | organization | 4.0h | 4 | 3 | 8.8 | **server-route-split** — Deferred: the API parity checker and seven test files read src/server.js as text to discover routes, so a split must move those readers first; only the HTTP helpers were extracted. |

Combined priority: **309.6**.

## Premise verification and rejected phantom work

- Rejected/deferred “tutorial-week-one-is-wrong”: The league opens at regular-season Week 1 and the first advance moves W1→W2; the tutorial copy was correct.
- Rejected/deferred “cpu-draft-ignores-needs”: runCpuDraft already weights roster need, projection and depth; persona-tilted drafting is deferred until a measured realism run.
- Rejected/deferred “hex-colors-break-theme”: Most of the 114 literals are team identity colors and standalone export documents, which must not follow the page theme.

## Three recommended design moves

1. Rewrite every visible engineering string in the game shell and public pages, keep the honesty voice, and extend the public-copy gate with the internal vocabulary plus a negative control.
2. Group the ranked calls with the Advisor, put progress tracks on one rail, collapse the Co-GM brief into a lazy drawer, and show injuries once.
3. Gate the jobs panel, QA report and its table behind the developer flag and stop the poll for players.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| player-language-gate | implemented | ~190 visible strings rewritten across 40+ modules and pages; marketing vocabulary gate flags injected 'S94/receipts/canon/shard/schema 2' five times on a temp copy and passes the real site; game pinned tests updated with intent preserved. |
| desk-next-move | implemented | game.html desk-lead/desk-rail grids; Co-GM brief moved to a lazy drawer (coGmBriefPanel.js) which also returned the static boot graph under its 650000-byte target; Desk injury table scoped to the controlled club; rendered dark/light 1440/390 inspected. |
| dev-surface-gating | implemented | Sim-jobs panel, its 8s poll and QA report gated behind ?dev=1; [data-dev-surface][hidden] forced hidden after the browser suite caught a visible .row; s94 spec now checks every surface. |
| landing-rebuild | implemented | Hero screenshot, one primary CTA, Advanced settings hold runtime/seed/data paths, visible help text, unverifiable superlatives and file-count stat removed; captured at 1440/390 both themes. |
| single-source-claims | implemented | public/content/claims.json rendered by scripts/lib/public-claims.mjs into marker blocks; build fails on unfilled markers; test/public-claims.test.js. |
| new-public-pages | implemented | features, how-to-play, faq, roadmap, changelog (status-archive + changelog.xml RSS), press kit with five 103-154 KB screenshots; sitemap, llms.txt, agents.json and footer manifest updated; smoke-pages passes. |
| site-chrome-parity | implemented | Shared header from footer-manifest headerLinks on every public page; og/twitter/theme-color/apple-touch-icon/manifest.webmanifest everywhere; contact/privacy/terms on the shared template. |
| onboarding-copy | implemented | Guide rewritten as league setup, your week, your season, where things live; tutorial scouting copy fixed; return digest speaks 'since your last visit'. |
| real-field-replay | implemented | deriveFieldState/buildGameFlow in simWatchPlayback.js; replaces the index-formula marker; unknown spots fall back to midfield, never invented; 2/2 new + 33 Sim-Watch neighbours. |
| league-pulse | implemented | src/stats/leagueLens.js (power rankings with prior-week movement, MVP/DPOY/Coach races on GAME_IMPACT_WEIGHTS, record watch on a memoized regular-season record book); same-seed determinism and unchanged standings asserted; postseason uses regular-season tables after review. |
| advisor-look-ahead | implemented | public/lib/lookAhead.js: venue, opponent rank/record/blurb, your rank and framing; asserts no odds language; 2/2. |
| potential-scouting-fog | implemented | visiblePotential through roster, free agents, search, profile, contract lists, waiver wire, depth snap share and stat tables (constructor and fromSnapshot); age-narrowing derived-stream band; 4/4 including restored-session regression whose negative control leaks truth without the hook; 70 potential neighbours green. |
| operating-statement | implemented | src/domain/operatingStatement.js over owner.finances and ownerEconomy liquidity; lazy Boardroom panel; 3/3 including determinism; rendered both themes. |
| server-hardening | implemented | src/server/httpHardening.js; 17/17 new tests (64 MB upload cut short with 413, generic 500 with server-side log, sibling-prefix traversal refused, clamps, headers, spoofed XFF/cf-connecting-ip still 429) and 157/157 server/community neighbours. |
| precache-diet | implemented | images/cover.png and images/screens/ excluded; precache 212 assets 3.21 MB -> 224 assets 2.84 MB; service-worker-precache 6/6. |
| repo-hygiene | implemented | Root CODEX_HANDOFF/HANDOFF/screenshots, 27 closeout-brief inputs and pre-S109 implement plans moved under docs/archive; nothing deleted. |
| accessibility-pass | implemented | Shortcuts dialog role/aria-modal/label, Depth tab labelled, theme toggle named, cloud-sync glyphs removed. |
| server-route-split | deferred | Deferred with reason: the API parity checker and seven test files read src/server.js as text. |
