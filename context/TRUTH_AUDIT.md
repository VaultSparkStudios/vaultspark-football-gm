<!-- truth-audit-version: 1.1 -->
# Truth Audit

Overall status: green
Last reviewed: 2026-06-08
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

2026-06-07 note:
- The documented Studio protocol surface now has project-local shims for the helper commands that live `/start` preflight proved were missing; `test:studio` covers the command load path.
- The test suite inventory has grown to 153 known tests across default shards after adding draft pressure, launch readiness, and protocol-shim coverage. This session reran affected/default-adjacent surfaces: core, runtime, studio, Pages build, and Pages smoke.
- The public-domain blocker remains true and intentionally visible: the game repo can explain and surface the Cloudflare/GitHub Pages issue, but it should not silently mutate the shared org-root domain without credentials or founder direction.
- Session 17 reran the full default suite (`npm test`: 153/153), Pages build, and Pages smoke. The repo-local startup shim surface is green, while the newer closeout cost ledger and closeout-brief renderer scripts are not present in this public repo and should be propagated or shimmed before relying on canonical closeout automation.

2026-06-08 note:
- The Launch Readiness public-domain row is no longer a hardcoded permanent blocker. It defaults to the known Cloudflare/GitHub Pages blocker, but can now represent `Ready` or `Needs check` only from explicit status evidence.
- The default test inventory is now 156 passing tests: core 54, runtime 75, sim-contract 22, sim-realism 1, studio 4. `npm test`, `npm run build:pages`, and `npm run smoke:pages` all passed in Session 18.
- Beta feedback issue URLs can include launch-readiness rows and still avoid personal data, tokens, or credentials.
