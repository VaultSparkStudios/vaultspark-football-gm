# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.

## 2026-07-16 — General Manager choices must execute or become falsifiable promises

**Decision:** Every marquee General Manager choice must either execute immediately through an existing safe simulation primitive or create a persisted, expiring commitment with directionally valid success/failure evidence.

**Rationale:** Recording only news and momentum prose made high-stakes choices feel consequential while leaving roster/cap state unchanged. Conversely, fabricating a trade or release without the source-of-truth evaluator would violate simulation honesty. Immediate depth-chart/restructure actions can execute safely; market-dependent choices become explicit promises that resolve from real transaction/cap evidence.

**Pattern established:** Immediate actions use existing `GameSession` mutation methods. Commitments capture baselines and deadlines, distinguish acquisition from draft-capital evidence, and resolve once into owner, fan, morale, legacy, news, and event-history receipts.

---

## 2026-07-16 — Accelerated simulation pauses only at material source-derived checkpoints

**Decision:** Four-week and season simulation may advance ordinary weeks continuously, but must pause at phase/playoff transitions, newly material General Manager decisions, or commitment resolutions; the browser must retain remaining work and provide one-action resume.

**Rationale:** Fast simulation should remove repetitive clicks without deleting agency or ceremonies. A source-derived digest preserves what happened, while narrow checkpoint classes avoid turning acceleration back into weekly modal spam.

**Pattern established:** Compare previous and next dashboard contracts, never infer hidden causality. A checkpoint panel reports actual game results and reason labels; resolving a pending decision flows through the existing decision modal and `/api/advance-week` consequence path.

---

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

---

## 2026-07-02 — Session 32: first-run tutorial uses the shared modal contract

**Decision:** The first-run tutorial overlay must use the same `modalManager` focus-trap contract as the rest of the game flow instead of hand-rolling dialog lifecycle behavior.

**Rationale:** The tutorial is the first keyboard-facing onboarding modal many beta players see. Keeping it outside the shared modal manager created inconsistent Escape/focus behavior and left an already-tested accessibility utility partially adopted.

**Pattern established:** New modal-like overlays should call `openModal()` after rendering and `closeModal()` before rerender/removal. Exceptions should be explicitly non-modal status surfaces, like the return digest.

## 2026-07-03 — Modal semantics must be backed by the shared modal lifecycle

**Decision:** Any overlay that behaves like a modal, or claims `role="dialog"` / `aria-modal="true"`, must use the shared `modalManager` open/close lifecycle unless it is explicitly documented as a non-modal status surface.

**Rationale:** Session 35 found several important overlays that looked modal but bypassed the focus trap or lacked complete dialog semantics. That created inconsistent keyboard behavior across the main game loop. The shared manager is small, tested, and already established by the tutorial modal, so adopting it preserves focus restoration and Escape behavior without adding new UI complexity.

**Pattern established:** New modal-like surfaces call `openModal()` after becoming visible and `closeModal()` before being hidden. Non-modal engagement surfaces must not claim `aria-modal`.

---

## 2026-07-04 — First-run tutorial must inherit the global theme contract

**Decision:** First-run tutorial styling must use the same theme tokens (`--panel-grad`, `--card-grad`, `--ink`, `--muted`, `--accent`, etc.) as the rest of the product instead of injecting standalone dark-mode colors.

**Rationale:** The tutorial is a first-session product surface. After the premium theme repair, leaving it hard-coded dark made light-mode onboarding visibly inconsistent and risked reintroducing the exact readability class the theme overhaul fixed.

**Pattern established:** Any injected or component-local CSS must consume the global surface/text/accent token contract unless it is deliberately brand-specific and covered by light/dark readability tests.

---

## 2026-07-04 — Mobile inline GM choices use the existing consequence path

**Decision:** Mobile GM decision choices should render inline in the mobile deck, but the selected choice must be submitted through the existing `/api/advance-week` `gmDecisionChoice` path rather than a new mobile-only endpoint or duplicate decision engine.

