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
