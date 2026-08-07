# Audit — Franchise Architect: Football — Session 74

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric with game overlay: +2 engagement, +1 UI/UX and +1 speed/organization; static-host, rendered-pixel, dual-audience and observability-honesty gates remain binding; staging: independent Cloudflare Pages staging exists; deploy and verify the exact candidate there before production
- Profile source: clean main at origin parity, doctor blockingFailing 0, latest CI and deploy runs, live source sampling, the Session 73 audit contract, current public metadata, and the canonical game-loop contract
- Game-loop review: tightness 9 · progression 9 · session engagement 9 · retention 8 · soul fidelity 9 · overall 8.8
- Evidence caveat: Structural score only. No cohort retention or fun claim is inferred. Retention remains the lowest axis because the new cross-season Decision Anthology is visible only inside the one-time season review, not in the permanent History surface.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Retention / dynasty memory / UI | 4.0h | 9 | 8 | 83.6 | **persistent-decision-anthology** — Add a Decision Archive History view with a year selector, source-coverage status, receipted turning-point cards and explicit non-causal/missing-evidence copy; hydrate it from the same dashboard authorities as Season Epilogue and cover navigation plus sparse states. |
| 2 | FIRE | Release evidence / CI reliability | 2.0h | 10 | 6 | 45.0 | **deterministic-sim-watch-evidence** — Extract a deterministic visual-game resolver that advances through bounded real runtime states, rejects byes/incomplete receipts, returns an exact archived game id with play-by-play, and fails with a diagnostic ledger rather than probabilistic absence; unit-test the resolver and wire responsive evidence to it. |
| 3 | HIGH | AI collaboration / dual audience / privacy | 4.0h | 8 | 9 | 41.8 | **co-gm-briefing-packet** — Create a versioned Co-GM briefing packet with allowlisted identity, current command, pressure, cap/roster posture, thesis and bounded receipts; expose Copy JSON and Download buttons in Franchise Command, declare the schema in agents.json, and surface exact disclosure/omission copy. |

Combined priority: **170.4**.

## Premise verification and rejected phantom work

- Rejected/deferred “Treat the latest Pages failure as infrastructure flakiness”: Rejected. Run 31069185396 failed at an exact source line after one advance-week request returned no recentBoxScores/latestBoxScore gameId. The script requires that random outcome and has no deterministic construction path.
- Rejected/deferred “The Decision Anthology is already a permanent archive”: Rejected against live imports. buildDecisionAnthology is consumed only by seasonEpilogue.js; History has only Season Awards and Hall of Fame views, so prior decision volumes vanish with the season-review modal.
- Rejected/deferred “agents.json already provides live franchise state to agents”: Rejected. agents.json contains project metadata and four static entrypoints only. It exposes no bounded dynamic decision-state schema, UI affordance or privacy contract.
- Rejected/deferred “Export the complete save as the Co-GM context”: Rejected. The save contains far more state than a collaborator needs. A fixed allowlist of current pressure, decisions, roster/cap posture, thesis and recent receipts is safer, smaller and easier to validate.
- Rejected/deferred “Mark contact email verified because MX records exist”: Rejected by live DNS and the Studio email ledger. The domain has Cloudflare forwarding MX, but no delivered-to-founder receipt and no Zoho reply-as-alias capability. DNS presence is not delivery or reply proof.
- Rejected/deferred “Resolve lifecycle drift by editing Studio Ops directly”: Rejected by CANON-018. The authoritative registry is sibling-owned; any reconciliation request must travel as signed Ark cargo.

## Three recommended design moves

1. First repair the release evidence authority so one scheduled bye or incomplete week cannot make a rendered-pixel gate nondeterministic.
2. Then promote the cross-season Decision Anthology from a one-time epilogue fragment into a permanent year-selectable History archive.
3. Finally expose a bounded Co-GM packet that humans can copy to an AI collaborator without exporting a save, credentials, hidden state or invented advice.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| persistent-decision-anthology | shipped | pure archive model and rendering tests; History navigation browser journey; dark/light desktop/mobile captures |
| deterministic-sim-watch-evidence | shipped | focused evidence-fixture test; mobile responsive evidence; complete three-viewport evidence; Pages workflow-equivalent build/smoke |
| co-gm-briefing-packet | shipped | pure packet allowlist and size-bound tests; copy/download UI test; agents.json schema declaration; dark/light desktop/mobile capture |
