# Evidence and version-sensitive contracts

Use this before implementing or repairing AIR SDK/API code. Read only the relevant official pages. MCP is optional: if unavailable, use the official web pages or Markdown index at https://docs.air3.com/llms.txt. If neither is reachable, inspect installed types/source and identify the exact remaining unknown. Do not silently turn a remembered example into a verified contract.

## Authority by component

- User requirements govern desired behavior and scope. Preserve a supplied integration contract and explicitly note any incompatibility with installed SDK/backend versions.
- Installed `@mocanetwork/airkit` types/source govern method names, parameters, and returned values. Inspect the package and lockfile; record the resolved version in `AIR.md`. Do not record `latest` as a verified version.
- Checked-out issuer backend source governs its handlers, environment variables, migrations, and response bodies. The reference is `air-issuer-service` branch `main_sd-jwt-vc`; inspect `README.md`, `.env.example`, `src/app.controller.ts`, `src/services/did.service.ts`, and `src/issuer/sd-jwt-vc-schemas/`, and record the commit. A floating upstream branch is not a fixed API contract.
- Current official AIR documentation governs hosted API and Dashboard setup. If docs disagree with backend/client source, distinguish the components, describe the discrepancy, and resolve it before the dependent call. Do not merge incompatible snippets or guess a method signature.

## Focused sources

Reviewed 2026-10-12 against AIR Kit 1.13.0; external contracts can change.

- Credential formats (SD-JWT default, Iden3 advanced): https://docs.air3.com/products/identity/credential-formats
- Issuance, Dashboard registration, direct issuance: https://docs.air3.com/products/identity/issuing-credentials
- Issuance quickstart (backend env, schema class, SDK call): https://docs.air3.com/get-started/quickstarts/issue-credentials
- Issuer backend hosting and go-live checklist: https://docs.air3.com/products/identity/backend-hosting
- Credential types (`vct`): https://docs.air3.com/products/identity/schema-creation
- Revocation and token status list: https://docs.air3.com/products/identity/revocation
- Issuance API (AIR hosts, headers, issuer routes): https://docs.air3.com/api-reference/issuance-api
- Verification and result shape: https://docs.air3.com/products/identity/verify
- Backend SD-JWT verification: https://docs.air3.com/products/identity/verify-sd-jwt
- Selective disclosure: https://docs.air3.com/products/identity/selective-disclosure
- Partner JWT: https://docs.air3.com/get-started/authentication/sdk-auth
- JWKS endpoint and one-Partner/one-JWKS rule: https://docs.air3.com/get-started/authentication/jwks-endpoint
- Custom auth (BYO login): https://docs.air3.com/get-started/authentication/custom-auth
- Sandbox and production: https://docs.air3.com/get-started/environments/about
- Release notes: https://docs.air3.com/api-reference/release-notes
- Iden3 (AIR-enabled accounts only): https://docs.air3.com/products/identity/iden3/issuing
- Issuer backend: https://github.com/MocaNetwork/air-issuer-service/tree/main_sd-jwt-vc

Known contract notes: `issueCredential` takes `credentialSubject: {}` because the backend supplies claims. SD-JWT `verifyCredential` requires `fieldsToDisclose`; `nonce` became optional in 1.12 but this skill always sends one and verifies the key-binding JWT. Issuance Partner JWTs (`issueCredential` and direct issuance) carry `scope: "issue"` and header `typ: "JWT"`, as the docs require; the reference issuer service's own tokens omit `typ` and do not default `scope` (see [auth.md](auth.md)). AIR login tokens verify against `https://static.sandbox.air3.com/.well-known/jwks.json`, then `https://account.sandbox-testnet.air3.com/.well-known/jwks.json`, then `https://static.air3.com/.well-known/jwks.json` in sandbox, and only `https://static.air3.com/.well-known/jwks.json` in production; the docs sessions page lists only the production URL. A live sandbox `verifyCredential` (2026-10-13, AIR Kit 1.13.0) returned `verifiableCredential[0]` as an `EnvelopedVerifiableCredential` whose `id` is `data:application/dc+sd-jwt,<token>`, as the docs show; the 1.13.0 type definitions instead declare SD-JWT entries as compact strings and give the object no `id`. Accept both, and pass the presentation to the backend untyped.

Snippets in recipes can use older initialization forms. Prefer installed SDK types over copying those snippets verbatim. For a genuinely unavailable method, report the incompatibility and the supported alternative instead of fabricating an API.
