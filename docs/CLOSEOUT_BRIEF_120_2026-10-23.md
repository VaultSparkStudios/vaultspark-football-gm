# Closeout Brief — Franchise Architect: Football — 120

> Players are told what the passer-rating fix did to their saves, and a release gate that failed 'flakily' now has its cause fixed.

## Shipped

- **Release note for the Desk and passer rating** (7/10 project, 1/10 ecosystem): status.html, status-archive.html and changelog.xml carry the 2026-10-23 note on production 207159ea; reviewer recomputed the range (about +10 at 7.8 Y/A, lower above 77.5% completion).
- **Release-gate race fixed at its source** (6/10 project, 3/10 ecosystem): Pages39968879574 2/268 red; tests-ui/reveal-table-race.spec.js red with the old helper ('unexpected value hidden'), green now; Pages39993950168 success.
- **Weekly standings read the sport pack** (4/10 project, 2/10 ecosystem): Golden master byte-identical 4/4; contract test 10/10, red on the literal version.
- **Every capture runs on installed Chrome** (4/10 project, 2/10 ecosystem): capture-public-qa ran from the committed script: 56 captures, 0 failures; smoke test red on a bare launch.

## Follow-ups

- **Backend deploy exit 75**: Deploy Backend Runtime 39968888182 remote step failed twice; API healthy at c0ce44b4; host read needs founder approval.
- **Public footer gutter and two capture gaps**: Footer text at x=0 on 11 public pages; mobile-moment-card-dark misses its card; lazy screenshots can miss full-page captures.

## Blockers

- **Backend not promoted**: Remote exit 75 after ops copy; host diagnosis over gateway SSH was not permitted in this session.

## Honesty Ledger

- **Fully deployed: Pages yes, backend no**: Production Pages 207159ea verified; the API still reports c0ce44b4.
- **One candidate cycle spent on a known symptom**: S118's closeout recorded a recovery-case browser failure without a cause; S120's first candidate hit it at the Pages gate.
- **Local suite partial; intelligence scripts absent**: Local studio 374/377, the 3 reds are git-ignored local files; CI is the full receipt. ignis-rescore, state-vector, entropy and genome scripts do not exist in this repo.

## Proof

- Files changed: 14
- Insertions: 515
- Deletions: 23
- Suite: CI39993396521 all jobs green on 207159ea; Pages39993950168 browser release gate green.
