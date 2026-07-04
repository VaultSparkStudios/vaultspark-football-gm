# Closeout Brief — franchise-architect-football — S38

> Mobile now surfaces the live pending General Manager decision before generic advance pressure.

## Shipped

- **mobile-gm-decision-first** (8/10 project, 5/10 ecosystem): Pending /api/gm-decision prompts feed state.mobilePendingDecision and render as the first mobile decision-deck card.
- **mobile-gm-decision-refresh-affordance** (6/10 project, 4/10 ecosystem): syncMobileLoopOverlay fetches /api/gm-decision in regular season mobile mode and re-renders the overlay from app state.

## Follow-ups

- **launch-email-receipt**: Obtain real received-message proof for football@playfranchisearchitect.com before any SPARKED flip.

## Blockers

- **Launch/SPARKED evidence gate**: Email forwarding/copying proof and current live-origin/routing proof remain required.

## Honesty Ledger

- **No backend duplication**: Rejected a new mobile-only decision engine; reused existing /api/gm-decision and desktop advance gate.
- **UI suite not rerun**: Default shards, focused mobile tests, Pages gates, and doctor passed; latest Playwright UI proof remains Session 36 17/17.

## Proof

- Files changed: 18
- Insertions: 426
- Deletions: 74
- Suite: direct default shards 282/282; focused mobile-loop 9/9; Pages build/smoke; doctor no items
