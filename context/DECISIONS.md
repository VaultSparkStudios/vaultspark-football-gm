# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.

## 2026-04-06 — CANON-008: All VaultSpark IP is proprietary by default

**Decision:** All code, content, assets, and designs created by VaultSpark Studios are proprietary and all rights are reserved by VaultSpark Studios LLC unless an open-source license is explicitly declared and approved by the Studio Owner. No agent may apply or imply an open-source license without Studio Owner direction.

**Applies to this project:** Yes — `docs/RIGHTS_PROVENANCE.md` reflects this project's specific license status.

**Rationale:** VaultSpark Studios LLC is a commercial entity building owned IP. Open-sourcing any project without deliberate strategy gives away commercial advantage and creates ownership ambiguity.

**Studio canon:** `vaultspark-studio-ops/docs/STUDIO_CANON.md` → CANON-008

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