**Rationale:** `/api/gm-decision` and `applyGmDecisionConsequence()` are already the source of truth. The gap was presentation and agency in the mobile loop, not backend capability. Keeping one consequence path preserves determinism and prevents desktop/mobile drift.

**Pattern established:** Mobile-first surfaces can add faster choice affordances, but must emit source-of-truth payloads into existing runtime actions when those actions already own game-state mutation.

---

## 2026-07-04 — Mobile fallback GM decisions use the existing modal/consequence path

**Decision:** Generic mobile `vsfgm:mobile-decision` events with `choose-gm-decision` action should route through the existing `checkAndShowGmDecision()` modal and then submit through `submitMobileGmDecisionChoice()` if the user makes a choice.

**Rationale:** Inline mobile choices are the best path when `/api/gm-decision` returns option details, but the generic event path already existed for non-inline cards and had no app-shell listener. The right fix is to complete the existing event contract, not add a mobile-only decision engine or second backend route.

**Pattern established:** Mobile fallback affordances should converge into the same accessible modal and source-of-truth consequence path used by desktop when inline data is unavailable.

---

## 2026-07-06 — Protocol commands must resolve to executable truth surfaces

**Decision:** If the local Session Protocol or startup brief points agents at a command, that command must either execute the real local source-of-truth path or fail with a specific actionable reason. Session 42 applied this to `scripts/sample-codebase.mjs` and `node scripts/ops.mjs genius-list`.

**Rationale:** Missing samplers and dead-end generator messages push future agents into ad hoc evidence gathering and can make startup guidance lie by omission. Bridging these commands to deterministic, tested outputs keeps `/audit` and `/go` aligned with live code and latest-audit truth.

**Pattern established:** When a required protocol helper is public-safe and repeatedly missing, implement the smallest local executable shim and add a focused studio smoke assertion for both exit status and output shape.

---

## 2026-07-06 — Deadline offers are structured recommendations, not fabricated trades

**Decision:** The Trade Deadline Frenzy panel should generate deterministic structured recommendations with partner, target need, asset ask, cap impact, rule constraint, and risk, but it should not fabricate an executable trade package unless the trade engine has actually evaluated that package.

**Rationale:** The existing trade evaluator and cap/challenge restrictions are the source of truth for executable deals. Session 44's gap was decision pressure and market framing in the browser panel, not a new trade engine. Structured recommendations make the General Manager ritual sharper while preserving CANON-031 observability honesty.

**Pattern established:** Player-facing recommendation cards may frame a market, but must name their constraints and route the user back to the source-of-truth action surface when execution requires validation.
---

## 2026-07-15 — Potential, availability, and snap authority

**Decision:** Potential is a persisted ceiling/trajectory signal while Overall remains the current ability signal. Automatic non-specialist room shares blend Overall (72%), Potential (18%), scheme fit (7%), and morale (3%). Healthy QB1, K1, and P1 exclusively own their role volume; availability promotes the next healthy player, and recovery naturally restores the prior hierarchy without overwriting saved non-exclusive room thresholds.

**Rationale:** Potential needs to matter for replayability and developmental opportunity without overpowering present NFL-quality performance. Deriving active shares from the saved room threshold plus live availability prevents injuries from permanently mutating the user's healthy-depth preferences.

**Pattern established:** Save healthy intent; derive game-day availability and merit at simulation time. Exclusive football jobs are automatic invariants, while rotational rooms preserve strategic volume.

---

## 2026-07-15 — Broadcast insights remain derived and visibly non-official

**Decision:** Quarter scoring and the Impact Index may synthesize the existing play/player box score into a broadcast hierarchy, but they must be deterministic, source-derived, and labeled as an index rather than presented as an observed NFL statistic.

**Rationale:** The box score benefits from editorial hierarchy, but CANON-031 forbids invented data. A transparent cross-phase index can identify decisive performances without fabricating tackles, conversions, or advanced tracking observations the simulator did not record.

**Pattern established:** Add interpretation above source data, never counterfeit source data to create the interpretation.

