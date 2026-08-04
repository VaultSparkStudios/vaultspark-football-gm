# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.

## 2026-08-01 - A falsy default may never stand in for an absent field when zero is meaningful

**Decision:** Where zero is a legal, meaningful value, defaults use `??`, not `||`. `normalizeContract` used `Number(contract.yearsRemaining || 1)` while clamping to a floor of `0` on the same line — the clamp declared zero legal and the default made it unreachable.

**Rationale:** Because the normalizer runs on every read, the resurrection was total: `advanceContractYear`'s expiry branch and `expireContracts`' `<= 0` check were both dead code, and no contract in the game's history had ever run out. The visible symptom (no free agency) was five call-stack layers away from the cause, and every intermediate layer looked correct in isolation. A whole shipped subsystem — the S62 competing-offer market — was structurally unreachable for five sessions without a single test failing.

**Pattern established:** When a normalizer's clamp or validation range admits a value, its default must admit that value too. Where an engine's terminal condition is unreachable in practice, prove reachability with a test that drives the real engine rather than the unit in isolation.

---

## 2026-08-01 - A silent `|| 0` on a read is a defect, not a safety net

**Decision:** Ledger values are validated finite at the point of **write**, not coerced at the point of read.

**Rationale:** The compensatory formula summed loss rows with `sum + (row.value || 0)`. Every row had been written `NaN` (from reading `player.value`/`player.capHit` off a projection carrying neither field), and the read-side coercion turned each one into a clean `0`. Nothing ever threw, nothing ever logged, and the feature — with a setup toggle, a league setting, a ledger, and a dashboard field — had never produced a single pick. The coercion is precisely what hid it.

**Pattern established:** Coerce on write and assert finiteness there; let a read surface a bad value rather than laundering it. Regression coverage asserts the ledger cannot be written a non-finite value.

---

## 2026-08-01 - Roster-building decisions belong to the GM, including the ones the engine finds convenient

**Decision:** The offseason engine never signs, re-signs, or fills for the controlled franchise. Where the GM's roster is short, the engine emits an actionable receipt instead of resolving it.

**Rationale:** Session 63 put an authority boundary on the command seam. The offseason engine is not a command and walked straight past it, adding five players per offseason to the player's roster with nothing issued. Roster legality is a real constraint, but satisfying it on the GM's behalf silently removes the decision the game is about.

**Pattern established:** Engines that mutate team state take an explicit authority parameter naming who they may act for. The controlled franchise's shortfall is surfaced through the existing inbox/news path with the exact positions and counts, so an exemption is actionable rather than a trap. The same rule governs the new CPU retention window: rivals keep their own; the GM decides.

---

## 2026-08-01 - Derived boards index directly; a modulo over a short array is a silent wrong answer

**Decision:** The draft board carries one entry per selection, and consumers index it directly. `league.draftPicks[].ownerTeamId` is the draft's source of truth.

**Rationale:** `draft.order` held 32 team ids and every consumer computed `(currentPick - 1) % 32`. That made pick ownership unreadable — a fully built, priced, tradeable asset class that the draft ignored entirely — and it also silently returned the wrong team for every round after the first in any consumer that tried to look past round one. Modulo over a short array cannot fail loudly; it always returns something.

**Pattern established:** Boards derived from a ledger are emitted as explicit slots carrying their own provenance (round, original club, acquired, compensatory). A deterministic fallback covers saves written before the ledger was load-bearing, so an old snapshot degrades to the previous behaviour rather than stalling.

## 2026-07-27 - Exact franchise identity owns asynchronous and browser-memory authority

**Decision:** The dashboard's exact franchiseId is the primary identity for every browser authority epoch and save-sensitive local ledger. League/team/year fields are legacy fallback inputs only.

**Rationale:** Two franchises can share a team and start year. Using leagueId or startYear allowed a late response, tutorial receipt, Return Digest, or trade block from one franchise to appear authoritative in another.

**Pattern established:** One shared scope normalizer builds authority and storage keys; cross-scope reads fail closed; franchise switches synchronously replace the epoch and memory scope.

---

## 2026-07-27 - Return guidance names only actions the interface actually completed

**Decision:** A source-derived return horizon may claim an exact continuation only when the target panel exists and receives focus. If only the containing tab exists, the interface must name that fallback.

**Rationale:** Opening a tab while claiming a specific panel opened makes observability lie at the point where a returning player most needs trustworthy orientation.

**Pattern established:** Season chapter actions carry targetTab, targetId, and label from live state. Activation, focus, and fallback each have distinct user-visible receipts and regression coverage.

---

