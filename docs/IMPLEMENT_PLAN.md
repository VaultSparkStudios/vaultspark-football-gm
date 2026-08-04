# Implementation Plan — Session 70

Source: `docs/AUDIT_2026-08-03_SESSION70.json`.

Efficiency-sorted execution (surface-grouped waves; each file/system loaded once; token-cost item inside the final ops wave; production promotion last so it ships a candidate containing everything else).

## Wave 1 — Website surface (public/*.html, setup.js, build-pages)
1. `public-truth-and-privacy-pass` (rank 6) — true/current/audience-correct public claims, real share image, no internal ops leakage.
2. `website-ia-consolidation` (rank 11) — 11 pages → 7, one build-injected footer, dated release notes, canonical/sitemap hygiene.
3. `root-funnel-instant-play` (rank 1) — state-branched home, one-click Quick Start with random team, truthful runtime copy.

## Wave 2 — Game loop reward layer (engagement/gameFlow/tab modules)
4. `reward-beats-hot-paths` (rank 5) — week recap, draft-pick verdict, post-trade verdict, wire the dead mentorship badge.
5. `achievement-trophy-case` (rank 3) — cross-save registry + trophy case UI + unlock toasts + share cards.
6. `synth-audio-haptics-layer` (rank 2) — WebAudio tone palette, mobile haptics, reduced-motion completeness.

## Wave 3 — Engine intelligence (src/engine + shared command seam)
7. `rival-gm-persona-memory` (rank 4) — deterministic named personas, bounded receipted grudge ledger, intel surfacing.
8. `living-difficulty-controls` (rank 9) — mid-game preset re-patch with receipts, opt-in bounded adaptive mode.

## Wave 4 — Platform (persistence, payload, service worker)
9. `indexeddb-persistence-promotion` (rank 7) — browser IDB store with transactional migration + fail-closed fallback.
10. `tab-code-splitting-sw-hardening` (rank 10) — lazy tab modules, SW resilience, payload receipt.

## Wave 5 — Ops + release (after staging re-verification)
11. `skill-cost-ledger-repair` (rank 12) — ledger records again; staleness self-announces.
12. `production-parity-promotion` (rank 8) — promote the staging-verified candidate containing this session's work.

Every item uses its L2 recipe. Focused verification after each item; canonical Node, browser, Pages, responsive/theme, doctor, and staging gates at closeout. Partial work is never marked shipped.
