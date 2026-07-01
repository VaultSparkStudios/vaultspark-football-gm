# Audit 2026-07-01 — Session 25

Scope: `/goal /arc` continuation for Franchise Architect: Football, using the game/product overlay despite the profiler's stale infrastructure classification. Live tree evidence showed an in-progress rebrand/public-surface/Windows-process-hardening pass rather than a clean Session 24 state.

## Ranked Findings

| Rank | Axis | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | Brand / Public Surface | The project identity had split between legacy `VaultSpark Football GM` paths and the intended `Franchise Architect: Football` product name, leaving public metadata, package identity, Pages paths, and feedback URLs inconsistent. | `README.md`, `package.json`, `context/STUDIO_MANIFEST.json`, `public/agents.json`, `scripts/build-pages.mjs`, `test/beta-feedback.test.js` | Implemented |
| 2 | Public Launch Readiness | The public surface needed root-domain canonicalization, richer universal pages, favicon/brand marks, and route smoke coverage for the new canonical and legacy paths. | `public/about.html`, `public/ip.html`, `public/status.html`, `public/changelog.html`, `public/sitemap.xml`, `scripts/smoke-pages.mjs` | Implemented |
| 3 | Engagement / Retention | Three high-emotion gameplay surfaces were present but needed wiring: scouting narratives, trade-deadline pressure cards, and Hall of Fame ceremony sharing. | `public/lib/prospectNarratives.js`, `public/lib/tradeDeadlineFrenzy.js`, `public/lib/hallOfFameCeremony.js`, `public/lib/tabDraft.js`, `public/lib/tabOverview.js`, `public/lib/tabHistory.js` | Implemented |
| 4 | Browser UX | The game lacked a verified light/dark theme toggle and stronger brand lockup on setup and game screens. | `public/lib/themeMode.js`, `public/index.html`, `public/game.html`, `public/styles.css` | Implemented |
| 5 | Process Hardening | Windows process safety still had a gap: Git/credential/editor prompts could open or hang despite `windowsHide:true`, and the startup brief v5 branch briefly reintroduced a raw `child_process` import. | `scripts/lib/git-window-guard.mjs`, `scripts/lib/safe-spawn.mjs`, `scripts/lib/windows-hide-shim.cjs`, `scripts/check-windows-hide.mjs`, `scripts/render-startup-brief.mjs` | Implemented and repaired during verification |
| 6 | Observability Honesty | Startup/status helpers needed better stale-summary, test-deferral, context-meter pricing, and append-only guard behavior so closeout/startup surfaces do not overclaim. | `scripts/render-startup-brief.mjs`, `scripts/lib/brief-blocks.mjs`, `scripts/context-meter.mjs`, `scripts/lib/context-wipe-guard.mjs`, `scripts/lib/doctor-remedies.mjs` | Implemented |

## Verification Plan

- Syntax check changed scripts and new browser modules.
- Run windows-hide guard after repairing any direct `child_process` import.
- Run studio shard, runtime shard, full default suite, Pages build/smoke, and Playwright UI.
- Keep launch readiness blocked unless on-domain email forwarding and post-deploy public route evidence prove otherwise.

## Deferred / Honesty Ledger

- Do not mark SPARKED: `football@playfranchisearchitect.com` forwarding is not verified, and public launch readiness still requires post-push domain evidence.
- Do not delete legacy route mirrors yet: `vaultspark-football-gm` and `games/vaultspark-football-gm` paths remain compatibility aliases until live traffic and links are migrated.