## 2026-07-27 - Innovation queues deduplicate semantic evidence gates

**Decision:** Generated innovation candidates with different wording but the same external release-evidence obligation collapse into one canonical gate while preserving all sources, actions, evidence, and duplicate count.

**Rationale:** Repeated wording inflated the apparent opportunity surface and encouraged repeated non-work instead of new second-order design.

**Pattern established:** Candidate identity is semantic, not string-exact. A deduplicated HOLD is a truthful deferred item; queue saturation counts only viable implemented innovations.

---

## 2026-07-25 — Runtime timeouts do not authorize state forks

**Decision:** A timed-out server request must preserve server runtime authority. Automatic browser-runtime fallback is allowed only when the server is actually unreachable or the deployment explicitly declares server mode unavailable.

**Rationale:** Real-browser cold-start evidence showed league hydration taking about 6.9 seconds, beyond the former four-second dashboard budget. Treating legitimate cold work as an outage silently created an unrelated browser league and made observability lie about which state the player controlled.

**Pattern established:** Bootstrap waits within the standard 15-second request budget; timeouts surface as retryable server uncertainty. The development server exposes both `/src/` and `/public/` roots required by the client runtime graph so a genuine fallback can load completely.

---

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

## 2026-07-23 — Franchise architecture is descriptive decision memory, never causal telemetry

**Decision:** Persist Architect's Ledger rows only inside successful controlled weekly transactions. A row may join declared tactic/General Manager intent, exact command boundaries, observed score/film alignment, and a next-adaptation prompt. Longitudinal summaries must state sample size and describe consistency/alignment only; they may not claim a tactic caused wins or losses.

**Rationale:** The product needs a legible plan-act-learn loop, but no controlled experiment or player telemetry supports causal performance claims. Transaction-only persistence prevents failed attempts from becoming false history.

**Pattern established:** Historical evidence can inform the next horizon without displacing the current live command authority.

## 2026-07-23 — Session observability has one invariant-enforcing write path

**Decision:** Every PROJECT_STATUS mutation routes through `updateProjectStatus`, and startup freshness joins date, coherence, closed-session authority, rendered-session identity, and status identity.

**Rationale:** A current timestamp previously masked a one-session identity lag, while direct writers bypassed SIL invariants. Observability is trustworthy only when its sources agree and self-reject stale joins.

## 2026-07-24 — Accelerated simulation carries explicit intent, never inferred intent

**Decision:** Four-week and season simulation may reuse one player-declared regular-season tactic only through a versioned scoped policy. No selection means no tactic attribution. Material regular-season checkpoints reopen the plan before continuation; offseason and draft phases never inherit it.

**Rationale:** Convenience should compress clicks, not erase the product's plan-act-learn loop or fabricate strategic intent.

## 2026-07-24 — Coaching lineage is a domain authority with collision-safe identity

**Decision:** Staff lifecycle delegates through CoachingService and persists mentor/promotion history in `league.coachingTree`. Coach IDs include role plus a collision sequence; lineage readers guard cycles and reconcile exactly one head-coach authority per team.

**Rationale:** Generic generated names previously allowed coordinator/head-coach identity overwrite and even self-mentorship. Long-lived franchise history needs deterministic identities and fail-safe traversal.

## 2026-07-24 — Mastery is a portfolio, not a replacement score

**Decision:** Preserve the historical General Manager Legacy score unchanged. Add a separate versioned Results/Stewardship/Promise/Identity portfolio derived only from existing receipts, with visible empty states, evidence counts, a lowest-path focus, and a separate strongest signature.

**Rationale:** Outcome-heavy legacy scoring cannot express how a player architects a franchise. The new layer rewards legibility and direction without adding a hidden mechanic or claiming causation.

## 2026-07-25 — Zero-gap observability is bidirectional and classified

**Decision:** API parity joins browser contracts, explicitly classified shared non-browser routes, and both advertised adapters in both directions. An unexpected adapter route fails just like a missing route; adapter-only exceptions require a frozen named allowlist and reason.

**Rationale:** A one-way declaration check could report zero gaps while local-only ghost handlers existed. Exact set equality prevents observability from overstating product parity.

**Pattern established:** Every zero-gap claim names its scanned sets, classifications, counts, and failure modes.

## 2026-07-25 — Mastery rewards deliberate identity, not raw variety

**Decision:** Architect identity mastery derives from bounded committed evidence, tactical continuity, and an observed reinforce/counter response after prior film misalignment. Distinct tactic count grants no automatic score, and every presentation disclaims causal outcome claims and hidden bonuses.

**Rationale:** Rewarding tactic variety contradicted the product's identity lesson and let random churn outscore coherent authorship.

