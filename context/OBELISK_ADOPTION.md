# Obelisk Adoption

coAuthoringRole: implementer
posture: phase-0-declared
lastReviewed: 2026-05-27

## Scope

VaultSpark Football GM is a public-unlaunched game repo with local browser/runtime surfaces and Studio OS automation scripts. It does not currently expose a password-primary production auth flow in this repo.

## Current Posture

- Phase 0 is declared for CANON-021 compliance.
- Secrets access in local automation goes through `scripts/lib/secrets.mjs`.
- Privileged provider actions remain outside this public repo and should route through Studio Ops capabilities.
- No production Obelisk passkey or MCP firewall migration has landed in this repo yet.

## Next Adoption Work

- Keep raw secrets out of prompts and logs.
- If public auth is added, prefer passkey-first patterns and document the Vault/Obelisk contract before launch.
- If privileged MCP tooling is added, require signed/registered MCP posture before production use.
