# Implementation Plan — Franchise Architect: Football — Session 98

Source: docs/AUDIT_2026-09-03_SESSION98.json (three live-premise-verified items; combined priority 71.6).

## Wave 1 — shared deterministic authorities

1. Add a pure season-transition authority and make the first valid completed season open its existing reckoning exactly once.
2. Add year/phase/week game chronology and route Trophy Road streak derivation through it without inventing chronology for incomplete receipts.
3. Add an orientation-aware roving-tab index authority for the existing primary navigation contract.

## Wave 2 — browser integration

1. Replace the redundant prevDashboardPhase sentinel with the previous/current dashboard transition contract.
2. Consolidate the duplicate Arrow/Home/End paths through the existing activateTab authority.
3. Return focus to the visible toggle when a keyboard selection closes and inerts the tablet drawer.

## Wave 3 — proof

1. Focused Node tests for year-one transition, cross-season streak order, unknown chronology, and tab wraparound.
2. Playwright desktop and tablet-drawer keyboard journey.
3. Full canonical, responsive rendered-pixel, staging, production, and exact-revision release gates.