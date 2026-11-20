# Closeout Brief — Franchise Architect: Football — 132

> Second release of Session 132: the seven carried audit items — a GM page, a scored weekly challenge, a grouped Desk, a game plan that changes the game, bundled fonts and the security remainder.

## Shipped

- **GM Profile tab**: career, trophies, share cards and saves moved out of Settings; unit tests and a browser spec pass; 23 specs re-pointed and green
- **Scored weekly challenge**: goal, score, share text and a shared board on the community service (schema 3); board gives no figures below five browsers and moves in steps of five; browser spec covers a sharing and a private browser
- **Desk in four groups, football wording**: group state persists per browser; a vocabulary test keeps process words out of player copy
- **Game-plan dials**: 7,440 games per position: plays -4.5% to +4.5%, rushes +6.2% to -6.3%, takeaways -7.0% to +6.5%; golden master s132-v6 with v5 frozen by hash
- **Fonts, screenshots, share images**: four WOFF2 files (89 KB) bundled; 17 share images; screenshots retaken on the final interface
- **Security and process**: staging noindex by host, IPv6 /64 limits, retention timer, 512 MiB import cap, escape helpers, four-shard browser gates in CI and promotion

## Follow-ups

- **Database role**: prepared in ops/sql, not applied until migrations move to an owner-run step
- **Save-size limits**: Gist import 10 MB, server route 64 MiB and file import 512 MiB disagree
- **Capture scripts**: screenshot and share-image scripts still live in a scratch folder
- **Launch hold**: email-delivery check, founder approval and lifecycle authority are founder-run

## Blockers

- No blockers recorded.

## Honesty Ledger

- **Three defects caught by review**: the first board design revealed an exact score two ways, and a staged plan could land on a later week; fixed with tests
- **Browser evidence is partial locally**: 139 tests on edited and affected specs plus four new specs, not the whole suite; one test timed out on an idle host and passed on rerun
- **Font packages**: the trust gate returned REVIEW 60/100; installed after a hand check of registry, source, licence and install scripts
- **No real traffic**: the challenge board has never held a real score; player response is unmeasured

## Proof

- Files changed: 205
- Insertions: 6614
- Deletions: 682
- Suite: Local: studio, core 811/811, runtime 1309/1309, 139 browser tests on edited and affected specs. Hosted CI recorded with the release.
