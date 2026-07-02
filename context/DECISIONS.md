# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.

## 2026-07-02 — Counterfactual features must be explicitly non-canon and side-effect free

**Decision:** The Monday Morning QB what-if replay is a deterministic counterfactual read model only. It may summarize an alternate outcome, but it must not mutate standings, stats, records, saves, injuries, or league history.

**Rationale:** Counterfactuals are useful for retention and learning, but fabricated alternate outcomes would violate observability honesty if they touched source-of-truth state. Keeping the replay behind a pure builder and API response preserves trust while still giving players a satisfying post-loss ritual.

**Pattern established:** Any future alternate-history feature must include an explicit non-canon note, deterministic inputs, and mutation-safety tests before it appears in the UI.

## 2026-07-02 — Return hooks should be interruptible status UI, not blocking modals

**Decision:** The return digest overlay should not be `aria-modal` or intercept normal navigation outside its card. It remains visible and actionable, but clicks outside the card pass through and Escape still dismisses it.

**Rationale:** Playwright proved the prior modal behavior could trap the player after a reload and block unrelated history/settings navigation. A return hook is engagement garnish, not a hard gate.
## 2026-06-15 — Browser-side pure functions are testable in Node if they don't touch the DOM at import time

**Decision:** Test `public/lib/*.js` functions in Node.js by importing them directly, relying on the fact that the import chain (`appState.js` → `createApiClient.js`) is pure JS with no DOM access at module evaluation time.

**Rationale:** Several existing tests (`draft-war-room`, `launch-readiness`, `beta-feedback`) already do this successfully. The pattern holds as long as the tested function itself doesn't call DOM APIs — `isMiracleRun`, `getInboxActionTab`, `buildRivalCoachIntel` are all pure logic functions.

**Pattern established:** When a `public/lib/` function is pure (no DOM calls in its own body), test it directly in Node. When it does use DOM (e.g. `appendSeasonEpilogue`), use source-inspection or indirect tests instead.

## 2026-06-15 — Smart-quote encoding bugs in template literals are silent until Node.js parses the module

**Decision:** When editing browser-side files with the Edit tool, always use ASCII straight quotes (`"`, `'`) not smart/curly quotes (U+201C, U+201D, U+2018, U+2019) as JavaScript string delimiters. Fix discovered smart-quote delimiters immediately when found.

**Rationale:** Browsers silently accept smart quotes in some contexts; Node.js v24 does not. The bug in `seasonEpilogue.js` prevented importing `isMiracleRun` for testing and would have broken any server-side use of the module. Encoding issues of this type are only discovered when the module is actually parsed by Node.

**Pattern established:** Run at least one Node.js import of any edited `public/lib/` file as part of the verification step, even if the test only covers a pure sub-function.

## 2026-06-08 — Launch readiness status follows evidence, not a permanent blocker string

**Decision:** The Settings Launch Readiness panel should default to the known Cloudflare/GitHub Pages blocker, but its public-domain row must be driven by explicit status evidence and support `Blocked`, `Ready`, and `Needs check`.

**Rationale:** Hardcoding `Blocked` was useful while diagnosing the outage, but it would become an inaccurate browser surface after the runbook succeeds. Evidence-driven status keeps CANON-031 observability honesty intact and lets the beta cockpit flip only after a public URL smoke proves reachability.

**Pattern established:** Public launch blockers should have a truthful state model even when the current state is blocked; never require a code edit just to stop a stale warning from lying.

## 2026-06-04 — Agent-attempt-first blocker handling, but no unilateral org-root domain surgery

**Decision:** The "GitHub Pages settings need external confirmation" blocker was reclassified by attempting it: the agent verified `gh` auth, ran the Pages health/cert APIs, executed a safe same-value cname PUT, and root-caused the outage (Cloudflare-proxied apex blocks GitHub ACME; Cloudflare serves a 403). The agent deliberately did NOT delete/re-add the custom domain on `VaultSparkStudios.github.io` because that repo's domain serves the entire portfolio and the action is outward-facing.

**Rationale:** Blocker preflight protocol requires an agent attempt before any human-blocked label, but portfolio-wide outward-facing changes on a repo outside the session's scope need founder sign-off. Diagnosis plus a precise runbook converts a vague external blocker into a 10-minute founder task.

**Pattern established:** Probe and diagnose cross-repo blockers freely; mutate shared org-level surfaces only with explicit founder direction.

## 2026-06-04 — Integrity stamps live in save metadata, not inside snapshots

**Decision:** Save-corruption detection stamps an FNV-1a checksum into the save *metadata* record (and a sidecar file for gist sync) rather than mutating the snapshot payload itself.

