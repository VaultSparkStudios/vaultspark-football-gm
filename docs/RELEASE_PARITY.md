# Release parity ledger

## Required surfaces

| Surface | Contract | Current evidence |
|---|---|---|
| Desktop browser | Full setup and game shell at 1440px; keyboard navigation; both themes readable | Covered by Playwright app/theme suites; rerun for every release candidate |
| Mobile browser | Full 390px navigation, decision deck, modals, and 44px actions | Covered by mobile/theme Playwright suites; rerun for every release candidate |
| Tablet browser | No clipped drawer, dialog, table, or core action at 768px | Covered by responsive release smoke; rerun for every release candidate |
| Native app | Not applicable; no native client is shipped | Explicitly not applicable, not a pass |

## Release rule

Parity evidence is current only when screenshots/tests were produced from the same source revision shown by `/_health` and `deploy-manifest.json`. A green local or staging screenshot cannot prove production parity when the canonical origin reports a different asset fingerprint.

Known external gates remain: received email-forwarding proof, current Cloudflare edge/security headers, and explicit founder launch approval. They are not inferred from static files.

## S110 recovery candidate — 2026-09-29

Source `dbcd750b1c8e8d477928f28ca8afa869bb80d253` and artifact `6585b783020cbca6b639f8222fd26825139db2e3c665e7ff576ae237534cd51a` are independently verified on the stable staging domain (14/14 same-origin checks) and live Pages origin (10/10 checks; manual promotion `36613134108` success). The source-bound responsive run passed 261 captures at 390, 768, and 1440 pixels in both themes; public pages passed 40 desktop/mobile/theme captures. The reviewed visual receipt keeps 146 hash-bound images. Full Playwright passed 69 tests with one intentional opt-in negative control skipped; the final-candidate Desk spec passed 2/2 after correcting an empty panel. Hosted lab entry-route performance: desktop LCP 696 ms, INP 48 ms, CLS 0; mobile LCP 784 ms, INP 24 ms, CLS 0.0085. These are lab measurements, not field cohort data. Backend workflow `36616242344` passed its gate and image builds but failed runner SSH transport across three attempts. Gateway SSH completed the workflow-equivalent pull/up and confirmed same-host plus external HTTPS health at `dbcd750`; `reports/s110-backend-authority.json` records the recovery. Pages parity and backend health are independently attested. Public launch remains HOLD.
