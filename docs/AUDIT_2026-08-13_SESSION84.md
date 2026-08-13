# Audit — Franchise Architect: Football — Session 84

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay: vivid General Manager agency, source-derived memory, touch/keyboard parity, privacy, static/local-first behavior, public stats honesty, release gates; gamification/engagement/immersion weighted +2, ui/ux and speed/organization/efficiency weighted +1; staging: stable Cloudflare Pages must prove the exact immutable candidate before direct-to-main publication; backend deployment is required only when backend source changes
- Profile source: arc-profile registry authority, Session 84 startup context, 29,981-token code sample, exact grep/read preverification against live source and test/, docs/performance/GAME_SHELL_DIAGNOSTIC.json hosted evidence, context/DECISIONS.md and context/TASK_BOARD.md tail review
- Game-loop review: tightness 9 · progression 9 · session engagement 9 · retention 7 · soul fidelity 8 · overall 8.4
- Evidence caveat: Carried forward from Session 83's code-contract review; this session did not re-run a full game-loop review, only targeted checks of specific surfaces (Overview rival intel, first-run tutorial route, Press Room, Hall of Fame formatting). No consented cohort or docs/PLAYTESTS evidence exists, so these scores do not claim measured fun or retention.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | UI/UX / gamification-engagement-immersion / first impression | 3.0h | 8 | 6 | 20.7 | **first-run-tutorial-layout-stability** — Add min-height reservations for every panel/element named in both the desktop and mobile shift logs at their respective breakpoints, re-run the hosted performance script to prove CLS drops under 0.1 on both profiles, and add a focused test asserting the stylesheet declares a placeholder height for each affected panel id. |
| 2 | HIGH | Speed / organization / efficiency / token-cost reduction | 1.5h | 6 | 4 | 13.3 | **rival-gm-single-team-endpoint** — Add the scoped param on both API adapters (src/app/api/localApiRuntime.js and src/server.js), update tabOverview.js's renderRivalryStrip to request the scoped payload instead of the full roster, and add a focused test proving scoped/unscoped equivalence for the same team. |
| 3 | LOW | Speed / organization / efficiency / test coverage | 0.5h | 3 | 2 | 4.5 | **history-formatting-test-coverage** — Add a full focused test file covering all five exports: every position branch, the ROY composition, zero-value award filtering, and both policy-line default/override paths. |

Combined priority: **38.5**.

## Premise verification and rejected phantom work

- Rejected/deferred “Surface rival GM personas (name/traits/grudge memory) on trade offers and pre-game intel”: Already fully wired. src/engine/rivalGmPersona.js feeds gmName/gmLine into rivalTradeOffers.js offer cards, beatReporter.js news, and buildPersonaIntel() renders on the Overview rival-coach-intel card via public/lib/tabOverview.js:781-785. Nothing to add.
- Rejected/deferred “Add offline/PWA service-worker support so the app boots from cache”: Already shipped at Session 62 (D-S62 service-worker-instant-boot) and hardened at Session 70/71 (per-URL allSettled precache, index registration root-fix). public/boot-manifest.json and the build-generated sw.js already exist; re-proposing this would ignore recorded decisions.
- Rejected/deferred “Add unit test coverage for public/lib/communityEventContract.js”: False premise caught before inclusion: test/community-event-contract.test.js (255 lines) imports normalizeCommunityEvent from src/community/eventContract.js, which is a one-line re-export of this exact file (`export * from "../../public/lib/communityEventContract.js"`). A naive filename-substring grep missed this; reading the shim caught it. Coverage is real.
- Rejected/deferred “Add unit test coverage for public/lib/gistCredentials.js (token storage)”: False premise: test/gist-sync-security.test.js exercises getSavedToken/saveToken/getSavedGistId/saveGistId directly by name. Coverage is real; a bare filename grep missed it because the test file is named for behavior, not the module.
- Rejected/deferred “Add unit test coverage for public/lib/pressRoomPanel.js”: Partially false premise, and repeats a Session 78 finding under a different name. tests-ui/s63-surfaces.spec.js drives #pressRoomCard end-to-end in a real browser. Session 78 already recorded 'pressRoomPanel.js already covered by two test files' — this session's grep for the literal name matched pressRoom.js (the tested engine) and momentarily suggested the DOM layer was uncovered, but the Playwright spec closes that gap. Not re-added.
- Rejected/deferred “Add drag-and-drop reordering to the Depth Chart for mobile parity”: No drag-and-drop exists anywhere in the codebase to make mobile-parity work on. public/lib/tabRoster.js renderDepthChart() already uses Up/Down buttons (44px touch targets, keyboard-operable), which is full mobile/desktop parity by construction — there is no desktop-only interaction being excluded from touch.
- Rejected/deferred “Treat the direct /game.html first-run tutorial CLS/LCP diagnostic as the canonical release Web Vitals gate”: Rejected again for the same reason Session 83 rejected it (premise error about measurement authority). This session's item instead fixes the actual layout-shift defect the diagnostic already measured, without touching which route gates release.

## Three recommended design moves

1. Fix the exact hosted CLS/LCP regression already sitting in docs/performance/GAME_SHELL_DIAGNOSTIC.json instead of re-arguing which route is the canonical gate — reserve layout space for the five/four named panels that collapse to zero height on the first-run tutorial path.
2. Stop the Overview rival-intel strip from refetching every rival GM's full persona and memory ledger just to read one opponent's row; scope the request to the one team it actually renders.
3. Close the one remaining genuinely-untested browser module (historyFormatting.js) rather than the three that looked untested by name but are already covered through re-export shims and Playwright specs.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| first-run-tutorial-layout-stability | shipped | re-run scripts/measure-hosted-performance.mjs against a staging deploy and confirm desktop and mobile CLS <= 0.1; confirm the recorded LCP element (tutorial-body) and its measured time do not regress further; existing lazy-UI-island and boot-budget tests remain green; dark/light desktop/mobile rendered captures of the tutorial route show no visible flash-then-shift |
| rival-gm-single-team-endpoint | shipped | a single-team-scoped request returns persona/memory/archetype data identical to the matching row of the unscoped response for a sample team; the existing League GM Archetypes table still renders all 32 rows correctly; a focused test measures the scoped response is smaller than the full response for a league with populated grudge memories |
| history-formatting-test-coverage | shipped | one test per position branch of hallOfFameCareerLine; awardCountLine's combined ROY count and its zero-value filtering are both asserted; hallOfFamePolicyLine/retiredNumberPolicyLine default and override paths are asserted |
