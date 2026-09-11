# Audit — Franchise Architect: Football — Session 105

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched browser football management game
- Rubric: product; game-loop payoff, truthful feedback, static-host safety and measured release readiness; staging: Stable Cloudflare staging before authorized main promotion and production deployment
- Profile source: arc-profile (studio-ops copy, --project .; no local copy exists), context/PROJECT_STATUS.json, context/LATEST_HANDOFF.md

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | HIGH | Observability truth; session authority | 1.0h | 8 | 6 | 30.3 | **handoff-session-authority-never-parsed** — Teach parseHandoffCloseoutAuthority the 'Latest Handoff — Session N → Session M' form (N is the closed session; M is only intent and never counts), and route brief-semantic-fingerprint through the same parser so the heading is declared once. |
| 2 | HIGH | Observability truth; closeout write-back | 1.5h | 7 | 6 | 23.2 | **sil-rolling-status-has-no-writer** — Write scripts/render-sil-rolling-status.mjs that derives the whole block from the entries themselves — last session, total, delta, 3/5/10/25/all averages, sparkline and intent rate — so the header is a projection, never an authority. |
| 3 | MEDIUM | Process quality; audit truth | 0.8h | 6 | 5 | 20.6 | **premise-decay-never-fails-anything** — Studio-shard test: checkAudit over every docs/AUDIT_*.json, assert openContradicted == 0 and unverified == 0. |
| 4 | MEDIUM | Simulation truth; measurement validity | 2.0h | 7 | 5 | 17.5 | **elite-density-unmeasured-under-declared-roster** — L1 on two further seeds, decompose the elite cohort by position room, and state whether the residual is intake/filter or roster shape. |
| 5 | LOW | Ecosystem; cross-repo coherence | 0.5h | 4 | 4 | 12.1 | **profile-lens-cache-has-no-refresh-path** — L1 with the proposed fix: the renderer computes the lens (or renders 'no profile source' honestly) instead of reading a TTL cache it cannot refresh. |
| 6 | LOW | Process quality; decision debt | 0.3h | 3 | 3 | 7.7 | **brief-preflight-importer-question-open-three-sessions** — L1 and drop the item from the handoff's next-work list. |

Combined priority: **111.0**.

## Premise verification and rejected phantom work

- No rejected candidates were recorded.

## Three recommended design moves

1. Teach parseHandoffCloseoutAuthority the 'Latest Handoff — Session N → Session M' form (N is the closed session; M is only intent and never counts), and route brief-semantic-fingerprint through the same parser so the heading is declared once.
2. Write scripts/render-sil-rolling-status.mjs that derives the whole block from the entries themselves — last session, total, delta, 3/5/10/25/all averages, sparkline and intent rate — so the header is a projection, never an authority.
3. Studio-shard test: checkAudit over every docs/AUDIT_*.json, assert openContradicted == 0 and unverified == 0.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| handoff-session-authority-never-parsed | implemented | parseHandoffCloseoutAuthority recognises the Latest Handoff — Session N → Session M form (N only); brief-semantic-fingerprint routes through the same parser instead of its own never-matching literal. session-authority.test.js binds the LIVE handoff to the newest SIL entry and the fingerprint, with a negative control reproducing the pre-S105 pattern. Brief now renders handoff=S104. |
| sil-rolling-status-has-no-writer | implemented | scripts/render-sil-rolling-status.mjs derives the block from live+archive entries (58 unique /1000 sessions, calibration excluded), adds Intent rate (denominator = entries recording an outcome) and carries only Velocity/Debt, labelled carried. The derived Avg3 is 959.7 against the hand-written 974.7, and the hand-written 87-session population was not reproducible from /1000 scores. A studio test binds the committed block to a fresh render. |
| premise-decay-never-fails-anything | implemented | session105-brief-authority-writers walks every docs/AUDIT_*.json through checkAudit and fails on open decay or unverified premises, with a fixture negative control. On its first run it caught a live instance: this session's own sidecar, whose items 1-3 had shipped while still marked planned. |
| elite-density-unmeasured-under-declared-roster | implemented | Shipped at the L1 rung plus the L2 room decomposition on the canonical seed; the L2 cross-seed readings were NOT taken and are the stated next step. Canonical seed 20260306, ten seasons: active-roster 90+ share 0.4% -> 2.8%, watch (S103 carried 3.3% on the pre-S104 shape). A probe reproducing the clone path (2.79% vs gated 2.8%) puts 64% of the elite cohort in QB (11/95, 11.6%) and OL (19/311, 6.1%), which are 24% of the roster; those are the only rooms generated above their own mean potential (OL 82.1 vs 79.8, QB 82.7 vs 80.9). No statistic or generator change shipped on one seed. |
| profile-lens-cache-has-no-refresh-path | implemented | Shipped as Ark pattern-share cargo 01K291HHVU080E58C015E99770 to vaultspark-studio-ops with the proposed fix (compute the lens in the renderer, or render an honest no-profile-source line). No local change is legal: renderer and lens are both propagated. Recorded in DECISIONS S105-5. |
| brief-preflight-importer-question-open-three-sessions | implemented | Closed as DECISIONS S105-4: the renderer cannot import brief-preflight because it statically imports a contractually forbidden file, and the S104 import gate fails the suite the moment it is wired. The module stays in the tree, inert by design. |
