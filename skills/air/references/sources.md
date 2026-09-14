# Evidence and version-sensitive contracts

Use this before implementing or repairing AIR SDK/API code. Read only the relevant official pages. MCP is optional: if unavailable, use the official web pages or Markdown index at https://docs.air3.com/llms.txt. If neither is reachable, inspect installed types/source and identify the exact remaining unknown. Do not silently turn a remembered example into a verified contract.

## Authority by component

- User requirements govern desired behavior and scope. Preserve a supplied integration contract and explicitly note any incompatibility with installed SDK/backend versions.
- Installed `@mocanetwork/airkit` types/source govern method names, parameters, and returned values. Inspect the package and lockfile; record the resolved version in `AIR.md`. Do not record `latest` as a verified version.
- Checked-out issuer backend source governs its handlers, environment variables, migrations, and response bodies. Inspect `package.json`, `.env.example`, relevant controller/service/schema classes, and record the commit. A floating upstream branch is not a fixed API contract.
- Current official AIR documentation governs hosted API and Dashboard setup. If docs disagree with backend/client source, distinguish the components, describe the discrepancy, and resolve it before the dependent call. Do not merge incompatible snippets or guess a method signature.

## Focused sources

Reviewed 2026-09-14; external contracts can change.

- Issuance and sandbox/mainnet registration: https://docs.air3.com/airkit/usage/credential/issuing-credentials
- Partner JWT/JWKS: https://docs.air3.com/airkit/usage/partner-authentication
- Issuance API (AIR bases, direct dStorage flow, issuer routes): https://docs.air3.com/airkit/usage/credential/issuance-api
- Verification API and 1.11.1 result shape: https://docs.air3.com/airkit/usage/credential/verify
- 1.11.1 release notes: https://docs.air3.com/airkit/release-notes
- One-Partner/one-JWKS rule: https://docs.air3.com/airkit/usage/jwks-setup
- BYO authentication claims: https://docs.air3.com/recipes/custom-auth-integration
- Issuer backend: https://github.com/MocaNetwork/air-issuer-service

The current docs contain a hosted-SDK wording mismatch: the overview describes backend-driven discovery through AIR proxy routes, while the detailed issuing guide/reference still shows a required `credentialSubject` argument. Prefer the most specific page and installed package types, and record the chosen contract in `AIR.md`; never silently invent a signature.

Likewise, snippets in recipes can use older initialization forms. Prefer installed SDK types over copying those snippets verbatim. For a genuinely unavailable method, report the incompatibility and the supported alternative instead of fabricating an API.
