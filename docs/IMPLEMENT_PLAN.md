# Implement Plan — Session 21

## Wave 1 — Recovery and startup

- Status: done
- Evidence: preserved dirty worktree, `git pull --rebase origin main` returned already up to date, restored WIP, wrote Codex session lock, ran startup preflights.

## Wave 2 — Infrastructure audit verification

- Status: done
- Evidence: stale Session 19 game audit rejected for this arc's infrastructure rubric; live diff and guard probes identified current infrastructure work.

## Wave 3 — Root fixes

- Status: done
- `safe-spawn-window-storm-guard`: shipped safe-spawn wrapper and windows-hide guard.
- `canon-044-wave-enforcement`: shipped guard and repaired `docs/SESSION_PROTOCOL.md` after the guard found a real gap.
- `blocker-parser-truth-repair`: restored task-board fallback parsing and GitHub Pages repo-secret blocker classification after focused tests failed.
- `honest-sil-context-telemetry`: shipped shared context verdicts, cost ledger rollups, SIL v6 scaffold, and related status/brief wiring.

## Wave 4 — Verification

- Status: done
- Evidence: `node --check` across changed JS/MJS files; `npm run test:studio`; `npm test`; `npm run build:pages`; `npm run smoke:pages`; `node scripts/check-windows-hide.mjs`; `node scripts/check-canon-044-waves.mjs`.

## Wave 5 — Closeout and deploy

- Status: in progress
- Remaining: closeout write-back, staged secret scan, commit, push to `main`, and verify GitHub Pages deployment/CI state.