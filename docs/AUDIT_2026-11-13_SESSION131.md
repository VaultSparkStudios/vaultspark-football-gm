# Audit — Franchise Architect: Football — Session 131

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched game
- Rubric: product; staging: independent Cloudflare Pages project; stable staging domain
- Profile source: Live source reads after /start plus a canonical-path engine probe (createSession seed 131, BUF, one regular season, dressed-roster capture via gameDressedPlayers).

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | ⚡ | gamification-immersion | 4.0h | 9 | 6 | 20.9 | **injury-clock-truth** — Move the regular-season recovery tick after simulation and before injury rolls; keep the season-end tick; prove absences by probe and focused test. |
| 2 | ⚡ | ui-ux-feedback | 2.0h | 6 | 5 | 15.0 | **questionable-status-visible** — One shared formatter used by profile, roster and depth board. |

Combined priority: **35.9**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. Move the regular-season recovery tick after simulation and before injury rolls; keep the season-end tick; prove absences by probe and focused test.
2. One shared formatter used by profile, roster and depth board.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| injury-clock-truth | shipped | — |
| questionable-status-visible | shipped | — |