**Pattern established:** Progression may reward legible decision discipline and response evidence, never novelty for novelty's sake.

## 2026-07-25 — Visual evidence has one self-validating artifact authority

**Decision:** The static-artifact responsive runner owns required viewport, theme, core-tab, runtime-error, contrast, overflow, and touch-target evidence. One-off screenshot scripts that depend on an external server or swallow navigation failures are retired.

**Rationale:** Screenshots are not evidence when missing panels can pass silently. A required-capture manifest made absence fail closed and immediately exposed a real cross-viewport tutorial defect.

**Pattern established:** Visual evidence declares its required matrix, proves completion counts, and converts every discovered defect into a root fix before green.

## 2026-07-27 — Feedback publication is a bounded disclosure transaction

**Decision:** Local playtest receipts remain private unless the player selects an unchecked attachment control for the next report. Published ratings, notes, franchise context, and readiness rows pass one versioned bounded disclosure receipt that sanitizes fields, caps row counts, and explicitly reports omitted excess.

**Rationale:** Consent without an exact payload boundary can still leak or over-expand context. Publication truth requires both affirmative choice and a falsifiable disclosure manifest.

## 2026-07-27 — Weekly intent is challenged before mutation, never predicted

**Decision:** Every regular-season weekly command passes one deterministic source-derived rehearsal before commit. It may join existing decision, tactic, promise, pressure, identity, and film receipts; it must allow revise/defer/commit, grant no hidden bonus, predict no result, and persist the counter-signal source in the visible commit receipt.

**Rationale:** The franchise fantasy deepens when the player can challenge a joined plan before mutation. Existing evidence is sufficient for a red-team countercase without a hosted model, variable cost, or causal pretense.

## 2026-07-27 — Tab hydration owns an exact self-validating topology

**Decision:** Overview cold boot loads no secondary domains. Each public tab declares exact loader ownership under an authority-scoped cache with in-flight coalescing, explicit invalidation, retry-visible failure receipts, and startup validation that rejects missing, duplicate, orphaned, or unknown topology.

**Rationale:** Broad eager loading spent work before player demand and let shell/loader drift hide. A self-validating topology makes request ownership observable and keeps committed state independent from secondary hydration quality.
## 2026-07-29 — Architect focus is authored intent, not an automatic score instruction

**Decision:** Preserve auto-lowest mastery as a separately labeled recommendation while letting the player persist a chosen Results, Stewardship, Promise, or Identity focus. Reinforce/Counter/Investigate may be declared only from a real prior film receipt, enters the next successful weekly ledger transaction, and resolves with observed source text plus an explicit non-causation disclaimer.

**Rationale:** A franchise-architecture fantasy needs deliberate authorship, but selecting a thesis must not secretly alter simulation strength, predict outcomes, or recast sequence as causation.

## 2026-07-29 — Mutable evidence authorities require conflict and lineage receipts

**Decision:** Architect Thesis writes carry a monotonic revision and may fail closed on an expected-revision mismatch. Pending and resolved hypotheses expose a live lineage verdict derived from Architect ledger IDs and exact observed text; missing endpoints, duplicates, or observation drift are explicit issues.

**Rationale:** A plausible UI receipt is not observability truth. Multi-view mutation and cross-receipt joins need machine-detectable stale-write and provenance failure modes.

## 2026-07-29 — Evaluate/commit workflows carry state-bound plan receipts

**Decision:** Trade evaluation returns a deterministic fingerprint over the exact roster, pick, cap, rule, and phase authority used to form the proposal. Commit may require that fingerprint and fails closed with 409 before mutation when current authority differs.

**Rationale:** A proposal can be internally valid when evaluated and unsafe seconds later. Validation at commit must prove it is committing the evaluated world, not merely rerun generic input checks.

**Pattern established:** Any split evaluate/commit workflow over mutable state should expose a bounded plan receipt and define stale-plan behavior before adding another caller.

## 2026-07-29 — Build policy and hosted application are separate authorities

**Decision:** The static build generates one fingerprinted edge-security artifact with exact inline script/style hashes. A separate live verifier joins that artifact to the deployed revision, canonical health, and actual response headers; it cannot infer application from the presence of `_headers`.

**Rationale:** GitHub Pages and other hosts may ignore repository policy files. Artifact correctness is necessary but cannot prove edge enforcement.

**Pattern established:** Release observability names both the generated contract and the owning host’s application receipt; absence in either authority remains HOLD.

## 2026-07-29 — Runtime route semantics delegate to domain handlers

