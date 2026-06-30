# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.

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
