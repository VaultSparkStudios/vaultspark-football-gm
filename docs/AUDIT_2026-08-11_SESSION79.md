# Audit — Franchise Architect: Football — Session 79

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product/game rubric with game-medium overlay: beta-readiness, vivid General Manager decision pressure, browser-visible feedback, static-host-safe/local-first features, plus public-app release and Canon lens; staging: stable Cloudflare Pages staging must prove the exact candidate before direct-to-main publication
- Profile source: arc-profile registry authority plus live startup brief, S79 code sample (29,981/30,000 tokens across 12 files), exact grep/read verification, doctor, boot-budget checker, and forked app-release gate
- Game-loop review: tightness 8 · progression 9 · session engagement 7 · retention 8 · soul fidelity 9 · overall 8.2
- Evidence caveat: Code-contract review only: no recent docs/PLAYTESTS evidence exists, so these scores do not claim measured fun, retention, or player sentiment.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Feature depth / UI/UX / deterministic intelligence | 6.0h | 5 | 7 | 11.7 | **canonical-agent-negotiation** — L1 plus persist bounded opening/counter/accepted/walked history inside the canonical negotiation ledger; render one accessible modal with ask, guaranteed money, leverage reason, counter, and deadline; actual source-derived rival interest—not a user-authored signal button—drives leverage. |
| 2 | FIRE | Gamification / feedback loop / observability truth | 4.0h | 5 | 6 | 11.6 | **prediction-loop-rollover-and-margin-truth** — L1 plus grade winner and margin as exact/within-three/within-seven/miss, track winner accuracy and mean absolute margin error separately, persist a bounded recent receipt journal, and include its truthful summary in the League Story export promised by the UI. |
| 3 | FIRE | Security / privacy / public-stats integrity | 12.0h | 5 | 6 | 7.9 | **community-participation-capability** — L1 plus issue a short-lived server capability bound to participant ID using an ephemeral process signing key, rate-limit issuance by trusted client address without persisting IP, and enforce nonce/use ceilings on ingest and withdrawal so caller ID rotation cannot mint a trusted cohort. |
| 4 | HIGH | Speed / organization / browser and agent efficiency | 10.0h | 5 | 5 | 7.0 | **non-overview-ui-islands** — L1 plus island Roster and Stats so every non-Overview tab loads on intent, enforce per-island byte budgets, and preload only on pointer/focus/idle hints without paying first-decision parse cost. |
| 5 | HIGH | Release architecture / observability truth | 2.5h | 5 | 3 | 6.9 | **exact-sha-staging-parity** — L1 plus bind current release-range rendered-pixel evidence and refreshed release truth to the candidate; only after staging is green publish direct to main and prove production provenance without changing launchReady. |
| 6 | HIGH | UI/UX accessibility / failure observability | 2.0h | 4 | 2 | 4.0 | **hall-of-fame-ceremony-accessibility** — L1 plus observable clipboard/download success and failure behavior, complete fake-DOM interaction coverage, and rendered-pixel receipts in both themes at desktop and mobile. |

Combined priority: **50.1**.

## Premise verification and rejected phantom work

- Rejected/deferred “CANON-054/055 stats-surface rebuild”: False premise. Homepage Stats links, the real Stats Atlas, public agents.json and llms.txt machine twins, Community Store/server, and focused S75-S77 coverage already exist. The conformance output is checker noise, not missing product behavior.
- Rejected/deferred “CANON-007 staging implementation”: False premise. A stable staging origin and rollback tooling exist; the real defect is current exact-revision parity, selected separately.
- Rejected/deferred “CANON-045 local authentication build”: Unproven and potentially harmful. The public game exposes no account flow; generated Obelisk files are orphan scaffolds. Make anonymous/accountless posture machine-verifiable rather than inventing project-local auth.
- Rejected/deferred “recent S75-S78 module coverage sweep”: False premise. Community handler/store failures, audio feedback, marquee labels, prediction logic/markup, Dynasty Timeline, and coaching-market accessibility now have focused tests.
- Rejected/deferred “GM firing/game-over loop”: Explicitly prohibited without founder creative direction in current Decisions; audit cannot reverse that canon silently.
- Rejected/deferred “another Co-GM assistant/export”: The S74 bounded allowlisted Co-GM packet already supplies agent-ready context without hidden save access or automatic transmission.
- Rejected/deferred “generic GameSession rewrite”: The 6,567-line authority is real debt, but a broad rewrite is not a bounded beta-readiness item. Preserve one mutation authority and extract only when a concrete subsystem boundary earns characterization work.

## Three recommended design moves

1. Root-fix the two player-visible broken loops first: make Agent Negotiation one reachable canonical contract path, then resolve/grade predictions automatically with truthful margin receipts.
2. Harden Community Stats ingress before any cohort warms: browser receipts must not self-promote evidence tier or mint k=5 by rotating caller-chosen IDs.
3. Recover deploy discipline and headroom together: island non-Overview code, run rendered-pixel verification, prove the exact SHA on stable staging, then publish directly to main without claiming launch readiness.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| canonical-agent-negotiation | implemented | One reachable accessible modal now submits only through /api/contracts/negotiate; deterministic persona, leverage, rival-interest and bounded ledger data are canonical and save-safe; obsolete /api/agent routes were removed; focused and aggregate authority tests pass. |
| prediction-loop-rollover-and-margin-truth | implemented | Dashboard rollover auto-settles the prior week idempotently, grades winner and exact/within-three/within-seven/miss margin truth, tracks mean absolute error, bounds receipts to 48, and exports the same receipt authority. |
| community-participation-capability | implemented | Public mutations require an allowed Origin and a short-lived participant-bound HMAC capability; trusted-address issuance limits prevent one caller minting k=5; evidence is forced to browser-receipt; client retry, withdrawal and adversarial tests pass. |
| non-overview-ui-islands | implemented | Roster, Contracts, Draft and Stats are true lazy islands with intent/focus/idle preload, hydration retry and per-island budgets; the static shell is 610,654/730,000 bytes with 48/58 modules and zero lazy leaks (16.35% byte headroom). |
| exact-sha-staging-parity | implemented | Candidate-side release authority is complete: rebuilt Pages artifact, current release-range 44-capture hash-bound visual receipt, exact-revision deploy/verify scripts, rollback contract, and launchReady false. Exact SHA staging and production proof execute only after the immutable closeout commit. |
| hall-of-fame-ceremony-accessibility | implemented | The ceremony uses the shared modal manager with dialog semantics, focus entry/restoration, Escape/backdrop close, observable clipboard/download outcomes and sanitized filenames; rendered review also raised both new modal close targets to 44px. |