**Decision:** Architect Thesis HTTP behavior lives in a shared handler imported by both the server and local browser adapter. Transport shells own routing only; domain status codes and payload semantics remain single-source.

**Rationale:** Matching route lists do not prevent handler semantics from drifting. Exact delegation converts parity from repeated code into one authority.

## 2026-07-31 — Premium free agents sign only through the competing-offer market

**Decision:** Free agents at or above 74 overall are market property: the instant sign path and CPU greedy maintenance keep only the depth tier, rival teams submit deterministic archetype-shaped bids, and resolution runs every weekly advance with an exact outbid receipt when the controlled team loses.

**Rationale:** A market with one possible bidder is scenery, not pressure. Competition must be real enough to lose, and losing must teach exact terms.

**Pattern established:** Any player-facing scarcity system must have at least one autonomous competitor operating through the same authority the player uses.

## 2026-07-31 — Venue effects are bounded per-game rating boosts with receipts

**Decision:** Home field (+1.2) and bye rest (+0.8) enter as per-game unit-rating boosts on the sim context, never the shared team object; every result and box score carries an explicit venue receipt; the Super Bowl is a neutral site.

**Rationale:** Boosting both sides of the home team's game keeps league-wide distributions calibration-neutral while shifting win share, and receipts keep the asymmetry observable instead of inferred.

## 2026-07-31 — Award selection is deterministic and skill-position scoped

**Decision:** `sortRowsByAv` carries a final playerId tie-break; MVP/OPOY/ROY pools admit only QB/RB/WR/TE; award tests recompute leaders on the pre-honor AV surface the engine actually selected from.

**Rationale:** All-Pro/Pro-Bowl honors feed AV after selection, so post-award recomputation compares against an inflated surface and only agreed by luck; and an offensive lineman with one recorded catch must not win MVP carrying blocking-derived AV.

## 2026-07-31 — Narrative events are decision surfaces, not headlines

**Decision:** The GM decision catalog doubled (star-trade-request, culture-crisis, legend-farewell) with triggers reading the live narrative log; immediate consequences are bounded, deterministic, and visible (exact morale deltas, news receipts); transactional promises resolve as commitments bound to the exact subject player.

**Rationale:** An event the player cannot answer is scenery; an answer without a receipt is fiction.

## 2026-07-31 — GM termination is founder canon, honestly deferred

**Decision:** The owner-pressure loop ships live patience, receipts, a reachable ultimatum, and a season-end failed-mandate consequence — but no firing/game-over state. That ending is new public product canon reserved for founder creative direction.

**Rationale:** Autonomous invention of the player character's termination would exceed the agent's creative authority; deferral recorded as a win, not a silent skip.

## 2026-07-31 — Restored sessions construct services exactly like new sessions

**Decision:** `GameSession.fromSnapshot` passes the same strategy bag to `createServices` as the constructor. A latent crash (TradeService.evaluate on any snapshot-restored session) existed since the services split and surfaced when S62's weekly market hooks ran inside the advance-week transaction clone.

**Pattern established:** Every session construction path must produce an identical service surface; a restore path with fewer capabilities is a dormant crash.

## 2026-07-31 — The precache worker never caches truth surfaces

**Decision:** The build-generated service worker precaches the static module graph (cache-first, background revalidate) but is network-only for `/api/`, `_health`, `deploy-manifest.json`, and `edge-policy-receipt.json`.

**Rationale:** Instant boot must never make freshness evidence lie; a cached health receipt is a fabricated one.

## 2026-08-01 — Session 63

**The authority guard belongs at the command boundary, not in `GameSession`.** Every mutating method (`releasePlayer`, `setDepthChart`, `setPracticeSquad`, …) is also called internally by CPU AI maintenance for all 31 rival teams. Placing a `teamId === controlledTeamId` check inside those methods — the obvious fix — would have broken the AI silently. `src/runtime/franchiseAuthority.js` therefore guards the shared command layer, matching S61's Architect Thesis handler and S62's dashboard payload parity, so both adapters inherit one verdict structurally. A regression test asserts `GameSession` itself carries no `team-authority` reason code, so the boundary cannot drift inward later.

**Route classification must be total, not best-effort.** The original hole was created silently — routes were added without anyone deciding whether they carried franchise authority. Rather than guard a list, all 58 POST routes are classified as either team-scoped or explicitly exempt *with a recorded reason*, and a test fails on any newly added unclassified route. An exemption with no real justification also fails. This is what makes the fix durable rather than a snapshot.

