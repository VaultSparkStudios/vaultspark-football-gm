# Audit — Franchise Architect: Football — Session 83

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay: vivid General Manager agency, source-derived memory, touch and keyboard parity, privacy, static/local-first behavior, public stats honesty, Obelisk identity boundaries, and public-app release gates; staging: stable Cloudflare Pages must prove the exact immutable candidate before direct-to-main publication; backend deployment is required only when backend source changes
- Profile source: arc-profile registry authority, Session 83 startup brief, 29,981-token code sample, exact grep/read preverification, game-loop review, app-release gate matrix, live CANON-054 checker, live Obelisk migration cargo, canon conformance, and current CI
- Game-loop review: tightness 9 · progression 9 · session engagement 9 · retention 7 · soul fidelity 8 · overall 8.4
- Evidence caveat: Code-contract review only. No consented cohort or docs/PLAYTESTS evidence exists, and public SOUL intentionally withholds private criteria, so these scores do not claim measured fun, retention, or complete private-soul conformance.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Security / identity architecture / release truth | 2.0h | 9 | 5 | 22.5 | **obelisk-v2-migration-boundary** — Quarantine every Passport v1 token/callback artifact, declare external Obelisk architecture and an honestly not-integrated v2 PKCE boundary in structured status and public-safe documentation, regression-test the absence of local auth, and request relying-party registration through Studio Ark. |
| 2 | FIRE | Observability honesty / feedback loop / ecosystem integration | 1.0h | 8 | 6 | 24.0 | **community-stats-feed-contract** — Make stats-surface.json the single privacy-bounded Analytica Feed v1 contract for a curated three-metric homepage showcase, a deeper six-metric atlas, explicit 30-second polling, aggregate-only handling, and structural conformance tests. |
| 3 | FIRE | Game depth / weekly decision texture / immersion | 3.0h | 8 | 8 | 24.8 | **rematch-film-memory** — Derive one Rematch Memory from the canonical rivalry ledger, orient the score to the controlled team, add a bounded recent W-L-T sample and explicit non-predictive disclaimer, then render it as subordinate tactical context with focused tests. |
| 4 | FIRE | Mobile UI UX / input parity / session engagement | 2.0h | 8 | 7 | 24.4 | **sim-watch-touch-transport** — Add idempotent touch/pen swipe transport with deterministic direction resolution, off-axis rejection, pan-y preservation, a concise discoverability hint, and behavioral tests while retaining button and keyboard parity. |

Combined priority: **95.7**.

## Premise verification and rejected phantom work

- Rejected/deferred “Delete indexedDbSaveStore.js, modLoader.js, or rewindManager.js because they have zero importers”: Rejected by the durable S67 decision after source review. They are intentionally retained persistence, modding, and replay assets; deleting them would erase planned capability rather than remove debt.
- Rejected/deferred “Create synthetic Community Stats activity or a mock playtest cohort”: Rejected by CANON-031 and GAME_LOOP. CANON-054 structure can be repaired without inventing adoption, retention, or player activity.
- Rejected/deferred “Add project-local authentication or claim Obelisk is integrated”: Rejected by CANON-045. The current game is anonymous, the required v2 relying-party registration is unavailable locally, and obsolete v1 samples are not integration evidence.
- Rejected/deferred “Treat the direct /game.html first-run tutorial diagnostic as the canonical release Web Vitals gate”: Rejected as a premise error. The canonical public entry is green and the direct-game deep-link remains an honest separate optimization diagnostic; changing boot semantics needs its own measured implementation.
- Rejected/deferred “Implement General Manager firing or terminal game over”: Founder-direction-gated in the durable decision record; this audit cannot invent terminal product canon.

## Three recommended design moves

1. Make identity absence explicit and safe: quarantine the obsolete Passport v1 samples, declare external Obelisk architecture, and keep the status honestly not-integrated until a registered v2 flow is proven.
2. Turn existing franchise history into weekly decision texture by bringing the last receipted meeting into the tactical brief without implying prediction or causality.
3. Complete input and reporting parity: let touch users drive the existing Sim-Watch director directly, and bind the public stats tile, deep page, and Analytica consumer to one privacy-bounded feed contract.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| obelisk-v2-migration-boundary | implemented | test/obelisk-migration-boundary.test.js 2/2,six executable/documented v1 artifacts removed,PROJECT_STATUS declares external + not-integrated + no local auth |
| community-stats-feed-contract | implemented | live CANON-054 checker conform with zero findings,public compliance descriptor regression green,six analyzed metrics and a curated three-metric showcase |
| rematch-film-memory | implemented | tactical film room focused suite 8/8,source-derived last score and recent sample,desktop/mobile dark/light rendered proof uses fictional OS/DMW labels and states the no-causality boundary |
| sim-watch-touch-transport | implemented | test/sim-watch-touch.test.js 3/3,authentic browser touch transport advanced 128→129 and rewound 129→128 through the existing director,desktop/mobile dark/light rendered proof confirmed the hint, reachable ticker launch, and mobile overlay stacking |