---

## 2026-07-16 — Injury recovery has one authority and explicit General Manager risk

**Decision:** Injury weeks decrement once per league week through the injury system. Rehab facilities, age, reinjury history, and a persisted Protect/Standard/Accelerate plan may affect modeled pace and risk, but no second availability path may mutate the same clock.

**Rationale:** Two independent decrement paths made displayed durations false. A single authority preserves simulation truth, while explicit plans turn recovery into a consequential football decision without presenting modeled risk as clinical advice.

**Pattern established:** When multiple systems observe the same countdown, exactly one mutates it; all others derive projections and publish receipts.

---

## 2026-07-16 — Runtime fallback is bootstrap-only after authority is established

**Decision:** Automatic server-to-client fallback is allowed only before the server has answered successfully. After authority is established, timeouts and connection failures remain visible server errors and cannot switch the active league to browser-local state.

**Rationale:** A background poll timed out while a valid multi-season server simulation occupied the event loop, silently forking subsequent settings work into unrelated local state. Availability convenience cannot outrank save authority.

**Pattern established:** Failover that changes the state authority must be explicit once a stateful session exists; transient read failures never authorize an implicit data-plane switch.

---

## 2026-07-16 — Roster-maintenance loops must prove progress

**Decision:** Batched offseason roster mutations refresh lookup authority before work, defer repeated reindexing, validate every release result, and stop with a source-derived stall receipt when the roster cannot shrink.

**Rationale:** Newly drafted practice players could be absent from a stale index, making release fail while an unguarded `while` loop continued forever. Progress is now a checked invariant, not an assumption.

**Pattern established:** Every state-reduction loop must either demonstrate a smaller measure on each iteration or emit an explicit bounded failure receipt.
## 2026-07-19 — Session 49 authority and evidence decisions

- Weekly advancement is one versioned command boundary shared by server and browser adapters. Runtime-specific backup/snapshot hooks may surround it, but payload validation, GM/tactic ordering, temporary-plan cleanup, simulation, and receipts may not diverge.
- Save compatibility is transactional: inspect version and minimum shape, verify any declared integrity algorithm, migrate, hydrate a replacement, and only then replace the active league. Unknown algorithms fail closed; absence of a stamp remains an explicit legacy contract.
- Browser background writes are authorized by dashboard identity plus panel request sequence/filter key. Authority advances only when the source identity changes; ordinary same-authority refreshes must remain committable.
- Runtime health and launch readiness are separate truths. `/_health` must report operational source evidence with `launchReady:false`; launch requires independently verified edge headers, email delivery, and exact deploy provenance.
- Repository/registry truth owned by Studio Ops is transported through signed Ark cargo. This repo never edits a sibling tree to make its own release gate green.
## 2026-07-20 — Production asset routes are an emitted contract

Decision: every supported public asset mount is declared in `deploy-manifest.json`, physically emitted by the Pages build, and smoke-tested for both body signature and MIME type. HTML fallback under a CSS/JavaScript URL is a blocking failure, even when the route returns HTTP 200.

Rationale: production served plain text because `/games/franchise-architect/` was a host-visible base path but not a build artifact. A route alias alone fixes one incident; a manifest-driven invariant prevents the entire drift class.

## 2026-07-20 — Commissioner Mode does not bypass General Manager decision authority

Decision: Commissioner advance forwards the same explicit General Manager decision payload as normal weekly advancement. Missing/stale choices fail closed, leave the authoritative league unchanged, reopen the multiplayer gate, and return the shared refusal envelope. Successful responses derive only from the newly committed session.

Rationale: auto-selecting a choice would erase player agency, while ignoring the refusal produced a false 200 and stale week. One authority and one transaction contract is both safer and more legible.

## 2026-07-21 — Browser API authority is an executable dual-runtime contract

**Decision:** Every browser-callable API operation declares method, normalized path, authority, mutability, and response-shape identity in one dependency-free manifest. Both advertised runtimes must implement it or be explicitly mode-gated; successful responses for high-risk parity families must satisfy executable required-field contracts before browser code can consume them.