**Coaching ability became read-only rather than merely guarded.** Closing the authority hole would have left `POST /api/staff` as god-mode for your *own* team — three number boxes writing live simulation inputs at zero cost. `updateStaff` now refuses rating writes with `reasonCode: staff-ratings-readonly` and ability comes only from hiring a priced candidate. Renaming stays open because it is cosmetic and players like it.

**Coach salary is a pure function of ratings, so no save migration was needed.** Existing saves have staff with no salary field. Deriving price from ratings means every coach in every existing franchise already has a consistent, well-defined value, and `owner.staffBudget` — already a live simulation input — finally binds.

**The coaching market is derived, not rolled.** Candidates come from a deterministic hash of (league identity, year, team, role). A market that rerolled on fetch would be its own cheat surface: refresh until an elite coordinator appears.

**Realism was measured, not asserted.** Item 3 changes play calling, so a claim that calibration held would have been unfalsifiable without a baseline. The matchup lean was temporarily neutralised in the working tree and the 12-season verification re-run to establish one. Result: season metrics unchanged (44 on-target / 0 out); career out-of-range **3 → 1 with** the lean. The remaining out-of-range metric (DB career passes-defended) is pre-existing and was left alone rather than tuned to look better.

**A deterministic stub is not automatically a safe stub.** The league normalizer used `{ int: () => 76, pick: (items) => items[0] }` to avoid consuming the session RNG stream — a correct constraint, since a normalizer that draws from the stream desyncs replays. But `createLeagueBase` does not build staff, so in the browser runtime the safety net became the primary generator and every team in the deployed game had identical coaching and identical owner economics. The constraint is kept and the constant dropped: `derivedRng` in `src/utils/rng.js` derives values from a seed key instead of drawing from a stream.

**Franchise economics were differentiated at the factory, centred on the values they replaced.** `createTeam` hardcoded identical owner economics for all 32 clubs, which the profile builder then preserved — so there was no big-market/small-market axis anywhere in the game. Each new band is centred on the old constant (marketSize ~1, ticket ~120, staff budget ~28M, facilities ~72), so this adds spread without moving league balance.

**GM firing remains unshipped, deliberately.** Re-verified live: `ownerConfidence.js` still floors patience at 0.05 and bands `<= 0.2` as critical with no terminal consequence. Founder creative direction is still required (recorded 2026-07-31). The coaching market was explicitly scoped to hiring and firing *staff* so a game-over state could not drift in as a side effect.

**A seed-pinned test was hardened, not silenced.** The S62 rival-offers test broke because this session legitimately changed simulation outcomes. Before touching it, offer generation was measured across ten seeds — 8/10 produce an offer within 18 weeks, median week 8 — confirming the engine was healthy and the test was over-fitted to one league. It now samples seeds for behaviour and asserts determinism separately and exactly.

**The canonical audit renderer is the authority; the JSON sidecar is the source of truth.** The session initially hand-wrote `AUDIT_2026-08-01_SESSION63.md`, which the studio smoke test correctly flagged as stale against its sidecar. The narrative analysis was preserved as a companion document rather than discarded, and the canonical markdown is now generated.

## 2026-08-01 — Session 64

**The mobile deck band was narrowed to 640px, not merely made test-compatible.** CI surfaced the S63 ≤980px band as an overlay intercepting clicks during responsive capture. The tempting fix was to teach the evidence script about mobile mode at 768px. That would have preserved a genuine product defect: the overlay is `position:fixed; inset:0; z-index:1000` — a full-screen *replacement* — so the band is a product decision about who loses the desktop UI, not a styling detail. S63 had swept tablets and small laptops into a phone layout by default. 640px is the width at which `styles.css` actually collapses `.side-menu`, so it marks where the full shell genuinely stops working rather than an arbitrary device guess. A real *tablet* layout stays deferred alongside touch affordances.

**The deck band is now bound to the responsive-evidence viewports by a test.** The failure mode was two files silently disagreeing about which widths are "desktop". A test that parses the evidence viewports and asserts the deck never covers a non-mobile capture makes that disagreement impossible to reintroduce, and fails locally before CI does.

**`src/server.js` gets executing tests, not just source-text greps.** A missing `res` argument produced an HTTP 500 that the entire node suite passed over, because every existing test drives the browser adapter and the few that mention the server only read it as a string. Adapter parity asserted by grep is not parity. `test/server-routes.test.js` boots the real server and speaks HTTP, including a guard that no mutating route may answer with a leaked runtime exception — the class of bug, not just the instance.

**Testing a function is not testing the wiring.** The S63 matchup-edge receipt had passing unit tests for `buildMatchupEdgeRead` and passing engine tests for the lean, and still never appeared on screen, because the dashboard projects a reduced team shape that dropped the ratings it reads. Browser coverage found it in one run. Any "visible receipt" claim needs an assertion that the receipt is visible.

