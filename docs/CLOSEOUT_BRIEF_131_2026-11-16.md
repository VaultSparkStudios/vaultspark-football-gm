# Closeout Brief — Franchise Architect: Football — 131

> Injuries now cost the games their label states; released to staging, production and the API at 0c6fa04c.

## Shipped

- **Injury clock truth**: Recovery ticks after the week's games and kickoff reads live injury state. Probe seed 131: Out 1W missed no game 297/316 before; 279/330 miss exactly one after, the rest are byes. Negative control red on the old engine.
- **Questionable reads as a game-time status**: Shared injuryStatus label on roster, depth chart (amber) and dossier; browser spec 4/4 desktop and mobile, dark and light.

## Follow-ups

- **Postseason medical clock**: Still ticks before each playoff game; align it with the regular-season order.
- **Questionable game-day odds and elevation pay**: A Questionable tag never costs a game; an elevated player's last injured week now earns a continuation pension game. Both need a decision.

## Blockers

- No blockers recorded.

## Honesty Ledger

- **Local suite incomplete**: Local npm test timed out under 100% CPU contention and later host sleep. Per-shard local runs and hosted exact-SHA CI 7/7 are the evidence; every local red is classified in reports/s131-release-acceptance.json.
- **Two self-inflicted reds**: The new test file was not assigned to a shard, and the golden master moved as intended; both fixed before the candidate. Two studio reds were sibling drift from the startup sync.

## Proof

- Files changed: 24
- Insertions: 1009
- Deletions: 103
- Suite: Hosted CI 7/7 at 0c6fa04c: core 772 + 5 declared skips, runtime 1198, sim:contract 271, studio 441, browser 348; production 327/327 responsive.


Wrote C:\Users\p4cka\Documents\Development\Franchise-Architect\docs\CLOSEOUT_BRIEF_131_2026-11-16.md
