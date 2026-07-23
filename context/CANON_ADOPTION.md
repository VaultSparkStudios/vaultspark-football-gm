# Canon Adoption — Franchise-Architect

> ACTIVELY CHECKED against the live `vaultspark-studio-ops/docs/STUDIO_CANON.md` (founder directive S183).
> Refresh: `node ../vaultspark-studio-ops/scripts/check-canon-adoption.mjs --project . --write`.
> Suggest: `node ../vaultspark-studio-ops/scripts/check-canon-adoption.mjs --project . --suggest` uses conformance evidence to pre-fill safe suggestions.
> Mark each: **adopted** · **pending** · **review** · **exempt (reason)**. This file is maintained, not auto-trusted.

Audience: public-unlaunched · Live ACTIVE canons: 51 · Pending review: 3

| Canon | Title | Status | Evidence / note |
|---|---|---|---|
| CANON-001 | Rolling Status headers use HTML comment markers for programm | adopted (suggested) | Conformance checker passed: rolling-status start+end markers present with content |
| CANON-002 | Sessions 1–3 are a Calibration Window, excluded from studio- | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-003 | prompts/initiate.md is separate from prompts/start.md for to | adopted (suggested) | Conformance checker passed: start.md + initiate.md both present and distinct |
| CANON-004 | studioOsApplied: true requires Layer 1 SIL format, not just  | exempt (suggested) | studioOsApplied !== true (registry + status) — Layer 1 SIL format not yet required |
| CANON-005 | CDR gap recovery check is mandatory at startup and closeout  | adopted (suggested) | Conformance checker passed: CDR gap-recovery instruction present in prompts/start.md, prompts/closeout.md, docs/SESSION_PROTOCOL.md |
| CANON-006 | Every public-facing product must display VaultSpark Studios | adopted | Exact linked VaultSpark branding and footer contract pass on all public routes. |
| CANON-007 | Every project must have a staging environment before deployi | adopted | GitHub Pages staging and local same-revision build/smoke evidence exist; production flip remains gated. |
| CANON-008 | All VaultSpark IP is proprietary by default; open-source lic | adopted | Proprietary rights provenance and exact all-rights-reserved footer are enforced. |
| CANON-009 | SIL rubric is 10 × 100 = 1000 (v3.0) | adopted (suggested) | Conformance checker passed: 1000-pt v3.0 · 10 cats · Σ==silScore(988) |
| CANON-010 | Claude Code and Codex must have strict skills + hooks + MCP | adopted | Codex hooks/skills and shared protocol paths are present and exercised. |
| CANON-011 | Every public-facing project must follow the universal sitema | adopted | Sitemap compliance passes 10/10. |
| CANON-012 | Every studio agent resolves credentials via the secrets gate | adopted | Brevo discovery used the Studio secrets gateway; no raw secret was printed. |
| CANON-013 | Every project picks one of 3 canonical low-cost archetypes a | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-015 | Claude Max Plan first; API requires founder approval + cost | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-016 | Studio OS protocol/process/enforcement propagates ecosystem- | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-017 | Free, long-term, scaleable integrations preferred; build-vs- | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-018 | All cross-repo agent communication MUST flow through Studio | adopted | No sibling edit; external reconciliation is reserved for signed Ark transport. |
| CANON-019 | Founder-Action Discipline (try first, label blocked only wit | adopted | Secrets discovery, blocker preflight, credential probe, and admin path were attempted before HOLD. |
| CANON-020 | Analytica is the canonical Studio analytics + insight plane | exempt (No project-local analytics plane change this session; Analytica remains the Studio authority.) | N/A at project scope; reviewed 2026-07-22. |
| CANON-021 | Obelisk is the Studio-wide trust + capability protocol | adopted | Obelisk posture retained; orphan fake broker removed instead of claiming integration. |
| CANON-022 | Agent Co-Authoring Protocol | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-023 | Obelisk Package Trust gates every agent install/download | adopted | No dependency/download/install was introduced this session. |
| CANON-024 | Broad approvals require non-malicious action verification | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-025 | Trinity role separation: VEILOS · IGNIS · Obelisk | exempt (Trinity role separation is Studio architecture; this public game does not redefine it.) | N/A at project scope; reviewed 2026-07-22. |
| CANON-026 | IGNIS visibility scope (private-by-default) | exempt (IGNIS private visibility is Studio-owned; this public repo exposes no private IGNIS ledger.) | N/A at project scope; reviewed 2026-07-22. |
| CANON-027 | PQC migration-ready language discipline | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-028 | Founder Identity Privacy (no personal name, no personal emai | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-029 | Free-Tier Cost Discipline (no variable cost on free plans) | adopted | Cost gates ALLOW; deterministic static architecture has zero variable cost. |
| CANON-030 | Acronym Expansion in Public Content (spell it out, acronym i | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-031 | Observability Honesty (no lying surfaces) | adopted | Commit, test, playtest, staging, CI, and launch truths are source-derived and separated. |
| CANON-032 | Build-Optimal for Flagships (no premature constraint) | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-033 | Launch Announcement Discipline (no silent launches) | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-034 | Browser Experience Excellence (browser is never second-class | adopted | Playwright 18/18 plus dark/light desktop/mobile responsive evidence passed. |
| CANON-035 | Project Brand Identity (every project designs its own profes | adopted | Project-specific franchise command/tactical identity visual language retained. |
| CANON-036 | Deploy Currency Discipline (production must not silently lag | adopted | Deploy evidence is revision-aware; hosted staleness remains HOLD. |
| CANON-037 | Canon Half-Life and Automated Consistency (re-confirmation c | adopted | Reviewed against live Session 53 evidence; project behavior conforms and no contradictory surface was found. |
| CANON-038 | Shared Studio Self-Host Server (one Hetzner box · isolated p | exempt (Shared-server allocation is centrally owned; this project currently uses cost-neutral static staging.) | N/A at project scope; reviewed 2026-07-22. |
| CANON-039 | Build-It-Ourselves, Internal-First, OSS-Research Discipline | adopted | Reuse registry was consulted through startup protocol; no new third-party tool/dependency added. |
| CANON-040 | Agent-Deployed Migrations (AI agents apply database/infra mi | exempt (No database or infrastructure migration exists in this browser/static change set.) | N/A at project scope; reviewed 2026-07-22. |
| CANON-041 | Website Mobile Parity + Elite Visual Craft (full desktop↔mob | adopted | Responsive evidence 20/20; mobile active-state contrast was visually found and fixed. |
| CANON-042 | Studio Branding System: approved usages, DBA rule, and the e | adopted | Exact approved Studio footer is build- and test-enforced on every public HTML route. |
| CANON-043 | Baseline repository security hygiene (free-tier: Dependabot | adopted | Secret scan clean; dependency surface unchanged; baseline hygiene gates pass. |
| CANON-044 | In-session task scaffolding (Phase/Wave lists), reconciled a | adopted (suggested) | Conformance checker passed: } |
| CANON-045 | Obelisk is the unified studio identity + auth plane (one stu | pending | Pending: public signup/auth is not yet wired to the unified Obelisk identity plane. |
| CANON-046 | Canon weighting: tiers + autonomy-first conflict resolution  | adopted (suggested) | Conformance checker passed: matrix integrity ok — no orphan rows, all tiers valid |
| CANON-047 | Theme system + AI-verified human readability (no unreadable | adopted | Dark/light themes were AI/manually inspected and computed contrast asserted. |
| CANON-048 | Dual-audience ecosystem: every surface built for Humans AND | adopted | Human UI and agent metadata routes remain in the Pages contract. |
| CANON-049 | Continuous evolution: the studio + every project is never st | adopted | Fresh audit plus implemented second-order innovations demonstrate continued evolution. |
| CANON-050 | Atlas: the foundation that carries the ecosystem — and the s | exempt (Atlas foundation ownership is outside this project; no local substitution is claimed.) | N/A at project scope; reviewed 2026-07-22. |
| CANON-051 | Web Hardening: every public surface meets the edge-security | pending | Pending: local hardening passes, but exact canonical custom-origin project health/headers remain unproved. |
| CANON-052 | Project Lifecycle Ladder: FORGE/SPARKED/VAULTED with sub-sta | pending | Pending: local FORGE truth conflicts with authoritative registry SPARKED; reconcile through Studio Ark. |

