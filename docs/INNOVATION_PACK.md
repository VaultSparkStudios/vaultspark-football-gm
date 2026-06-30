# Innovation Pack — Session 23

Generated manually because `node scripts/ops.mjs innovation-pack` is not implemented in this repo. Premises were checked against live code after the primary audit list shipped.

## Shipped

1. **static-route-build-smoke-proof** — The primary pass added contact/legal/agent files, but the build pipeline only canonicalized `index.html` and `game.html`, and the smoke test only exercised the app route. The second-order pass promoted all static HTML pages into the build canonicalization list and made `smoke-pages.mjs` assert `contact.html`, `privacy.html`, `terms.html`, `agents.json`, `.well-known/llms.txt`, and `sitemap.xml` from the built bundle.

## Rejected / Deferred

- **cloudflare-cert-repair** — GitHub Pages API still reports `bad_authz` for the custom-domain certificate, but the available agent path only proves status; no Cloudflare credential is present in the secrets gateway.
- **public-launch-flip** — Public URL returned HTTP 200, but release readiness needs post-push route smoke plus certificate-state verification before changing public launch posture.

---
# Innovation Pack — Session 22

Generated manually because `node scripts/ops.mjs innovation-pack` is not implemented in this repo. Premises were checked against live code.

## Shipped

1. **mobile-overlay-post-advance-refresh** — After wiring the mobile core loop, the next compounding polish was to keep the overlay fresh after an Advance Week action. The normal advance handler now calls `syncMobileLoopOverlay()` after state mutation, inbox/franchise moment updates, and rewind pruning, so enabled mobile mode does not leave stale decision cards after a sim step.

## Rejected / Deferred

- **unsupported-client-runtime-501-sweep** — `localApiRuntime.js` has a generic 501 fallback for truly unsupported endpoints. That is honest behavior, not a live beta defect by itself; no endpoint premise was verified as missing today.
- **cloudflare-domain-fix** — still blocked by missing Cloudflare capability and the existing public runbook. Do not force-green launch readiness.