**Rationale:** Keeping the payload byte-identical preserves backward compatibility (legacy saves load unverified rather than failing), keeps snapshot schema migrations independent of the integrity layer, and lets the checksum cover the exact serialized string written to storage.

## 2026-05-27 — Obelisk posture declared in public-safe context

**Decision:** Declare Football GM's Obelisk posture in `context/OBELISK_ADOPTION.md` as `phase-0-declared`.

**Rationale:** CANON-021 requires every project to declare an Obelisk posture. This repo currently has no production auth migration to claim, so Phase 0 is the accurate public-safe state.

---

## 2026-04-06 — CANON-008: All VaultSpark IP is proprietary by default

**Decision:** All code, content, assets, and designs created by VaultSpark Studios are proprietary and all rights are reserved by VaultSpark Studios LLC unless an open-source license is explicitly declared and approved by the Studio Owner. No agent may apply or imply an open-source license without Studio Owner direction.

**Applies to this project:** Yes — `docs/RIGHTS_PROVENANCE.md` reflects this project's specific license status.

**Rationale:** VaultSpark Studios LLC is a commercial entity building owned IP. Open-sourcing any project without deliberate strategy gives away commercial advantage and creates ownership ambiguity.

**Studio canon:** `vaultspark-studio-ops/docs/STUDIO_CANON.md` → CANON-008

---

## 2026-05-27 — Project-local Codex Apps startup workaround

**Decision:** Keep global Codex Apps enabled, but add Football GM-specific launch wrappers that run Codex with `--disable apps` for this repo only.

**Rationale:** The failing startup path is the built-in `codex_apps` MCP handshake, not the entire GitHub connector capability. Other Studio projects may need Apps, so a repo-local wrapper avoids a portfolio-wide capability loss while preserving a reliable startup path here.

**Pattern established:** When an agent runtime feature fails in one repo, prefer a project-local launcher or profile before changing global Codex configuration.

---

## 2026-05-27 — Package metadata follows proprietary posture

**Decision:** Package metadata should not advertise an open-source license for VaultSpark Football GM.

**Rationale:** `docs/RIGHTS_PROVENANCE.md` declares the project proprietary under CANON-008. `package.json` and the lockfile root entry should not contradict that public rights posture.

---

## 2026-04-13 — Session 8: Engagement-first architecture for beta

**Decision:** All new features in Session 8 prioritize user retention and emotional engagement over raw feature count. The "Franchise Moment" card, GM Decision modal, and Sim-Watch overlay are all designed to create memorable individual moments that drive word-of-mouth sharing.

**Rationale:** Competitive analysis vs Football-GM shows the moat is emotional engagement, not feature parity. Football-GM has more features; VaultSpark wins on narrative feel, world-state depth, and cinematic moments.

**Pattern established:** Every session hereafter should ship at least one "moment-generating" feature — something that makes the user want to tell someone else about their game.

---

## 2026-04-13 — Session 8: Priority Inbox over notification spam

**Decision:** News items are classified into CRITICAL / IMPORTANT / FLAVOR tiers rather than treating all events equally. CRITICAL and IMPORTANT items persist in the inbox until dismissed; FLAVOR items stay in the ticker only.

**Rationale:** Previous news ticker showed all events with equal weight, causing users to tune it out. Hierarchical inbox forces attention only where it matters (cap violations, QB injuries, trade deadlines) without overwhelming for minor events.

---

## 2026-04-13 — Session 9: Engagement endpoints mirrored into localApiRuntime

**Decision:** The 5 Session-8 API endpoints (`/api/season-arcs`, `/api/gm-decision`, `/api/records/franchise`, `/api/team-archetypes`, `/api/franchise-moment`) and their helper functions (`_deriveGmArchetype`, `_generateSeasonArcs`, `_generateGmDecisions`) were duplicated into `localApiRuntime.js` rather than extracted into a shared module.

**Rationale:** The shared-module refactor would have touched server.js (a stable deployed file) and added a new dependency edge to the engine. The localApiRuntime is the testable surface; inlining the helpers keeps the change additive and zero-risk to the deployed server.

**Pattern established:** Server-only functions that need to be tested should be mirrored into localApiRuntime.js until a natural shared-module refactor opportunity arises.

---

## 2026-04-13 — Session 9: Pure logic tests mirror server internals inline

**Decision:** `checkRateLimit`, `validateParam`, `deriveGmArchetype`, and `pruneSimJobs` are tested by inlining equivalent logic into the test file rather than exporting from server.js.

