# Obelisk Integration Status

Franchise Architect uses the `external` Obelisk architecture boundary. The current browser-first game is anonymous and has no local account system.

Status: `not-integrated`.

The current Obelisk migration contract requires Passport v2 using OpenID Connect Authorization Code with S256 Proof Key for Code Exchange (PKCE). Session 83 removed the deprecated Passport v1 query-token callback and server verification samples so they cannot be mistaken for a supported authentication path. No login UI or authentication claim is published until a registered Obelisk relying party passes an end-to-end flow.

Future account-bearing flows must delegate sign-in, account creation, invitations, recovery, sessions, and logout to Obelisk. This project must not create a local password database, accept identity tokens from URL query parameters, or ship a client secret in browser code.

The product remains playable without an account. This declaration is an architecture boundary, not evidence that Obelisk authentication is live.
