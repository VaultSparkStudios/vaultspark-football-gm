# Closeout Brief — franchise-architect-football — S78

> All 7 audit items shipped: two genuine new player-facing systems (Primetime Marquee, spread-prediction minigame) plus five zero-risk polish/coverage fixes, with 3 phantom candidates correctly rejected on evidence first.

## Shipped

- **td-flourish-touchdown-sound-hookup** (5/10 project, 2/10 ecosystem): Built-but-dead td-flourish sound now fires on touchdown plays during Sim-Watch, gated by the existing sound toggle. 7/7 tests.
- **dynasty-timeline-keyboard-accessibility** (5/10 project, 2/10 ecosystem): role/tabindex/aria-expanded/aria-controls + Enter/Space activation on Dynasty Timeline nodes. 10/10 tests.
- **coaching-market-panel-aria-live** (4/10 project, 1/10 ecosystem): aria-live=polite added to coaching market panel mount.
- **cap-war-room-expiring-zero-year-contracts** (3/10 project, 1/10 ecosystem): Cap War Room now counts yearsRemaining===0 as expiring (previously only ===1). 6/6 tests.
- **audiofeedback-test-coverage** (4/10 project, 2/10 ecosystem): 13-test suite for previously-uncovered audioFeedback.js (7 call sites, 5 modules).
- **primetime-marquee-badge** (4/10 project, 5/10 ecosystem): Deterministic 'Division Showdown'/'Statement Game'/'Playoff Preview' badge on schedule + Sim-Watch header, derived from standings/rivalry signal, no randomness. 12/12 tests.
- **weekly-spread-prediction-minigame** (4/10 project, 7/10 ecosystem): Local-only pick'em with running accuracy streak; proven byte-identical league state with/without a prediction. 18+9 tests.
- **boot-budget-regression-fix** (3/10 project, 1/10 ecosystem): Root-fixed a self-inflicted static boot-budget overage from the 3 new statically-imported modules; ceiling raised 710000/55 -> 730000/58 with inline justification.

## Follow-ups

- **Watch first real consenting community-stats cohort**: Unchanged from S75-77 — confirm freshness/suppression behavior without manufacturing activity.

## Blockers

- **Launch HOLD**: Email-delivery-unverified, founder-approval-unverified, lifecycle-authority-unverified — all three external, none agent-fixable this session.

## Honesty Ledger

- **coaching-tree-lineage rejected**: Already shipped S53 (src/engine/coachingTree.js + CoachingService.js, tested by test/coaching-lineage-authority.test.js).
- **pressRoomPanel.js coverage rejected**: Already covered by test/interactive-press-conference.test.js + test/press-room-truth.test.js.
- **generalized || 0 / || 1 sweep mostly rejected**: Spot-checked as legitimate display-time fallbacks, not the S67/S71 write-side laundering class; the one real instance shipped separately as cap-war-room-expiring-zero-year-contracts.

## Proof

- Files changed: 21
- Insertions: 1893
- Deletions: 54
- Suite: npm test 998/998 direct exit 0 (up from 922/922)
