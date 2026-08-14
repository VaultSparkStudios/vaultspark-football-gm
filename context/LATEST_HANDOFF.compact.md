<!-- generated-by: scripts/compact-handoff.mjs v3.1 -->
<!-- source-hash: 342d9e4c47f9 -->
<!-- generated-at: 2026-08-13T20:12:11.142Z -->

# LATEST_HANDOFF (compact)

SESSION 84 HANDOFF — COMPRESSED

Session
- S84 closed. Next up: S85.

What Shipped (S84)
- Tutorial-route CLS fix: five desktop / four mobile first-run panels now reserve rendered height in public/styles.css (closes GAME_SHELL_DIAGNOSTIC.json shift sources).
- /api/team-archetypes now accepts optional ?team= in both Express (src/server.js) and static (localApiRuntime.js) runtimes; Overview Rival Coach Intel scopes to one opponent. Full-list call site unchanged (needs all 32).
- historyFormatting.js now covered (test/history-formatting.test.js, 5 tests) — closed the last zero-test browser module.
- Node proof 1,094/1,094 across five shards (+16). Pages build/smoke green. No pixel-capture pass (CSS/backend-only, no themed state change — explicit scope call).

Current Intent (S85)
- Run fresh live-code audit from S84 authority. S84 three-item lens is exhausted.
- Do NOT re-litigate rejected phantoms without new evidence: rival-GM persona surfacing, offline/service-worker, the three already-covered untested modules, Depth Chart drag-drop parity.
- Preserve external Obelisk boundary and public-launch HOLD unless new signed evidence.

Now — Top 3
- Re-run scripts/measure-hosted-performance.mjs against live staging to confirm tutorial CLS lands under 0.1 desktop+mobile (contract verified/tested this session, live delta not yet measured).
- Observe first real opted-in Community Stats cohort without manufacturing activity; evaluate historical/shareable aggregates only after cohort proves value.
- Complete Obelisk relying-party registration when signed Ark response arrives; then prove discovery, PKCE, session, logout.

Blockers — Top 3
- Zoho delivery/reply-as unproved.
- SHA-bound founder launch approval unmet.
- Registry SPARKED / local FORGE reconciliation unmet.

Human-Blocked (age)
- Founder launch approval — unmet since ≥S79 (~5 sessions).
- Zoho delivery/reply-as — unmet since ≥S78 (~6 sessions).
- Obelisk signed Ark response (cargo 01JVSA8NLA2EE76D2CFC3958C0) — pending since ~S83.

Invariants
- Tutorial min-height is render-order fix only; never alter lazy-island hydration contract (D-S73.6) or add delay.
- ?team= is additive/backward-compatible; omitting always returns all 32.

Key Files
- public/styles.css, test/tutorial-layout-stability.test.js, docs/performance/GAME_SHELL_DIAGNOSTIC.json
- src/server.js, src/app/api/localApiRuntime.js, public/lib/tabOverview.js
- public/lib/historyFormatting.js, docs/AUDIT_2026-08-13_SESSION84.json

Next session: run a fresh live-code audit from S84 authority; first verify the live staging CLS delta.