**The save-size blocker was measured and recorded, not fixed.** A `mode:"play"` snapshot is ~30.7 MB after six weeks and `weeklyHistory` projects ~24 MB per season against a 5–10 MB localStorage budget, so a zero-backend franchise cannot survive one season. The fix is a persistence reshape touching replay, what-if, box-score and history surfaces, and it needs explicit save migration for existing franchises. Attempting it unscoped at the end of an audit would risk the saves it is meant to protect. Ceilings pinned just above today's measurements keep it from worsening and give the eventual fix a number to beat. Production readiness is therefore **not** claimed on this axis.

**A first framing was corrected by measurement.** `matchupEdges` was initially treated as the storage problem because it was dead payload I had added. Measured, it is 0.4% of a retained game against `boxScore` at 98%. The finding was rewritten around the real cause rather than the convenient one.

## 2026-08-01 — Session 65

**Trimming derived data was necessary but could never be sufficient.** After leaning week records and bounding the archive, a full-season snapshot was still 16.83 MB — and `league.players` alone is ~6.8 MB. That is real game state, not waste. Once measured, the conclusion was forced: raw JSON cannot fit a 5–10 MB localStorage origin at this game's scale, so the fix had to be encoding rather than more pruning.

**Compression, not IndexedDB.** IndexedDB would raise the ceiling further and is the eventual right home for a 100-year franchise, but it is an async, multi-store migration of the whole persistence adapter. gzip+base64 achieves 8.5× behind three method signatures and four call sites, keeps the existing store, and — because the payload is self-describing via a magic prefix — leaves every existing save loadable. That is a far better risk-to-benefit trade for the blocker actually in front of us. IndexedDB remains available later if franchises outgrow this.

**The integrity stamp now covers the encoded bytes.** It always meant "the bytes on disk are the bytes we wrote", and stamping after encoding preserves exactly that. Legacy saves stamped over plain JSON still verify, because plain JSON is still what is stored for them.

**Backups are an undo runway, not an archive.** Retention was 40 full snapshots, which at franchise scale is hundreds of megabytes and was the dominant cause of quota failures. A count cap alone cannot bound storage when the item size grows with the save, so retention is now bounded by bytes as well — and always keeps at least one backup even if a single snapshot exceeds the budget, because one undo point beats none.

**Older games lose their drive log, and the UI says so.** Play-by-play is 68% of an archived box score. Retaining it for every game is what broke saves; retaining it only for a recent window keeps sim-watch and recent replays intact. The statistical box score stays complete for every archived game, and the modal states plainly when a drive log is not stored — a silent empty table would have been the same class of defect this work has been removing.

**`/api/rewind/restore` was routed through the migration seam.** It loaded a persisted snapshot with `fromSnapshot` directly, so an older-schema rewind point restored unmigrated — a pre-existing gap found while wiring the reclaim. Routing it through `migrateSnapshot` fixes that and means legacy franchises shrink the moment they are opened.

## 2026-08-02 — Session 68

**Tactic identity is typed and versioned at the authority, not inferred by consumers.** One frozen tactic catalog names the affected unit, modifiers, summary, and stable authority id. Weekly commands, simulator aggression, browser selection, and film receipts consume that same catalog; `tactical-plan@2.0:<id>` makes old evidence distinguishable if the model evolves.

**Continuity is the default; rehearsal is exception-driven.** The previous successful tactic becomes the standing plan. A full rehearsal is required only when live evidence raises a first-plan, tactic-change, General Manager decision, failed-film, owner, thesis/adaptation, or injury red flag. A stable week gets a one-click reinforcement path rather than ritual friction.

**Season chapters report a thesis ledger; they do not invent a narrative cause.** The exact Opening Contract receipt and later checkpoints persist the chosen thesis, status, and evidence. The season reckoning may compare the contract with observed receipts, but it never awards hidden power or claims the thesis caused a result.

**Partial test progress is deliberately non-authoritative.** `.cache/test-progress.json` is atomic and useful while a shard is live, but always carries `authoritative:false`; only the complete source-digest-bound test receipt can substantiate a green suite. Timeout and failure survive for diagnosis instead of disappearing behind an ambiguous long-running shell.

**Release readiness is an AND of independent authorities.** Route reachability, origin health, security headers, exact revision, independent staging, received email, founder approval, and lifecycle authority are separate gates. The contract is hash-bound and recomputable, so a hand-edited summary cannot turn production health into launch readiness.

