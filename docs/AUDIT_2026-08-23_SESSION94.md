# Audit — Franchise Architect: Football — Session 94

Public-safe live-code audit. The JSON sidecar is the sole source of truth.

## Profile and review lens

- Product: public-unlaunched public browser football game/app
- Rubric: product rubric plus game-medium overlay (retention, emotional payoff, decision pressure, mobile browser polish) and app-release-gate; staging: Cloudflare Pages staging must prove the exact immutable candidate before direct-to-main production promotion; public sanitization mandatory
- Profile source: skill-profile audit overlay, PROJECT_STATUS S93, TASK_BOARD open-item projection (19 open), live source tree, live production origin headers and bodies, live community API

## Ranked implementation plan

| Rank | Tier | Category | Effort | Impact | Innovation | Priority | Item and concrete recipe |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | CRITICAL | Security config / observability / user feedback loop | 3.0h | 8 | 7 | 9.4 | **own-csp-blocks-the-only-production-analytics** — L1 plus extend verify-edge-policy-application.mjs to assert that every external origin the built document requests is admitted by the served CSP, proven with a negative control. |
| 2 | CRITICAL | Process integrity / public truth | 5.0h | 8 | 9 | 9.4 | **public-truth-gate-cannot-see-staleness** — L1 plus the freshness assertion inside check-public-truth.mjs with a negative control, plus content-derived sitemap lastmod in build-pages.mjs. |
| 3 | HIGH | UI/UX + gamification / information architecture | 4.0h | 8 | 8 | 9.1 | **front-door-leads-with-zero-contributors** — Full state-aware invitation state on both the front door and /stats, plus the sitemap rule. |
| 4 | HIGH | Gamification / immersion / AI intelligence | 9.0h | 9 | 9 | 8.6 | **thirty-one-front-offices-with-memory-hidden-behind-a-load-button** — Shared front-office card attached at all three negotiation seams including the on-clock draft market; retire the load button. |
| 5 | HIGH | Features/depth + new public page | 10.0h | 8 | 10 | 8.2 | **the-realism-story-is-the-differentiator-and-it-is-unpublished** — L2 as described -- build-time verdict block bound to the progressionParity receipt, llms.txt entry, diagnostic panels retired from the consumer surface. |
| 6 | HIGH | UI/UX + information architecture + redundancy merge | 12.0h | 10 | 8 | 7.7 | **settings-is-a-twenty-panel-junk-drawer-holding-the-economy** — Full four-way split including the new Boardroom tab, with the S93 authority regression tests. |
| 7 | HIGH | Speed/efficiency | 7.0h | 9 | 6 | 6.3 | **content-hashed-assets-served-revalidating-and-the-boot-graph-is-not-hashed-at-all** — Hash the full boot graph in build-pages with import-specifier rewriting, split the edge cache policy, prove both. |
| 8 | MEDIUM | Speed/efficiency | 2.0h | 7 | 5 | 6.4 | **zero-modulepreload-on-a-fifty-module-boot-graph** — Generate the full preload list from the boot-budget module graph with the lazyRoots-disjointness assertion. |
| 9 | MEDIUM | UI/UX / funnel / redundancy merge | 8.0h | 10 | 6 | 6.6 | **the-front-door-is-a-configuration-form** — Full funnel inversion -- landing content at `/`, setup at `/play`, returning-player detection preserved, redirects and specs. |
| 10 | MEDIUM | Speed/organization | 3.0h | 7 | 6 | 6.6 | **visual-qa-is-105-megabytes-of-tracked-pngs** — Enforced retention window in write-visual-qa-receipt.mjs plus the one-time prune, with the release-authority check. |
| 11 | MEDIUM | Token/API cost reduction | 5.0h | 7 | 7 | 6.4 | **append-only-ledgers-are-861-kilobytes** — L1 plus rolling archive for all five ledgers with an enforced size ceiling and before/after measurement. |
| 12 | MEDIUM | UI/UX / redundancy merge | 10.0h | 8 | 6 | 4.9 | **fourteen-tabs-five-of-them-about-the-roster** — Full five-surface regroup with sub-navigation, islands preserved, deep links preserved, mobile-first. |
| 13 | MEDIUM | UI/UX / redundancy merge / onboarding | 7.0h | 8 | 5 | 4.6 | **four-places-to-learn-the-same-game** — Single learning surface with three modes, reference sourced from one structured file, duplicates removed. |
| 14 | LOW | Speed/organization / hygiene | 2.0h | 5 | 4 | 3.7 | **three-meta-refresh-redirect-pages-and-a-latent-runtime-divergence** — Edge 301s replacing all three documents (play.html sequenced after rank 9), plus the meta alignment and its assertion. |

