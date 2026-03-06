# VaultSpark Football GM

VaultSpark Football GM is a browser-based NFL franchise simulator with weekly progression, offseason systems, and PFR-weighted statistical calibration.

## Implemented Systems

1. Weekly playable flow:
   - `advance week` and `advance season`
   - weekly game results
   - injury and suspension reports
   - per-week transactions
2. Franchise actions:
   - free agency signing
   - releasing players (waiver or FA)
   - trades
   - practice squad moves
   - depth chart edits
   - contract re-signing
3. Contract and cap mechanics:
   - base salary, bonus, guarantees
   - cap hit and dead cap tracking
   - restructure support
   - June 1 release option support in backend
   - rollover/dead-cap ledger
4. Draft pipeline:
   - draft class with combine/pro-day fields
   - mock draft snapshot
   - user picks
   - CPU draft flow
5. League events:
   - injuries
   - suspensions
   - morale updates
   - coaching/scheme effects in game simulation
6. Save/load slots:
   - save, load, delete, list slots (`saves/`)
7. PFR ETL pipeline:
   - ingest JSON/CSV/NDJSON rows
   - output season rows + player import + realism profile
8. QA dashboard:
   - league metrics vs target baselines (PPG, YPA, sack/int rates, rush YPA)
9. Richer stat/history tools:
   - sortable + paginated stat table
   - record book view
   - player timeline
   - team history
   - awards tracking
10. Automated tests:
   - deterministic simulation
   - session integration
   - contract/roster actions
   - calibration coverage
11. Retirements and longevity:
   - position max-age limits (QB 45, RB 40, etc.)
   - winning-team retirement retention
   - manual retirement override comeback flow
12. Rulebook UI:
   - in-game `Rules` tab documenting simulation rules and every major UI feature/button
13. Multi-year realism verification:
   - season + career drift checks by position over 10-20 year simulation windows

## Run Browser Game

```powershell
cd "C:\Users\p4cka\Documents\Development\VaultSpark Football GM"
npm.cmd run dev
```

Open `http://localhost:4173`.

## Run CLI Simulation

```powershell
npm.cmd run cli -- --years 100 --seed 2026 --export --outDir output
```

## Scripts

- `npm run dev`: run browser server
- `npm run start`: same as dev
- `npm run cli`: CLI simulation mode
- `npm run sim:100`: 100-year export simulation
- `npm run build:realism-profile`: profile from season rows
- `npm run etl:pfr`: full PFR ETL pipeline
- `npm run verify:realism`: run multi-year realism verification
- `npm run test`: automated tests

## PFR ETL Usage

```powershell
npm.cmd run etl:pfr -- --input path\to\pfr_rows.json --outDir output\pfr-etl --fromYear 2019 --toYear 2025 --halfLife 2.2
```

Outputs:
- `season-rows.json`
- `player-import.json`
- `realism-profile.json`
- `career-realism-profile.json`

## Key API Endpoints

Core:
- `GET /api/state`
- `POST /api/new-league`
- `POST /api/control-team`
- `POST /api/advance-week`
- `POST /api/advance-season`

Roster/transactions:
- `GET /api/roster?team=BUF`
- `GET /api/free-agents?position=WR&limit=120`
- `GET /api/retired?position=QB&limit=200`
- `POST /api/sign`
- `POST /api/release`
- `POST /api/practice-squad`
- `POST /api/retirement/override`
- `POST /api/waiver-claim`
- `POST /api/trade`

Contracts:
- `GET /api/contracts/expiring?team=BUF`
- `POST /api/contracts/resign`
- `POST /api/contracts/restructure`

Draft:
- `GET /api/draft`
- `POST /api/draft/prepare`
- `POST /api/draft/user-pick`
- `POST /api/draft/cpu`

Stats/history/qa:
- `GET /api/tables/player-season`
- `GET /api/tables/player-career`
- `GET /api/tables/team-season`
- `GET /api/records`
- `GET /api/champions`
- `GET /api/calibration`
- `GET /api/qa/season?year=2026`
- `GET /api/realism/verify?seasons=12`
- `GET /api/history/team?team=BUF`
- `GET /api/history/player?playerId=<id>`

Saves:
- `GET /api/saves`
- `POST /api/saves/save`
- `POST /api/saves/load`
- `POST /api/saves/delete`
