# Closeout Brief — franchise-architect-football — 25

> Franchise Architect now has a coherent public beta identity, root-domain static surface, richer browser moments, and stricter Windows/Git process guardrails.

## Shipped

- **Franchise Architect identity migration** (9/10 project, 7/10 ecosystem): README/package/context/public metadata now use Franchise Architect and franchise-architect-football.
- **Root-domain public surface** (9/10 project, 8/10 ecosystem): about/play/contact/privacy/terms/IP/status/changelog plus agents/llms/security/robots/sitemap are built and smoke-tested.
- **Browser brand and theme polish** (8/10 project, 5/10 ecosystem): Setup/game screens use the brand mark and a light/dark theme toggle.
- **Engagement moments** (8/10 project, 5/10 ecosystem): Scouting narratives, trade-deadline pressure cards, Hall of Fame ceremony sharing, and sim-watch field feedback are wired.
- **Windows/Git process hardening** (7/10 project, 8/10 ecosystem): safe-spawn/shim inherit non-interactive Git guard env; windows-hide guard passes.
- **Closeout truth surfaces** (7/10 project, 6/10 ecosystem): Session 25 audit, handoff, task board, SIL, truth audit, PROJECT_STATUS, and startup brief are updated.

## Follow-ups

- **Verify deployment**: After push, confirm GitHub Actions/Pages and smoke playfranchisearchitect.com routes.
- **Verify on-domain email**: Confirm football@playfranchisearchitect.com forwards/copies to Studio operations before SPARKED.

## Blockers

- **Launch/SPARKED evidence gate**: On-domain email forwarding and post-push public route/domain evidence are not yet verified.

## Honesty Ledger

- **Parallel aggregate test noise**: One overlapping npm test attempt exited nonzero with truncated output; isolated and final sequential canonical runs passed.
- **Raw child_process regression repaired**: check-windows-hide caught render-startup-brief.mjs before closeout; fixed to use safe-spawn.

## Proof

- Files changed: 39
- Insertions: 524
- Deletions: 334
- Suite: npm test 166/166; npm run test:ui 9/9; build:pages; smoke:pages; windows-hide; blocker/canon checks