**Rationale:** Exporting from server.js would require adding `export` keywords to a module that has no exports and is a direct HTTP entry point — architectural mismatch. Inline logic tests verify the algorithm; integration tests via localApiRuntime verify the wiring.

---

## 2026-04-13 — Session 8: Rate limiting at 50 req/min per IP (not per session)

**Decision:** Rate limiting is applied at the IP level with a 60-second window, not per user session (no auth exists). The limit is 50 req/min — generous enough for normal gameplay, tight enough to prevent simple DoS.

**Rationale:** No auth system exists; IP is the only available identity signal. 50 req/min covers all legitimate use cases (most users hit <10 req/min in normal play) while blocking automated flooding.

---

## 2026-06-30 — Infrastructure guardrails must be executable, not remembered

**Decision:** For Studio protocol infrastructure in this repo, prefer small guard scripts and shared helper modules over prose-only conventions. Session 21 applied that to child-process spawning (`safe-spawn` + `check-windows-hide`), Wave-list discipline (`check-canon-044-waves`), context-meter verdicts, and SIL telemetry.

**Rationale:** These surfaces affect agent reliability and founder-visible truth. A convention that depends on every future agent remembering it is weaker than an executable check that fails with concrete file/line evidence.

**Pattern established:** When a public-safe Studio protocol rule is propagated into this repo, pair the prose with a local guard or focused test whenever practical.

## 2026-06-30 — Session 22 honest launch deferral

Decision: Do not treat `vaultsparkstudios.com` as ready from repo-local evidence. Session 22 shipped game/runtime/protocol improvements, but the public-domain blocker remains Cloudflare/GitHub Pages-side until the existing runbook is applied or credentials are added and a public URL smoke passes.

Rationale: CANON-031 observability honesty. A green local suite, Pages bundle, and static smoke prove the deployable repo, not the external custom-domain path.

---

## 2026-06-30 — Session 23 public reachability evidence split

**Decision:** Treat public reachability as partially improved but not fully release-ready: `https://vaultsparkstudios.com/vaultspark-football-gm/` returned HTTP 200 on 2026-06-30 and Actions/Pages workflows are green, but GitHub Pages API still reports the custom-domain certificate as `bad_authz` with an expiry of 2026-06-02.

**Rationale:** CANON-031 observability honesty. A Cloudflare-edge 200 proves the old blanket "Cloudflare 403" wording is stale, while the GitHub Pages certificate state prevents claiming the custom-domain path is fully healthy.

**Pattern established:** Launch Readiness must distinguish route reachability, deploy workflow health, and certificate/domain health instead of collapsing them into a single green/red label.

---

## 2026-06-30 — Session 24 protocol commands must be executable locally

**Decision:** Project-local protocol commands referenced by `docs/SESSION_PROTOCOL.md` should have executable shims in this repo when they are public-safe and repeatedly used by arcs. Session 24 added `node scripts/ops.mjs innovation-pack` instead of continuing to write the innovation expansion manually.

**Rationale:** A required protocol step that depends on manual reconstruction is fragile and creates inconsistent closeout evidence. A small source-derived generator with `--dry-run` support gives future agents a deterministic queue and lets tests cover the command without rewriting real docs.

**Pattern established:** When a protocol step is repeatedly marked "manual because command missing," implement the smallest honest local command and test the command path.

---

## 2026-06-30 — Startup SIL category rows prefer v3 status values

**Decision:** The startup brief should prefer `PROJECT_STATUS.json.silCategoriesV3` for the v3 category rows when recent SIL entries no longer contain the old table format.

**Rationale:** Rendering zeroes under a 921/1000 headline is a CANON-031 truth bug. The status JSON already carries the current category source of truth and must drive the founder-facing brief when the append-only SIL prose cannot be parsed as a table.

---

## 2026-07-01 — Franchise Architect becomes the canonical public identity

**Decision:** Treat `Franchise Architect: Football`, `franchise-architect-football`, and `https://playfranchisearchitect.com/` as the canonical public identity for this game, while keeping legacy `vaultspark-football-gm` route mirrors as compatibility aliases.

**Rationale:** The public beta needs a product-specific brand and root-domain route surface before launch. Removing old aliases immediately would risk breaking existing links and smoke assumptions, so aliases stay until live migration evidence supports removal.

**Pattern established:** Product rebrands must update human pages, machine-readable agent files, package/repo metadata, feedback links, Pages build paths, and smoke tests in the same session so observability does not split across names.

---

## 2026-07-01 — Protocol cache source ordering must be filename-stable

**Decision:** Project-local audit/queue cache helpers should rank audit sources by encoded date/session in the filename, not mutable file modification time.

