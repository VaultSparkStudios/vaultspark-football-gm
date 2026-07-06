# Audit 2026-07-06 Session 44 - Franchise Architect: Football

Fresh `/goal /arc` audit after Session 43. Premises were checked against the live startup brief, deterministic code sample, existing trade deadline browser surface, focused grep scans, and the Gridiron-GM vault merge review. The project profile is app/public-unlaunched with product/gameplay weighting.

## Summary

- Ranked items: 1
- Combined priority: 55.8
- Top item: deadline-offer-ritual
- Primary list read: current genius cache was fresh but exhausted from Session 43, so this audit generated a new verified candidate from live code rather than recycling a stale row.
- Release gate read: no SPARKED flip attempted; launch remains blocked on real received-message proof for `football@playfranchisearchitect.com` forwarding/copying and current live-origin/routing evidence.

## Ranked Plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | Gameplay immersion / trade deadline | 0.8h | 8 | 8 | 55.8 | **deadline-offer-ritual** - The trade deadline panel exists and is browser-visible, but `public/lib/tradeDeadlineFrenzy.js` currently renders advisory copy only. **Recipe:** upgrade `buildTradeDeadlineFrenzy()` to generate deterministic offer cards with partner, target need, cap impact, asset ask, constraint, and risk from live dashboard inputs; render those fields in the existing panel; add focused tests proving role selection, determinism, and cap/challenge-safe constraints. |

## Rejected / Deferred With Evidence

- **sparked-flip** - still blocked on real received-message proof that `football@playfranchisearchitect.com` forwards/copies to Studio operations plus current live-origin/routing evidence.
- **live-field-visualization** - rejected as stale: Sim-Watch already has a field-position layer in `public/lib/engagementFeatures.js`; deeper work needs fresh play-by-play data design rather than a quick port.

## Execution Log

| Item | Status | Evidence | Verification |
|---|---|---|---|
| deadline-offer-ritual | Shipped | `public/lib/tradeDeadlineFrenzy.js` now returns structured deterministic deadline offers with partner, target need, cap impact, asset ask, constraint, risk, and role/cap metadata; `public/styles.css` renders the offer terms; `test/trade-deadline-frenzy.test.js` covers buyer, cap/challenge constraints, and determinism. | `node --check public/lib/tradeDeadlineFrenzy.js`; `node --test test/trade-deadline-frenzy.test.js` 3/3. |

