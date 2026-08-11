# Audit — Franchise Architect: Football — Session 80

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product/game rubric with game-medium overlay: beta-readiness, vivid General Manager decision pressure, browser-visible feedback, static-host-safe/local-first behavior, plus public-app release and Canon gates; staging: stable Cloudflare Pages staging must prove the exact candidate before direct-to-main publication; the backend server must also deploy the exact candidate through its guarded workflow
- Profile source: arc-profile registry authority, S80 startup brief, 29,980-token code sample, exact grep/read verification, direct 1,018-pass/1-local-debris-failure baseline suite, game-loop review, and read-only application release gate
- Game-loop review: tightness 8 · progression 9 · session engagement 7 · retention 8 · soul fidelity 9 · overall 8.2
- Evidence caveat: Code-contract review only. No recent docs/PLAYTESTS cohort exists, and the public SOUL file intentionally withholds private creative criteria, so these scores do not claim measured fun, retention, or full private-soul conformance.

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | FIRE | UI/UX / game-loop tightness / organization | 5.0h | 5 | 7 | 12.5 | **exact-command-surface-routing** — Create one tested exact-surface navigation authority, route Command Center, Blueprint, and Season chapter actions through it, publish target IDs in explanation receipts, and verify cap/injury/deadline/draft behavior in rendered desktop/mobile themes. |
| 2 | FIRE | Feature depth / gamification / progression truth | 3.0h | 4 | 7 | 12.1 | **mastery-signature-visibility** — Extend the canonical signature projection with status and source receipt count, render a strongest-signature card with explicit empty/non-causal language in Architecture Review, and cover both evidence and empty states in tests and pixels. |
| 3 | HIGH | Release architecture / observability truth | 2.0h | 5 | 3 | 7.5 | **exact-candidate-full-stack-promotion** — Bind current rendered/build/test receipts to one immutable candidate, verify it on stable staging, push direct to main, wait for exact production Pages provenance, dispatch exact-SHA backend deployment, and verify the live API without changing launch readiness. |

Combined priority: **32.1**.

## Premise verification and rejected phantom work

- Rejected/deferred “Create synthetic or inferred playtest outcomes”: Rejected by context/GAME_LOOP.md. Local journey and rating receipts are instrumentation; product-wide engagement and retention claims require a real consented cohort. No synthetic rows will be created to make the audit green.
- Rejected/deferred “Build another playtest export path”: False premise. betaFeedback.js already records bounded local clarity, agency, pace, and return-intent receipts, exports an allowlisted receipt pack, and attaches only an explicitly selected receipt. The missing authority is real participants, not software scaffolding.
- Rejected/deferred “Rebuild Community Stats or local authentication”: False or harmful premise. The stats surface, community backend, consent/capability controls, dual-audience metadata, and tests exist; the public game exposes no account flow, so project-local auth would violate the Obelisk boundary rather than close it.
- Rejected/deferred “Rewrite GameSession or the browser application shell”: Real structural debt but not a bounded beta-readiness fix. The selected command-navigation seam removes duplicated behavior without destabilizing the canonical simulation or hydration authorities.
- Rejected/deferred “Treat direct-deploy authorization as public-launch approval”: Rejected by D-S74.5 and the live release gate. Deployment success must not fabricate reply-capable email, lifecycle reconciliation, Web Vitals, or a SHA-bound launch decision.
- Rejected/deferred “Keep or publish the ignored S79 Creative Direction Record”: Rejected and root-fixed during baseline verification. The ignored file contained only a no-direction note; the public compliance contract requires the private ledger path to be absent, and the focused 13/13 test now passes.

## Three recommended design moves

1. Make every ranked General Manager command land on and focus the exact decision surface named by its reason receipt, using one shared browser navigation authority.
2. Expose the already-computed strongest Architect mastery signature with its source receipt count and non-causal boundary in Architecture Review.
3. Bind the final candidate to fresh rendered evidence, prove it on stable staging, push main, then dispatch and verify the exact-SHA backend without changing independent launch readiness.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| exact-command-surface-routing | implemented | One shared async navigation authority now activates and hydrates the owning tab, scrolls to and focuses the declared target, honors reduced-motion preference, and reports unavailable targets honestly. Command Center, mobile pressure, Blueprint, and season-chapter routes publish and consume exact target IDs; 37 focused tests and the rendered desktop/mobile dark/light command captures pass. |
| mastery-signature-visibility | implemented | The canonical mastery projection now publishes signature score, status, and source receipt count; Architecture Review renders the strongest evidence-backed identity beside focus and milestone information with an explicit no-hidden-bonus boundary and honest empty state. Focused engine/UI tests and desktop/mobile dark/light pixels pass. |
| exact-candidate-full-stack-promotion | implemented | Immutable candidate 7becc57385515042dee5d80146c635d45962ea40 passed stable staging provenance 14/14 with artifact 6781437a0b319806945b94700e02d53faeee59be0885060a1b78dcc7545b5c9a (188 files) and rollback a836ac8f-8e6b-4b42-86e2-b7b6a2fb5344. Direct main push succeeded; CI 31544142759, Pages 31544142748 and brief-format 31544142762 are green. Guarded backend dispatch 31544469131 built exact-SHA play/api images and deploy-server succeeded. Production serves the identical SHA/artifact; the external Community API reports database ready, production CORS, no-store health and ETag/cache snapshot behavior. launchReady remains false. |