**Rationale:** Startup and smoke tests can touch older generated files during verification. If cache freshness follows mtime alone, `/go` can point at a prior session even when a newer audit exists, which is a CANON-031 truth bug.

**Pattern established:** For append-only session artifacts named with session IDs, derive recency from the session/date identity first and use mtime only as a tie-breaker.

## 2026-07-01 — Session 28 Launch Evidence Must Prove Email Delivery

Decision: Launch/SPARKED readiness for Franchise Architect: Football is gated by repo-local launch evidence, including both public route reachability and explicit proof that the on-domain contact address forwards/copies to Studio operations.

Rationale: Public route checks can be automated, but email forwarding cannot be assumed from static files or DNS intent. The evidence report must remain `blocked` until a real delivery receipt is supplied.

Impact: `scripts/launch-evidence-report.mjs` and `ops launch-evidence` may green public routes while still blocking launch on missing email evidence. This is the desired honest state, not a failure to paper over.

---

## 2026-07-02 — Session 29: additive situational play-calling over drive-engine rewrite

**Decision:** Implement fourth-down decision-making and situational play selection as a real, tracked-within-the-drive down/distance/field-position state machine layered on top of the existing drive-summary engine, rather than rearchitecting `simulateDrive` into a full down-by-down play-by-play engine.

**Rationale:** The audit's literal ask ("no down-and-distance awareness, no 4th-down go-for-it model") is real, but the drive engine's yardage/completion/sack/interception formulas are tuned against a heavily-guarded regression suite (calibration, monte-carlo, stats, ratings, career-realism, determinism). A full rearchitecture in one session risks destabilizing calibration that took many prior sessions to tune, with no safety net beyond re-tuning tolerances after the fact. The additive design tracks real down/distance/field position, replaces the flat coin-flip play selector with a situational one, and adds a genuine go/kick/punt fourth-down brain — reusing the exact existing FG-make and punt-yardage formulas for the forced-4th-down path, and leaving the natural-end-of-drive resolution path (for drives that exhaust their rolled play budget before a real 4th down) completely untouched byte-for-byte.

**Verification:** Full calibration/monte-carlo/stats/ratings/career-realism/determinism regression suite passed unchanged before and after; a new end-to-end test proves forced fourth-down kicks/punts fire in real simulated games.

**Pattern established:** When an audit item's literal scope would require rearchitecting a heavily-calibrated system, prefer an additive layer that changes *decisions* (what play is called, whether to go for it) without touching the *formulas* that produce the outcome distributions those decisions feed into. Verify with the full regression suite, not just the new feature's own tests.

---

## 2026-07-02 — Session 29: honest deferral under a session-limit signal

**Decision:** Three planned audit items (what-if-replay, silent-error-surfacing, service-scaffold-honesty) were not started this session. Two were dispatched as background subagents but returned no usable result alongside two consecutive "you've hit your session limit" notifications; a third (return-hook-digest work) was completed directly. Rather than dispatch further large parallel work under that signal, the session consolidated: verified all in-flight and completed work (tests, syntax checks, Pages build/smoke), fixed a real bug the background agent's partial work left behind (ARIA `aria-selected`/`tabindex` markup shipped in `game.html` but `activateTab()` was never updated to keep it in sync — fixed directly), and moved to closeout.

**Rationale:** CANON-019/031 — try first, but do not fabricate progress or push further under a resource-ceiling signal when the honest move is to stabilize and hand off cleanly. A background agent producing no result text is not evidence its file changes are safe; each touched file was diffed and verified before being trusted.

**Pattern established:** When a background subagent's notification carries a session-limit/resource-ceiling signal instead of a result, treat its partial file changes as unverified until diffed directly — do not assume completion from the dispatch prompt's intent. Stop dispatching new large work and consolidate.

---

## 2026-07-02 — Session 31: task board is the cache fallback truth source

**Decision:** When the latest audit lacks an Execution Log, `scripts/cache-genius-list.mjs` must join completion status from `context/TASK_BOARD.md` by audit slug before reporting `/go` open work.

**Rationale:** Session 29/30 completion evidence was recorded in the task board, handoff, current state, and status JSON, but the cache helper only trusted an audit Execution Log section that did not exist in `docs/AUDIT_2026-07-01_SESSION29.md`. Reporting those shipped items as open violated CANON-031 observability honesty and could make a future arc rework completed systems.

**Pattern established:** Audit artifacts can be immutable ranked plans; task boards are allowed to be the append-only execution ledger. Protocol caches should reconcile both before claiming work is open or exhausted.