Combined priority: **9.4**.

## Premise verification and rejected phantom work

- Rejected/deferred “public-pages-missing-canonical-tags”: REFUTED BY THE LIVE DOCUMENT. Not ranked. The source-level observation is correct: a scan of public/*.html finds `rel="canonical"` in stats.html only. But the deployed documents are not the source documents. `GET https://playfranchisearchitect.com/` returns `<link rel="canonical" href="https://playfranchisearchitect.com/" />` and `GET .../landing.html` returns `<link rel="canonical" href="https://playfranchisearchitect.com/landing.html" />` plus its own `og:url`. build-pages.mjs injects both per page at build time. The duplicate-content risk is already handled by construction. Only the narrower residue survived into rank 9: the built landing.html still has no og:image and no twitter card, so the marketing page shares worse than the setup form.
- Rejected/deferred “security-headers-are-weak”: REFUTED BY MEASUREMENT. Not ranked as a defect. The live origin returns a hash-based CSP with no `unsafe-inline` in script-src, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self' mailto:`, an explicitly enumerated `connect-src`, and `upgrade-insecure-requests`; plus `x-frame-options: DENY`, `strict-transport-security: max-age=31536000; includeSubDomains; preload`, `referrer-policy: strict-origin-when-cross-origin` and a restrictive `permissions-policy`. This is a stronger posture than most shipped consumer web apps. The only header absent is `cross-origin-opener-policy`, whose marginal value here is low. The genuine security finding in this audit is the opposite shape and is ranked first: the policy is strong enough that it blocks something the site itself serves.
- Rejected/deferred “boot-amortization-is-wasted”: REFUTED BY INSPECTION. Not ranked. `scripts/session-floor.mjs` computes this as work-shipped per session-boot cost, and running it now reports `shipped 0/1 floor · context 0% · amortization 0x (wasted)` -- at session start, before anything has shipped, the ratio is necessarily zero. The recorded 1.29 is a faithful record of one low-yield session, not a regression in any mechanism. It is a session-economics meter, not a project defect. Ranking it would have been a phantom manufactured from a scary word.

## Three recommended design moves

1. L1 plus extend verify-edge-policy-application.mjs to assert that every external origin the built document requests is admitted by the served CSP, proven with a negative control.
2. L1 plus the freshness assertion inside check-public-truth.mjs with a negative control, plus content-derived sitemap lastmod in build-pages.mjs.
3. Full state-aware invitation state on both the front door and /stats, plus the sitemap rule.

## Execution Log

| Item | Status | Evidence |
|---|---|---|
| own-csp-blocks-the-only-production-analytics | shipped | — |
| public-truth-gate-cannot-see-staleness | shipped | — |
| front-door-leads-with-zero-contributors | shipped | — |
| thirty-one-front-offices-with-memory-hidden-behind-a-load-button | shipped | — |
| the-realism-story-is-the-differentiator-and-it-is-unpublished | shipped | — |
| settings-is-a-twenty-panel-junk-drawer-holding-the-economy | shipped | — |
| content-hashed-assets-served-revalidating-and-the-boot-graph-is-not-hashed-at-all | shipped-reduced | — |
| zero-modulepreload-on-a-fifty-module-boot-graph | shipped | — |
| the-front-door-is-a-configuration-form | shipped-corrected | — |
| visual-qa-is-105-megabytes-of-tracked-pngs | shipped-with-correction | — |
| append-only-ledgers-are-861-kilobytes | shipped | — |
| fourteen-tabs-five-of-them-about-the-roster | skipped-premise-corrected | — |
| four-places-to-learn-the-same-game | shipped | — |
| three-meta-refresh-redirect-pages-and-a-latent-runtime-divergence | shipped | — |
