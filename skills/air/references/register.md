# Register configured endpoints and identity

Inspect the actual partner, environment, and live endpoints. Current official setup: https://docs.air3.com/airkit/usage/credential/issuing-credentials (reviewed 2026-09-14). If the Dashboard differs, verify current instructions rather than insisting on a remembered field.

## JWKS and application domain

Choose the URL actually served: web `/api/.well-known/jwks`, or issuer `/.well-known/jwks` for a backend-only integration. Check it with:

```bash
node <skill-base-dir>/scripts/jwks.mjs --check <actual-public-https-jwks-url>
```

Register that exact URL in Dashboard → Account → General → JWKS URL. Whitelist the actual web origin if the integration uses AIR Kit in a browser. Preserve existing registered origins; do not replace them with an ephemeral tunnel by default.

One Partner ID maps to one registered JWKS URL. When issuer and verifier capabilities use the same Partner ID, serve both public signing keys from that one JWKS document; use a second Partner ID only if separate JWKS URLs are required.

## Sandbox issuer

Current docs describe self-service under Issuer → Settings: register the derived issuer DID and issuer API key, then configure supported signature types and backend endpoints. Derive backend claim URLs from the recorded `ISSUER_ORIGIN` and verified handlers. Use the installed backend and selected program's supported signature type.

The user can copy `API_KEY` from the gitignored backend configuration to the relevant Dashboard field. Do not print it in chat, put it into documentation, or ask for the seed/private signing key. Sandbox does not automatically require an activation email.

After registration, create/select the schema and issuance program using [schema.md](schema.md).

## Verifier

Register its signing JWKS and browser domain as applicable, then create/select a verification program. Do not generate an issuer seed/backend to enable verification by default. If credential menus are hidden, inspect the actual account entitlement and current Dashboard guidance; explain only that access step and obtain the required account enablement from AIR if necessary.

## Mainnet

Mainnet uses separate identity, keys, programs, and access. Current docs require AIR team involvement in activation. Prepare a reviewable handoff with public IDs/endpoints and explain where the issuer API key is securely supplied. Never send mail without explicit authorization. Do not include `SEED`, `ADMIN_API_KEY`, or private signing keys. Automated context/key/provision commands are sandbox-only; follow [environments.md](environments.md).

## Record confirmed state

Record each action only after it has actually been completed or the user confirms that specific action:

```bash
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --jwks-url <actual-url> --jwks-registered yes
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --activated yes
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --domain-whitelisted yes
```

Issuer activation is inapplicable to a verifier-only setup. A live JWKS check does not prove Dashboard registration. A 403 does not by itself prove activation is missing: inspect the request route, credentials, and backend error before diagnosing it.