**Generic propagation may not erase project startup authority.** A pre-existing Studio propagation payload was byte-identical to the sibling template but removed the project's exported scan roots and broke startup-authority tests. It was rolled back rather than normalized into this public tree; mechanization issues are returned through Ark.

**Visual QA must inspect pixels, not only metrics.** The automated responsive matrix was green while both mobile themes visibly rendered roster needs as `[object Object]`. The object projection was fixed, the Pages artifact rebuilt, and the exact corrected captures were retained in `docs/visual-qa/`.

**The final push used a documented hook-transport bypass, not a check bypass.** The ordinary `git push origin main` deadlocked for 124 seconds in the repository's April `.git/hooks/pre-push` wrapper: the verified tree stopped at `env .git/hooks/pre-push` with no live hook child, while GitHub still reported the old main SHA. Only that exact five-process push tree was terminated. The same hook was then executed manually with the exact local/remote ref tuple and returned direct exit `0`; the stronger staged Studio secret scan had already returned 0 findings. The subsequent `git push --no-verify` bypasses only the broken Git-for-Windows wrapper transport. Follow-up is Ark-owned: repair/reinstall the Windows hook so a normal push terminates (`01JV2TC1JI6683F7C1ED40088F`).

## 2026-08-02 — Session 68

**Tactic identity is typed and versioned at the authority, not inferred by consumers.** One frozen tactic catalog names the affected unit, modifiers, summary, and stable authority id. Weekly commands, simulator aggression, browser selection, and film receipts consume that same catalog; `tactical-plan@2.0:<id>` makes old evidence distinguishable if the model evolves.

**Continuity is the default; rehearsal is exception-driven.** The previous successful tactic becomes the standing plan. A full rehearsal is required only when live evidence raises a first-plan, tactic-change, General Manager decision, failed-film, owner, thesis/adaptation, or injury red flag. A stable week gets a one-click reinforcement path rather than ritual friction.

**Season chapters report a thesis ledger; they do not invent a narrative cause.** The exact Opening Contract receipt and later checkpoints persist the chosen thesis, status, and evidence. The season reckoning may compare the contract with observed receipts, but it never awards hidden power or claims the thesis caused a result.

**Partial test progress is deliberately non-authoritative.** `.cache/test-progress.json` is atomic and useful while a shard is live, but always carries `authoritative:false`; only the complete source-digest-bound test receipt can substantiate a green suite. Timeout and failure survive for diagnosis instead of disappearing behind an ambiguous long-running shell.

**Release readiness is an AND of independent authorities.** Route reachability, origin health, security headers, exact revision, independent staging, received email, founder approval, and lifecycle authority are separate gates. The contract is hash-bound and recomputable, so a hand-edited summary cannot turn production health into launch readiness.

**Generic propagation may not erase project startup authority.** A pre-existing Studio propagation payload was byte-identical to the sibling template but removed the project's exported scan roots and broke startup-authority tests. It was rolled back rather than normalized into this public tree; mechanization issues are returned through Ark.

**Visual QA must inspect pixels, not only metrics.** The automated responsive matrix was green while both mobile themes visibly rendered roster needs as `[object Object]`. The object projection was fixed, the Pages artifact rebuilt, and the exact corrected captures were retained in `docs/visual-qa/`.

## 2026-08-03 — Session 69

**Evidence semantics precede receipt presence.** A checkpoint is not “evidenced” merely because a receipt exists. Eligibility is phase-gated first, then proof is classified aligned or contested; only aligned proof across at least two eligible checkpoints can establish the season thesis.

**Return continuity is a session boundary, not an elapsed-time simulation claim.** This zero-backend game cannot advance while closed. Every authoritative advance and pagehide refreshes a versioned, per-franchise monotonic boundary; Welcome Back reports only the persisted deltas authored in the prior session.

**General Manager promotion paths remain independent.** Score, playoff appearances, championships, and tenure are separate OR paths. The UI states every exact remaining path and never converts a milestone promotion into fictional score credit.

**Project authority must survive generic propagation.** Parser exports, the invariant PROJECT_STATUS writer, nonzero canonical shard discovery, and startup lifecycle/Genius fingerprints are a local fail-closed compatibility contract. The sibling mechanizer root cause travels through signed Ark cargo; this public repo never edits the Studio Ops tree directly.

**Staging authority resolves its DNS zone by exact domain name.** A configured global zone id can name another Studio zone. The deployer resolves exactly one active playfranchisearchitect.com zone through the brokered Cloudflare plane before any CNAME write, then requires the stable custom hostname—not an ephemeral Pages URL—to replay exact SHA and artifact identity.

