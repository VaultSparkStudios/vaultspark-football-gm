# Implement Plan — Session 109 (2026-09-14)

Source: `docs/AUDIT_2026-09-14_SESSION109.json` (15 items, combined priority 226.6). Re-sorted for efficiency, not priority: same-file batches first, foundations before façades, token-cost item last. Default rung L2.

| Step | Item | Rung | Lane | Why here |
|---:|---|---|---|---|
| 1 | internal-session-narrative-ships-in-public-source | L1 (sitemap only) | build | premise corrected: HTML comments were already stripped at build; only the sitemap shipped one |
| 2 | dev-server-cors-reflects-any-origin-when-unconfigured | L2 | server | half an hour, isolated |
| 3 | landing-stat-bar-is-hand-typed | L1 (gate) | build | premise corrected: check-public-truth already gates engine and rival counts; the tier count was ungated |
| 4 | public-footer-contract-checks-copyright-not-navigation | L2 | build + pages | shared chrome must exist before pages are added |
| 5 | about-status-and-the-missing-faq-and-press-pages | L2 | pages | inherits the chrome |
| 6 | stats-page-is-private-for-now-in-every-cell | L2 (showcase) | pages | premise narrowed: pre-cohort already renders an invitation; the showcase decade is what was missing |
| 7 | visual-system-has-tokens-but-does-not-use-them | L1 tokens + crests | css + module | consumed by every shell item after it |
| 8 | moments-are-not-shareable | L2 | module + producers | needs crests |
| 9 | first-season-has-no-contract-after-the-tutorial | L2 | shell | defines what the Desk is built around |
| 10 | overview-carries-ten-panels-and-the-shell-fourteen-tabs | L1/L2 | shell | one evidence re-baseline |
| 11 | rival-personas-never-change-a-rival-decision | L2 | engine | rivals behave before the advisor cites them |
| 12 | front-office-advisor-narrates-the-co-gm-packet | L2 | module + shell | lands in the Desk |
| 13 | engine-runs-on-the-main-thread | L2 | transport | last: changes the transport everything was tested on |
| 14 | static-artifact-ships-eight-alias-copies | L1 | build | image re-encode; aliases need the host contract |
| 15 | audit-lanes-are-not-cached-between-sessions | L1 | docs | closeout-adjacent |

Parallel lanes this session: engine (11), css + crests (7), worker transport (13), moment cards (8) and advisor logic (12) ran as isolated agents while the website batch (1–6) was done directly; shell wiring (9, 10, 12 UI) is sequential on `public/game.html`.
