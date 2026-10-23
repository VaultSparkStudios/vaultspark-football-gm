# Closeout Brief — Franchise Architect: Football — 119

> The phone Desk fits and the passer rating matches the box score, live on production.

## Shipped

- **Phone Desk no longer clipped** (8/10 project, 2/10 ecosystem): Min-content probe named #situationalCallsCard (356 px in a 321 px column); spec red on the old rule (35.6 px); production c0ce44b4 Desk 6 cards, 0 overflowing at 390/320 px.
- **One NFL passer rating** (7/10 project, 2/10 ecosystem): Reference lines 99.3/158.3/115.1/0 from both copies; golden s119-v3 moved only seasonTable.passing; production client returns 99.3/158.3/0.
- **Red main repaired before release** (6/10 project, 3/10 ecosystem): test/session106 failed on eb0ed0a6 and 6e5b2351; CI39900408127 seven jobs green on c0ce44b4; Pages39900428496 and backend39900432601 success; doctor 12/12.

## Follow-ups

- **Player-facing release note**: Corrected passer ratings appear in existing saves; a release note needs its own exact candidate.
- **Evidence tool parity and payload headroom**: capture-public-qa.mjs ignores PLAYWRIGHT_CHANNEL; six-week snapshot 15.305 MB vs 16 MB bar.

## Blockers

- No blockers recorded.

## Honesty Ledger

- **One candidate cycle lost**: First candidate f67f9e6c was started without reading main's red CI; its promotions were cancelled and refused.
- **Local suite evidence was partial**: Local sim-contract shard was stopped by host memory pressure; local studio reds came from git-ignored files. CI is the full receipt.
- **Backend host identity not re-read**: Workflow exact-SHA health and external health only; no SSH host readback this session.

## Proof

- Files changed: 20
- Insertions: 831
- Deletions: 76
- Suite: CI39900408127: six canonical unit shards and the browser job green on c0ce44b4.
