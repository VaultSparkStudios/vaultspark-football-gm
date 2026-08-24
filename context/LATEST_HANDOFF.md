# Latest Handoff — Session 94 → Session 95

**Closed:** 2026-08-23 · SIL v3.0 **991 / 1000** · canonical receipt **1,266 / 1,266**, direct exit 0, all six shards.

---

## What this session actually was

A full-spectrum `/audit` and its implementation. The defining decision was to audit the **live origin** rather than the tree, and it is the reason four of the fourteen ranked findings exist at all.

What ships here is `source → build-pages rewrite → edge policy`. Two of those three stages leave no trace in git. A source-only audit of this project is therefore structurally blind, and had been.

## The finding that matters most

**The site's own Content-Security-Policy was refusing a script the site itself serves.** Cloudflare injects its Web Analytics beacon into every delivered document; `script-src` admitted `'self'` plus four hashes. Production had collected **zero pageviews** and thrown a CSP violation on every page load — while every launch-readiness judgement about the public surface was being made without a single production datapoint.

Why no automated check ever saw it, which is the transferable part: measured on this origin across two routes, **the edge injects the beacon only for browser-shaped requests**. `verify-edge-policy-application.mjs` fetched `/` with `Accept: application/json,text/plain,*/*`, so it was auditing a document no visitor ever receives. It now fetches as a browser does and asserts the served policy admits every external origin the served document requests. The two admitted hosts were read out of `beacon.min.js` itself rather than taken from documentation.

The negative control is the point: run against today's live policy and today's live browser document it returns both violations by name; against the new policy and the same document, none.

## Three premises corrected during implementation, not after

This is the part worth reading before trusting the audit document.

1. **The funnel item would have reversed canon.** It proposed landing content at `/` and setup at `/play`. `DECISIONS 2026-08-04` already settled that "the root URL is for the person who has never seen the game", which S70 fixed by making one click start a league. The real gap was narrower — S70 answered *let a newcomer start* and never answered *let a newcomer know why*. The argument moved onto the root page **below** the one-click start, and a Playwright spec asserts the ordering so a later reshuffle cannot quietly undo it.
2. **"Rival personas are invisible" was false.** `rivalTradeOffers.js:212-213` already attached `gmName`/`gmLine`, and `beatReporter`'s free-agency outbid names the winning GM. Half the item did not exist. The two real gaps — a faceless on-clock draft market and intel behind a Load button — were what shipped.
3. **"The receipts already carry the hashes" covered one session out of twenty-four.** `LATEST.json` held 84 capture hashes, all S93, against 821 files. Pruning on that sentence would have destroyed the only record twenty-three sessions of visual review ever had. The 819-entry ledger was written first and the prune made to refuse without it.

## One item deliberately not done

**14→6 tab regroup, skipped.** The rail is already grouped under five task headers (Gameday / Roster / Builds / History / Config), so it is not "organised by data table". What remains true is target count on a phone — which is a founder-deferred task-board item explicitly needing its own visual-evidence re-baseline budget. Migrating fourteen panels against a 1,220-test suite for no measured benefit was the wrong trade.

## What found defects in my own work

Four independent mechanisms, in order of how much they caught:

- **`/code-review high` — ten findings, all real.** An inert opt-in button on the new invitation (the primary CTA of the new surface, dead on click, in exactly the state the surface was built for). Two dead-code paths whose comments asserted behaviour the code did not have. A diagnostics surface that hid itself when hydration degraded — including the retry button that exists for that state. A `continue` that should have been `break`. A second `--apply` that would have eaten its own archive header. And a gate branch with no empty-match guard that **I hand-repaired this session without noticing it could never have warned me**.
- **`shard-coverage`** — all four new suites unassigned, so CI would have skipped them while every local run passed.
- **`check-windows-hide`** — a raw `child_process` import instead of the hardened wrapper.
- **`edge-policy-application`** — adding document-agreement correctly turned a green fixture HOLD. The fixture was fixed, not the conjunction relaxed.

## Start here next session

The task board's `## Now` is accurate. In priority order:

1. **Gate the long-horizon facility equilibrium** (carried, still the strongest known item). The S93 upkeep design rests on a measured dispersion turnaround at season 15 that no test asserts — argued rather than gated, the shape this project keeps re-finding.
2. **Verify the beacon actually reports** once the S94 policy reaches production. Admitted is not reporting. A still-silent dashboard after deploy is a live finding, not a deploy delay.
3. **Calibrate `owner.cash` scale** and **source `FACILITY_MARKET_PROFILE`'s appetite weights** — both carried from S93, both now more load-bearing than when they were booked.

## Standing constraints

- Public launch remains **HOLD**; `launchReady` false. Blockers are `email-delivery-unverified`, `founder-approval-unverified`, `lifecycle-authority-unverified` — all externally owned.
- `check-release-evidence-freshness` is **expired** (observed 2026-08-16, expired 2026-08-17). Pre-existing, tied to the same external blockers, not caused by S94.
- Two `app.spec.js` failures are **pre-existing** — confirmed by reproducing them on the stashed pre-S94 tree.
- Registry says SPARKED, local contract says FORGE. Reconcile through the Ark owner; never edit sibling truth directly.
