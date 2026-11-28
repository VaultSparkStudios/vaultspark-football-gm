# Closeout Brief — franchise-architect — S133

> The studio asked for bodies that matter, wingspan, a football-first site and anonymous counts by default; all sixteen audit items shipped across four verified releases, ending at 14b50e4d, with hosted CI catching the defects local runs missed before each went live.

## Shipped

- **Frame Matters: a player's body changes games and injuries** (9/10 project, 5/10 ecosystem): physicalProfile.js measures position centres from the live league each game and turns height, weight, wingspan, arm and hand into bounded edges (4 rating points; injury x0.9-1.2; fumble x0.85-1.15) with no random draws. Golden master s133-v8 with v7 frozen by hash; champions move in both scenarios; sim realism and long shards pass in CI.
- **Scouting measurables, body programmes and combine fixes** (8/10 project, 4/10 ecosystem): RAS, Speed Score, catch radius and frame type on the dossier; bulk / lean programmes through the command seam (403 for another club); timed drills no longer invert and the combine no longer moves the session's random stream. Unit tests for each.
- **Gridiron Census: anonymous counts on by default** (9/10 project, 6/10 ecosystem): Studio decision. Counters with no identifier and no analytics storage, GPC and Do Not Track honoured, inert outside a page; community schema 4 keeps one total per metric per day and counts only the live origin. Negative controls in test/league-pulse.test.js; live GET /community/v1/pulse answers on schema 4.
- **Uniforms, drive chart, scenarios and automatic highlights** (7/10 project, 3/10 ecosystem): Club colours with position-sized pads (saved looks byte-identical without colours); Sim-Watch drive chart; four one-click franchise scenarios; automatic highlights never opened before because the advance dialog was still on the modal stack, now scheduled after it closes. reward-beats 5/5.
- **A tidier site and a safer release path** (7/10 project, 4/10 ecosystem): Four thin pages folded with 301s, footer 19 to 13; database password out of the connection URL; Turnstile admitted by default. CI 11/11, staging 14/14 and 10/10, production 10/10, performance and release authority verified; visual review recorded with owner approval.
- **Second wave: bodies that age, a kit that fits, a legacy across saves** (8/10 project, 4/10 ecosystem): Heavy veterans lose a step before strength (golden master s133-v9, v8 frozen by hash); the full-body view wears the club game kit with a helmet and the 3D body the club colour; steal-or-bust draft retrospectives; a GM legacy summed across every franchise in the browser; scenario codes carry the frame archetype; an animated field strip and screenshot feature cards on the landing page. CI green (run 45528972070), production 10/10 at a8b46bb3 (run 45705176918), API schema 4 (run 45693904176), owner-approved visual review, doctor 0 failing.
- **Third wave: player cards, a scenario board and a lighter start page** (7/10 project, 3/10 ecosystem): A 1200x630 player-card PNG from the dossier; About, Press, Media and Contact merged with a 10-link footer; saves and backups hidden for new visitors and a Continue button naming club, year and week; a Census scenario board from eight new ID-free counters; public pages load a 45 KB stylesheet subset checked pixel by pixel against the full sheet. CI green (run 45731087407), production 10/10 at 14b50e4d (run 46066494829), API run 46061399009 with the pulse returning scenario counters, owner-approved visual review, doctor 0 failing.
- **A measurables glossary and the third-wave review fixes** (Players and agents can look up every body measurement and score the game uses, and the player card reads clearly for every club./10 project, A glossary held to the engine by a test is a reusable pattern: public copy that cannot drift from the code it explains./10 ecosystem): aa2eaffc; CI 46088087941; API 46110633548; Pages 46116105991; production and staging 10/10; live CSP admits Turnstile; review 7 fixed, round 2 pass; doctor 0 failing.

## Follow-ups

- No follow-ups recorded.

## Blockers

- No blockers recorded.

## Honesty Ledger

- No declined or rejected items recorded.

## Proof

- Files changed: n/a
- Insertions: n/a
- Deletions: n/a
- Suite: not recorded