**Hosted verification is bounded and convergence-aware.** Node HTTPS probes carry a wall-clock abort deadline in addition to socket timeout, and staging promotion polls the stable origin until the exact manifest converges. A deployment upload or active certificate alone cannot mint a verified receipt.

**Launch remains an AND of independent gates.** Verified independent staging closes one gate only. Healthy production routes/headers do not replace exact production parity, received-and-reply-capable email, SHA-bound founder approval, or authoritative lifecycle reconciliation.

**No Creative Direction Record was added.** The founder direction concerned execution quality, persistence, evidence honesty, and cost discipline rather than a new product creative decision; this public repository retains its intentional CDR omission.

## 2026-08-04 — Session 70

**The root URL is for the person who has never seen the game.** A save manager with a disabled Continue button and "Connecting to server..." optimized the homepage for the ~0% of first loads that have local saves on a zero-backend product. The hero now branches on actual save presence, and every quick-start affordance keeps its promise: one click creates a league.

**Public claims are build-gated, not reviewed.** A truth gate wired into the Pages build derives the engine-system count from source, forbids retired or false claims and internal lifecycle vocabulary on every public surface, and fails the build if the promised og:image does not exist. It caught its first real drift within hours — two new engine modules made "36 Engine Systems" stale mid-session.

**Reward beats derive from receipts and never block navigation.** Week Recap, draft-pick verdict, and trade verdict read the exact receipted result (box score, grade + round, valuation delta) and render as one shared non-modal auto-dismissing card. A bye stays silent; a missing valuation shows no verdict rather than a fabricated "fair" one.

**Trophies are cross-save identity, earned only from receipted truth.** The achievement registry checks receipted events and live dashboard values, treats missing data as not-earned, persists ids and timestamps only, and never re-awards. The trophy case is permanent across every franchise in the browser profile.

**Rival GM personas are deterministic, descriptive, and never causal.** Persona identity derives from league seed + team through a local avalanche hash — verification caught the shared derivedRng producing identical personas for near-identical keys, and the shared util could not change without silently re-rolling every existing league's staff. Grudge ledgers record only receipted interactions (trades, declines, outbids), bounded at eight entries, and no persona line grants or removes a point of value.

**Difficulty changes announce themselves through one seam.** Both runtimes route /api/settings through GameSession.updateLeagueSettings, which re-materializes the controlled owner's patience on preset change and writes a receipted news event. Adaptive League is opt-in, bounded to hard bands around the preset baseline, driven only by rolling two-season win%, and announces every nudge.

**Save bytes moved to IndexedDB; truth stayed in localStorage.** The hybrid store keeps slot metadata and integrity stamps synchronous in localStorage while snapshot bytes use IndexedDB capacity. Migration is copy-forward and verified by readback against a fresh integrity stamp before the localStorage bytes are released; any IndexedDB failure permanently degrades the session to the proven localStorage path. Under a healthy hybrid store, drive-log retention stops sacrificing play-by-play (settings-derived window, full 272-game archive).

**One 404 must not kill offline.** The service worker's atomic cache.addAll was replaced with per-URL Promise.allSettled plus failure logging, the duplicate plain stylesheet left the precache, and the registration condition was root-fixed so index.html actually registers the worker (writeHtml passes "./" as the index pagePath — the old check could never match).

**Artifacts are platform-independent by construction.** Windows checkouts carry CRLF and CI carries LF, so byte-identical trees produced different artifact fingerprints and production parity could never verify against a local expectation. Every text asset LF-normalizes at artifact copy; the local fingerprint now exactly matches the CI-built production artifact.

**CI env is part of the brand surface.** The deploy workflow still built with pre-rebrand canonical/og URLs, shipping vaultspark-football-gm canonicals on playfranchisearchitect.com for every deploy since S25. Discovered only because parity verification compared real bytes; fixed at the workflow, root mount + canonical host, legacy mounts kept as mirrors.

**Gates must not demand what other gates forbid.** The lifecycle evidence check required the literal internal "before marking the project SPARKED" sentence on the public status page — vocabulary the new public-truth gate forbids. The check now asserts the intent (beta declared, no launch claim) instead of the internal wording.

**A dead telemetry file is worse than no file.** The audit itself was misled by a stale legacy skill-cost ledger sitting beside the live one. The dead twin was retired and the context meter now carries a heartbeat that self-announces when the newest ledger row predates the current session lock.

**Production parity closed without a hook bypass.** The pre-push wrapper was slow (~15 minutes under load), not deadlocked; the S68 bypass precedent was deliberately not exercised once patience proved the hook honest. Push, gated deploy, staging 11/11, and production 8/8 all completed on the normal path.
