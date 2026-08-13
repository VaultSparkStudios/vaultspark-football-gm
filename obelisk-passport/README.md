# Obelisk identity boundary

Franchise Architect declares the `external` Obelisk architecture. The game is currently anonymous and does not expose account, sign-in, invitation, recovery, session, or logout flows.

The obsolete Passport v1 callback-token sample was removed in Session 83. It must not return: browser query tokens such as `obelisk_session` and project-local `/auth/verify-session` handlers are not valid integration paths.

If accounts become part of the product, integration must use Obelisk Passport v2 through OpenID Connect Authorization Code with Proof Key for Code Exchange (PKCE), registered as a public client with no client secret. Until registration and end-to-end verification exist, status remains `not-integrated`; this folder intentionally contains no executable authentication code.