**Rationale:** The public browser exposed 26 controls that worked in static mode but could 404 after server authority was established. Route existence alone also missed a rewind-envelope mismatch and cross-origin Commissioner DELETE omission. Joining call sites, adapters, CORS, success envelopes, and live state transitions prevents runtime mode from changing product capability or silently corrupting UI assumptions.

**Pattern established:** New browser routes land atomically with manifest metadata, both adapter handlers, response attestation, and a representative parity test. Adapter-local persistence is explicit; it never authorizes fallback from an established server GameSession.

---
---

## 2026-07-21 — Agency-preserving progression and explicit automation

**Decision:** Generic week/offseason advancement stops before any controlled-team draft selection. `Finish Draft` and the named `simulateOneSeason`/multi-season commands are explicit delegation boundaries and may complete controlled picks; tests invoking those automation paths must declare that delegation.

**Rationale:** A Resume control must never silently choose for the player, while an explicit full-season simulation command is unusable if it cannot complete the season it names. Naming the delegation boundary preserves both agency and deterministic simulation tooling.

**Pattern established:** Default progression preserves agency; automation that delegates consequential choices must say so in its command semantics and regression fixtures.

---

## 2026-07-21 — Playtest evidence is explicit, local, and non-causal

**Decision:** Playtest receipts collect only four bounded ratings, public-safe franchise context, and an optional short note. They stay in local storage until the player explicitly copies or attaches one; they contain no account identifier or save payload.

**Rationale:** Executable coverage cannot prove fun, pace, comprehension, or return intent. A zero-backend opt-in receipt creates a real future evidence path without inventing telemetry, new custody, or variable cost.

**Pattern established:** When adoption evidence is absent, ship an explicit evidence instrument and keep impact scores at zero until real receipts arrive.

---

## 2026-07-21 — Release success requires same-origin identity evidence

**Decision:** HTTP redirects or route availability alone cannot green staging. Health, deploy manifest, and hashed asset must remain on the configured origin and agree on revision/repository/asset identity; unreachable data is HOLD, never an empty success.

**Rationale:** The configured Pages URL redirected into an unrelated failing surface while naive status handling appeared successful. Source-derived release truth needs one joined receipt, not independent optimistic checks.

**Pattern established:** Availability evidence and deploy-identity evidence are one fail-closed contract.

## 2026-07-22 — Commit authority and hydration quality are separate receipts

**Decision:** Once the weekly command boundary returns success, its state is authoritative. Follow-up loaders settle independently and may mark the screen committed-degraded with named retry actions, but they cannot recast the mutation as failed.

**Rationale:** Secondary dashboard hydration is fallible and observational. Coupling it to commit semantics produced false failure language and encouraged duplicate submissions.

**Pattern established:** Every mutation-plus-refresh workflow records commit identity first, then reports hydration quality as a separate bounded receipt.

---

## 2026-07-22 — Product feedback remains local, sparse, and epistemically labeled

**Decision:** Contextual evidence prompts fire only from persisted source milestones, obey one seven-day global cadence plus occurrence deduplication, and never transmit automatically. Trends require at least three receipts and label sample size, self-selection, locality, and non-causality.

**Rationale:** The project needs real learning signals, but fabricated telemetry or overinterpreted self-reports would violate observability truth and add data custody.

**Pattern established:** Evidence instruments state what they can and cannot prove at the point of interpretation.

---

## 2026-07-22 — Launch posture is independent from local implementation completeness

**Decision:** Session 53 can be complete while launch remains HOLD. Local same-revision evidence, shared-origin web hardening, credential readiness, and latest-run CI success cannot substitute for exact hosted-origin revision evidence, a real received-message receipt, literal 5/5 CI, founder approval, or authoritative lifecycle reconciliation.

**Rationale:** Joining unlike evidence sources creates a polished but false release claim. External truth remains pending until its own receipt exists.
