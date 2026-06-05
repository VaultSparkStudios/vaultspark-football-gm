<!-- truth-audit-version: 1.1 -->
# Truth Audit

Overall status: green
Last reviewed: 2026-06-04
Public-safe summary only. Sensitive verification notes are maintained privately.

2026-05-27 note:
- Public metadata now consistently reflects the proprietary rights posture.
- Football GM has a repo-local Codex startup workaround; global Codex Apps remains enabled outside this project.
- Startup brief generation and blocker preflight now run with local public-safe helper modules.
- GameSession lookup indexes and deterministic browser simulation job IDs are covered by targeted regression tests; full `npm test` timed out locally and remains unproven for this session.
- Obelisk posture is now declared in `context/OBELISK_ADOPTION.md` as Phase 0. The root-level `OBELISK.md` template remains uncommitted because it contains placeholders and is not the canonical project adoption file.
- Continuation verification on 2026-05-27 reconfirmed the targeted changed-surface gates; full `npm test` timed out again after 20 minutes.

2026-06-03 note:
- The prior full-suite timeout statement is obsolete. Default `npm test` now passes locally via bounded shards with 131 passing tests.
- The explicit `npm run test:long` smoke shard passes locally with 3 tests covering same-seed determinism and the career-realism verification pipeline.
- GitHub CI and Pages deploy workflows now include a static client smoke gate before public artifact upload.
- GitHub Pages launch remains blocked only on external provider/repo settings confirmation, not on missing repo-side smoke automation.

2026-06-04 note:
- The prior "external provider/repo settings confirmation" framing is obsolete: Pages is configured (workflow build type), and the real outage is a Cloudflare-origin 403 plus an expired bad_authz GitHub cert on the org root repo's custom domain. The remaining action is Cloudflare-side (founder runbook in TASK_BOARD).
- The "CI matrix green" claim from Session 13 was never true in Actions: both browser-dependent jobs hung at the Playwright install and were timeout-cancelled. Local shard results were accurate; the CI claim is now corrected and the install step is defended. Default suite is 149 passing tests locally.
- New derived surfaces (rivalry strip, epilogue, challenge codes, integrity stamps, feedback URLs) are covered by 18 new tests in the runtime shard.
